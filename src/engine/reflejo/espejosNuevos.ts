/**
 * espejosNuevos.ts — ESPEJOS v2: `espejo.medicina` y `espejo.codigo` (v1.54.0)
 * ============================================================================
 * Los dos ids que vivían COMENTADOS en `orquestador.ts` (líneas 439 y 451) como
 * plantillas de Ollama externo. Eran ids simbólicos: no existían en
 * `IDS_ESPEJOS`, no tenían `ejecutar`, y `consultar_espejo` no los alcanzaba.
 * Este módulo los convierte en entidades REALES, deterministas y verificables.
 *
 * ─── ADR (por qué así y no de otra forma) ───────────────────────────────────
 *
 * DECISIÓN 1 · `espejo.medicina` = calculadora clínica determinista.
 *   ALTERNATIVA DESCARTADA: descomentar la ley `ext-medicina` y enrutar a
 *   `http://ollama-medicina:11434/api/generate`. Se descarta porque ese
 *   endpoint NO EXISTE en esta máquina: prometerlo sería mentir, y el usuario
 *   comprueba. La aritmética clínica (IMC, superficie corporal, aclaramiento
 *   renal, dosis por peso, conversión de dosis) SÍ es exacta y auditable.
 *   CONSECUENCIA HONESTA: este espejo NO diagnostica ni prescribe. Devuelve
 *   números con su fórmula y su unidad, y declara explícitamente que la
 *   decisión clínica es de un profesional. Un espejo que dijera "tome X mg"
 *   sin fórmula sería un peligro, no una herramienta.
 *
 * DECISIÓN 2 · `espejo.codigo` = analizador con VEREDICTO, no contador.
 *   ALTERNATIVA DESCARTADA: duplicar `espejo.codigos`. Se descarta porque la
 *   regla de admisión del proyecto (manual §8) exige CONTRATO DE SALIDA
 *   distinto: `codigos` CUENTA (líneas, símbolos, ciclomática); `codigo`
 *   JUZGA y devuelve HALLAZGOS con severidad y línea. Uno describe, el otro
 *   dictamina. Son dos preguntas distintas sobre el mismo texto.
 *
 * ─── SPOF y mitigación ──────────────────────────────────────────────────────
 *   · SPOF: un cambio en `IDS_ESPEJOS` rompe los tests que congelan el 11.
 *     MITIGACIÓN: los tests se actualizan en el mismo commit (13 es el número
 *     nuevo, y el inventario lo verifica contra el catálogo real, no contra
 *     una constante escrita a mano).
 *   · SPOF: `espejo.medicina` usado como consejo médico.
 *     MITIGACIÓN: el campo `aviso` viaja SIEMPRE en la salida, y el espejo
 *     rechaza cualquier dato que no pueda calcular con fórmula declarada.
 *
 * Puro: sin modelo, sin red, sin disco, sin `node:*`. Viaja al bundle igual
 * que `espejos.ts` y `consejo.ts`.
 */
import type { Entidad, ResultadoEntidad } from "./consejo";

type Reg = (id: string, nombre: string, dominio: Entidad["dominio"], activa: boolean, descripcion: string, ejecutar: (d: any) => ResultadoEntidad) => Entidad;
type Env = (entidad: string, t0: number, ok: boolean, extra?: Partial<ResultadoEntidad>) => ResultadoEntidad;

// ─── utilidades puras ───────────────────────────────────────────────────────

const r = (n: number, dec = 4): number =>
  !isFinite(n) ? n : Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);

/** Número finito desde cualquier entrada; NaN si no lo es. */
const num = (x: unknown): number => {
  if (typeof x === "number") return isFinite(x) ? x : NaN;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x.replace(",", "."));
    return isFinite(n) ? n : NaN;
  }
  return NaN;
};

/** Normaliza sin acentos y en minúsculas (misma ley lingüística del motor). */
const sinAcentos = (s: string): string =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ═══════════════════════════════════════════════════════════════════════════
// ESPEJO · MEDICINA — calculadora clínica determinista
// ═══════════════════════════════════════════════════════════════════════════

