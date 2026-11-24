/**
 * cerebroOrgano.ts — EL ÓRGANO DE REDIRECCIÓN («.con-ciencia») · v1.48.0
 * ============================================================
 * PEDIDO DE MARIO (en sus palabras): un `cerebro.md` que funcione como un
 * «cerebro» de verdad — un ÓRGANO que NO se lee entero cada vez, sino que
 * REDIRIGE a la información exacta por tema, título y contexto; que aprenda
 * solo la semántica a medida que trabaja; y que viva en una base de datos
 * local bajo C:\Cerebronico\cerebro\, ligada al agente por el puente :5000/MCP.
 *
 * CÓMO MADURA LA IDEA (y por qué así):
 *   · El «cerebro» NO es un único .md gigante que haya que cargar entero (eso
 *     llena la ventana del modelo y, con 8 GB de RAM, es la diferencia entre
 *     responder y colgarse). Es una BASE DE DATOS pequeña:
 *        cerebro/
 *          ├─ indice.json      ← EL ÓRGANO: tabla de ruteo (tema/título/palabras
 *          │                     → archivo). Es lo único que se lee para DECIDIR.
 *          ├─ CEREBRO.md       ← cara humana: índice legible de lo aprendido.
 *          └─ temas/<slug>.md  ← el conocimiento de verdad, UNO por entrada.
 *   · ENRUTAR = puntuar la consulta contra el índice (solapamiento de palabras
 *     + peso de tema/título) y devolver SÓLO las entradas que ganan. El motor
 *     entonces lee UN PUÑADO de archivos pequeños, nunca todo el cerebro.
 *   · APRENDER = cuando el agente cierra algo útil (una decisión, una receta,
 *     un patrón del proyecto), escribe una entrada: extrae palabras clave
 *     semánticas del tema+título+texto y las registra en el índice. Así el
 *     cerebro «se auto-aprende» sin que nadie reescriba el índice a mano.
 *
 * REGLAS DE LA CASA RESPETADAS:
 *   · Módulo PURO de Node (fs/path/crypto): cero red, cero dependencias nuevas,
 *     cero Ollama. Vive bajo src/engine/ como los demás órganos del motor.
 *   · Escritura ATÓMICA (tmp + rename), igual que memoria.md: un corte de luz
 *     no deja el índice a medias.
 *   · ADITIVO y NO destructivo: si el cerebro no existe o está vacío, todas las
 *     funciones devuelven vacío sin romper nada. No toca ni un archivo del
 *     proyecto del usuario; vive en su propia carpeta.
 */

import fs from "fs";
import path from "path";
import nodeCrypto from "node:crypto";

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

/** Una entrada del cerebro: un trozo de conocimiento con sus señas de ruteo. */
export interface EntradaCerebro {
  /** id estable (slug + hash corto): también es el nombre del archivo .md */
  id: string;
  /** tema / categoría (p.ej. "arranque", "proveedores", "ui", "sandbox") */
  tema: string;
  /** título humano de la entrada */
  titulo: string;
  /** palabras clave semánticas por las que se enruta (ya normalizadas) */
  palabras: string[];
  /** archivo relativo dentro de cerebro/ (p.ej. "temas/arranque-xxx.md") */
  archivo: string;
  /** resumen de UNA línea para el índice humano y la cabecera del contexto */
  resumen: string;
  /** peso/importancia (sube si la entrada se vuelve a reforzar) */
  peso: number;
  /** marca de tiempo de la última actualización (ISO) */
  ts: string;
}

export interface IndiceCerebro {
  version: 1;
  actualizado: string;
  entradas: EntradaCerebro[];
}

/** Resultado de enrutar: la entrada + por qué ganó (para explicar el ruteo). */
export interface Ruta {
  entrada: EntradaCerebro;
  score: number;
  coincidencias: string[];
}

// ------------------------------------------------------------
// Rutas de la base local
// ------------------------------------------------------------

/** Carpeta raíz del cerebro bajo la raíz de datos (C:\Cerebronico\cerebro). */
export function rutaCerebro(raizDatos: string): string {
  return path.join(raizDatos, "cerebro");
}
function rutaIndice(raizDatos: string): string {
  return path.join(rutaCerebro(raizDatos), "indice.json");
}
function rutaTemas(raizDatos: string): string {
  return path.join(rutaCerebro(raizDatos), "temas");
}
function rutaCerebroMd(raizDatos: string): string {
  return path.join(rutaCerebro(raizDatos), "CEREBRO.md");
}

// ------------------------------------------------------------
// Normalización semántica (tokenizador en español, sin acentos, sin ruido)
// ------------------------------------------------------------

/** Palabras vacías (stopwords) del español que NO sirven para enrutar. */
const VACIAS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a",
  "en", "y", "o", "u", "que", "con", "por", "para", "se", "su", "sus", "lo",
  "le", "les", "mi", "tu", "es", "son", "ser", "esta", "este", "esto", "estos",
  "estas", "como", "mas", "muy", "ya", "si", "no", "ni", "pero", "porque",
  "cuando", "donde", "cual", "cuales", "hay", "ha", "he", "han", "fue", "era",
  "the", "of", "and", "to", "in", "is", "it", "for", "on", "with", "as", "at",
]);

/** Baja a minúsculas, quita acentos y signos, y parte en palabras útiles. */
export function normalizar(texto: string): string[] {
  const limpio = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes/diéresis
    .replace(/[^a-z0-9\s_\-\.]/g, " ");
  const bruto = limpio.split(/[\s_\-\.]+/).filter(Boolean);
  const out: string[] = [];
  for (const w of bruto) {
    if (w.length < 3) continue; // ruido: "ok", "id"…
    if (VACIAS.has(w)) continue;
    out.push(w);
  }
  return out;
}

/** Palabras úNICAS (set) para no inflar el peso con repeticiones. */
function unicas(ws: string[]): string[] {
  return [...new Set(ws)];
}

// ------------------------------------------------------------
// Persistencia del índice (lectura tolerante + escritura atómica)
// ------------------------------------------------------------

