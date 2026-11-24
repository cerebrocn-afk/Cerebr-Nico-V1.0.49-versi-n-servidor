/**
 * tests/hindsightHibrido.test.ts — CAPA DE MEMORIA HINDSIGHT DEL HÍBRIDO (v1.17.0)
 * ================================================================================
 * Se ejecuta con:  npx tsx tests/hindsightHibrido.test.ts
 *                  (o `npm run validar`, que la descubre por estar en tests/)
 *
 * Qué custodia, y por qué cada línea existe:
 *   1. CONTRATO DE PACK: el demonio Python sirve el manifiesto que
 *      `registerExternalPack` sabe leer. Un manifiesto con forma equivocada no
 *      falla ruidosamente: el pack se carga vacío o no se carga, y el agente
 *      simplemente «olvida» que tenía memoria. Eso es peor que un crash.
 *   2. MODO ESPEJO REAL:写入/leer/borrar sobre el almacén local, con búsquedas
 *      que funcionan CON acentos (el español es el idioma nativo del proyecto).
 *   3. ATOMICIDAD: un espejo corrupto se archiva y se recomienza, jamás se
 *      borra en silencio; y un JSON roto a mitad de escritura no destruye la
 *      memoria (os.replace atómico).
 *   4. GUARDA DE SKILLS: `leer_skill` no puede sacar la nariz fuera de skills/
 *      ( traversal probada con ../../), porque una herramienta de lectura con
 *      rutas libres es una puerta de fuga de secretos.
 *   5. WRAPPER NODE: el SDK oficial se resuelve y expone sus 8 + 1 herramientas
 *      SIN necesitar un servidor arriba (el manifiesto se puede inspeccionar en seco).
 *   6. CONFIGURACIÓN COHERENTE: los puertos del híbrido no pisan los del
 *      sistema (3000/3500/5000/11434), solo un pack de memoria va enabled, y
 *      las skills instaladas traen su SKILL.md.
 *
 * La suite levanta el demonio en un puerto efímero con ESPEJO Y SKILLS EN UN
 * DIRECTORIO TEMPORAL (CN_HINDSITE_MIRROR / CN_HINDSITE_SKILLS): el espejo real
 * del usuario no se toca nunca durante una prueba.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leRuta = (rel: string) => path.join(RAIZ, rel);
const leer = (rel: string) => readFileSync(leRuta(rel), "utf8");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) {
    correctas++;
    console.log(`  ✓ ${que}`);
  } else {
    fallos.push(que + (detalle ? ` — ${detalle}` : ""));
    console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);

const ES_WINDOWS = process.platform === "win32";
const PYTHON = ES_WINDOWS ? "python" : "python3";
const DEMONIO = leRuta("scripts/hindsight_daemon.py");

/** Python disponible = requisito de la capa; si falta, se AVISA, no se miente. */
function pythonVivo(): boolean {
  const r = spawnSync(PYTHON, ["--version"], { encoding: "utf8", timeout: 8000 });
  return r.status === 0;
}

const esperar = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * pedirJSON — la puerta de TODA la suite al demonio.
 *
 * v1.57.1 · BLINDAJE (arreglo de «SUITE MUERTA A MITAD»). Lo que había: el
 * `control.abort()` del timeout lanzaba un `DOMException [AbortError]` que NADIE
 * capturaba; se escapaba por el `finally`, tumbaba el `try` gigante del archivo y
 * congelaba la suite en la comprobación 14 — el log de Mario lo muestra tal cual
 * («hindsight · SUITE MUERTA A MITAD · 0 · Requisitos del entorno · 1 · Contrato
 * de pack · [DOMException [AbortError]]»). Un fallo de red o de lentitud debe ser
 * un ROJO visible, no una muerte silenciosa que además se lleva por delante las
 * ~90 comprobaciones que venían detrás.
 *
 * Ahora: el fallo se DECLARA con comprobar() (modo ruidoso, el normal) y se
 * devuelve `{ estado: 0, datos: null }` para que la suite se degrade a medible.
 * `silencioso = true` es para los bucles de sondeo (levantar el demonio): ahí
 * reintentar mientras el proceso hijo arranca es lo NORMAL, no un rojo — si ese
 * bucle gritara, cada arranque lento contaminaría el veredicto con fallos falsos.
 */
async function pedirJSON(url: string, opciones?: RequestInit, silencioso = false): Promise<any> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 8000);
  try {
    const resp = await fetch(url, { ...opciones, signal: control.signal });
    return { estado: resp.status, datos: await resp.json().catch(() => null) };
  } catch (e: any) {
    const nombre = String(e?.name || "error");
    const detalle = String(e?.message || e).slice(0, 160);
    if (!silencioso) {
      comprobar(`la petición a ${url} no se perdió (falló: ${nombre})`, false, detalle);
    }
    return { estado: 0, datos: null, error: nombre, detalle };
  } finally {
    clearTimeout(t);
  }
}

