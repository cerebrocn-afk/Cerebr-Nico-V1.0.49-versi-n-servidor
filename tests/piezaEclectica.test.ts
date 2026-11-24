/**
 * piezaEclectica.test.ts — v1.92.0 · EL INFORME ECLÉCTICO DESARMADO EN PIEZAS
 * ==========================================================================
 * Pedido de Mario (30/10): «RESTRUCRURA ESTETICA DE ECLEPTICO».
 * La valla que importa NO es cómo se ve, sino que el desarme sea **fiel**: cada
 * pieza del informe de `informeEclectico`/`bloqueDeObra` (formato real, generado
 * acá con el generador de la casa, no con un texto inventado por quien escribe el
 * test) llega a su pieza, y lo que no se reconoce sobrevive en `resto`.
 *
 * Si alguien cambia el formato del informe sin tocar el parser, esta suite canta:
 * `resto` se llena o una pieza esperada queda vacía.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { informeEclectico, bloqueDeObra, dividirEclectica } from "../src/engine/enjambreEclectico";
import { dividirInformeEclectico } from "../src/utils/piezaEclectica";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

/** Informe REAL: se arma con el mismo generador que ve el usuario. */
function informeDeMuestra(conObra = true): string {
  const respuestas = [
    { provider: "zai", model: "glm-4.5-flash", ok: true, texto: "Escribí el PDF con jsPDF.", ms: 812 },
    { provider: "groq", model: "llama-3.3-70b-versatile", ok: true, texto: "Generá el informe en un archivo.", ms: 900 },
    { provider: "openrouter", model: "openrouter/free", ok: false, texto: "", error: "HTTP 429: cuota gratuita agotada", ms: 210 },
  ] as any[];
  const evaluadas = [
    { provider: "zai", model: "glm-4.5-flash", ok: true, puntaje: 78, etiquetas: ["concreto"], ms: 812 },
    { provider: "groq", model: "llama-3.3-70b-versatile", ok: true, puntaje: 55, etiquetas: [], ms: 900 },
    { provider: "openrouter", model: "openrouter/free", ok: false, puntaje: 0, etiquetas: [], ms: 210 },
  ] as any[];
  const veredicto = {
    origen: "medido",
    confianza: 0.62,
    veredicto: "El archivo quedó escrito en `informes/plan.pdf` con 3 páginas.",
    resumen: "Dos voces coinciden: usar jsPDF y escribir el archivo en el workspace.",
    mejorVoz: "zai/glm-4.5-flash",
    coincidencias: ["usar jsPDF para armar el pdf", "escribir el archivo en el workspace"],
    divergencias: ["una voz propone pdfmake en lugar de jspdf"],
    riesgos: ["la tercera voz no contestó y no aporta verificación"],
  } as any;
  const uno = informeEclectico({
    tarea: "haceme un pdf con el plan",
    respuestas,
    evaluadas,
    veredicto,
    motivoArmado: "Enjambre de 3 voces de 3 proveedores distintos.",
    notaMemoria: "Memoria: 2 turnos previos.",
  });
  if (!conObra) return uno;
  const obra = {
    intentado: true,
    ok: true,
    pasos: [
      { nombre: "fs_write", ok: true, resumen: "Escrito informes/plan.pdf (20480 bytes)" },
      { nombre: "exec", ok: false, resumen: "❌ comando no permitido" },
    ],
    texto: "PDF escrito en el workspace.",
    ejecutor: "zai/glm-4.5-flash",
    vueltas: 2,
  };
  return `${uno}\n\n${bloqueDeObra(obra as any)}`;
}