/** Aviso que viaja en TODA salida del espejo de medicina. No es decorativo:
 *  es la frontera entre "calcular" y "decidir", y el espejo no la cruza. */
const AVISO_CLINICO =
  "Cálculo determinista con fórmula declarada. NO es diagnóstico ni prescripción: " +
  "la decisión clínica es de un profesional con el paciente delante.";

interface ResultadoClinico {
  ok: boolean;
  salida?: Record<string, unknown>;
  motivo?: string;
}

/**
 * IMC — índice de masa corporal (OMS).
 * Fórmula: peso(kg) / talla(m)². Clasificación OMS con los cortes reales.
 */
function imc(d: any): ResultadoClinico {
  const peso = num(d?.peso ?? d?.pesoKg ?? d?.kg);
  // v1.54.1 — «alturaCm» es el nombre natural en español y el que usa
  // superficie_corporal: si llega, se acepta y la conversión cm→m de abajo
  // lo resuelve. Antes, pasar alturaCm a «imc» devolvía «falta talla».
  const talla = num(d?.talla ?? d?.tallaM ?? d?.altura ?? d?.alturaCm ?? d?.tallaCm ?? d?.m);
  if (!isFinite(peso) || peso <= 0) return { ok: false, motivo: "falta «peso» en kg (número > 0)." };
  if (!isFinite(talla) || talla <= 0) return { ok: false, motivo: "falta «talla» en metros (número > 0, ej. 1.75) o «alturaCm» en centímetros (ej. 175)." };
  // Talla en cm es un error de unidad frecuente: se corrige y se DECLARA.
  let tallaM = talla;
  let avisoUnidad: string | undefined;
  if (talla > 3) {
    tallaM = talla / 100;
    avisoUnidad = `«talla» llegó como ${talla}: se interpretó en cm y se convirtió a ${r(tallaM, 2)} m. Si querías metros, pasa un valor < 3.`;
  }
  const valor = peso / (tallaM * tallaM);
  const clasificacion =
    valor < 18.5 ? "bajo peso" :
    valor < 25 ? "normopeso" :
    valor < 30 ? "sobrepeso" :
    valor < 35 ? "obesidad grado I" :
    valor < 40 ? "obesidad grado II" : "obesidad grado III";
  return {
    ok: true,
    salida: {
      accion: "imc",
      imc: r(valor, 2),
      clasificacionOMS: clasificacion,
      formula: "peso(kg) / talla(m)^2",
      entradas: { pesoKg: peso, tallaM: r(tallaM, 3) },
      ...(avisoUnidad ? { avisoUnidad } : {}),
      aviso: AVISO_CLINICO,
    },
  };
}

/**
 * Superficie corporal — Mosteller (m²).
 * Fórmula: sqrt(altura(cm) × peso(kg) / 3600). Es la más usada en oncología
 * para dosificar; se declara la fórmula porque hay otras (Du Bois, Haycock).
 */
function superficieCorporal(d: any): ResultadoClinico {
  const peso = num(d?.peso ?? d?.pesoKg ?? d?.kg);
  const alturaCm = num(d?.alturaCm ?? d?.altura ?? d?.tallaCm);
  if (!isFinite(peso) || peso <= 0) return { ok: false, motivo: "falta «peso» en kg (número > 0)." };
  if (!isFinite(alturaCm) || alturaCm <= 0) return { ok: false, motivo: "falta «alturaCm» en centímetros (número > 0, ej. 175)." };
  const m2 = Math.sqrt((alturaCm * peso) / 3600);
  return {
    ok: true,
    salida: {
      accion: "superficie_corporal",
      superficieM2: r(m2, 3),
      formula: "Mosteller: sqrt(altura(cm) * peso(kg) / 3600)",
      entradas: { pesoKg: peso, alturaCm },
      nota: "Du Bois y Haycock dan valores distintos (±3%). Se declara Mosteller porque es la fórmula pedida por defecto.",
      aviso: AVISO_CLINICO,
    },
  };
}

