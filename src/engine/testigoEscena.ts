/**
 * src/engine/testigoEscena.ts — EL TESTIGO DE LA ESCENA 3D (v1.0.7)
 * =================================================================
 * QUÉ RESUELVE. Desde v1.0.6 la casa puede armar escenas 3D (motor vendorizado +
 * skill + manual), pero quedó una deuda dicha en voz alta: **nadie miraba el
 * fotograma**. El manual y la skill exigen `data-progreso`/`data-fotograma`, y la
 * valla lo comprobaba en el TEXTO. O sea: se podía afirmar «se mueve con el
 * scroll» sin haberlo visto nunca. Este módulo cierra la parte honestamente
 * cerrable y — esto es lo importante — **declara lo que NO puede medir**.
 *
 * Qué puede comprobar SIN navegador, pidiendo los archivos por HTTP al propio
 * sandbox (`:3500`), que es como los ve el usuario:
 *   · que el motor exista en la ruta que usa la obra (el 404 de
 *     `/vendor/three/three.module.js` ES la pantalla negra: es el fallo número uno
 *     y se detecta acá, no a oscuras);
 *   · que el `importmap` declare esa ruta EXACTA (OrbitControls importa `three`
 *     pelado: sin mapa, la escena muere sin mensaje);
 *   · que el JavaScript esté afuera (la cerradura tiene la regla `csp-ausente`);
 *   · que la obra no dependa de un CDN (unpeg/jsdelivr/esm.sh la casan a la red);
 *   · que el recorrido use `getPointAt` y no `getPoint` (longitud de arco: con
 *     `getPoint` el vehiculo frena y alabea en las curvas cerradas);
 *   · que existan los testigos DOM (`data-motor`, `data-progreso`,
 *     `data-fotograma`) — sin ellos el movimiento NO es observable, y eso va en
 *     el veredicto como impedimento, no como sugerencia;
 *   · que la escena declare limpieza (`dispose`) y bucle (`requestAnimationFrame`).
 *
 * Qué NO puede comprobar, y lo dice: los PÍXELES. Renderizar de verdad necesita
 * un navegador; `navegadorReal.ts` describe el `BrowserDriver` que haría falta y
 * en `devDependencies` no hay Playwright. Por eso el veredicto trae
 * `noMedible` SIEMPRE: para que un modelo —del proveedor que sea— no pueda
 * convertir «todas las pruebas pasaron» en «la escena se ve y se mueve».
 */

export type PruebaEscena = {
  id: string;
  titulo: string;
  ok: boolean;
  motivo: string;
};

export type VeredictoEscena = {
  ok: boolean;
  pruebas: PruebaEscena[];
  /** Lo que ninguna de estas pruebas puede afirmar. Va siempre, no solo al fallar. */
  noMedible: string;
  resumen: string;
};

/** Se inyecta para poder probar sin server: devuelve texto + estado, o null si 404. */
export type Traer = (ruta: string) => Promise<{ codigo: number; texto: string } | null>;

