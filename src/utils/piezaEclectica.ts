/**
 * piezaEclectica.ts — EL INFORME ECLÉCTICO DESARMADO EN PIEZAS (v1.92.0)
 * ======================================================================
 * Pedido de Mario (30/10): «restrucura estética de ecléctico».
 *
 * EL PROBLEMA. `informeEclectico` (engine/enjambreEclectico.ts) emite un informe
 * determinista y MIXTO: rótulo 🎭, notas de contexto, tabla Markdown de voces,
 * marcadores `**Acuerdo medido:**`, `**Coincidencias…**`, `**Divergencias…**`,
 * `**Riesgos declarados:**`, `**Resumen del enjambre:**`, `**Veredicto final de
 * la tarea:**`, la cita `> Tarea consultada: …` y —desde v1.88.0— el bloque
 * `### Fase 2 · la tarea, ejecutada` con sus pasos ✔/✗. La vista de v1.84.1
 * metía TODO eso en un `<pre>` monoespaciado dentro del botón «ver el
 * pensamiento»: honesto pero ilegible (contar pipe contra pipe para saber qué
 * voz falló no es revisar un enjambre, es hacer de parser a mano).
 *
 * QUÉ HACE. Un PASO ÚNICO sobre las líneas del informe, con estado, y devuelve
 * piezas: voces, acuerdo, mejor voz, coincidencias, divergencias, riesgos,
 * resumen, veredicto, obra de la fase 2, tarea y `resto`. Cada pieza se pinta con
 * su forma en ChatCenter (tabla real, barra de acuerdo, listas de color).
 *
 * POR QUÉ UNA PASADA Y NO CUATRO `findIndex` con cortes: la primera versión
 * extraía sección por sección y recosía el resto; con dos secciones seguidas el
 * rótulo de la siguiente se duplicaba en `resto` y la subsecuente no encontraba
 * su contenido. Un autómata de una sola pasada no puede solapar ni duplicar.
 *
 * REGLA DE LA CASA, INTACTA: NADA SE DESCARTA. Lo que ningún estado reconoció
 * cae en `resto` y se pinta como prosa. Un texto que no es informe devuelve
 * `null` y la vista muestra el crudo — mejor un muro honesto que un recorte
 * mentiroso (la misma regla de `dividirEclectica`).
 */

export interface VozEclectica {
  n: string;
  voz: string;
  estado: string;
  ok: boolean;
  puntaje: string;
  ms: string;
}

export interface PasoEclectico {
  nombre: string;
  ok: boolean;
  resumen: string;
}

export interface ObraEclectica {
  /** `true` cuando el informe trae el bloque de la fase 2 (aunque no haya ejecutado nada). */
  intentada: boolean;
  pasos: PasoEclectico[];
  /** «N de M paso(s) con efecto real · ejecutor …» (sin los `**`). */
  veredicto: string;
  /** La línea final del ejecutor (`> …`). */
  cierre: string;
}

export interface EclecticaEnBloques {
  /** Primera línea del informe (rótulo 🎭 + «N/M voces contestaron…»). */
  cabecera: string;
  /** Notas indentadas bajo el rótulo (armado, memoria, ↻ re-empuje, ⚠ una voz). */
  notas: string[];
  /** ⛔ solo si el informe declaró bucle de repetición; "" en caso contrario. */
  bucle: string;
  /** Filas de la tabla de voces ([] si el informe no traía tabla). */
  voces: VozEclectica[];
  /** «62» — porcentaje de acuerdo medido ("" si no venía). */
  acuerdo: string;
  /** La línea de acuerdo completa (origen: juez / consenso / sin material). */
  acuerdoTexto: string;
  mejorVoz: string;
  coincidencias: string[];
  divergencias: string[];
  riesgos: string[];
  resumen: string;
  veredicto: string;
  obra: ObraEclectica | null;
  tarea: string;
  /** Lo que ningún estado reconoció: se pinta como prosa, nunca se tira. */
  resto: string;
}

