/**
 * ordenPromptCableado.test.ts — v1.0.29 · LA VALLA DEL CABLE
 * ========================================================
 * POR QUÉ EXISTE
 * `ordenDelPrompt.ts` puede estar perfecto y verde, y no servir de nada si el
 * server nunca lo llama: es exactamente lo que pasó en la casa con
 * `contextoMedido` (359 líneas con suite verde que nadie llamaba y hubo que
 * cablear en v2.3.14). Un módulo sin cable es una idea, no una mejora.
 *
 * LO QUE FIJA
 *   1. `server.ts` importa y USA la operación (una sola llamada, un solo punto).
 *      v1.0.30: la lógica salió del monolito a `prepararSistemaParaCache` para no
 *      seguir pagando líneas contra el trinquete; esta suite vigila las DOS
 *      mitades (que el server llame, y que el módulo haga lo que promete).
 *   2. La línea de fecha/hora sale del PRINCIPIO del bloque de sistema y se
 *      recoloca al final: si vuelve a entrar delante, cada turno cambia el
 *      prefijo y la caché se paga entera (la fuga original).
 *   3. La fecha sigue estando en el prompt (no se rompió la respuesta «¿qué día
 *      es hoy?» de v1.6.17, que costó encontrarlo).
 *   4. La compactación se decide por CARACTERES medidos / ventana del modelo, no
 *      por un número de tokens inventado.
 *   5. `abrir_red` declara resultados parciales: una URL caída no convierte la
 *      llamada entera en fracaso.
 *
 * LO QUE NO PRUEBA
 *   No mide aciertos de caché contra Groq ni Cloudflare (eso es red + cuenta).
 *   Prueba la propiedad del fuente que hace posible el acierto.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => (existsSync(path.join(RAIZ, rel)) ? readFileSync(path.join(RAIZ, rel), "utf8") : "");

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, cond: unknown, detalle?: string) => {
  if (cond) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  ✗ ${que}${detalle ? ` — ${detalle}` : ""}`); }
};

console.log("\n═══ ORDEN DEL PROMPT CABLEADO EN EL SERVER (v1.0.29) ═══\n");

const servidor = leer("server.ts");
const modulo = leer("src/engine/ordenDelPrompt.ts");

console.log("1) El módulo existe y es puro");
comprobar("★ src/engine/ordenDelPrompt.ts existe", modulo.length > 1000);
comprobar("exporta lo que el server necesita",
  /export function ordenarBloques/.test(modulo) && /export function decidirCompactacion/.test(modulo) && /export function compararPrefijos/.test(modulo));

console.log("\n2) El server lo usa de verdad, en el punto único del sistema");
comprobar("★ server.ts importa la operación completa", /import \{ prepararSistemaParaCache \} from "\.\/src\/engine\/ordenDelPrompt"/.test(servidor));
comprobar("★ y la LLAMA (no solo la importa)", /consolidatedSystemInstruction = prepararSistemaParaCache\(\{/.test(servidor));
comprobar("★ el resultado se adopta como bloque de sistema", /\}\)\.texto;/.test(servidor));
comprobar("mide con la ventana REAL del modelo del turno (numCtx), no una constante",
  /presion: presionDeTexto\(\{ texto: consolidatedSystemInstruction, ventanaTokens: getProfile\(modeloEfectivoTurno \|\| model\)\.numCtx \}\)\.fraccion/.test(servidor));
comprobar("★ la compactación decide con turnos REALES del historial",
  /turnosDisponibles: Array\.isArray\(history\) \? history\.length : 0/.test(servidor));
comprobar("se llama UNA sola vez (un segundo punto sería un prompt distinto para cada proveedor)",
  (servidor.match(/prepararSistemaParaCache\(/g) || []).length === 1,
  String((servidor.match(/prepararSistemaParaCache\(/g) || []).length));

console.log("\n3) La fecha cambió de sitio (la fuga original)");
comprobar("★ la fecha/hora se declara VOLÁTIL al ordenar",
  /id: "dato-real-fecha-hora", texto: fecha, estabilidad: "volatil", orden: 99/.test(modulo));
comprobar("★ y se extrae del bloque por su marca (no se duplica en el prompt)",
  /const i = base\.indexOf\(marca\)/.test(modulo) && /base = base\.slice\(0, i\)/.test(modulo));
comprobar("★ el módulo usa la MISMA marca que escribe el server",
  /MARCA_DATO_SISTEMA = "\\n\\n\[DATO REAL DEL SISTEMA — fecha y hora\]"/.test(modulo) &&
  /\[DATO REAL DEL SISTEMA — fecha y hora\]/.test(servidor));
comprobar("★★ la fecha SIGUE en el prompt (no se rompió la respuesta «¿qué día es hoy?»)",
  /\[DATO REAL DEL SISTEMA — fecha y hora\] Hoy es \$\{fechaDelSistema\}/.test(servidor));
comprobar("y sigue con la orden de no inventarla",
  /No lo deduzcas del historial ni lo inventes\./.test(servidor));
comprobar("el orden atrapa el fallo sin tumbar el turno", /catch \{ \/\* ordenar el prompt nunca debe tumbar el turno \*\//.test(servidor));

console.log("\n4) La nota de compactación no se mete delante");
comprobar("★ la nota se anexa AL FINAL del bloque (dentro del módulo, tras ordenar)",
  /const aviso = dec\.decision !== "no" && dec\.motivo/.test(modulo) && /if \(aviso\) texto \+= aviso;/.test(modulo));
{
  const iOrden = modulo.indexOf("const orden = ordenarBloques([");
  const iNota = modulo.indexOf("if (aviso) texto += aviso;");
  comprobar("★ y DESPUÉS de ordenar (si fuera antes, la orden la reordenaría a ciegas)", iOrden > 0 && iNota > iOrden, `${iOrden} / ${iNota}`);
}
comprobar("solo se anuncia cuando hay motivo (por debajo del umbral no cuesta nada)",
  /dec\.decision !== "no" && dec\.motivo \?/.test(modulo));

console.log("\n5) abrir_red: resultados parciales");
comprobar("★ declara el resumen de partes (pedidas / leídas / caídas)",
  /paginas_pedidas: paginas\.length, paginas_leidas: leidas, paginas_caidas: caidas\.length/.test(servidor));
comprobar("★ una URL caída se nombra con su motivo (no se tapa)",
  /fallidas: caidas\.map\(\(x: any\) => \(\{ url: x\.url, motivo: x\.error \}\)\)/.test(servidor));
comprobar("★ y `ok` es verdadero si ALGO salió: una caída no anula el trabajo"  ,
  /ok: leidas > 0 \|\| buscaOk,/.test(servidor));
comprobar("si no salió NADA, el aviso dice que es red del equipo y que no repita igual",
  /es un problema de red del equipo, no de la consulta\. No repitas la llamada igual/.test(servidor));

console.log("\n6) La guarda SSRF sigue en su sitio (no se perdió al tocar el caso)");
comprobar("★ abrir_red sigue bloqueando direcciones internas", /dirección interna bloqueada por seguridad/.test(servidor));
comprobar("★ y sigue exigiendo confirmar:true antes de salir a la red", /if \(args\?\.confirmar !== true\)/.test(servidor));

console.log(`\n═══ ORDEN DEL PROMPT CABLEADO: ${correctas} correctas · ${fallos.length} fallidas ═══`);
if (fallos.length) {
  console.log("\nFALLOS:\n" + fallos.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