/**
 * Aclaramiento de creatinina — Cockcroft-Gault (mL/min).
 * Fórmula: ((140 − edad) × peso) / (72 × creatinina) × 0.85 si sexo femenino.
 * Es la fórmula clásica para ajuste de dosis; NO es el CKD-EPI (que estima
 * TFG por otra vía). Se declara cuál se usó.
 */
function aclaramiento(d: any): ResultadoClinico {
  const edad = num(d?.edad ?? d?.edadAnios);
  const peso = num(d?.peso ?? d?.pesoKg ?? d?.kg);
  const creatinina = num(d?.creatinina ?? d?.creatininaMgDl);
  const sexo = sinAcentos(String(d?.sexo ?? ""));
  if (!isFinite(edad) || edad <= 0 || edad > 130) return { ok: false, motivo: "falta «edad» en años (número entre 1 y 130)." };
  if (!isFinite(peso) || peso <= 0) return { ok: false, motivo: "falta «peso» en kg (número > 0)." };
  if (!isFinite(creatinina) || creatinina <= 0) return { ok: false, motivo: "falta «creatinina» en mg/dL (número > 0)." };
  if (!["m", "masculino", "hombre", "f", "femenino", "mujer"].includes(sexo))
    return { ok: false, motivo: `«sexo» debe ser masculino|femenino (llegó «${d?.sexo ?? ""}»): el factor 0.85 cambia el resultado.` };
  const femenino = sexo === "f" || sexo === "femenino" || sexo === "mujer";
  const crcl = (((140 - edad) * peso) / (72 * creatinina)) * (femenino ? 0.85 : 1);
  const estadio =
    crcl >= 90 ? "normal (≥90)" :
    crcl >= 60 ? "leve (60–89)" :
    crcl >= 30 ? "moderado (30–59)" :
    crcl >= 15 ? "grave (15–29)" : "falla renal (<15)";
  return {
    ok: true,
    salida: {
      accion: "aclaramiento",
      aclaramientoMlMin: r(crcl, 1),
      estadioAproximado: estadio,
      formula: "Cockcroft-Gault: ((140 - edad) * peso) / (72 * creatinina) * (0.85 si femenino)",
      entradas: { edad, pesoKg: peso, creatininaMgDl: creatinina, sexo: femenino ? "femenino" : "masculino" },
      nota: "Cockcroft-Gault estima aclaramiento de creatinina para ajuste de dosis; NO es CKD-EPI (que estima TFG). No sustituye una analítica.",
      aviso: AVISO_CLINICO,
    },
  };
}

/**
 * Dosis por peso — mg/kg → mg totales, con techo opcional.
 * Fórmula: dosis(mg/kg) × peso(kg), recortada al máximo si se declara.
 */
function dosisPorPeso(d: any): ResultadoClinico {
  const mgPorKg = num(d?.mgPorKg ?? d?.dosis ?? d?.mgKg);
  const peso = num(d?.peso ?? d?.pesoKg ?? d?.kg);
  if (!isFinite(mgPorKg) || mgPorKg <= 0) return { ok: false, motivo: "falta «mgPorKg» (número > 0)." };
  if (!isFinite(peso) || peso <= 0) return { ok: false, motivo: "falta «peso» en kg (número > 0)." };
  const bruta = mgPorKg * peso;
  const techo = num(d?.maxMg ?? d?.techoMg);
  const aplicaTecho = isFinite(techo) && techo > 0 && bruta > techo;
  const total = aplicaTecho ? techo : bruta;
  return {
    ok: true,
    salida: {
      accion: "dosis_por_peso",
      dosisTotalMg: r(total, 2),
      dosisCalculadaMg: r(bruta, 2),
      techoAplicado: aplicaTecho ? r(techo, 2) : null,
      formula: "mg/kg * peso(kg), recortado a maxMg si se declara",
      entradas: { mgPorKg, pesoKg: peso, ...(isFinite(techo) ? { maxMg: techo } : {}) },
      aviso: AVISO_CLINICO,
    },
  };
}