// ------------------------------------------------------------
// CACHÉ DE ÍNDICE EN TIEMPO REAL (indexación sin re-parsear en cada consulta)
// ------------------------------------------------------------
//
// PROBLEMA que resuelve: `enrutar()` se llama en CADA turno (y a veces varias
// veces por turno, desde cada proveedor). Antes releía y re-parseaba
// `indice.json` entero del disco siempre — con un cerebro que crece, eso es
// lectura+JSON.parse en el camino caliente, justo en una máquina con 8 GB.
//
// SOLUCIÓN «en tiempo real»: cacheamos el índice ya parseado en memoria,
// marcado con el `mtimeMs` + `size` del archivo. En cada carga hacemos un
// `fs.statSync` barato (sin leer el contenido):
//   · si el archivo NO cambió desde la última vez → servimos la copia cacheada
//     (cero lectura, cero parse).
//   · si cambió (el agente aprendió algo, o alguien editó el .json a mano) →
//     el stat lo detecta al instante y recargamos. Por eso es «tiempo real»:
//     el aprendizaje se ve en la siguiente consulta sin reiniciar nada.
// Además `guardarIndice` siembra el caché con lo que acaba de escribir, para
// que el PRIMER enrutado tras aprender tampoco toque disco.
//
// Es un caché por `raizDatos` (puede haber más de un cerebro) y 100% opcional:
// si el stat falla, caemos al camino antiguo (leer+parsear) sin romper nada.
interface EntradaCache {
  mtimeMs: number;
  size: number;
  indice: IndiceCerebro;
  /**
   * v1.48.0 · ÍNDICE DE BÚSQUEDA PRECALCULADO (perf del motor de autoconciencia).
   * `enrutar()` corre en el camino caliente (una o varias veces por turno). Antes
   * re-normalizaba el tema y el título de CADA entrada en CADA consulta —NFD +
   * regex + split + Set— aunque eso solo cambia cuando cambia el índice. Aquí lo
   * precalculamos UNA vez por versión del índice y lo servimos ya listo. Es
   * perezoso (se arma al primer `enrutar`) y comparte la validez del caché: si el
   * archivo cambia, nace un `EntradaCache` nuevo sin `buscador` y se reconstruye.
   */
  buscador?: EntradaIndexada[];
}

/** Una entrada con sus Sets de ruteo ya calculados (tema/título/palabras). */
interface EntradaIndexada {
  entrada: EntradaCerebro;
  setTema: Set<string>;
  setTitulo: Set<string>;
  setPal: Set<string>;
}

/** Precalcula los Sets de ruteo de todas las entradas (una vez por índice). */
function indexarEntradas(entradas: EntradaCerebro[]): EntradaIndexada[] {
  return entradas.map((e) => ({
    entrada: e,
    setTema: new Set(normalizar(e.tema)),
    setTitulo: new Set(normalizar(e.titulo)),
    setPal: new Set(e.palabras),
  }));
}

const cacheIndice = new Map<string, EntradaCache>();

/** Clona superficialmente el índice para que quien lo reciba no mute el caché. */
function clonarIndice(src: IndiceCerebro): IndiceCerebro {
  return {
    version: 1,
    actualizado: src.actualizado,
    entradas: src.entradas.map((e) => ({ ...e, palabras: [...e.palabras] })),
  };
}

/** Siembra/actualiza el caché con un índice recién escrito. */
function sembrarCache(raizDatos: string, indice: IndiceCerebro): void {
  try {
    const st = fs.statSync(rutaIndice(raizDatos));
    cacheIndice.set(path.resolve(rutaCerebro(raizDatos)), {
      mtimeMs: st.mtimeMs,
      size: st.size,
      indice: clonarIndice(indice),
    });
  } catch { /* si no se puede sellar el caché, la próxima lectura recarga */ }
}

/** Invalida el caché de un cerebro (p.ej. si se borra la carpeta a mano). */
export function invalidarCacheCerebro(raizDatos: string): void {
  cacheIndice.delete(path.resolve(rutaCerebro(raizDatos)));
}

/** Lee el órgano de ruteo. Si no existe o está corrupto, devuelve uno vacío. */
export function cargarIndice(raizDatos: string): IndiceCerebro {
  const vacio: IndiceCerebro = { version: 1, actualizado: new Date().toISOString(), entradas: [] };
  try {
    const p = rutaIndice(raizDatos);
    if (!fs.existsSync(p)) return vacio;
    // TIEMPO REAL: un stat barato decide si el caché sigue vigente.
    const clave = path.resolve(rutaCerebro(raizDatos));
    let st: fs.Stats | null = null;
    try { st = fs.statSync(p); } catch { st = null; }
    if (st) {
      const cached = cacheIndice.get(clave);
      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
        return clonarIndice(cached.indice); // golpe de caché: cero lectura/parse
      }
    }
    const crudo = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!crudo || !Array.isArray(crudo.entradas)) return vacio;
    // Saneado defensivo: una entrada rota no tumba el cerebro entero.
    const entradas: EntradaCerebro[] = crudo.entradas
      .filter((e: any) => e && e.id && e.archivo)
      .map((e: any) => ({
        id: String(e.id),
        tema: String(e.tema || "general"),
        titulo: String(e.titulo || e.id),
        palabras: Array.isArray(e.palabras) ? e.palabras.map(String) : [],
        archivo: String(e.archivo),
        resumen: String(e.resumen || ""),
        peso: Number.isFinite(e.peso) ? Number(e.peso) : 1,
        ts: String(e.ts || new Date().toISOString()),
      }));
    const indice: IndiceCerebro = { version: 1, actualizado: String(crudo.actualizado || new Date().toISOString()), entradas };
    // Sella el caché con el estado recién leído (si tenemos stat).
    if (st) cacheIndice.set(clave, { mtimeMs: st.mtimeMs, size: st.size, indice: clonarIndice(indice) });
    return indice;
  } catch {
    return vacio;
  }
}