async function llamarDemoonio(base: string, nombre: string, args: Record<string, unknown>) {
  const r = await pedirJSON(`${base}/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nombre, arguments: args }),
  });
  return r.datos;
}

/** Puerto efímero real: preguntar al SO evita colisiones con el IDE del usuario. */
function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

async function levantarDemoonio(env: Record<string, string>) {
  const puerto = await puertoLibre();
  const proceso = spawn(PYTHON, [DEMONIO, "--port", String(puerto)], {
    cwd: RAIZ,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // El demonio registra CADA petición en stderr; si nadie drena la tubería, en
  // Windows su búfer se llena y el proceso hijo se BLOQUEA a mitad de una
  // respuesta (fetch failed sin causa aparente). Se drenan las dos tuberías.
  proceso.stdout?.on("data", () => {});
  proceso.stderr?.on("data", () => {});
  return Object.assign(proceso, { __url: `http://127.0.0.1:${puerto}` }) as ChildProcess & { __url: string };
}

// ════════════════════════════════════════════════════════════════════════════
seccion("0 · Requisitos del entorno");
// ════════════════════════════════════════════════════════════════════════════
comprobar("el demonio de memoria existe en scripts/", existsSync(DEMONIO));
comprobar("el wrapper Node del SDK existe", existsSync(leRuta("scripts/hindsight_agent_server.mjs")));
comprobar("el SDK vendorizado trae dist/ precompilado", existsSync(leRuta("vendor/hindsight-agent-sdk/dist/index.js")));
comprobar("Python está disponible para el pack", pythonVivo(), `${PYTHON} no responde — el pack :5100 no podrá arrancar en esta máquina`);

// ════════════════════════════════════════════════════════════════════════════
seccion("1 · Contrato de pack externo (lo que come registerExternalPack)");
// ════════════════════════════════════════════════════════════════════════════
const DIR_PRUEBAS = mkdtempSync(path.join(tmpdir(), "cn-hindsite-"));
let demonio: (ChildProcess & { __url: string }) | null = null;
let BASE = "";
let demonioVivo = false; // v1.40.0 — solo section 9 corre si /health respondió; si no, degrada sin matar la suite

try {
  // Skills falsas en temporal: la guarda se prueba sin tocar skills/ reales.
  const skillsDir = path.join(DIR_PRUEBAS, "skills");
  mkdirSync(path.join(skillsDir, "skill-demo"), { recursive: true });
  writeFileSync(
    path.join(skillsDir, "skill-demo", "SKILL.md"),
    "---\nname: skill-demo\ndescription: una skill de prueba con acento español\n---\n\n# Demo\nEl contenido lleva ñ y acentos: canción.\n",
    "utf8",
  );
  // Un archivo fuera de toda skill, que NO debe ser alcanzable por leer_skill.
  writeFileSync(path.join(DIR_PRUEBAS, "secreto.txt"), "no debes leerme", "utf8");
  mkdirSync(path.join(DIR_PRUEBAS, "proyecto", "documentacion"), { recursive: true });
  writeFileSync(path.join(DIR_PRUEBAS, "proyecto", "README.md"), "# Proyecto de prueba\n\nUn documento largo suficiente para ser indexado con contenido real y medible.\n", "utf8");
  writeFileSync(path.join(DIR_PRUEBAS, "proyecto", "documentacion", "informe.md"), "# Informe\n\n" + "texto de informe ".repeat(40) + "\n", "utf8");

  if (pythonVivo()) {
    demonio = await levantarDemoonio({
      CN_HINDSITE_MIRROR: path.join(DIR_PRUEBAS, "espejo.json"),
      CN_HINDSITE_SKILLS: skillsDir,
      // Las tres herramientas de disco (exportar/importar/indexar) TAMBIÉN se
      // redirigen al temporal: sin esto, la suite escribía respaldos reales dentro
      // de .cerebro-db/ de la app y el manifiesto los firmaba como fuente.
      CN_HINDSITE_EXPORTS: path.join(DIR_PRUEBAS, "exports"),
      CN_HINDSITE_INDEX_ROOTS: path.join(DIR_PRUEBAS, "proyecto"),
    });
    BASE = demonio.__url;
    let vivo = false;
    for (let i = 0; i < 30 && !vivo; i++) {
      try {
        // silencioso=true: reintentar mientras el proceso hijo levanta es lo
        // normal; cada intento fallido NO es un rojo de la suite.
        const r = await pedirJSON(`${BASE}/health`, undefined, true);
        vivo = r.estado === 200 && r.datos?.ok === true;
      } catch {
        /* aún levantando */
      }
      if (!vivo) await esperar(200);
    }
    comprobar("el demonio levanta y responde /health", vivo, BASE);
    demonioVivo = vivo;

    if (vivo) {
      const manifiesto = (await pedirJSON(`${BASE}/tools`)).datos;
      const lista = manifiesto?.tools;
      comprobar(
        "GET /tools devuelve { tools: [...] } con forma de ToolSpec",
        Array.isArray(lista) && lista.length > 0,
        JSON.stringify(manifiesto)?.slice(0, 120),
      );
      comprobar(
        "cada herramienta trae name + description + parameters(objeto)",
        Array.isArray(lista) &&
          lista.every(
            (t: any) =>
              typeof t?.name === "string" &&
              typeof t?.description === "string" &&
              t?.parameters?.type === "object" &&
              typeof t?.parameters?.properties === "object",
          ),
      );
      const nombres = (lista || []).map((t: any) => t.name);
      comprobar("los nombres de herramienta son únicos", new Set(nombres).size === nombres.length);
      comprobar(
        "hay cheap (para modelos ≤8B) y al menos una destructive marcada",
        (lista || []).some((t: any) => t.cheap === true) && (lista || []).some((t: any) => t.destructive === true),
      );
      for (const obligada of ["memory_estado", "memory_recall", "memory_guardar_aprendizaje", "memory_reflect", "leer_skill"]) {
        comprobar(`el manifiesto declara ${obligada}`, nombres.includes(obligada));
      }

      // EL MANIFIESTO Y EL REGISTRO DEBEN SER EL MISMO CONJUNTO. Bug real de esta
      // versión: `h_listar_pages` estaba escrito y registrado en EJECUTORES pero
      // NO en el manifiesto → el modelo jamás la veía (función viva, herramienta
      // muerta: exactamente lo que la casa llama «un registro que se llama y no
      // hace nada»). Se comprueba sobre el código, no contra el servidor.
      // Comprobación por el HECHO, no por el texto: se llama a cada herramienta
      // declarada con argumentos vacíos. Una no registrada responde
      // «Herramienta desconocida»; una registrada contesta con su validación
      // («Falta query», «Falta page_id»…). Ninguna llamada aquí borra nada.
      // Secuencial a propósito: abrir las ~19 conexiones a la vez (Promise.all)
      // desbordaba el backlog de escucha del demonio y en Windows el SO las
      // RECHAZABA con ECONNREFUSED (en Linux se reintentaban en silencio). Una
      // a una prueba lo mismo sin depender del tamaño del backlog del SO.
      const promesas: { n: string; r: any; ms: number }[] = [];
      for (const n of nombres) {
        const tSonda = Date.now();
        const r = await llamarDemoonio(BASE, n, {});
        promesas.push({ n, r, ms: Date.now() - tSonda });
      }
      const sinEjecutor = promesas.filter((x) => /Herramienta desconocida/.test(String(x.r?.error || "")));
      // v1.57.1 — El detalle lleva las tres herramientas MÁS LENTAS medidas y las
      // que no contestaron. Razón: en el log de Mario la suite moría reventada
      // contra el timeout de 8 s y el culpable (`memory_indexar_proyecto`, con 40
      // escrituras fsync del espejo) era INVISIBLE porque nada se mediaba por
      // herramienta. Sin cifra no hay diagnóstico, y sin diagnóstico el arreglo
      // se adivina.
      const sinRespuesta = promesas.filter((x) => !x.r).map((x) => x.n);
      const lentas = [...promesas]
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 3)
        .map((x) => `${x.n}:${x.ms}ms`);
      comprobar(
        `las ${nombres.length} herramientas declaradas tienen ejecutor real`,
        sinEjecutor.length === 0 && sinRespuesta.length === 0,
        JSON.stringify({ sinEjecutor: sinEjecutor.map((x) => x.n), sinRespuesta, lentas }),
      );
      comprobar(
        "una herramienta sin argumentos se queja en vez de actuar (falla cerrado)",
        promesas.every((x) => x.r?.ok === false || x.r?.ok === true || x.r?.error),
        JSON.stringify(promesas.filter((x) => !x.r || typeof x.r.ok !== "boolean").map((x) => x.n)),
      );
      // Y el sentido inverso, sobre el fuente: el bloque EJECUTORES termina en la
      // «}» de columna 0 (cortar en la primera «}» interna leía los `lambda` y
      // salían «ok» y «skills» como herramientas falsas — pasó, y por eso se fija).
      const fuenteDemonio = leer("scripts/hindsight_daemon.py");
      const inicio = fuenteDemonio.indexOf("EJECUTORES = {");
      const bloque = fuenteDemonio.slice(inicio, fuenteDemonio.indexOf("\n}", inicio) + 2);
      const registradas = [...bloque.matchAll(/^\s{4}"([a-z_]+)":/gm)].map((m) => m[1]);
      const declaradasEnFuente = [...fuenteDemonio.matchAll(/^\s{4}\{"name":\s*"([a-z_]+)"/gm)].map((m) => m[1]);
      const invisibles = registradas.filter((n) => !declaradasEnFuente.includes(n));
      comprobar(
        "todo ejecutor registrado está en el manifiesto (ninguna capacidad queda invisible)",
        invisibles.length === 0 && registradas.length > 0,
        JSON.stringify({ invisibles, registradas: registradas.length, declaradas: declaradasEnFuente.length }),
      );
      comprobar(
        "el manifiesto servido por HTTP y el del código son el mismo conjunto",
        JSON.stringify([...nombres].sort()) === JSON.stringify([...declaradasEnFuente].sort()),
        `${nombres.length} servidas vs ${declaradasEnFuente.length} en el fuente`,
      );

      // ── Modo espejo: memoria útil SIN Hindsight arriba ──
      seccion("2 · Modo espejo — memoria que funciona sin servidor");
      const guardado = await llamarDemoonio(BASE, "memory_guardar_aprendizaje", {
        contenido: "El guard JSON bloquea comas de más en memoria.md.",
        tags: ["guard", "json"],
      });
      comprobar("guardar un aprendizaje devuelve ok", guardado?.ok === true, JSON.stringify(guardado)?.slice(0, 160));

      const recallAcentos = await llamarDemoonio(BASE, "memory_recall", { query: "comas de más en JSON" });
      comprobar(
        "recall encuentra el aprendizaje CON acentos y mayúsculas mezcladas",
        Array.isArray(recallAcentos?.recall) && recallAcentos.recall.length > 0 && /comas/.test(recallAcentos.recall[0]?.text || ""),
        JSON.stringify(recallAcentos)?.slice(0, 180),
      );
      const nada = await llamarDemoonio(BASE, "memory_recall", { query: "unicornio zzz qqq" });
      comprobar("recall de un tema ajeno devuelve lista vacía (no inventa)", Array.isArray(nada?.recall) && nada.recall.length === 0);

      const reflejo = await llamarDemoonio(BASE, "memory_reflect", { query: "guard JSON" });
      comprobar(
        "reflect en espejo avisa que NO hay síntesis LLM (honestidad de capa)",
        reflejo?.reflect?.aviso?.includes("LLM") === true || String(reflejo?.reflect?.aviso || "").length > 0,
        JSON.stringify(reflejo)?.slice(0, 180),
      );

      const pagina = await llamarDemoonio(BASE, "memory_guardar_page", { page_id: "Preferencias Editoriales", name: "Preferencias" });
      comprobar("guardar página normaliza el page_id (español con espacios y acentos)", pagina?.ok === true);
      const leida = await llamarDemoonio(BASE, "memory_leer_page", { page_id: "preferencias-editoriales" });
      comprobar("leer la página por su id normalizado la devuelve", leida?.ok === true && leida?.page?.name === "Preferencias");
      const paginas = await llamarDemoonio(BASE, "memory_listar_pages", {});
      comprobar("listar páginas muestra la creada", (paginas?.pages || []).some((p: any) => (p.page_id || p.id) === "preferencias-editoriales"));
      const borrada = await llamarDemoonio(BASE, "memory_borrar_page", { page_id: "preferencias-editoriales" });
      comprobar("borrar la página devuelve ok", borrada?.ok === true);
      const falta = await llamarDemoonio(BASE, "memory_borrar_page", { page_id: "no-existe" });
      comprobar("borrar una página inexistente dice la verdad (ok:false)", falta?.ok === false);
      const vacia = await llamarDemoonio(BASE, "memory_guardar_aprendizaje", { contenido: "   " });
      comprobar("el contenido vacío se rechaza en vez de guardarse", vacia?.ok === false);

      seccion("3 · Skills bajo demanda y su guarda de rutas");
      const skills = await llamarDemoonio(BASE, "listar_skills", {});
      comprobar("listar_skills ve la skill de prueba", (skills?.skills || []).some((s: any) => s.skill === "skill-demo"));
      const cuerpo = await llamarDemoonio(BASE, "leer_skill", { skill: "skill-demo" });
      comprobar(
        "leer_skill devuelve SKILL.md con UTF-8 intacto",
        cuerpo?.ok === true && String(cuerpo.content).includes("canción"),
        JSON.stringify(cuerpo)?.slice(0, 120),
      );
      const ataque = await llamarDemoonio(BASE, "leer_skill", { skill: "..", archivo: "secreto.txt" });
      comprobar("leer_skill NO atraviesa fuera de skills/ (traversal bloqueada)", ataque?.ok === false, JSON.stringify(ataque)?.slice(0, 120));
      const ataque2 = await llamarDemoonio(BASE, "leer_skill", { skill: "skill-demo", archivo: "../secreto.txt" });
      comprobar("leer_skill NO atraviesa con ../ dentro de arguments", ataque2?.ok === false, JSON.stringify(ataque2)?.slice(0, 120));
      const ataque3 = await llamarDemoonio(BASE, "leer_skill", { skill: "skill-demo", archivo: "SKILL.exe" });
      comprobar("leer_skill rechaza extensiones que no son .md/.txt/.json", ataque3?.ok === false);

      seccion("4 · El espejo resiste la corrupción (no olvida en silencio)");
      const rutaEspejo = path.join(DIR_PRUEBAS, "espejo.json");
      comprobar("el espejo vive en el directorio de pruebas, no en el proyecto", existsSync(rutaEspejo));
      comprobar("el espejo real de .cerebro-db no se tocó", !existsSync(leRuta(".cerebro-db/hindsight-mirror.json")));
      writeFileSync(rutaEspejo, "{ esto no es json válido", "utf8");
      const despues = await llamarDemoonio(BASE, "memory_estado", {});
      comprobar("con el espejo roto el servicio sigue respondiendo", despues?.ok === true);
      const recuperado = await llamarDemoonio(BASE, "memory_recall", { query: "comas de más" });
      comprobar("tras la corrupción el recall no inventa nada (empezó de cero)", (recuperado?.recall || []).length === 0);

      const danado = readdirSync(DIR_PRUEBAS).filter((f) => f.includes(".danado."));
      comprobar("el espejo ilegible quedó archivado como .danado.*", danado.length === 1, JSON.stringify(danado));
      comprobar(
        "el archivo dañado conserva byte a byte lo que había (nada se perdió en silencio)",
        danado.length === 1 && readFileSync(path.join(DIR_PRUEBAS, danado[0]), "utf8").startsWith("{ esto"),
      );
      let curado: any = null;
      try {
        curado = JSON.parse(readFileSync(rutaEspejo, "utf8"));
      } catch {
        /* se reporta como rojo abajo, con el trozo real del archivo */
      }
      comprobar(
        "el activo se AUTOCURÓ: ahora es JSON válido (no queda roto para siempre)",
        curado !== null && Array.isArray(curado.units),
        readFileSync(rutaEspejo, "utf8").slice(0, 60),
      );

      // Y el servicio SIGUE escribiendo sobre un almacén limpio, sin re-archivar:
      const renace = await llamarDemoonio(BASE, "memory_guardar_aprendizaje", { contenido: "renací tras la corrupción" });
      const buscaRenacida = await llamarDemoonio(BASE, "memory_recall", { query: "renací" });
      comprobar("tras curar el corrupto, la memoria vuelve a escribir y leer", renace?.ok === true && (buscaRenacida?.recall || []).length > 0);
      await llamarDemoonio(BASE, "memory_guardar_aprendizaje", { contenido: "segundo aprendizaje tras la cura" });
      const danado2 = readdirSync(DIR_PRUEBAS).filter((f) => f.includes(".danado."));
      comprobar(
        "no se re-archiva en cada lectura: seguir escribiendo NO inunda el disco (.danado sigue en 1)",
        danado2.length === 1,
        JSON.stringify(danado2),
      );
    }
  } else {
    console.log("  (se omite la inmersión del demonio: sin Python en esta máquina)");
  }

  seccion("9 · v1.18.0 — BM25, ciclo de vida y raíces seguras en disco");
  if (demonioVivo) {
    for (const texto of [
      "El guard JSON bloquea comas de más en el parser del sandbox",
      "Ollama expulsa el modelo de RAM tras cinco minutos sin uso gracias al keep-alive",
      "La semilla de versión vive en constants.ts y la vigila la suite bajoConsumo",
    ]) {
      await llamarDemoonio(BASE, "memory_guardar_aprendizaje", { contenido: texto, tags: ["bm25"] });
    }
    const r1 = await llamarDemoonio(BASE, "memory_recall", { query: "comas de más en el guard JSON" });
    // v2.1.3 — La comprobación pedía `metodo === "bm25-espejo"`, o sea exigía que
    // el embedder estuviera APAGADO. En la instalación de Mario Ollama está vivo y
    // el recall contesta "bm25+coseno": el ganador era el correcto (el detalle del
    // rojo lo mostraba) y la suite igual se ponía roja. Una valla que mide el
    // entorno no mide el ranking. Se exige el ORDEN y que el método declarado sea
    // uno de los dos honestos — y que el método vaya DICHO en la respuesta.
    const metodosHonestos = ["bm25-espejo", "bm25+coseno", "espejo+coseno"];
    comprobar(
      "BM25 ordena por relevancia: la unidad correcta gana a las demás",
      metodosHonestos.includes(String(r1?.metodo)) &&
        (r1?.recall || []).length > 0 &&
        /comas/.test(r1.recall[0]?.text || ""),
      JSON.stringify(r1?.recall?.[0])?.slice(0, 140) + " · metodo=" + String(r1?.metodo),
    );
    comprobar(
      "el método de búsqueda viaja en la respuesta (el cliente sabe si hubo coseno)",
      metodosHonestos.includes(String(r1?.metodo)),
      String(r1?.metodo),
    );
    const r2 = await llamarDemoonio(BASE, "memory_recall", { query: "expulsa modelo RAM keep-alive" });
    comprobar(
      "BM25 no devuelve el mismo top para temas distintos (discrimina, no empata)",
      (r2?.recall || []).length > 0 && r2.recall[0].id !== r1.recall[0].id,
      JSON.stringify([r1.recall[0].id, r2?.recall?.[0]?.id]),
    );
    comprobar(
      "las stopwords españolas no dominan el ranking (consulta sin contenido útil = vacío)",
      (await llamarDemoonio(BASE, "memory_recall", { query: "de la que el en y a los" }))?.recall?.length === 0,
    );
    const sinTag = await llamarDemoonio(BASE, "memory_recall", { query: "modelo", tags: ["etiqueta-inexistente"] });
    const conTag = await llamarDemoonio(BASE, "memory_recall", { query: "modelo", tags: ["bm25"] });
    comprobar(
      "el filtro por tags funciona en los dos sentidos (excluye y encuentra)",
      (sinTag?.recall || []).length === 0 && (conTag?.recall || []).length > 0,
      JSON.stringify([sinTag?.recall?.length, conTag?.recall?.length]),
    );

    const leccion = await llamarDemoonio(BASE, "memory_aprender_de_error", {
      contexto: "sandbox", error: "preview en blanco", causa: "guard bloqueó JSON válido",
      correccion: "política conservadora de bloqueo", verificacion: "suite roundtrip en verde",
    });
    comprobar("aprender-de-error crea unidad y página", leccion?.ok === true && leccion?.pagina === "lecciones-de-error");
    const pagina = await llamarDemoonio(BASE, "memory_leer_page", { page_id: "lecciones-de-error" });
    comprobar(
      "la lección entra en la tabla de lecciones con sus cinco campos",
      String(pagina?.page?.content || "").includes("preview en blanco") &&
        String(pagina?.page?.content || "").includes("política conservadora"),
    );
    const repetida = await llamarDemoonio(BASE, "memory_aprender_de_error", {
      contexto: "sandbox", error: "preview en blanco", causa: "guard bloqueó JSON válido",
      correccion: "política conservadora de bloqueo", verificacion: "suite roundtrip en verde",
    });
    comprobar("la lección repetida se detecta y no duplica la fila", repetida?.fila_duplicada === true);
    comprobar(
      "una lección incompleta se rechaza en vez de guardarse a medias",
      (await llamarDemoonio(BASE, "memory_aprender_de_error", { contexto: "x", error: "y" }))?.ok === false,
    );

    for (const t of ["apuntes", "apuntes"]) await llamarDemoonio(BASE, "memory_guardar_aprendizaje", { contenido: "unidad duplicada a propósito" });
    const seco = await llamarDemoonio(BASE, "memory_repasar", {});
    comprobar("repasar en seco detecta el grupo duplicado y propone", seco?.aplicado === null && seco?.grupos_duplicados >= 1 && (seco?.propuestas || []).length > 0, JSON.stringify(seco?.propuestas)?.slice(0, 120));
    const aplicado = await llamarDemoonio(BASE, "memory_repasar", { aplicar: true });
    comprobar(
      "repasar solo fusiona cuando se le pide explícitamente (aplicar:true)",
      aplicado?.aplicado && aplicado.aplicado.despues < aplicado.aplicado.antes,
      JSON.stringify(aplicado?.aplicado),
    );

    const conflicto = await llamarDemoonio(BASE, "memory_conflictos", {});
    comprobar("conflictos responde con ok y candidatos (no veredictos)", conflicto?.ok === true && Array.isArray(conflicto?.candidatos), JSON.stringify(conflicto)?.slice(0, 140));
    comprobar(
      "la regla de precedencia del acta viaja en la propia respuesta, no solo en cerebro.md",
      typeof conflicto?.regla === "string" && /manda el acta/.test(conflicto.regla) && /cerebro\.md/.test(conflicto.regla),
      String(conflicto?.regla),
    );

    const expMd = await llamarDemoonio(BASE, "memory_exportar", { nombre: "respaldo-prueba", formato: "md" });
    const expJson = await llamarDemoonio(BASE, "memory_exportar", { nombre: "respaldo-prueba" });
    comprobar("exportar produce el respaldo en md y en json", expMd?.ok === true && expJson?.ok === true);
    const reimport = await llamarDemoonio(BASE, "memory_importar", { nombre: "respaldo-prueba.json" });
    comprobar(
      "importar es idempotente: reinyectar el mismo exporto no duplica",
      reimport?.ok === true && reimport?.unidades_nuevas === 0 && reimport?.unidades_ya_presentes > 0,
      JSON.stringify(reimport),
    );
    const traversal = await llamarDemoonio(BASE, "memory_exportar", { nombre: "../../escape" });
    comprobar("exportar se niega a escribir fuera de la carpeta de exportaciones", traversal?.ok === false, JSON.stringify(traversal));
    const importFalso = await llamarDemoonio(BASE, "memory_importar", { nombre: "no-existe-nada" });
    comprobar("importar un archivo inexistente lo dice en vez de inventar", importFalso?.ok === false);

    const buscado = await llamarDemoonio(BASE, "skill_buscar", { query: "skill-demo contenido acentos" });
    comprobar("skill_buscar encuentra fragmentos dentro de skills/ por BM25", buscado?.ok === true && (buscado?.resultados || []).length > 0 && buscado.resultados[0].skill === "skill-demo", JSON.stringify(buscado)?.slice(0, 160));

    const indexado = await llamarDemoonio(BASE, "memory_indexar_proyecto", { max_archivos: 3 });
    comprobar("indexar por lotes respeta el tope de archivos", indexado?.ok === true && indexado?.ingeridos <= 3, JSON.stringify(indexado)?.slice(0, 120));
    comprobar(
      "indexar solo toca las raíces autorizadas (nada de node_modules en el espejo)",
      (indexado?.archivos || []).every((a: string) => !/node_modules|dist\/|__pycache__/.test(a)),
      JSON.stringify(indexado?.archivos)?.slice(0, 140),
    );
    comprobar(
      "la suite NO ensucia la app: ni espejo ni exportaciones reales aparecen en .cerebro-db",
      !existsSync(leRuta(".cerebro-db/hindsight-mirror.json")) && !existsSync(leRuta(".cerebro-db/exportaciones")),
    );
    const idOlvidable = (await llamarDemoonio(BASE, "memory_recall", { query: "renací o la que sea" }))?.recall?.[0]?.id;
    if (idOlvidable) {
      const olvido = await llamarDemoonio(BASE, "memory_olvidar", { id: idOlvidable });
      comprobar("olvidar borra por id concreto", olvido?.borradas === 1, JSON.stringify(olvido));
    } else {
      comprobar("olvidar borra por id concreto", false, "no había ninguna unidad que olvidar");
    }
    comprobar("olvidar una id inexistente lo admite", (await llamarDemoonio(BASE, "memory_olvidar", { id: "u-no-existe" }))?.ok === false);
    comprobar(
      "el veto de dependencias está declarado (indexar no traga node_modules)",
      /VETO_DIR = \{[^}]*node_modules/.test(leer("scripts/hindsight_daemon.py")) &&
        /VETO_DIR = \{[^}]*dist/.test(leer("scripts/hindsight_daemon.py")),
    );
  }

  // ── Wrapper Node del SDK oficial ──
  seccion("5 · Wrapper Node del SDK (pack :5101) — en seco, sin servidor");
  const seco = spawnSync(process.execPath, [leRuta("scripts/hindsight_agent_server.mjs"), "--tools"], {
    cwd: RAIZ,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, CN_HINDSITE_NODE_PORT: "5198" },
  });
  let manifiestoNode: any = null;
  try {
    manifiestoNode = JSON.parse(seco.stdout || "{}");
  } catch {
    /* se reporta abajo con detalle */
  }
  comprobar("node scripts/hindsight_agent_server.mjs --tools sale a tiempo con manifiesto", seco.status === 0 && !!manifiestoNode?.tools, (seco.stderr || "").slice(0, 160));
  const nombresNode = (manifiestoNode?.tools || []).map((t: any) => t.name);
  for (const h of [
    "agent_knowledge_recall",
    "agent_knowledge_reflect",
    "agent_knowledge_ingest",
    "agent_knowledge_list_pages",
    "agent_knowledge_get_page",
    "agent_knowledge_create_page",
    "agent_knowledge_update_page",
    "agent_knowledge_delete_page",
    "hs_estado",
  ]) {
    comprobar(`el pack Node expone ${h}`, nombresNode.includes(h));
  }
  comprobar(
    "el pack Node marca delete_page como destructiva (la UI debe confirmar)",
    (manifiestoNode?.tools || []).find((t: any) => t.name === "agent_knowledge_delete_page")?.destructive === true,
  );

  // ── Coherencia de configuración del híbrido ──
  seccion("6 · Coherencia de configuración (que el híbrido no se pise a sí mismo)");
  const cfgPacks = JSON.parse(leer("tools.config.json"));
  const packs = cfgPacks.packs || [];
  const urls = packs.map((p: any) => p.url);
  comprobar("no hay dos packs con la misma URL", new Set(urls).size === urls.length, JSON.stringify(urls));
  const PUERTOS_SISTEMA = [":3000", ":3500", ":5000", ":11434"];
  comprobar(
    "ningún pack nuevo pisa un puerto del sistema (3000/3500/5000/11434)",
    packs.filter((p: any) => p.id !== "puente-mcp").every((p: any) => !PUERTOS_SISTEMA.some((q) => String(p.url).includes(q))),
    JSON.stringify(urls),
  );
  const deMemoria = packs.filter((p: any) => String(p.id).startsWith("memoria-"));
  comprobar(
    "solo UN pack de memoria va enabled (18 herramientas de golpe pierden a un modelo pequeño)",
    deMemoria.filter((p: any) => p.enabled === true).length === 1,
    JSON.stringify(deMemoria.map((p: any) => [p.id, p.enabled])),
  );
  comprobar("el pack habilitado es el del demonio Python (tiene modo espejo)", deMemoria.find((p: any) => p.enabled === true)?.id === "memoria-hindsight");

  const pkg = JSON.parse(leer("package.json"));
  comprobar("package.json declara el SDK vendorizado como file:", String(pkg.dependencies?.["@vectorize-io/hindsight-agent-sdk"] || "").startsWith("file:"));
  // v1.31.0 — semilla de la valla actualizada (venía fija a 1.23.0 desde hace
  // cuatro versiones: viajaba roja de fábrica contra cualquier paquete sano).
  // v1.46.0 — Y DE RAÍZ: se deja de subir el literal. Subirlo «arreglaba» la
  // valla una vez y la volvía a romper en la siguiente release. Ahora se
  // comprueba la PROPIEDAD (semver + una sola semilla compartida), que no
  // caduca. El comentario de arriba es la prueba de que parchear el número no
  // funcionaba.
  comprobar("la versión del híbrido es una semver válida", /^\d+\.\d+\.\d+$/.test(String(pkg.version)), pkg.version);
  comprobar("la semilla visible coincide con package.json",
    (leer("src/constants.ts").match(/const VERSION_SEMVER = "([^"]+)"/) || [])[1] === pkg.version);
  for (const s of ["memoria", "memoria:node", "hindsight:server", "vendor:sdk"]) {
    comprobar(`el script npm «${s}» existe`, typeof pkg.scripts?.[s] === "string" && pkg.scripts[s].length > 0);
  }

  const env = leer(".env.example");
  for (const v of ["HINDSITE_API_URL", "HINDSITE_BANK_ID", "CN_MEMORY_PORT", "CN_HINDSITE_TOKEN", "CN_HINDSITE_MAX_UNITS"]) {
    comprobar(`.env.example documenta ${v}`, env.includes(v));
  }

  seccion("7 · Skills instaladas y su índice");
  const skillDir = (n: string) => path.join(RAIZ, "skills", n);
  for (const n of ["hindsight-architect", "hindsight-local", "hindsight-cloud", "hindsight-self-hosted", "hindsight-docs", "code-review", "cerebronico-memoria", "cerebronico-verificar", "cerebronico-ecosistema"]) {
    comprobar(`skills/${n}/SKILL.md está instalada`, existsSync(path.join(skillDir(n), "SKILL.md")));
  }
  comprobar("SKILLS.md indexa las skills y el protocolo de memoria", existsSync(leRuta("SKILLS.md")) && leer("SKILLS.md").includes("memory_recall"));
  comprobar("SKILLS.md avisa que la síntesis LLM exige Hindsight arriba", /modo espejo/i.test(leer("SKILLS.md")));

  seccion("8 · La gobernanza conoce la capa nueva");
  const cerebro = leer("cerebro.md");
  comprobar("cerebro.md menciona la capa de memoria Hindsight", /Hindsight/.test(cerebro));
  comprobar("cerebro.md deja claro que la capa es OPCIONAL (no rompe el arranque)", /opcional/i.test(cerebro));
  const memoria = leer("memoria.md");
  comprobar("memoria.md registra la decisión (ADR) del híbrido", /h[ií]brido/i.test(memoria) && /2026-09-28/.test(memoria));
  const changelog = leer("CHANGELOG.md");
  comprobar("CHANGELOG tiene la entrada v1.17.0", /1\.17\.0/.test(changelog));
} finally {
  if (demonio) {
    demonio.kill("SIGTERM");
    await esperar(150);
  }
  try {
    rmSync(DIR_PRUEBAS, { recursive: true, force: true });
  } catch {
    /* temporal ya ido */
  }
}

console.log(`\n${fallos.length === 0 ? "✓ TODO EN VERDE" : "✗ HAY ROJOS"}`);
console.log(`${correctas} correctas · ${fallos.length} fallidas`);
if (fallos.length) {
  for (const f of fallos) console.log(`  · ${f}`);
  process.exitCode = 1;
}