/**
 * Conversión de dosis entre unidades de masa (mcg ↔ mg ↔ g).
 * Tabla cerrada: no inventa unidades. Factor SI exacto.
 */
function convertirDosis(d: any): ResultadoClinico {
  const cantidad = num(d?.cantidad ?? d?.valor);
  const de = sinAcentos(String(d?.de ?? ""));
  const a = sinAcentos(String(d?.a ?? ""));
  const FACTOR: Record<string, number> = { mcg: 1e-6, ug: 1e-6, mg: 1e-3, g: 1, kg: 1e3 };
  if (!isFinite(cantidad)) return { ok: false, motivo: "falta «cantidad» numérica." };
  if (!(de in FACTOR)) return { ok: false, motivo: `unidad de origen «${d?.de ?? ""}» desconocida (mcg|ug|mg|g|kg).` };
  if (!(a in FACTOR)) return { ok: false, motivo: `unidad de destino «${d?.a ?? ""}» desconocida (mcg|ug|mg|g|kg).` };
  const enGramos = cantidad * FACTOR[de];
  return {
    ok: true,
    salida: {
      accion: "convertir_dosis",
      resultado: r(enGramos / FACTOR[a], 8),
      unidad: a,
      formula: "cantidad * factor(de) / factor(a)  [factores SI exactos]",
      entradas: { cantidad, de, a },
      aviso: AVISO_CLINICO,
    },
  };
}

/** Tabla de acciones del espejo de medicina. Fuente única del despacho. */
const ACCIONES_MEDICINA: Record<string, (d: any) => ResultadoClinico> = {
  imc,
  superficie_corporal: superficieCorporal,
  aclaramiento,
  dosis_por_peso: dosisPorPeso,
  convertir_dosis: convertirDosis,
};

// ═══════════════════════════════════════════════════════════════════════════
// ESPEJO · CÓDIGO — analizador con veredicto (hallazgos con severidad)
// ═══════════════════════════════════════════════════════════════════════════

type Severidad = "critico" | "alto" | "medio" | "bajo";

interface Hallazgo {
  regla: string;
  severidad: Severidad;
  linea: number;
  detalle: string;
}

/** Patrones de SECRETO hardcodeado. Un secreto en el código es BLOQUEO CRÍTICO:
 *  no es estilo, es una fuga. Se detecta por forma, no por nombre de variable. */