/** Escribe un archivo de forma atómica (tmp + rename): nunca a medias. */
function escribirAtomico(destino: string, contenido: string): void {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = `${destino}.tmp-${nodeCrypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(tmp, contenido, "utf-8");
  fs.renameSync(tmp, destino);
}

/** Guarda el índice y regenera la cara humana (CEREBRO.md). */
export function guardarIndice(raizDatos: string, indice: IndiceCerebro): void {
  indice.actualizado = new Date().toISOString();
  escribirAtomico(rutaIndice(raizDatos), JSON.stringify(indice, null, 2));
  // TIEMPO REAL: siembra el caché con lo recién escrito, para que el primer
  // enrutado tras aprender no vuelva a leer el disco.
  sembrarCache(raizDatos, indice);
  try {
    escribirAtomico(rutaCerebroMd(raizDatos), renderCerebroMd(indice));
  } catch { /* la cara humana es un extra: nunca debe tumbar el guardado */ }
}

/** El índice humano: lista legible de lo que el cerebro sabe, por tema. */
function renderCerebroMd(indice: IndiceCerebro): string {
  const porTema = new Map<string, EntradaCerebro[]>();
  for (const e of indice.entradas) {
    const arr = porTema.get(e.tema) || [];
    arr.push(e);
    porTema.set(e.tema, arr);
  }
  const lineas: string[] = [];
  lineas.push("# CEREBRO — órgano de redirección (.con-ciencia)");
  lineas.push("");
  lineas.push("> Cara humana del cerebro. NO se lee entero: el motor consulta");
  lineas.push("> `indice.json` para enrutar y sólo abre los `temas/*.md` que ganan.");
  lineas.push("");
  lineas.push(`Entradas: ${indice.entradas.length} · Actualizado: ${indice.actualizado}`);
  lineas.push("");
  for (const [tema, arr] of [...porTema.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lineas.push(`## ${tema}`);
    for (const e of arr.sort((a, b) => b.peso - a.peso)) {
      lineas.push(`- **${e.titulo}** — ${e.resumen || "(sin resumen)"}  \`[${e.archivo}]\``);
    }
    lineas.push("");
  }
  return lineas.join("\n");
}

// ------------------------------------------------------------
// ENRUTAR — el órgano decide qué leer (sin leer todo)
// ------------------------------------------------------------

/**
 * Puntuación de una entrada YA INDEXADA contra las palabras (únicas) de la
 * consulta. Peso: una coincidencia en el TEMA o el TÍTULO vale más que en el
 * cuerpo, porque es la señal que el usuario pidió («enruta por tema/título/
 * contexto»). La matemática es idéntica a la versión previa; lo único que
 * cambió es que los Sets llegan precalculados (no se rehacen por consulta) y
 * que `tokens` ya viene deduplicado por el llamador (una vez, no por entrada).
 */
function puntuarIndexada(ix: EntradaIndexada, tokens: string[]): { score: number; hits: string[] } {
  if (tokens.length === 0) return { score: 0, hits: [] };
  const hits: string[] = [];
  let score = 0;
  for (const t of tokens) {
    let aporta = 0;
    if (ix.setTema.has(t)) aporta += 3;
    if (ix.setTitulo.has(t)) aporta += 2;
    if (ix.setPal.has(t)) aporta += 1;
    if (aporta > 0) {
      score += aporta;
      hits.push(t);
    }
  }
  // El peso de la entrada modula (una decisión reforzada pesa más), pero no
  // domina: una coincidencia fuerte en tema siempre vence a peso bruto.
  if (score > 0) score += Math.min(2, Math.log2(1 + Math.max(0, ix.entrada.peso)));
  return { score, hits };
}

/**
 * Devuelve el índice de búsqueda precalculado para esta raíz. Asegura primero
 * que el caché esté vigente (vía `cargarIndice`, que hace el stat barato) y
 * construye el `buscador` perezosamente la primera vez. Si no hay caché (stat
 * falló o archivo raro), cae al camino honesto: indexa al vuelo sin cachear.
 */
function obtenerBuscador(raizDatos: string): EntradaIndexada[] {
  const idx = cargarIndice(raizDatos); // puebla/revalida el caché por stat
  const cached = cacheIndice.get(path.resolve(rutaCerebro(raizDatos)));
  if (cached) {
    if (!cached.buscador) cached.buscador = indexarEntradas(cached.indice.entradas);
    return cached.buscador;
  }
  return indexarEntradas(idx.entradas);
}

/**
 * ENRUTAR: puntua la consulta contra el índice y devuelve las entradas que
 * ganan, de mayor a menor. ESTO es la «redirección»: no abre ningún .md, solo
 * dice CUÁLES valdría la pena abrir.
 */
export function enrutar(raizDatos: string, consulta: string, max = 4): Ruta[] {
  const buscador = obtenerBuscador(raizDatos);
  if (buscador.length === 0) return [];
  // Deduplicamos los tokens de la consulta UNA sola vez (antes se rehacía el
  // Set dentro de `puntuar` por cada entrada del índice).
  const tokens = unicas(normalizar(consulta));
  if (tokens.length === 0) return [];
  const rutas: Ruta[] = [];
  for (const ix of buscador) {
    const { score, hits } = puntuarIndexada(ix, tokens);
    if (score > 0) rutas.push({ entrada: ix.entrada, score, coincidencias: hits });
  }
  rutas.sort((a, b) => b.score - a.score || b.entrada.peso - a.entrada.peso);
  // Clonamos SOLO el puñado que devolvemos: el `buscador` referencia las
  // entradas canónicas del caché, así que entregamos copias para que nadie las
  // mute por accidente (misma garantía de aislamiento que `cargarIndice`).
  return rutas.slice(0, Math.max(1, max)).map((r) => ({
    entrada: { ...r.entrada, palabras: [...r.entrada.palabras] },
    score: r.score,
    coincidencias: r.coincidencias,
  }));
}

/** Lee el cuerpo de UNA entrada, recortado al presupuesto de caracteres. */
export function leerEntrada(raizDatos: string, entrada: EntradaCerebro, budget = 1500): string {
  try {
    const abs = path.join(rutaCerebro(raizDatos), entrada.archivo);
    if (!fs.existsSync(abs)) return "";
    const txt = fs.readFileSync(abs, "utf-8");
    return txt.length > budget ? txt.slice(0, budget) + "\n…(recortado)" : txt;
  } catch {
    return "";
  }
}

// ------------------------------------------------------------
// APRENDER — el cerebro se auto-escribe (semántica por tema/título/contexto)
// ------------------------------------------------------------

// v1.99.5 · el `slug` y la forma del nombre viven en `nombreArchivo.ts`: los necesita también
// `arraigo`, que planifica sin tocar disco. Dos fórmulas de nombre = un asiento predicho que
// nunca coincide con el archivo escrito.
import { slug, idDeEntrada } from "./nombreArchivo";

/**
 * Extrae palabras clave semánticas de tema+título+texto. El tema y el título
 * entran SIEMPRE (son la intención explícita); del cuerpo se toman las
 * palabras más frecuentes que no son ruido. Así el ruteo futuro acierta sin
 * que nadie escriba las palabras a mano.
 */
export function extraerPalabras(tema: string, titulo: string, texto: string, tope = 24): string[] {
  const fuertes = unicas([...normalizar(tema), ...normalizar(titulo)]);
  const frec = new Map<string, number>();
  for (const w of normalizar(texto)) frec.set(w, (frec.get(w) || 0) + 1);
  const delCuerpo = [...frec.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .filter((w) => !fuertes.includes(w));
  return unicas([...fuertes, ...delCuerpo]).slice(0, tope);
}

export interface EntradaNueva {
  tema: string;
  titulo: string;
  texto: string;
  /** opcional: palabras extra que fuerza el llamador */
  palabras?: string[];
  /** opcional: resumen de una línea (si falta, se toma la 1ª línea del texto) */
  resumen?: string;
  /**
   * v1.99.5 · ANCLA DETERMINISTA para el arraigo. Sin ella el `id` lleva 3 bytes al azar, así que
   * «el eje» nace con un nombre distinto en cada máquina y en cada reinstalación: el mapa de
   * hemisferios no puede saber DÓNDE vive su pieza y el reflejo queda en `deuda` eterna. Con `id`
   * el archivo es `temas/<tema>-<titulo>-<ancla>.md`, siempre el mismo. No cambia nada para el
   * resto de los llamantes: es opcional y sólo afecta a las entradas NUEVAS (las existentes se
   * siguen actualizando por tema+titulo, con el archivo que ya tenían).
   */
  id?: string;
}

/**
 * APRENDER: registra (o refuerza) una entrada en el cerebro.
 * · Si ya existe una entrada con el mismo tema+título, se ACTUALIZA su cuerpo y
 *   sube su peso (refuerzo), en vez de duplicar.
 * · Devuelve la entrada resultante. Nunca lanza: un fallo de aprendizaje jamás
 *   debe tumbar el turno del agente.
 */
export function aprender(raizDatos: string, nueva: EntradaNueva): EntradaCerebro | null {
  try {
    const tema = (nueva.tema || "general").trim() || "general";
    const titulo = (nueva.titulo || "nota").trim() || "nota";
    const texto = String(nueva.texto || "").trim();
    if (!texto) return null;
    const indice = cargarIndice(raizDatos);
    const clave = `${slug(tema)}::${slug(titulo)}`;
    const existente = indice.entradas.find((e) => `${slug(e.tema)}::${slug(e.titulo)}` === clave);
    const resumen =
      (nueva.resumen && nueva.resumen.trim()) ||
      texto.split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 160) ||
      titulo;
    const palabras = unicas([
      ...extraerPalabras(tema, titulo, texto),
      ...(nueva.palabras || []).flatMap((p) => normalizar(p)),
    ]);
    const ahora = new Date().toISOString();
    let entrada: EntradaCerebro;
    if (existente) {
      entrada = existente;
      entrada.tema = tema;
      entrada.titulo = titulo;
      entrada.resumen = resumen;
      entrada.palabras = palabras;
      entrada.peso = (entrada.peso || 1) + 1; // refuerzo
      entrada.ts = ahora;
    } else {
      // v1.99.5 · con `id` el sello es el que trajo el llamante (arraigo): misma pieza, mismo
      // archivo, en cualquier máquina y después de reinstalar. Sin `id`, comportamiento histórico.
      const sello = (nueva.id ? slug(String(nueva.id)) : "") || nodeCrypto.randomBytes(3).toString("hex");
      const id = idDeEntrada(tema, titulo, sello);
      entrada = {
        id,
        tema,
        titulo,
        palabras,
        // Literal y con barra: es LA forma que `archivoDeEntrada` predice. `path.join` daría
        // `temas\…` en Windows y el asiento del plano no coincidiría con el archivo escrito.
        archivo: `temas/${id}.md`,
        resumen,
        peso: 1,
        ts: ahora,
      };
      indice.entradas.push(entrada);
    }
    // Cuerpo de la entrada (el conocimiento de verdad), con cabecera legible.
    const cuerpo =
      `# ${titulo}\n` +
      `> tema: ${tema} · actualizado: ${ahora} · refuerzos: ${entrada.peso}\n\n` +
      texto +
      "\n";
    escribirAtomico(path.join(rutaCerebro(raizDatos), entrada.archivo), cuerpo);
    guardarIndice(raizDatos, indice);
    return entrada;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// INYECCIÓN EN EL PROMPT — solo lo enrutado, nunca todo el cerebro
// ------------------------------------------------------------

/**
 * Arma el bloque de contexto para el turno: enruta la consulta, abre SÓLO las
 * entradas que ganan y las ensambla recortadas al presupuesto total. Si el
 * cerebro está vacío o nada enruta, devuelve "" (no gasta ni un token).
 */
export function buildCerebroContext(raizDatos: string, consulta: string, budgetTotal = 1600, rutasForzadas?: Ruta[]): string {
  // v1.84.0 · FASE 2: cuando el llamante ya enruto en HÍBRIDO (vector + palabra,
  // `enrutarHibrido`), trae sus rutas y acá solo se leen los cuerpos con el
  // presupuesto de siempre. Sin rutas forzadas, el comportamiento es idéntico
  // al histórico: ruteo por palabra.
  const rutas = rutasForzadas && rutasForzadas.length > 0 ? rutasForzadas.slice(0, 4) : enrutar(raizDatos, consulta, 4);
  if (rutas.length === 0) return "";
  // El presupuesto se reparte entre las entradas que ganaron (mínimo útil 300).
  const porEntrada = Math.max(300, Math.floor(budgetTotal / rutas.length));
  const partes: string[] = [];
  let gastado = 0;
  for (const r of rutas) {
    if (gastado >= budgetTotal) break;
    const cuerpo = leerEntrada(raizDatos, r.entrada, Math.min(porEntrada, budgetTotal - gastado));
    if (!cuerpo) continue;
    partes.push(
      `• [${r.entrada.tema}] ${r.entrada.titulo} (relevancia ${r.score}; señales: ${r.coincidencias.join(", ") || "—"})\n${cuerpo}`
    );
    gastado += cuerpo.length;
  }
  if (partes.length === 0) return "";
  return (
    "## CEREBRO (.con-ciencia) — conocimiento ENRUTADO para esta consulta\n" +
    "El órgano de redirección seleccionó SOLO estas entradas de tu memoria de\n" +
    "largo plazo (no es todo el cerebro, es lo pertinente). Úsalas como contexto\n" +
    "de confianza; si algo contradice el estado real del proyecto, manda la realidad.\n\n" +
    partes.join("\n\n")
  );
}

/** Retrato numérico del cerebro, para reportes honestos (/estado, logs). */
export function estadoCerebro(raizDatos: string): { entradas: number; temas: number; bytes: number; ruta: string } {
  const indice = cargarIndice(raizDatos);
  const temas = new Set(indice.entradas.map((e) => e.tema)).size;
  let bytes = 0;
  try {
    const dir = rutaTemas(raizDatos);
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        try { bytes += fs.statSync(path.join(dir, f)).size; } catch { /* ignora */ }
      }
    }
  } catch { /* ignora */ }
  return { entradas: indice.entradas.length, temas, bytes, ruta: rutaCerebro(raizDatos) };
}

// ══════════════════════════════════════════════════════════════════════
// v1.84.0 · FASE 2 — LA MITAD VECTORIAL DEL ÓRGANO (X22 del plano maestro)
// ──────────────────────────────────────────────────────────────────────
// «Si la tarea no usa la palabra exacta del recuerdo, el recuerdo no
// existe»: eso se acabó acá. El índice de palabras sigue siendo la base
// (y el fallback); el vector es una capa lateral en `cerebro/vectores.json`
// —cache derivada, regenerable, nunca verdad única—. El embedder entra
// INYECTADO como función: el órgano no conoce Ollama, conoce promesas con
// timeout. Así el turno NUNCA espera más que la ventana propia (5 s del
// plano), y la suite prueba paráfrasis sin una sola palabra en común.
// ══════════════════════════════════════════════════════════════════════

// (import al final del archivo: mismo modulo, sin pelear con el orden histórico)
import { coseno, conTimeout, fusionarRutasHibridas, claveVector, PESO_HIBRIDO, TIMEOUT_EMBED_POR_DEFECTO, type PesosHibridos } from "./vectorCerebro";
// v1.98.0 · la política de CUÁNTO calentar por pasada vive en `embedderResidencia` (pura,
// medible en seco). El órgano aporta el fs y el embedder inyectado; la cuenta, no.
import { planCalentado, POR_LOTE_POR_DEFECTO, MAX_CUERPOS_POR_PASADA, VENTANA_LOTE_MS } from "./embedderResidencia";

function rutaVectores(raizDatos: string): string {
  return path.join(rutaCerebro(raizDatos), "vectores.json");
}

function cargarVectores(raizDatos: string): Record<string, number[]> {
  try {
    const p = rutaVectores(raizDatos);
    if (!fs.existsSync(p)) return {};
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, number[]>) : {};
  } catch {
    return {};
  }
}

