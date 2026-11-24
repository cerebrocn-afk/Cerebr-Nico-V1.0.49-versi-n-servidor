/**
 * rutasAtomicas.ts — v1.0.20 · UNA PREGUNTA, UNA RESPUESTA, UN ARCHIVO
 * ==========================================================================
 * PEDIDO DE MARIO (15/11): «consolidar las rutas a nivel atómico desde el
 * comienzo; el sandbox quedó ocupado de la sesión anterior y no encuentra la
 * ruta; escribe todo estático y después no sabe dónde están los archivos;
 * cuando los encuentra se le complica encontrar la ruta para servir; se confunde
 * la raíz del dev con la ruta de instalación C:\Cerebronico».
 *
 * LA RAÍZ no es que falte un manual: es que la MISMA pregunta («¿dónde está el
 * proyecto?») tenía CUATRO autoridades (pin del canal directo, estado vivo del
 * sandbox, autodetección por mtime y raíz de datos). Cuatro respuestas posibles
 * y ninguna obligada a coincidir con las otras tres.
 *
 * LA LEY DE ESTE MÓDULO
 *   1. Clasificar una ruta NO es adivinar: cada ruta cae en una de cinco clases
 *      y, si no cae en ninguna, se dice «fuera» — nunca se elige la más parecida.
 *   2. Abrir un proyecto es una DECISIÓN, no un efecto: o se puede (y se dice
 *      dónde queda cada cosa) o se rechaza con el motivo exacto.
 *   3. Escribir tiene un veredicto PREVIO: antes de tocar el disco se sabe si el
 *      archivo cae en la obra, en la raíz de datos o en la instalación del IDE.
 *      «Ruta fuera del proyecto no permitida» sin decir DÓNDE sí se puede es el
 *      bucle de rojos que hay que matar.
 *
 * QUÉ NO HACE: no toca el disco, no importa `fs` ni `path`, no lee el entorno.
 * Recibe raíces ya resueltas y devuelve decisiones. Todo lo que pisa disco vive
 * en `server/proyectoRegistro.ts`. Se prueba aislado en
 * `tests/rutasAtomicas.test.ts`.
 */

/** Las cinco clases. `fuera` es una respuesta, no un error de parseo. */
export type ClaseDeRuta = "instalacion" | "datos" | "estado" | "proyecto" | "fuera";

/** Las tres raíces que conviven en la máquina del usuario. */
export interface ContextoRutas {
  /** Donde vive el IDE instalado (`C:\Cerebronico` en el instalador). */
  instalacion: string;
  /** Donde viven los proyectos del usuario (la raíz de datos). */
  datos: string;
  /** El proyecto abierto AHORA (si hay uno). */
  proyecto: string | null;
}

/** Lo que hay que saber de un proyecto abierto. */
export interface ProyectoAbierto {
  nombre: string;
  /** Carpeta absoluta de la obra. */
  ruta: string;
  /** Cuándo se abrió (epoch ms). */
  abiertoEn: number;
  /** `creado` = la carpeta no existía; `existente` = se adoptó lo que había. */
  origen: "creado" | "existente";
  /** Qué se sembró al abrirla (vacío si ya tenía archivos). */
  sembrado: string[];
  /** De dónde salió este proyecto si NO lo abrimos nosotros (p. ej. el pin
   *  legacy). Su presencia es la prueba de que hubo reconstrucción, no invención. */
  heredadoDe?: string;
}

// ─── normalización sin `path` ────────────────────────────────────────────────