const PATRONES_SECRETO: Array<{ regla: string; re: RegExp; detalle: string }> = [
  { regla: "secreto.aws", re: /\bAKIA[0-9A-Z]{16}\b/, detalle: "clave de acceso AWS hardcodeada" },
  { regla: "secreto.privada", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, detalle: "clave privada en el código" },
  { regla: "secreto.token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/, detalle: "token de GitHub hardcodeado" },
  { regla: "secreto.openai", re: /\bsk-[A-Za-z0-9]{20,}\b/, detalle: "clave de API con forma de sk-… hardcodeada" },
  { regla: "secreto.asignacion", re: /\b(?:api[_-]?key|apikey|secret|password|passwd|token|contrase[ñn]a)\s*[:=]\s*["'][^"'\s]{8,}["']/i, detalle: "credencial asignada en texto plano" },
];

/** Nombres que delatan deuda técnica declarada. */
const PATRONES_DEUDA: Array<{ regla: string; re: RegExp; severidad: Severidad; detalle: string }> = [
  { regla: "deuda.todo", re: /\b(TODO|FIXME|HACK|XXX)\b/, severidad: "medio", detalle: "marcador de trabajo pendiente" },
  { regla: "deuda.console", re: /\bconsole\.(?:log|debug)\s*\(/, severidad: "bajo", detalle: "traza de depuración en el código" },
  { regla: "deuda.eval", re: /\beval\s*\(/, severidad: "alto", detalle: "eval: ejecución de código arbitrario" },
  { regla: "deuda.var", re: /^\s*var\s+[A-Za-z_$]/, severidad: "bajo", detalle: "var en lugar de let/const" },
  { regla: "deuda.igualdad", re: /[^=!<>]==[^=]/, severidad: "bajo", detalle: "== en lugar de === (coerción implícita)" },
  { regla: "deuda.catch-vacio", re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/, severidad: "alto", detalle: "catch vacío: el error se traga en silencio" },
];

/**
 * Analiza un fragmento de código y devuelve HALLAZGOS con severidad y línea.
 * Contrato distinto al de `espejo.codigos` (que cuenta): aquí se dictamina.
 */
function analizarCodigo(d: any): ResultadoClinico {
  const codigo = typeof d?.codigo === "string" ? d.codigo : "";
  if (!codigo.trim()) return { ok: false, motivo: "no llegó «codigo» (texto del fragmento a analizar)." };
  const lineas = codigo.split("\n");
  const hallazgos: Hallazgo[] = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const n = i + 1;
    for (const p of PATRONES_SECRETO) {
      if (p.re.test(linea)) hallazgos.push({ regla: p.regla, severidad: "critico", linea: n, detalle: p.detalle });
    }
    for (const p of PATRONES_DEUDA) {
      if (p.re.test(linea)) hallazgos.push({ regla: p.regla, severidad: p.severidad, linea: n, detalle: p.detalle });
    }
  }

  // Complejidad por función: cuenta ramas dentro de cada bloque `function`/`=>`.
  const funciones = [...codigo.matchAll(/\b(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g)];
  const complejas: Array<{ nombre: string; ramas: number }> = [];
  for (const f of funciones) {
    const nombre = f[1] || f[2] || "(anónima)";
    const desde = f.index ?? 0;
    // Ventana hasta la siguiente función o 2000 caracteres: aproximación DECLARADA.
    const hasta = Math.min(codigo.length, desde + 2000);
    const cuerpo = codigo.slice(desde, hasta);
    const ramas = (cuerpo.match(/\b(?:if|else\s+if|for|while|case|catch|\?\?|\?\.|&&|\|\|)\b/g) || []).length;
    if (ramas >= 10) complejas.push({ nombre, ramas });
  }
  for (const c of complejas) {
    hallazgos.push({
      regla: "complejidad.alta",
      severidad: c.ramas >= 20 ? "alto" : "medio",
      linea: 0,
      detalle: `«${c.nombre}» tiene ~${c.ramas} ramas en su ventana: candidata a dividir`,
    });
  }

  // Imports sin uso: se declara la limitación (búsqueda textual, no AST).
  const imports = [...codigo.matchAll(/^\s*import\s+(?:\{([^}]+)\}|([A-Za-z_$][\w$]*))\s+from\s+["'][^"']+["']/gm)];
  const sinUsar: string[] = [];
  for (const im of imports) {
    const nombres = (im[1] || im[2] || "").split(",").map((s: string) => s.trim().split(/\s+as\s+/).pop() || "").filter(Boolean);
    for (const nombre of nombres) {
      const cuerpoSinImport = codigo.replace(/^\s*import[^\n]*$/gm, "");
      const usos = (cuerpoSinImport.match(new RegExp(`\\b${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) || []).length;
      if (usos === 0) sinUsar.push(nombre);
    }
  }
  for (const nombre of sinUsar) {
    hallazgos.push({ regla: "import.sin-uso", severidad: "bajo", linea: 0, detalle: `«${nombre}» se importa y no se usa` });
  }

  const cuenta: Record<Severidad, number> = { critico: 0, alto: 0, medio: 0, bajo: 0 };
  for (const h of hallazgos) cuenta[h.severidad]++;

  const veredicto =
    cuenta.critico > 0 ? "BLOQUEADO" :
    cuenta.alto > 0 ? "REVISAR_ANTES_DE_MERGE" :
    cuenta.medio > 0 ? "ACEPTABLE_CON_DEUDA" : "LIMPIO";

  return {
    ok: true,
    salida: {
      accion: "analizar",
      veredicto,
      totalHallazgos: hallazgos.length,
      cuenta,
      hallazgos: hallazgos.slice(0, 60),
      truncado: hallazgos.length > 60,
      lineas: lineas.length,
      limitaciones: [
        "Análisis textual, no AST: los imports sin uso se detectan por nombre, no por ámbito.",
        "La complejidad es una ventana de 2000 caracteres desde la firma, no el cuerpo exacto.",
        "No ejecuta el código ni resuelve tipos.",
      ],
    },
  };
}

/** Tabla de acciones del espejo de código. */
const ACCIONES_CODIGO: Record<string, (d: any) => ResultadoClinico> = {
  analizar: analizarCodigo,
};

// ═══════════════════════════════════════════════════════════════════════════
// FÁBRICA — las dos entidades nuevas
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crea `espejo.medicina` y `espejo.codigo` con el MISMO contrato que los otros
 * espejos: `{ ok, salida?: JSON string, motivo?, entidad, ms }`.
 *
 * Despacho: si llega `accion` y existe en la tabla, se ejecuta esa acción; si
 * llega `accion` y NO existe, se devuelve el motivo con la lista de acciones
 * válidas (nunca silencio); sin `accion`, se usa la acción por defecto.
 */
export function crearEspejosNuevos(reg: Reg, r: Env): Entidad[] {
  const okJ = (id: string, t0: number, obj: unknown) => r(id, t0, true, { salida: JSON.stringify(obj) });
  const no = (id: string, t0: number, motivo: string) => r(id, t0, false, { motivo });
  const E = "espejo";
  const lista: Entidad[] = [];

  const construir = (
    id: string,
    nombre: string,
    descripcion: string,
    acciones: Record<string, (d: any) => ResultadoClinico>,
    accionPorDefecto: string,
  ) => {
    lista.push(reg(id, nombre, E, true, descripcion, (d) => {
      const t0 = Date.now();
      const accion = d && typeof d === "object" ? String((d as any).accion || "") : "";
      const clave = accion || accionPorDefecto;
      const fn = acciones[clave];
      if (!fn) {
        return no(id, t0, `«${clave}» no es acción de ${id}. Acciones: ${Object.keys(acciones).join(", ")}.`);
      }
      try {
        const res = fn(d ?? {});
        return res.ok ? okJ(id, t0, res.salida) : no(id, t0, res.motivo || "sin motivo declarado");
      } catch (e: any) {
        return no(id, t0, `la acción «${clave}» reventó: ${String(e?.message || e)}`);
      }
    }));
  };

  construir(
    "espejo.medicina",
    "Espejo · Medicina",
    "calculadora clínica determinista: IMC (OMS), superficie corporal (Mosteller), aclaramiento de creatinina (Cockcroft-Gault), dosis por peso y conversión de dosis. NO diagnostica ni prescribe: devuelve el número con su fórmula y su aviso (JSON, sin modelo)",
    ACCIONES_MEDICINA,
    "imc",
  );

  construir(
    "espejo.codigo",
    "Espejo · Código (veredicto)",
    "analiza un fragmento y DICTAMINA: secretos hardcodeados (crítico), eval, catch vacío, complejidad alta, imports sin uso y deuda declarada, con severidad, línea y veredicto BLOQUEADO/REVISAR/LIMPIO (JSON, sin modelo)",
    ACCIONES_CODIGO,
    "analizar",
  );

  return lista;
}

/** Catálogo de acciones, para documentación y para el mensaje de error. */
export const ACCIONES_ESPEJOS_NUEVOS: Record<string, string[]> = {
  "espejo.medicina": Object.keys(ACCIONES_MEDICINA),
  "espejo.codigo": Object.keys(ACCIONES_CODIGO),
};
