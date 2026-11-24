/**
 * tests/concienciaCache.test.ts — v1.48.0 · EL CACHÉ DEL ÍNDICE EN TIEMPO REAL
 * =====================================================================
 * Se ejecuta con:  npx tsx tests/concienciaCache.test.ts  (o `npm run validar`)
 *
 * Qué protege esta suite (lo que de verdad importa del caché):
 *   1. CORRECCIÓN: el caché nunca puede devolver algo distinto de lo que hay en
 *      disco. Un caché que miente es peor que no tener caché.
 *   2. TIEMPO REAL: aprender algo DEBE verse en la siguiente consulta sin
 *      reiniciar — el caché no puede «congelar» el cerebro.
 *   3. DETECCIÓN DE CAMBIO EXTERNO: si alguien edita indice.json a mano, el
 *      stat (mtime+tamaño) lo detecta y recarga.
 *   4. AISLAMIENTO: quien recibe el índice no puede mutar por accidente la copia
 *      compartida del caché (se entrega un clon).
 *   5. NO DESTRUCTIVO: cerebro vacío → todo responde vacío sin romper.
 *
 * Módulo puro: usa una carpeta temporal real como raíz de datos y limpia al
 * terminar. Sin red, sin Ollama, sin tocar el proyecto del usuario.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  aprender,
  enrutar,
  cargarIndice,
  invalidarCacheCerebro,
  buildCerebroContext,
  estadoCerebro,
  rutaCerebro,
} from "../src/engine/cerebroOrgano";

let pasadas = 0;
let falladas = 0;
const afirmar = (titulo: string, ok: boolean, detalle = "") => {
  if (ok) {
    pasadas++;
    console.log(`  ✔ ${titulo}`);
  } else {
    falladas++;
    console.log(`  ✘ ${titulo}${detalle ? ` → ${detalle}` : ""}`);
  }
};
const seccion = (t: string) => console.log(`\n${t}`);

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "cn-cerebro-"));
const rutaIndiceJson = path.join(rutaCerebro(raiz), "indice.json");

try {
  /* ---------------------------------------------------------------- */
  seccion("1. Cerebro vacío: nada rompe, todo responde vacío");
  {
    const idx = cargarIndice(raiz);
    afirmar("índice vacío tiene 0 entradas", idx.entradas.length === 0, String(idx.entradas.length));
    afirmar("enrutar sobre vacío devuelve []", enrutar(raiz, "lo que sea").length === 0);
    afirmar("buildCerebroContext vacío devuelve ''", buildCerebroContext(raiz, "hola") === "");
    const st = estadoCerebro(raiz);
    afirmar("estado reporta 0 entradas / 0 temas", st.entradas === 0 && st.temas === 0);
  }

  /* ---------------------------------------------------------------- */
  seccion("2. TIEMPO REAL: aprender se ve en la siguiente consulta");
  {
    const e = aprender(raiz, {
      tema: "arranque",
      titulo: "Puerto ocupado al iniciar",
      texto: "Si el puerto 3000 esta ocupado el servidor elige el siguiente libre y lo anuncia en el log.",
    });
    afirmar("aprender devuelve una entrada", !!e && e.tema === "arranque");
    const rutas = enrutar(raiz, "puerto ocupado arranque");
    afirmar("★ la entrada recién aprendida ya enruta (sin reiniciar)", rutas.length === 1, String(rutas.length));
    afirmar("enruta a la entrada correcta", rutas[0]?.entrada.titulo === "Puerto ocupado al iniciar");
    afirmar("la coincidencia de tema puntua fuerte", (rutas[0]?.score ?? 0) >= 3, String(rutas[0]?.score));
  }

  /* ---------------------------------------------------------------- */
  seccion("3. GOLPE DE CACHÉ: dos cargas seguidas coinciden y no leen de nuevo");
  {
    // Espiamos las lecturas reales del indice.json contando llamadas a
    // fs.readFileSync sobre ESA ruta. Si el caché funciona, la 2ª carga no lee.
    const realRead = fs.readFileSync;
    let lecturas = 0;
    (fs as any).readFileSync = function (p: any, ...rest: any[]) {
      try {
        if (typeof p === "string" && path.resolve(p) === path.resolve(rutaIndiceJson)) lecturas++;
      } catch { /* ignora */ }
      return (realRead as any)(p, ...rest);
    };
    try {
      const a = cargarIndice(raiz); // puede leer (o servir del seed de guardarIndice)
      const lecturasTrasPrimera = lecturas;
      const b = cargarIndice(raiz); // DEBE ser golpe de caché: 0 lecturas nuevas
      afirmar("★ la 2ª carga NO vuelve a leer el disco", lecturas === lecturasTrasPrimera, `${lecturas} vs ${lecturasTrasPrimera}`);
      afirmar("ambas cargas tienen el mismo número de entradas", a.entradas.length === b.entradas.length);
    } finally {
      (fs as any).readFileSync = realRead;
    }
  }

  /* ---------------------------------------------------------------- */
  seccion("4. AISLAMIENTO: mutar lo devuelto no corrompe el caché");
  {
    const a = cargarIndice(raiz);
    const antes = a.entradas.length;
    a.entradas.push({
      id: "intruso", tema: "x", titulo: "x", palabras: [], archivo: "temas/x.md",
      resumen: "", peso: 1, ts: new Date().toISOString(),
    } as any);
    a.entradas[0] && (a.entradas[0].titulo = "MUTADO");
    const b = cargarIndice(raiz);
    afirmar("★ el caché no se contamina al mutar la copia devuelta", b.entradas.length === antes, `${b.entradas.length} vs ${antes}`);
    afirmar("el título original sigue intacto", b.entradas[0]?.titulo !== "MUTADO");
  }

  /* ---------------------------------------------------------------- */
  seccion("5. CAMBIO EXTERNO: editar indice.json a mano se detecta por stat");
  {
    const crudo = JSON.parse(fs.readFileSync(rutaIndiceJson, "utf-8"));
    crudo.entradas.push({
      id: "manual-abc", tema: "manual", titulo: "Entrada metida a mano",
      palabras: ["manual", "externo", "edicion"], archivo: "temas/manual-abc.md",
      resumen: "editada fuera del motor", peso: 1, ts: new Date().toISOString(),
    });
    // Escritura directa (cambia tamaño → el stat lo nota aunque el mtime no salte).
    fs.writeFileSync(rutaIndiceJson, JSON.stringify(crudo, null, 2), "utf-8");
    const idx = cargarIndice(raiz);
    afirmar("★ la edición externa aparece en la siguiente carga", idx.entradas.some((e) => e.id === "manual-abc"), String(idx.entradas.length));
    const rutas = enrutar(raiz, "entrada manual externo");
    afirmar("y la entrada metida a mano YA enruta", rutas.some((r) => r.entrada.id === "manual-abc"));
  }

  /* ---------------------------------------------------------------- */
  seccion("6. REFUERZO Y GUARDADO: guardarIndice siembra el caché");
  {
    aprender(raiz, { tema: "arranque", titulo: "Puerto ocupado al iniciar", texto: "Refuerzo: ademas registra el puerto final elegido." });
    const rutas = enrutar(raiz, "puerto ocupado arranque");
    const ent = rutas.find((r) => r.entrada.titulo === "Puerto ocupado al iniciar")?.entrada;
    afirmar("★ el refuerzo sube el peso (no duplica)", (ent?.peso ?? 0) >= 2, String(ent?.peso));
    const st = estadoCerebro(raiz);
    afirmar("no se duplicó la entrada reforzada", rutas.filter((r) => r.entrada.titulo === "Puerto ocupado al iniciar").length === 1);
    afirmar("el estado cuenta temas reales", st.temas >= 2, String(st.temas));
  }

  /* ---------------------------------------------------------------- */
  seccion("7. INVALIDAR: forzar recarga tras limpiar el caché");
  {
    invalidarCacheCerebro(raiz);
    const idx = cargarIndice(raiz);
    afirmar("★ tras invalidar, la carga sigue siendo correcta", idx.entradas.length >= 2, String(idx.entradas.length));
  }
} catch (err) {
  falladas++;
  console.log(`  ✘ excepción inesperada → ${(err as Error).message}`);
} finally {
  // Limpieza: borra la raíz temporal (nunca toca nada del proyecto).
  try { fs.rmSync(raiz, { recursive: true, force: true }); } catch { /* ignora */ }
}

console.log(`\n${"─".repeat(56)}`);
console.log(`═══ CACHÉ .CON-CIENCIA: ${pasadas} correctas · ${falladas} fallidas ═══`);
console.log("─".repeat(56));
if (falladas > 0) process.exit(1);