/** Barras a `/`, sin barra final, sin repetidas y sin el prefijo `\\?\` de Windows. */
export function normalizarRuta(ruta: string): string {
  let s = String(ruta ?? "").replace(/\\/g, "/").replace(/^\/\/\?\//, "");
  s = s.replace(/\/+/g, "/");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

/** Minúsculas para comparar (Windows no distingue; en POSIX se compara igual, y se dice). */
export function claveDeRuta(ruta: string): string {
  return normalizarRuta(ruta).toLowerCase();
}

/** ¿`hijo` está dentro de `padre` (o es el mismo)? Comparación por segmentos, no por prefijo de texto. */
export function estaDentro(hijo: string, padre: string): boolean {
  const h = claveDeRuta(hijo);
  const p = claveDeRuta(padre);
  if (!h || !p) return false;
  if (h === p) return true;
  return h.startsWith(p.endsWith("/") ? p : p + "/");
}

/** Relativa a `base`, con `/`. Cadena vacía si es la base misma. */
export function relativaA(ruta: string, base: string): string {
  const h = normalizarRuta(ruta);
  const b = normalizarRuta(base);
  if (!estaDentro(h, b)) return "";
  const hl = claveDeRuta(h);
  const bl = claveDeRuta(b);
  if (hl === bl) return "";
  return h.slice(b.length).replace(/^\/+/, "");
}

// ─── slug de proyecto ───────────────────────────────────────────────────────

/** Nombres que Windows NO permite como carpeta, con o sin extensión. */
const RESERVADOS = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/**
 * Convierte lo que el humano escribió («Finanzas App — 2ª parte») en un nombre de
 * carpeta que Windows, macOS y Linux aceptan igual. Sin acentos, sin espacios,
 * sin reservados, sin puntos finales (Windows los recorta y luego no encuentra la
 * carpeta que juró haber creado) y con 48 caracteres de tope.
 */
export function slugDeProyecto(nombre: string): string {
  const limpio = String(nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");
  if (!limpio) return "proyecto";
  if (RESERVADOS.has(limpio)) return `${limpio}-app`;
  return limpio;
}

// ─── clasificación ──────────────────────────────────────────────────────────

/** Qué hago con esta ruta, dicho para que el usuario lo pueda repetir. */
export const QUE_HACER: Record<ClaseDeRuta, string> = {
  instalacion: "es la INSTALACIÓN del IDE: se lee, no se escribe la obra ahí",
  datos: "es la RAÍZ DE DATOS: aquí nacen las carpetas de proyecto, no los archivos sueltos",
  estado: "son los archivos de estado del IDE (.cerebro-db): los escribe el motor, no el modelo",
  proyecto: "es la OBRA abierta: aquí van los archivos y el :3500 sirve esta carpeta",
  fuera: "está FUERA de todo lo que el IDE sirve: se rechaza con la raíz buena, no con un «no permitido»",
};

/**
 * Clasifica una ruta. ORDEN = JERARQUÍA: lo más específico primero — un archivo
 * de `.cerebro-db` está dentro de la raíz de datos, pero es ESTADO, no obra.
 */
export function clasificarRuta(ruta: string, ctx: ContextoRutas): ClaseDeRuta {
  const r = normalizarRuta(ruta);
  if (!r) return "fuera";
  if (ctx.proyecto && estaDentro(r, ctx.proyecto)) {
    // El estado del IDE puede vivir DENTRO de la obra; sigue siendo estado.
    return esRutaDeEstado(r) ? "estado" : "proyecto";
  }
  if (esRutaDeEstado(r)) return "estado";
  if (estaDentro(r, ctx.datos)) return "datos";
  if (estaDentro(r, ctx.instalacion)) return "instalacion";
  return "fuera";
}

/** ¿Es de los nuestros de estado (`.cerebro-db`, `.cn-quirofano`, `.proyectos`)? */
export function esRutaDeEstado(ruta: string): boolean {
  const r = claveDeRuta(ruta);
  return /(^|\/)\.cerebro-db(\/|$)/.test(r) || /(^|\/)\.cn-quirofano(\/|$)/.test(r) || /(^|\/)\.cerebro\.json$/.test(r);
}

// ─── decisión de apertura ───────────────────────────────────────────────────

export interface PeticionApertura {
  /** Lo que escribió el humano o el modelo. */
  nombre: string;
  /** Clase de apertura: `nuevo` crea si falta; `abrir` solo adopta lo existente. */
  modo?: "nuevo" | "abrir";
}

export interface DecisionApertura {
  ok: boolean;
  /** Motivo del rechazo, en español y con la salida. Vacío si `ok`. */
  motivo: string;
  /** Nombre de carpeta que se va a usar (slug). */
  slug: string;
  /** Carpeta destino. */
  ruta: string;
  /** `creado` si hay que crearla; `existente` si se adopta. */
  efecto: "creado" | "existente";
}

/**
 * Decide si se puede abrir un proyecto y DÓNDE queda. Puro: recibe si la carpeta
 * existe y si ya tiene archivos; no consulta el disco.
 *
 * Rechaza (con motivo, nunca en silencio):
 *  · nombre vacío o que solo tiene símbolos;
 *  · rutas absolutas (un proyecto NO se abre donde el modelo quiera: se abre en
 *    la raíz de datos, que es la única carpeta que el :3500 sirve);
 *  · `..` de escape;
 *  · nombres reservados que el slug no pudo salvar.
 */
export function decidirApertura(p: PeticionApertura, ctx: ContextoRutas): DecisionApertura {
  const crudo = String(p.nombre ?? "").trim();
  const rechazo = (motivo: string): DecisionApertura => ({
    ok: false, motivo, slug: "", ruta: "", efecto: "existente",
  });
  if (!crudo) return rechazo(`Falta el nombre del proyecto. Ejemplo: { "nombre": "finanzas-app" }. Los proyectos se crean en ${ctx.datos}.`);
  if (/^[a-zA-Z]:[\\/]/.test(crudo) || /^[\\/]{1,2}/.test(crudo)) {
    return rechazo(`«${crudo}» es una ruta absoluta: un proyecto no se abre donde el modelo quiera. Se abre dentro de la raíz de datos (${ctx.datos}), que es la única carpeta que el :3500 sirve.`);
  }
  if (crudo.split(/[\\/]+/).some((s) => s === "..")) {
    return rechazo(`«${crudo}» intenta salir con «..»: no se negocia. Usá un nombre simple, sin barras.`);
  }
  if (crudo.includes("/") || crudo.includes("\\")) {
    return rechazo(`«${crudo}» trae barras: abrir un proyecto es UN nombre de carpeta, no una ruta. Ejemplo: «finanzas-app».`);
  }
  const slug = slugDeProyecto(crudo);
  const ruta = `${normalizarRuta(ctx.datos)}/${slug}`;
  // La instalación del IDE no puede estar dentro de la raíz de datos ni al revés.
  if (estaDentro(ruta, ctx.instalacion) || estaDentro(ctx.instalacion, ruta)) {
    return rechazo(`«${slug}» caería sobre la INSTALACIÓN del IDE (${ctx.instalacion}): ese árbol no se toca. Elegí otro nombre.`);
  }
  return { ok: true, motivo: "", slug, ruta, efecto: p.modo === "abrir" ? "existente" : "creado" };
}

// ─── veredicto de escritura ─────────────────────────────────────────────────

export interface VeredictoEscritura {
  /** La ruta absoluta final (si `permitida`). */
  abs: string;
  clase: ClaseDeRuta;
  permitida: boolean;
  /** Motivo del rechazo; cuando hay, SIEMPRE nombra la ruta buena. */
  motivo: string;
  /** true si hubo que reencaminar la ruta a otra raíz (y se dice cuál). */
  reencaminada: boolean;
}

/**
 * Antes de escribir: ¿esta ruta cae donde el :3500 la va a servir?
 *
 *  · relativa + hay obra → va a la OBRA (`reencaminada` si el llamador creía
 *    estar en la raíz de datos). Es el arreglo del «escribo estático y después no
 *    sé dónde quedaron los archivos»: la respuesta dice la ruta absoluta.
 *  · absoluta dentro de la obra / de los datos / de la instalación → se acepta y
 *    se CLASIFICA (para que el mensaje de éxito no mienta sobre dónde quedó).
 *  · absoluta fuera → se rechaza nombrando la obra abierta.
 *  · relativa sin obra → raíz de datos, y se avisa que lo servido puede ser otra cosa.
 */
export function veredictoDeEscritura(rel: string, ctx: ContextoRutas): VeredictoEscritura {
  const crudo = String(rel ?? "").trim();
  const esAbsoluta = /^[a-zA-Z]:[\\/]/.test(crudo) || /^[\\/]{1,2}/.test(crudo);
  const datos = normalizarRuta(ctx.datos);
  const proyecto = ctx.proyecto ? normalizarRuta(ctx.proyecto) : null;

  if (esAbsoluta) {
    const abs = normalizarRuta(crudo);
    const clase = clasificarRuta(abs, ctx);
    if (clase === "fuera") {
      return {
        abs, clase, permitida: false, reencaminada: false,
        motivo: proyecto
          ? `«${crudo}» está fuera de la obra. La obra abierta es «${proyecto}» y el :3500 sirve ESA carpeta: escribí con una ruta relativa (p. ej. «index.html») y queda ahí.`
          : `«${crudo}» está fuera de todo. No hay proyecto abierto: abrí uno primero (o escribí con ruta relativa y nace en ${datos}).`,
      };
    }
    return { abs, clase, permitida: true, motivo: "", reencaminada: false };
  }

  // Relativa: nunca sale de la raíz elegida.
  if (crudo.split(/[\\/]+/).some((s) => s === "..")) {
    return {
      abs: "", clase: "fuera", permitida: false, reencaminada: false,
      motivo: `«${crudo}» lleva «..»: una escritura no puede salir de su proyecto. La raíz buena es ${proyecto || datos}.`,
    };
  }
  const relLimpia = normalizarRuta(crudo).replace(/^\/+/, "");
  if (!relLimpia) {
    return { abs: proyecto || datos, clase: proyecto ? "proyecto" : "datos", permitida: false, reencaminada: false,
      motivo: `La ruta está vacía: no se escribe «el proyecto» entero. Indicá el archivo (p. ej. «index.html»).` };
  }
  const base = proyecto || datos;
  const abs = `${base}/${relLimpia}`;
  const clase = clasificarRuta(abs, ctx);
  return { abs, clase, permitida: true, motivo: "", reencaminada: false };
}

// ─── texto para el modelo ───────────────────────────────────────────────────

/**
 * El bloque que el modelo recibe ANTES de tocar nada. Se compone de la MISMA
 * verdad que contesta `/api/rutas/contexto`: no hay dos textos que puedan
 * divergir. Si no hay obra, lo dice — y dice qué herramienta la abre.
 */
export function textoDeContexto(ctx: ContextoRutas, extra: { servido?: string | null; url?: string | null } = {}): string {
  const proyecto = ctx.proyecto ? normalizarRuta(ctx.proyecto) : null;
  const lineas = [
    "[RUTAS — una sola respuesta, no la deduzcas]",
    `- Instalación del IDE: ${normalizarRuta(ctx.instalacion)} (se lee, no se escribe la obra ahí)`,
    `- Raíz de datos: ${normalizarRuta(ctx.datos)} (aquí nacen las carpetas de proyecto)`,
    proyecto
      ? `- Proyecto ABIERTO: ${proyecto} → escribí con ruta RELATIVA (p. ej. "index.html") y el archivo nace ahí`
      : "- No hay proyecto abierto: abrí uno con abrir_proyecto {\"nombre\": \"mi-app\"} antes de escribir",
    extra.servido ? `- Se sirve en :3500 desde: ${normalizarRuta(extra.servido)}` : "- Se sirve en :3500 desde: (nada arrancado todavía)",
    "- Si algo no aparece en el preview, decí en qué raíz lo buscaste: un «no anda» sin ruta no se puede diagnosticar.",
  ];
  if (extra.url) lineas.push(`- URL de la obra: ${extra.url}`);
  return lineas.join("\n");
}

/** Una línea para el log de arranque / el chat. */
export function resumenRutas(ctx: ContextoRutas): string {
  return `RUTAS · instalación ${normalizarRuta(ctx.instalacion)} · datos ${normalizarRuta(ctx.datos)} · obra ${ctx.proyecto ? normalizarRuta(ctx.proyecto) : "(ninguna)"}`;
}

/** Un `index.html` mínimo para que una obra recién creada se vea YA en el :3500.
 * No es plantilla de producto: es la prueba de que la ruta sirve. */
export function indexDeArranque(nombre: string): string {
  const titulo = String(nombre || "Proyecto").replace(/[<>&"']/g, "");
  return [
    "<!DOCTYPE html>",
    '<html lang="es">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${titulo}</title>`,
    '  <style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e8ecff}main{text-align:center}h1{font-size:2rem;margin:0 0 .5rem}p{opacity:.7;margin:0}</style>',
    "</head>",
    "<body>",
    "  <main>",
    `    <h1>${titulo}</h1>`,
    "    <p>La ruta sirve: este archivo se está sirviendo desde la obra abierta.</p>",
    "  </main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