function guardarVectores(raizDatos: string, v: Record<string, number[]>): void {
  try {
    const p = rutaVectores(raizDatos);
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(v), "utf-8");
    fs.renameSync(tmp, p);
  } catch {
    /* el sidecar es cache: si no se escribe, el híbrido recalcula la próxima */
  }
}

/** FNV-1a de 32 bits, hex: huella barata y determinista para invalidar vectores. */
function huellaTexto(txt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export interface OpcionesHibrido {
  /** Recibe los textos que faltan vector (y la consulta) y devuelve SUS vectores. */
  embed: (textos: string[], senal?: AbortSignal) => Promise<Array<number[] | null>>;
  pesos?: PesosHibridos;
  timeoutMs?: number;
  max?: number;
  /**
   * v1.98.0 · CUÁNTOS cuerpos sin vector se arrastran al pedido del turno.
   * Antes no había tope: se mandaban LOS 150 y la ventana de 5 s nunca alcanzaba
   * (peor aún: al expirar se tiraba el trabajo entero y el turno siguiente
   * repetía los mismos 150). Con un lote acotado la deuda baja por turnos y el
   * primer turno sigue pudiendo ser híbrido.
   */
  porLote?: number;
  /**
   * v1.98.0 · salida de emergencia cuando el turno no pudo vectorizar nada: se le
   * entregan al cable los cuerpos pendientes para que se calienten EN SEGUNDO PLANO,
   * con paciencia propia, sin robarle un segundo más al usuario. Se llama y no se
   * espera; si el cable falla, el turno ni se entera.
   */
  alCalentar?: (cuerpos: string[]) => void;
}

export interface ResultadoHibrido {
  rutas: Ruta[];
  modo: "hibrido" | "palabras";
  /** Presente SOLO cuando se degradó: el fallback se registra, no se calla. */
  aviso?: string;
  msVector: number;
  /** v1.98.0 · entradas del índice que todavía no tienen vector (0 = índice sano). */
  deuda: number;
}

/**
 * Lote en el turno: cuerpos + la consulta.
 * v2.1.1 · 12 -> 8. MEDIDO en este equipo (snowflake-arctic-embed:33m):
 *   8 textos -> 1.404 ms · 16 -> 4.000 ms (el borde de la ventana).
 * El techo de `embedderResidencia.POR_LOTE_POR_DEFECTO` bajó a 8 en v2.1.3 y
 * este literal quedó en 12: la valla «turno <= techo» se rompía (12/8) y el
 * turno mandaba más cuerpos de los que la ventana aguanta. El número tiene que
 * ser el mismo que el techo, y el techo manda.
 */
export const POR_LOTE_EN_TURNO = 8;

/** Universos que se vectorizan: el mismo corte que ve `enrutarHibrido`. */
const ENTRADAS_EN_JUEGO = 150;

interface DeudaVectorial {
  entradas: EntradaCerebro[];
  vigentes: Record<string, number[]>;
  /** id de entrada → clave del sidecar */
  claves: Map<string, string>;
  /** cuerpo (tema+titulo+resumen) → claves que lo comparten: dos entradas hermanas se vectorizan UNA vez */
  pendientes: Array<{ cuerpo: string; claves: string[] }>;
}

/**
 * Dueño único de la pregunta «¿a quién le falta vector?». La usan el ruteo, el
 * calentador y el panel, para que los tres hablen del mismo número.
 */
function auditarVectores(raizDatos: string): DeudaVectorial {
  const indice = cargarIndice(raizDatos);
  const entradas = (indice.entradas || []).slice(0, ENTRADAS_EN_JUEGO);
  const vigentes = cargarVectores(raizDatos);
  const claves = new Map<string, string>();
  const pendientes: DeudaVectorial["pendientes"] = [];
  const filaPorCuerpo = new Map<string, number>();
  for (const e of entradas) {
    const cuerpo = `${e.tema} ${e.titulo} ${e.resumen}`.trim();
    const huella = huellaTexto(cuerpo);
    const clave = claveVector(e.tema, e.archivo, huella);
    claves.set(e.id, clave);
    if (Array.isArray(vigentes[clave]) && vigentes[clave].length > 0) continue;
    const i = filaPorCuerpo.get(cuerpo);
    if (i !== undefined) pendientes[i].claves.push(clave);
    else {
      filaPorCuerpo.set(cuerpo, pendientes.length);
      pendientes.push({ cuerpo, claves: [clave] });
    }
  }
  return { entradas, vigentes, claves, pendientes };
}

/** Cuántas entradas tienen/sin vector AHORA (lo que lee el panel de Puertos). */
export function estadoVectores(raizDatos: string): { entradas: number; conVector: number; deuda: number } {
  try {
    const d = auditarVectores(raizDatos);
    const conVector = d.entradas.length - new Set(d.pendientes.flatMap((p) => p.claves)).size;
    return { entradas: d.entradas.length, conVector: Math.max(0, conVector), deuda: d.pendientes.length };
  } catch {
    return { entradas: 0, conVector: 0, deuda: 0 };
  }
}

/**
 * El ruteo híbrido del plano: 0.7 de similitud vectorial + 0.3 de palabra.
 * Degradaciones honestas: sin índice → []; embedder caído o fuera de su
 * ventana → las rutas de palabra de siempre + `aviso`. Nunca lanza, nunca
 * bloquea más que `timeoutMs`.
 */
export async function enrutarHibrido(raizDatos: string, consulta: string, opts: OpcionesHibrido): Promise<ResultadoHibrido> {
  const max = Math.max(1, opts.max || 4);
  const pesos = opts.pesos || PESO_HIBRIDO;
  const palabra = enrutar(raizDatos, consulta, Math.max(max * 3, 8));
  const deuda = auditarVectores(raizDatos);
  const entradas = deuda.entradas;
  if (entradas.length === 0) return { rutas: palabra.slice(0, max), modo: "palabras", aviso: palabra.length ? "el indice no tiene entradas con cuerpo" : "el cerebro esta vacio", msVector: 0, deuda: 0 };
  const palabraScore = new Map<string, number>();
  for (const r of palabra) palabraScore.set(r.entrada.id, r.score);
  const coincid = new Map<string, string[]>();
  for (const r of palabra) coincid.set(r.entrada.id, r.coincidencias);

  const porLote = Math.max(0, Math.floor(opts.porLote ?? POR_LOTE_EN_TURNO));
  const lote = deuda.pendientes.slice(0, porLote);
  // v1.98.0 · UN pedido chico: la consulta + lo que cabe en la ventana. La consulta
  // va primera y se leen SUS vectores en la MISMA posición que se mandaron.
  const res = await conTimeout(async (senal) => {
    const textos = [consulta, ...lote.map((p) => p.cuerpo)];
    const vecs = await opts.embed(textos, senal);
    if (!Array.isArray(vecs) || vecs.length !== textos.length) throw new Error_2("el embedder devolvio una lista desalineada");
    return vecs;
  }, Math.max(50, opts.timeoutMs || TIMEOUT_EMBED_POR_DEFECTO));

  if (!res.ok) {
    // El turno no espera un segundo más, pero tampoco tira la deuda a la basura:
    // se la pasa al cable para que la caliente en segundo plano con su propia ventana.
    const enDeuda = deuda.pendientes.map((p) => p.cuerpo);
    try { if (enDeuda.length > 0) opts.alCalentar?.(enDeuda); } catch { /* el calentador nunca es problema del turno */ }
    const motivoFallo: string = res.ok === false ? res.motivo : "sin motivo";
    const detalleFallo: string = res.ok === false ? res.detalle : "";
    return {
      rutas: palabra.slice(0, max),
      modo: "palabras",
      aviso: `fallback por palabra (${motivoFallo}: ${detalleFallo}) — vector no disponible, el turno sigue${enDeuda.length > 0 ? ` · ${enDeuda.length} entradas sin vector, calentando en segundo plano` : ""}`,
      msVector: res.ms,
      deuda: enDeuda.length,
    };
  }
  const vecs = res.valor;
  const qvec = vecs[0];
  let nuevos = 0;
  for (let i = 0; i < lote.length; i++) {
    const v = vecs[i + 1];
    if (!Array.isArray(v) || v.length === 0) continue;
    // Se guarda POR CLAVE: dos entradas que comparten cuerpo cobran su vector en la misma pasada.
    for (const clave of lote[i].claves) {
      deuda.vigentes[clave] = v.map(Number);
      nuevos++;
    }
  }
  // v1.98.0 · lo poco que se logró se PERSISTE: antes un timeout a mitad de camino
  // borraba el trabajo de 150 textos y el turno siguiente empezaba de cero.
  if (nuevos > 0) guardarVectores(raizDatos, deuda.vigentes);
  const simVector = (id: string): number => coseno(qvec, deuda.vigentes[deuda.claves.get(id) as string]);
  const tabla = fusionarRutasHibridas(
    entradas.map((e) => ({ clave: e.id, simPalabra: palabraScore.get(e.id) || 0 })),
    simVector,
    pesos
  ).filter((t) => t.score > 0);
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const rutas: Ruta[] = [];
  for (const t of tabla) {
    const e = porId.get(t.clave);
    if (!e) continue;
    rutas.push({ entrada: { ...e, palabras: [...e.palabras] }, score: Math.round(t.score * 1000) / 1000, coincidencias: coincid.get(t.clave) || [] });
    if (rutas.length >= max) break;
  }
  return { rutas, modo: "hibrido", msVector: res.ms, deuda: Math.max(0, deuda.pendientes.length - lote.length) };
}

class Error_2 extends Error {}

// ══════════════════════════════════════════════════════════════════════════
// v1.98.0 · EL CALENTADOR DE SEGUNDO PLANO
// ──────────────────────────────────────────────────────────────────────────
// El índice se termina DE A POCO y se guarda POR LOTE. Las dos reglas que sacan
// al cerebro del pozo del log del 31/10:
//   · ningún pedido vuelve a medir 151 textos (`planCalentado` corta la deuda);
//   · lo que ya vectorizó un lote se escribe en disco YA, aunque el lote
//     siguiente explote — así la deuda baja pasada a pasada en vez de reiniciarse.
// Nunca lanza: si Ollama está caído, registra el motivo y devuelve.
// ══════════════════════════════════════════════════════════════════════════

export interface OpcionesCalentado {
  embed: (textos: string[], senal?: AbortSignal) => Promise<Array<number[] | null>>;
  /** Fuerza cuerpos concretos (el turno los pasó por `alCalentar`). */
  cuerpos?: string[];
  porLote?: number;
  maxCuerpos?: number;
  /** Ventana de UN lote. Corta: un lote chico o responde o se suelta. */
  ventanaLoteMs?: number;
  /**
   * v2.1.1 · PRECALENTAR (default `true`). El primer pedido paga la CARGA del
   * modelo en RAM y esa carga se comía la ventana del lote. En producción se
   * quiere siempre; en una valla que cuenta llamadas al embedder hay que poder
   * apagarlo para medir SOLO los lotes (si no, el precalentamiento se come la
   * primera llamada y el conteo miente).
   */
  precalentar?: boolean;
}

export interface ResultadoCalentado {
  ejecutado: boolean;
  lotes: number;
  vectorizados: number;
  fallidos: number;
  ms: number;
  /** Cuántos cuerpos siguen sin vector al terminar (para el panel). */
  pendientes: number;
  aviso?: string;
}

interface PasadaCalentador extends ResultadoCalentado {
  en: number;
}

const estadoCalentador: {
  enCurso: boolean;
  pasadas: number;
  vectorizados: number;
  fallidos: number;
  ultima?: PasadaCalentador;
} = { enCurso: false, pasadas: 0, vectorizados: 0, fallidos: 0 };

/** Lo que vio el último calentador. En memoria a propósito: es telemetría, no estado. */
export function estadoCalentamiento(): typeof estadoCalentador {
  return { ...estadoCalentador, ultima: estadoCalentador.ultima ? { ...estadoCalentador.ultima } : undefined };
}

/**
 * Calienta la deuda vectorial en lotes acotados y persiste entre lote y lote.
 * Si ya hay una pasada en curso, NO se apila: devuelve `ejecutado:false` (dos
 * calentadores peleándose por el mismo Ollama en Modo 8 GB es la receta para el
 * corte de los 180 s que Mario vio en el watchdog).
 */
export async function calentarVectores(raizDatos: string, opts: OpcionesCalentado): Promise<ResultadoCalentado> {
  const t0 = Date.now();
  if (estadoCalentador.enCurso) {
    return { ejecutado: false, lotes: 0, vectorizados: 0, fallidos: 0, ms: 0, pendientes: estadoVectores(raizDatos).deuda, aviso: "ya hay una pasada en curso" };
  }
  estadoCalentador.enCurso = true;
  const salida: ResultadoCalentado = { ejecutado: true, lotes: 0, vectorizados: 0, fallidos: 0, ms: 0, pendientes: 0 };
  try {
    const deuda = auditarVectores(raizDatos);
    // v2.1.1 · DEDUPE POR CUERPO: dos entradas hermanas comparten tema+titulo+resumen
    // y por tanto el MISMO cuerpo. Sin deduplicar acá, el turno que fuerza cuerpos
    // mandaba el mismo texto dos veces al embedder (dos llamadas para un vector).
    // Se preserva el orden de llegada: mismo conjunto, misma respuesta.
    const forzosos = Array.isArray(opts.cuerpos)
      ? [...new Set(opts.cuerpos.map((c) => String(c || "").trim()).filter(Boolean))]
      : [];
    // v2.1.1 · DEDUPE POR CUERPO (camino forzado): `forzosos` ya viene único, pero
    // un cuerpo forzado puede no estar en `deuda.pendientes` (el turno lo mandó por
    // `alCalentar` antes de que se re-auditara). Antes se le asignaba `claves: []` y
    // el guardado caía a una clave sintética que NADIE lee después: el vector se
    // escribía en el sidecar pero la entrada seguía en deuda. Ahora se resuelve la
    // clave REAL con la misma fórmula que `auditarVectores` (tema+archivo+huella).
    const objetivo = forzosos.length > 0
      ? forzosos.map((cuerpo) => {
          const yaEsta = deuda.pendientes.find((p) => p.cuerpo === cuerpo);
          if (yaEsta) return yaEsta;
          const huella = huellaTexto(cuerpo);
          const claves = deuda.entradas
            .filter((e) => `${e.tema} ${e.titulo} ${e.resumen}`.trim() === cuerpo)
            .map((e) => claveVector(e.tema, e.archivo, huella));
          return { cuerpo, claves };
        })
      : deuda.pendientes;
    const lotes = planCalentado(objetivo, {
      porLote: opts.porLote ?? POR_LOTE_POR_DEFECTO,
      maxTextos: opts.maxCuerpos ?? MAX_CUERPOS_POR_PASADA,
    });
    let avisos: string[] = [];
    // v1.99.6 · PRECALENTAMIENTO: el primer lote paga la CARGA del modelo en RAM
    // (snowflake-arctic-embed:33m tarda varios segundos en frío) y esa carga se
    // comía la ventana de 4 s: los 14 lotes caían por tiempo-excedido. Un pedido
    // de prueba con ventana AMPLIA saca la carga del presupuesto de los lotes.
    if (lotes.length > 0 && opts.precalentar !== false) {
      try {
        const caliente = await conTimeout(async (senal) => {
          const v = await opts.embed(["calentamiento"], senal);
          return Array.isArray(v) && v.length === 1;
        }, Math.max(50, opts.ventanaLoteMs || VENTANA_LOTE_MS) * 6);
        if (caliente.ok === false) avisos.push(`precalentamiento: ${caliente.motivo}`);
      } catch { /* si el precalentamiento falla, los lotes lo intentan igual */ }
    }
    for (const lote of lotes) {
      salida.lotes++;
      const res = await conTimeout(async (senal) => {
        const textos = lote.map((p) => p.cuerpo);
        const vecs = await opts.embed(textos, senal);
        if (!Array.isArray(vecs) || vecs.length !== textos.length) throw new Error_2("el embedder devolvio una lista desalineada");
        return vecs;
      }, Math.max(50, opts.ventanaLoteMs || VENTANA_LOTE_MS));
      if (!res.ok) {
        // v1.99.6 · REINTENTO: si el lote expiró, se reintenta UNA vez con el
        // modelo ya caliente. Antes se descartaba y el siguiente lote volvía a
        // pagar la carga: con el modelo frío caían los 14 seguidos.
        const reintento = await conTimeout(async (senal) => {
          const textos = lote.map((p) => p.cuerpo);
          const vecs = await opts.embed(textos, senal);
          if (!Array.isArray(vecs) || vecs.length !== textos.length) throw new Error_2("el embedder devolvio una lista desalineada");
          return vecs;
        }, Math.max(50, opts.ventanaLoteMs || VENTANA_LOTE_MS) * 2);
        if (!reintento.ok) {
          salida.fallidos += lote.length;
          avisos.push(`${res.ok === false ? res.motivo : ""}: ${res.ok === false ? res.detalle : ""}`);
          continue; // el lote que no llegó se reintenta en la próxima pasada; los demás siguen
        }
        // El reintento funcionó: se procesa como un lote normal.
        let guardadosR = 0;
        for (let i = 0; i < lote.length; i++) {
          const v = reintento.valor[i];
          if (!Array.isArray(v) || v.length === 0) { salida.fallidos++; continue; }
          const claves = lote[i].claves.length > 0 ? lote[i].claves : [claveVector("", "", huellaTexto(lote[i].cuerpo))];
          for (const clave of claves) {
            deuda.vigentes[clave] = v.map(Number);
            guardadosR++;
          }
        }
        if (guardadosR > 0) guardarVectores(raizDatos, deuda.vigentes);
        salida.vectorizados += guardadosR;
        continue;
      }
      let guardados = 0;
      for (let i = 0; i < lote.length; i++) {
        const v = res.valor[i];
        if (!Array.isArray(v) || v.length === 0) { salida.fallidos++; continue; }
        const claves = lote[i].claves.length > 0 ? lote[i].claves : [claveVector("", "", huellaTexto(lote[i].cuerpo))];
        for (const clave of claves) {
          deuda.vigentes[clave] = v.map(Number);
          guardados++;
        }
      }
      // PARTIAL y EN DISCO: la regla que rompe el bucle de los cinco segundos.
      if (guardados > 0) guardarVectores(raizDatos, deuda.vigentes);
      salida.vectorizados += guardados;
    }
    salida.pendientes = estadoVectores(raizDatos).deuda;
    if (avisos.length > 0) salida.aviso = avisos.slice(0, 2).join(" · ");
    return salida;
  } catch (e: any) {
    salida.aviso = `el calentador se cayó: ${String(e?.message || e).slice(0, 160)}`;
    return salida;
  } finally {
    estadoCalentador.enCurso = false;
    estadoCalentador.pasadas++;
    estadoCalentador.vectorizados += salida.vectorizados;
    estadoCalentador.fallidos += salida.fallidos;
    estadoCalentador.ultima = { ...salida, ms: Date.now() - t0, en: Date.now() };
  }
}


/**
 * Indexa las sesiones exportadas de la IDE (`cerebronico-ide-sesion-*.json`)
 * como entradas del órgano, con el embedder opcional para su vector.
 * Tolerante por diseño: si un JSON no tiene forma de conversación, se SALTA y
 * se dice por qué — nunca se inventa un recuerdo.
 */
export function indexarSesiones(
  raizDatos: string,
  raizProyecto: string,
  prefijo = "cerebronico-ide-sesion-"
): { indexadas: number; saltadas: number; motivos: string[] } {
  const salida = { indexadas: 0, saltadas: 0, motivos: [] as string[] };
  try {
    const archivos = fs
  .readdirSync(raizProyecto)
  .filter((f) => f.startsWith(prefijo) && f.endsWith(".json"))
  .sort()
  .slice(-12); // las 12 mas recientes: el historial completo sigue en disco
    for (const f of archivos) {
      try {
        const crudo = fs.readFileSync(path.join(raizProyecto, f), "utf-8");
        if (crudo.length > 4_000_000) {
          salida.saltadas++;
          salida.motivos.push(`${f}: mas de 4 MB`);
          continue;
        }
        const j = JSON.parse(crudo);
        const pedazos: string[] = [];
        const caminar = (nodo: any, prof: number) => {
          if (prof > 6 || pedazos.join(" ").length > 12_000) return;
          if (typeof nodo === "string") {
            if (nodo.length > 40) pedazos.push(nodo);
            return;
          }
          if (Array.isArray(nodo)) for (const x of nodo) caminar(x, prof + 1);
          else if (nodo && typeof nodo === "object") {
            for (const k of ["messages", "conversacion", "mensajes", "content", "contenido", "texto", "text", "rol", "role"]) {
              if ((nodo as any)[k] !== undefined) caminar((nodo as any)[k], prof + 1);
            }
          }
        };
        caminar(j, 0);
        const texto = pedazos.join("\n").trim();
        if (texto.length < 120) {
          salida.saltadas++;
          salida.motivos.push(`${f}: sin conversacion reconocible`);
          continue;
        }
        const e = aprender(raizDatos, {
          tema: "sesiones",
          titulo: f.replace(/\.json$/i, ""),
          texto: texto.slice(0, 6000),
          resumen: `Sesion exportada: ${f}`,
          tipo: "nota" as never,
          origen: "sesion",
        } as any);
        if (e) salida.indexadas++;
        else {
          salida.saltadas++;
          salida.motivos.push(`${f}: el organ rechazo la entrada`);
        }
      } catch {
        salida.saltadas++;
        salida.motivos.push(`${f}: JSON ilegible`);
      }
    }
  } catch {
    salida.motivos.push("no se pudo leer la carpeta del proyecto");
  }
  return salida;
}


/**
 * v1.99.4 · LAS CLAVES DEL SIDECAR, separadas por tienen vector o no.
 *
 * `estadoVectores()` devuelve TOTALES (`entradas / conVector / deuda`), que alcanza para
 * una barra de progreso y NO alcanza para el tri-estado `luz / deuda / nada` de
 * `cerebroSemilla`: ahí hace falta saber, **por pieza**, si tiene vector. Con los totales
 * se podría igual "inferir" un porcentaje y pintarlo — y esa es exactamente la mentira
 * que el eje viene a matar (cobertura redonda sobre un cerebro vacío, que es como
 * encontramos `cerebro/` vacío y sin `vectores.json` mientras todo se veía sano).
 *
 * No calcula nada nuevo: lee el mismo sidecar que ya lee `estadoVectores` y lo devuelve
 * por clave (`tema|archivo|huella`), para que el consumo sea una comparación de prefijo
 * honesta y no un promedio.
 */
export function clavesVectores(raizDatos: string): { con: string[]; sin: string[] } {
  const con: string[] = [];
  const sin: string[] = [];
  try {
    // El sidecar es un mapa `tema|archivo|huella -> vector`. Es la ÚNICA fuente honesta
    // del "¿esta pieza tiene vector?", porque `estadoVectores` devuelve totales.
    for (const [clave, vector] of Object.entries(cargarVectores(raizDatos))) {
      (Array.isArray(vector) && vector.length > 0 ? con : sin).push(clave);
    }
  } catch {
    // Sin sidecar no hay claves: eso es `nada`, no `deuda`, y arriba se lee así.
  }
  return { con, sin };
}