const RE = {
  importmap: /<script[^>]*type=["']importmap["'][^>]*>/i,
  scriptInline: /<script(?![^>]*\bsrc=)[^>]*>[\s\S]{0,40}?\S[\s\S]{0,400}?<\/script>/i,
  cdn: /(unpkg\.com|jsdelivr\.net|esm\.sh|cdnjs\.cloudflare\.com|skypack)/i,
  // Se acepta cualquiera de las dos formas de escribir el mismo atributo:
  // `data-motor="…"` en el HTML o `canvas.dataset.motor = …` en el modulo. Prohibir
  // una de las dos seria castigar la forma moderna de escribirlo.
  dataMotor: /data-motor|dataset\.motor|setAttribute\(\s*["']data-motor/i,
  dataProgreso: /data-progreso|dataset\.progreso|setAttribute\(\s*["']data-progreso/i,
  dataFotograma: /data-fotograma|dataset\.fotograma|setAttribute\(\s*["']data-fotograma/i,
  // OJO con el punto: la forma equivocada se escribe JUSTO con punto
  // (`curva.getPoint(t)`), excluir el punto dejaba sin marcar el bug real.
  // `getPointAt(` no casaca: lleva `At` antes del parentesis.
  getPointMalo: /\.getPoint\s*\(|(^|[^.\w])getPoint\s*\(/,
  getPointAt: /getPointAt\s*\(/,
  dispose: /\bdispose\s*\(/,
  raf: /requestAnimationFrame/,
  csp: /Content-Security-Policy/i,
};

/**
 * Audita una escena 3D servida en el sandbox. `baseHtml` es la ruta del HTML de la
 * obra (p. ej. "/index.html"); el resto se deduce de lo que esa HTML importa.
 */
export async function auditarEscena3D(traer: Traer, baseHtml = "/index.html"): Promise<VeredictoEscena> {
  const pruebas: PruebaEscena[] = [];
  const suma = (id: string, titulo: string, ok: boolean, motivo: string) =>
    pruebas.push({ id, titulo, ok, motivo });

  const html = await traer(baseHtml);
  if (!html || html.codigo !== 200 || !html.texto) {
    suma("html", `La obra contesta en ${baseHtml}`, false, `el preview devolvio ${html ? html.codigo : "nada"}: no hay obra que auditar.`);
    return { ok: false, pruebas, noMedible: NO_MEDIBLE, resumen: "sin obra" };
  }
  suma("html", "La obra contesta en el preview", true, `200 · ${html.texto.length} chars`);

  const texto = html.texto;

  // 1 · El importmap, con la ruta real del motor.
  const tieneMapa = RE.importmap.test(texto);
  suma("importmap", "Declara el mapa de importaciones (sin eso 'three' no resuelve)", tieneMapa,
    tieneMapa ? "existe <script type=importmap>" : "no hay importmap: el modulo y los add-ons van a importar 'three' pelado y la escena muere sin mensaje.");
  const mapa = (texto.match(/<script[^>]*importmap[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || "";
  const rutaMotor = (mapa.match(/["']three["']\s*:\s*["']([^"']+)["']/) || [])[1] || "";
  suma("importmap-ruta", "El importmap apunta al motor vendorizado de la casa",
    /\/vendor\/three\/[\w.-]+\.js$/.test(rutaMotor), rutaMotor || "el importmap no declara la clave 'three'");

  // 2 · El motor, pedido POR LA RUTA QUE USA LA OBRA (mata el 404 silencioso).
  const motor = rutaMotor ? await traer(rutaMotor) : null;
  const motorOk = !!motor && motor.codigo === 200 && /REVISION/.test(motor.texto);
  suma("motor", "El motor 3D se sirve por la ruta que pide la obra", motorOk,
    motorOk ? `${rutaMotor} · ${motor!.texto.length} chars`
      : `falta ${rutaMotor || "la ruta del motor"} (${motor ? motor.codigo : "sin respuesta"}). Corré "npm run vendor:3d": la pantalla negra empieza aca.`);

  // 3 · JavaScript afuera y sin CDN.
  const inline = !RE.scriptInline.test(texto.replace(RE.importmap ? /<script[^>]*importmap[^>]*>[\s\S]*?<\/script>/gi : /x/g, ""));
  suma("js-afuera", "El codigo vive en archivos .js, no inline (regla csp-ausente de la cerradura)", inline,
    inline ? "sin bloques <script> con codigo" : "hay <script> inline: la cerradura lo marca y la CSP local lo bloquea.");
  const sinCdn = !RE.cdn.test(texto);
  suma("sin-cdn", "La obra no queda casada a un CDN", sinCdn,
    sinCdn ? "ninguna URL remota de libreria" : "importa tres.js de un CDN: con CSP «default-src 'self'» no carga y sin red tampoco.");
  const tieneCsp = RE.csp.test(texto);

  // 4 · La matemática del recorrido y la limpieza del bucle.
  const jsRutas = ["main.js", "/main.js", "/src/main.js", "/app.js"].filter((r, i, arr) => arr.indexOf(r) === i);
  let js = "";
  for (const r of jsRutas) {
    const tomado = await traer(r);
    if (tomado && tomado.codigo === 200) { js += "\n" + tomado.texto; }
  }
  const encuentra = (re: RegExp) => re.test(texto) || re.test(js);
  if (!js) {
    suma("js", "Se puede leer el JavaScript de la escena", false,
      "no se encontro main.js en las rutas habituales: el resto de las pruebas de codigo queda sin hacer.");
  } else {
    suma("js", "Se puede leer el JavaScript de la escena", true, `${js.length} chars`);
    const usaRecorrido = /CatmullRom|Curve3|getPoint/.test(js);
    if (usaRecorrido) {
      const bien = RE.getPointAt.test(js) && !RE.getPointMalo.test(js);
      suma("arco", "El recorrido esta parametrizado por longitud de arco (getPointAt)", bien,
        bien ? "usa getPointAt sin getPoint pelado"
          : "usa getPoint(t): el parametro NO es longitud de arco, el vehiculo se frena y acelera en las curvas cerradas.");
    }
    suma("testigos", "La escena publica sus testigos DOM (data-motor/progreso/fotograma)",
      (RE.dataMotor.test(js) || RE.dataMotor.test(texto)) && (RE.dataProgreso.test(js) || RE.dataProgreso.test(texto)) && (RE.dataFotograma.test(js) || RE.dataFotograma.test(texto)),
      "sin data-fotograma nadie puede probar que la escena anima: el movimiento no es observable.");
    suma("bucle", "Hay bucle de animacion y cancelacion", RE.raf.test(js) && /cancelAnimationFrame/.test(js),
      RE.raf.test(js) ? "requestAnimationFrame declarado" : "no hay requestAnimationFrame: la escena va a estar congelada.");
    suma("limpieza", "Libera geometrías/materiales al cerrar (dispose)", RE.dispose.test(js),
      RE.dispose.test(js) ? "llama a dispose()" : "sin dispose(): el preview comparte origen y la escena vieja sigue gastando GPU.");
  }

  const fallidas = pruebas.filter((p) => !p.ok);
  return {
    ok: fallidas.length === 0,
    pruebas,
    noMedible: NO_MEDIBLE + (tieneCsp ? "" : " · (aviso aparte: la obra no declara Content-Security-Policy)"),
    resumen: fallidas.length === 0
      ? `${pruebas.length}/${pruebas.length} pruebas de montaje y contrato superadas. ${NO_MEDIBLE}`
      : `${fallidas.length} de ${pruebas.length} pruebas fallan: ${fallidas.map((f) => f.id).join(", ")}. ${NO_MEDIBLE}`,
  };
}

const NO_MEDIBLE =
  "LO QUE ESTO NO MIDIO: los pixeles. Nadie renderizo la escena ni comparo dos fotogramas; " +
  "probar eso requiere un navegador (el BrowserDriver de navegadorReal.ts, sin Playwright en este paquete). " +
  "Un veredicto «ok» autoriza a decir «la escena esta bien montada y sus testigos existen», y NO «se ve y se mueve».";
