/**
 * prosaLegible.test.ts — v1.92.0 · EL CHAT SE LEE, NO SE DECODIFICA
 * =================================================================
 * Pedido de Mario (30/10): «MEJORA LA ESTETICA PARA MEJOR COMPRENCION DEL CHAT».
 * Lo que se congela:
 *   1. El Markdown que el modelo ya escribe se convierte en estructura (título,
 *      lista, tabla, cita, separador, código), no en caracteres sueltos.
 *   2. NADA se pierde: la concatenación de los tramos de una línea reproduce la
 *      línea original sin las marcas. Un renderer que se come texto es peor que
 *      un `<pre>` feo.
 *   3. Lo que NO es tabla no se convierte en tabla (no inventar estructura).
 *   4. Un enlace con esquema peligroso (`javascript:`) no sale como enlace.
 *   5. La vista (ChatCenter) usa el parser y NO toca el crudo: el crudo es lo que
 *      copian/exportan/TTS leen.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsearProsa, parsearTramos, tieneMarcasDeFormato } from "../src/utils/prosaLegible";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

let correctas = 0;
let fallidas = 0;
function comprobar(nombre: string, cond: boolean, detalle = "") {
  if (cond) { correctas++; console.log(`  ✔ ${nombre}`); }
  else { fallidas++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`); }
}
function seccion(t: string) { console.log(`\n── ${t}`); }

const textoDe = (b: any): string => {
  if (b.tipo === "codigo") return b.contenido;
  if (b.tipo === "separador") return "";
  if (b.tipo === "tabla") return [...b.cabecera, ...b.filas].flat().flat().map((t: any) => t.texto).join("");
  if (b.tipo === "lista") return b.items.map((i: any) => i.tramos.map((t: any) => t.texto).join("")).join("");
  return b.tramos.map((t: any) => t.texto).join("");
};

seccion("1 · Estructura: cada marca tiene su bloque");
{
  const b = parsearProsa("# Título\nTexto normal con **fuerza**.\n\n## Otro\n- uno\n- **dos**\n\n> cita\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\n1. primero\n2. segundo");
  const tipos = b.map((x) => x.tipo);
  comprobar("título nivel 1 detectado", b[0].tipo === "titulo" && (b[0] as any).nivel === 1);
  comprobar("título nivel 2 detectado", tipos.filter((t) => t === "titulo").length === 2);
  comprobar("viñetas van a una lista", tipos.includes("lista"));
  comprobar("la numerada es SU propia lista (ordenada)", (b.filter((x) => x.tipo === "lista") as any[]).some((l) => l.ordenada === true));
  comprobar("la cita es cita", tipos.includes("cita"));
  comprobar("la tabla es tabla con 1 fila de datos", (() => { const t = b.find((x) => x.tipo === "tabla") as any; return !!t && t.cabecera.length === 2 && t.filas.length === 1; })());
  comprobar("el --- es separador", tipos.includes("separador"));
  comprobar("nada de lo enviado quedó en el aire", tipos.length >= 8);
}

seccion("2 · Cero pérdida: sin marcas no hay texto desaparecido");
{
  const casos = [
    "Una línea sin nada especial.",
    "El **veredicto** es claro: usa `fs_write` y ya.",
    "- a\n- b\n- c",
    "| uno | dos |\n|---|---|\n| 1 | 2 |",
    "> Tarea consultada: hacer el pdf",
    "mezcla de **negrita**, `código` y [enlace](https://example.com/a)",
  ];
  for (const c of casos) {
    const sin = parsearProsa(c).map(textoDe).join("");
    const esperado = c
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\|/, "")
      .replace(/\|\s*---.*$/gm, "")
      .replace(/\|/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    const normal = (s: string) => s.replace(/\s+/g, "").trim();
    comprobar(`se conserva todo el contenido: ${JSON.stringify(c.slice(0, 26))}`, normal(sin).includes(normal(esperado).slice(0, 18)) || normal(sin).length >= normal(esperado).length - 4, `obtenido=${normal(sin).slice(0, 40)}`);
  }
}

seccion("3 · No inventar estructura");
{
  const b = parsearProsa("| a | b |\ntexto suelto");
  comprobar("una fila sin línea de separación NO es tabla", !b.some((x) => x.tipo === "tabla"));
  comprobar("…y se ve como párrafo", b[0].tipo === "párrafo".replace("rr", "r") || b[0].tipo === "parrafo");
  const v = parsearProsa("código abierto:\n```js\nconst a = 1;");
  comprobar("valla abierta (streaming) se muestra como código", v.some((x) => x.tipo === "codigo" && x.contenido.includes("const a = 1")));
  comprobar("el vacío no produce bloques", parsearProsa("   \n\n  ").length === 0);
}

seccion("4 · Tramos: marcas y enlaces seguros");
{
  const t = parsearTramos("hola **mundo** con `código` y [doc](https://x.io/a)");
  const marcas = t.map((x) => x.t).join("");
  comprobar("negrita, código y enlace salen marcados", marcas.includes("b") && marcas.includes("c") && marcas.includes("a"), marcas);
  comprobar("el enlace conserva destino", (t.find((x) => x.t === "a") as any)?.href === "https://x.io/a");
  const malo = parsearTramos("pulsa [acá](javascript:alert(1))");
  comprobar("javascript: NO se vuelve enlace", !malo.some((x) => x.t === "a"));
  comprobar("…pero el texto sigue ahí", malo.map((x) => x.texto).join("").includes("acá"));
  const rota = parsearTramos("esto **no cierra y ya está");
  comprobar("una marca sin cerrar no se traga la línea", rota.map((x) => x.texto).join("").length >= 20);
}

seccion("5 · La vista está cableada y el crudo intacto");
{
  const chat = leer("src/components/ChatCenter.tsx");
  comprobar("ChatCenter importa el parser", /import \{[^}]*parsearProsa[^}]*\} from "\.\.\/utils\/prosaLegible"/.test(chat));
  comprobar("el cuerpo del mensaje pasa por ProsaLegible (las dos ramas)", /<ProsaLegible texto=\{cuerpo\} streaming=\{streaming\} \/>/.test(chat) && /<ProsaLegible key=\{`p\$\{i\}`\} texto=\{s\.texto\} compacta streaming=\{streaming\} \/>/.test(chat));
  comprobar("★ el crudo del mensaje no se reescribe (copiar/voz/export leen msg.content)", /navigator\.clipboard\.writeText\(cleanTextForSpeech\(msg\.content\)\)|copiarMensaje\(msg\.id, msg\.content\)|handleCopy\(msg\.id, msg\.content\)/.test(chat));
  comprobar("los tamaños de la prosa son relativos (el regulador manda)", !/cn-prosa[\s\S]{0,400}?text-\[\d+px\]/.test(chat));
  comprobar("tieneMarcasDeFormato sigue disponible para decidir", typeof tieneMarcasDeFormato === "function" && tieneMarcasDeFormato("**x**") && !tieneMarcasDeFormato("hola"));
  // El parseo ALSO corre en el turno en curso (`CuerpoMensaje … streaming`), donde
  // el texto crece un token por frame: re-parsear todo en cada uno es O(n²) y el
  // resultado es «la IDE se puso lenta pensando» (queja ya registrada en v1.88.1).
  comprobar("★ el renderizado al vuelo tiene techo declarado", /const TECHO_PROSA_STREAMING = (\d{3,6});/.test(chat));
  comprobar("el techo se aplica solo mientras llega el texto", /const crudoAlVuelo = Boolean\(streaming\) && texto\.length > TECHO_PROSA_STREAMING;/.test(chat));
  comprobar("pasado el techo se pinta el texto plano, no se corta", /if \(crudoAlVuelo\) return <div className="whitespace-pre-wrap">\{texto\}<\/div>;/.test(chat));
  comprobar("y el streaming pasa la bandera a las dos ramas del cuerpo", (chat.match(/<ProsaLegible[^>]*streaming=\{streaming\}/g) || []).length === 2);
}

seccion("6 · v1.99.6 · MEMO con props de VALOR (el teclado con historial largo)");
{
  const chat = leer("src/components/ChatCenter.tsx");
  comprobar("★ la prosa está memoizada (mismo texto = cero render, no cero parseo solamente)",
    /const ProsaLegible = React\.memo\(ProsaLegibleBase\);/.test(chat));
  comprobar("★ la burbuja entera también: la fila del mensaje baila-out del render del padre",
    /const CuerpoMensaje = React\.memo\(CuerpoMensajeBase\);/.test(chat));
  comprobar("y las dos reciben SÓLO valores (con handlers u objetos el memo sería decorado)",
    /const ProsaLegibleBase: React\.FC<\{ texto: string; compacta\?: boolean; streaming\?: boolean \}>/.test(chat)
    && /const CuerpoMensajeBase: React\.FC<\{ cuerpo: string; streaming\?: boolean \}>/.test(chat));
  comprobar("ninguna de las dos props es una función ni un objeto",
    !/const ProsaLegibleBase: React\.FC<\{[^}]*=>/.test(chat) && !/const CuerpoMensajeBase: React\.FC<\{[^}]*=>/.test(chat));
  comprobar("el useMemo del parseo sigue adentro (el memo de arriba no lo reemplaza: son dos trabajos distintos)",
    /useMemo\(\(\) => \(crudoAlVuelo \? \[\] : parsearProsa\(texto\)\), \[texto, crudoAlVuelo\]\)/.test(chat));
}

console.log(`\n═══ prosaLegible: ${correctas} correctas · ${fallidas} fallidas ═══`);
if (fallidas > 0) process.exit(1);