seccion("1 · Piezas completas sobre el informe real");
{
  const p = dividirInformeEclectico(informeDeMuestra());
  comprobar("el informe se reconoce como ecléctico", p !== null);
  const q = p!;
  comprobar("cabecera con el rótulo 🎭", /🎭\s*RESPUESTA ECLÉCTICA/.test(q.cabecera));
  comprobar("cada voz es una fila con su estado", q.voces.length === 3, JSON.stringify(q.voces.map((v) => v.voz)));
  comprobar("la voz que falló se marca como NO ok", q.voces.some((v) => !v.ok && /openrouter/.test(v.voz)) && q.voces.filter((v) => v.ok).length === 2);
  comprobar("los puntos y ms viajan por columna", q.voces.every((v) => v.puntaje !== "" && v.ms !== ""));
  comprobar("el acuerdo sale como número limpio", /^\d{1,3}$/.test(q.acuerdo));
  comprobar("la mejor voz es la que dice el evaluador", q.mejorVoz.includes("glm"));
  comprobar("coincidencias, divergencias y riesgos separados", q.coincidencias.length === 2 && q.divergencias.length === 1 && q.riesgos.length === 1);
  comprobar("resumen y veredicto tienen su propia pieza", q.resumen.includes("jsPDF") && q.veredicto.includes("plan.pdf"));
  comprobar("la tarea consultada no se pierde", q.tarea.includes("pdf"));
  comprobar("la fase 2 sale con sus pasos y su ✔/✗", !!q.obra && q.obra!.pasos.length === 2 && q.obra!.pasos[0].ok === true && q.obra!.pasos[1].ok === false);
  comprobar("★ NADA se perdió: `resto` queda vacío en el formato conocido", q.resto === "", q.resto.slice(0, 120));
}

seccion("2 · Sin fase 2 (pregunta, no tarea)");
{
  const p = dividirInformeEclectico(informeDeMuestra(false));
  comprobar("no hay obra y no se inventa", p !== null && p.obra === null);
  comprobar("el resto de las piezas sigue completo", p!.voces.length === 3 && p!.veredicto.includes("plan.pdf") && p!.resto === "");
}

seccion("3 · Formato desconocido: no recortar, no mentir");
{
  const extra = `${informeDeMuestra(false)}\n\n**Sección que la casa no conoce todavía:**\n- dato valioso\n`;
  const p = dividirInformeEclectico(extra);
  comprobar("una marca nueva cae en `resto` CON su rótulo", !!p && /Sección que la casa no conoce/.test(p.resto) && /dato valioso/.test(p.resto));
  comprobar("las piezas conocidas no se rompen por culpa de la nueva", !!p && p.voces.length === 3);
  comprobar("un texto cualquiera NO es informe", dividirInformeEclectico("hola, ¿cómo estás?") === null);
  comprobar("el vacío tampoco", dividirInformeEclectico("") === null);
}

seccion("4 · Bucle declarado: se ve, no se esconde");
{
  const conBucle = informeDeMuestra(false).split("\n");
  conBucle.splice(1, 0, "  ⛔ BUCLE DE REPETICIÓN DETECTADO: la misma tarea 3 veces");
  const p = dividirInformeEclectico(conBucle.join("\n"));
  comprobar("el aviso de bucle llega como pieza propia", !!p && /BUCLE DE REPETICIÓN/.test(p.bucle));
}

seccion("5 · La vista pinta piezas, no un muro");
{
  const chat = leer("src/components/ChatCenter.tsx");
  comprobar("ChatCenter usa el desarmador", /dividirInformeEclectico\(ecl\.detalle\)/.test(chat));
  comprobar("el veredicto y el resumen se ven SIN desplegar", /veredicto final de la tarea/.test(chat) && /resumen del enjambre/.test(chat));
  comprobar("las voces se pintan en tabla real", /functionDeclarations/.test(chat) === false && /<th[^>]*>voz<\/th>|>\s*voz\s*</.test(chat));
  comprobar("el acuerdo es una barra, no solo un número", /const BarraAcuerdo/.test(chat));
  comprobar("★ si el informe no calza, se ve el CRUDO (nunca se esconde sin reemplazar)", /whitespace-pre-wrap\">\{ecl\.resolucion\}<\/div>/.test(chat) && /\{ecl\.detalle\}</.test(chat));
  comprobar("los pasos de la fase 2 conservan su ✔/✗", /s\.ok \? "✔" : "✗"/.test(chat));
}

console.log(`\n═══ piezaEclectica: ${correctas} correctas · ${fallidas} fallidas ═══`);
if (fallidas > 0) process.exit(1);