const RE_CAB_ECL = /^\s*🎭 RESPUESTA ECL[Ée]CTICA\b/;
/** Cualquier marcador de sección en línea a solas: `**Riesgos declarados:**`. */
const RE_MARCA = /^\*\*([^*]+?):\*\*\s*$/;
/** Marcador con el valor en la MISMA línea: `**Acuerdo medido:** ███ 62 % · …`. */
const RE_MARCA_INLINE = /^\*\*([^*]+?):\*\*\s+(.+)$/;
const RE_FILA_TABLA = /^\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|$/;
const RE_TAREA = /^\s*>\s*Tarea consultada:\s*(.*)$/;
const RE_OBRA_CAB = /^###\s*Fase 2\b/;
const RE_PASO = /^-\s*`([^`]+)`\s*(✔|✗|✗|✗|X|x)\s*[—–-]?\s*(.*)$/;

/** Normaliza los tres trazos que la casa usa para «mal»: ✗ (U+2717), ✗, X. */
const ES_FAIL = (s: string): boolean => /(^|\s)(✗|✗|✗|✗|X|x)\b/.test(s);

type Estado =
  | "notas"
  | "coincidencias"
  | "divergencias"
  | "riesgos"
  | "resumen"
  | "veredicto"
  | "obra"
  | "resto";

/** El nombre de la marca decide el estado. Cualquier marca desconocida manda al
 *  `resto` CON su rótulo: si el formato crece, la vista no pierde información. */
function estadoDeMarca(nombre: string): Estado | "inline" | null {
  const n = nombre.toLowerCase();
  if (n.startsWith("coincidencias")) return "coincidencias";
  if (n.startsWith("divergencias")) return "divergencias";
  if (n.startsWith("riesgos")) return "riesgos";
  if (n.startsWith("resumen del enjambre")) return "resumen";
  if (n.startsWith("veredicto final")) return "veredicto";
  if (n.startsWith("acuerdo medido") || n.startsWith("voz más sólida")) return "inline";
  return null;
}

/** Desarma el informe ecléctico en piezas pintables. `null` = no es un informe. */
export function dividirInformeEclectico(texto: string): EclecticaEnBloques | null {
  const src = String(texto ?? "");
  if (!RE_CAB_ECL.test(src.slice(0, 80))) return null;

  const lineas = src.split("\n");
  const cabecera = (lineas[0] || "").trim();

  const notas: string[] = [];
  const bucles: string[] = [];
  const voces: VozEclectica[] = [];
  const coincidencias: string[] = [];
  const divergencias: string[] = [];
  const riesgos: string[] = [];
  const resto: string[] = [];
  const cuerpoResumen: string[] = [];
  const cuerpoVeredicto: string[] = [];
  const obraLineas: string[] = [];
  let acuerdo = "";
  let acuerdoTexto = "";
  let mejorVoz = "";
  let tarea = "";
  let estado: Estado = "notas";

  for (let i = 1; i < lineas.length; i++) {
    const cruda = lineas[i];
    const l = cruda.trim();

    // ── Cambios de estado por rótulo explícito ─────────────────────────────
    if (RE_OBRA_CAB.test(l)) {
      estado = "obra";
      continue;
    }
    const mTarea = RE_TAREA.exec(cruda);
    if (mTarea) {
      tarea = mTarea[1].trim();
      estado = "resto";
      continue;
    }
    const mInline = RE_MARCA_INLINE.exec(l);
    if (mInline && estadoDeMarca(mInline[1]) === "inline") {
      const valor = mInline[2].trim();
      if (/acuerdo/i.test(mInline[1])) {
        acuerdoTexto = valor;
        const pct = valor.match(/(\d{1,3})\s*%/);
        acuerdo = pct ? pct[1] : "";
      } else mejorVoz = valor;
      estado = "resto";
      continue;
    }
    const mMarca = RE_MARCA.exec(l);
    if (mMarca) {
      const e = estadoDeMarca(mMarca[1]);
      if (e === "inline") continue;
      if (e) {
        estado = e;
        continue;
      }
      // Marca que la casa no conoce: se conserva CON su rótulo.
      estado = "resto";
      resto.push(cruda);
      continue;
    }
    if (!l) continue;

    // ── Contenido según el estado activo ────────────────────────────────
    if (estado === "obra") {
      obraLineas.push(l);
      continue;
    }
    if (estado === "resumen") {
      cuerpoResumen.push(l);
      continue;
    }
    if (estado === "veredicto") {
      cuerpoVeredicto.push(l);
      continue;
    }
    if (estado === "coincidencias" || estado === "divergencias" || estado === "riesgos") {
      const destino = estado === "coincidencias" ? coincidencias : estado === "divergencias" ? divergencias : riesgos;
      if (/^[-*]\s+/.test(l)) destino.push(l.replace(/^[-*]\s+/, "").trim());
      else if (destino.length) destino[destino.length - 1] = `${destino[destino.length - 1]} ${l}`;
      else destino.push(l);
      continue;
    }
    // ── Notas previas y tabla de voces (estado "notas") ────────────────────
    const mFila = RE_FILA_TABLA.exec(l);
    if (mFila && /^\d+$/.test(mFila[1])) {
      const est = mFila[3].trim();
      voces.push({ n: mFila[1], voz: mFila[2].trim(), estado: est, ok: est.startsWith("✓"), puntaje: mFila[4].trim(), ms: mFila[5].trim() });
      continue;
    }
    if (/^\|/.test(l)) continue; // cabecera y separador de la tabla
    if (/^⛔/.test(l)) {
      bucles.push(l);
      continue;
    }
    if (/^\s{2,}\S/.test(cruda)) {
      notas.push(l);
      continue;
    }
    resto.push(cruda);
    estado = "resto";
  }

  // La fase 2 se interpreta al final: su forma es la que firma `bloqueDeObra`.
  let obra: ObraEclectica | null = null;
  if (obraLineas.length) {
    const pasos: PasoEclectico[] = [];
    const sueltos: string[] = [];
    for (const l of obraLineas) {
      const m = RE_PASO.exec(l);
      if (m) {
        pasos.push({ nombre: m[1].trim(), ok: m[2] === "✔", resumen: m[3].trim() });
        continue;
      }
      sueltos.push(l);
    }
    const veredictoLinea = sueltos.find(x => /^\*\*.*\*\*$/.test(x));
    const cierre = sueltos.find(x => x.startsWith(">"));
    obra = {
      intentada: true,
      pasos,
      veredicto: veredictoLinea ? veredictoLinea.replace(/\*\*/g, "").trim() : "",
      cierre: cierre ? cierre.replace(/^>\s*/, "").trim() : "",
    };
    for (const s of sueltos) {
      if (s === veredictoLinea || s === cierre) continue;
      resto.push(s);
    }
  }

  return {
    cabecera,
    notas,
    bucle: bucles.join(" "),
    voces,
    acuerdo,
    acuerdoTexto,
    mejorVoz,
    coincidencias,
    divergencias,
    riesgos,
    resumen: cuerpoResumen.join("\n").trim(),
    veredicto: cuerpoVeredicto.join("\n").trim(),
    obra,
    tarea,
    resto: resto.join("\n").trim(),
  };
}
