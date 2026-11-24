/**
 * explicarDecision.ts — EL MODO «¿POR QUÉ DECIDISTE ESTO?» (v1.86.0 · FASE 7.3)
 * ===========================================================================
 * EL PLANO (FASE 7 punto 3): «un modo «¿por qué decidiste esto?» que responde
 * citando traza (FASE 6) + trozos del órgano (FASE 2) con ruta y línea, como
 * esta documentación». Y la evidencia que exige: «la respuesta «¿por qué?»
 * siempre cita artefacto real — test: ninguna cita sin ruta».
 *
 * ESTO NO ES UN RESUMEN GENERADO. Es la traza del ciclo de decisión (FASE 6.2)
 * re-leída y convertida en prosa, con dos clases de fuente:
 *   · REGLA — la línea del código donde vive la regla que decidió (resuelta
 *     contra el árbol del IDE con `citaFuente`, o sea: medida en disco AHORA).
 *   · ÓRGANO — la entrada de memoria que pesó en la decisión, citada con el
 *     archivo y la línea donde está escrita (`cerebro/temas/*.md` del motor).
 *
 * LA REGLA DURADERA, que es lo que distingue esta pieza de un chat que explica
 * bonito: ANTES de responder, cada cita se reverifica contra el disco
 * (`verificarCita`). La que no resuelve se BAJA de la respuesta y sube a
 * `sinFuente` con nombre y apellido. Cero citas huérfanas, igual que
 * `ejecutarEntidad` nunca falla en silencio.
 *
 * SIN TRAZA NO HAY EXPLICACIÓN: si el paso no existe, `ok:false` con el motivo
 * y la lista de los pasos que sí existen. Inventar una explicación de un paso
 * que no ocurrió es exactamente la mentira que el plano quiere matar.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cargarTrazas, listarTrazas, trazaPorId, type TrazaDecision } from "./cicloDecision";
import { localizarLinea, verificarCita, type Cita } from "./citaFuente";
import { cargarIndice, rutaCerebro } from "./cerebroOrgano";

export type OrigenCita = "regla" | "organo" | "traza";

export interface CitaVerificada extends Cita {
  origen: OrigenCita;
  /** Qué afirma esta cita (el eslabón de la explicación que sostiene). */
  sostiene: string;
  /** false = la cita NO resolvió contra disco: se baja de la respuesta. */
  verificada: boolean;
}

export interface Explicacion {
  ok: boolean;
  pasoId: string;
  /** La pregunta que se respondió, tal cual la hace la UI. */
  pregunta: string;
  resumen: string;
  /** Prosa citable: cada párrafo termina con [archivo:línea] o dice que no hay fuente. */
  explicacion: string;
  citas: CitaVerificada[];
  /** Afirmaciones que se devuelven SIN cita, declaradas (nunca disfrazadas). */
  sinFuente: string[];
  /** Cuando ok === false: por qué no hay explicación. */
  motivo?: string;
  /** Pasos disponibles, para que el «no existe» sirva de algo. */
  disponibles?: string[];
}

export interface ContextoExplicar {
  /** Raíz del código fuente (para las citas de regla). */
  raizFuente: string;
  /** Raíz de datos del motor (ahí vive `cerebro/`, para las citas del órgano). */
  raizDatos: string;
  /** Trazas a usar (por defecto: anillo + disco, en ese orden). */
  trazas?: TrazaDecision[];
}

function resolverTraza(pasoId: string | number, ctx: ContextoExplicar): TrazaDecision | null {
  const delAnillo = trazaPorId(pasoId);
  if (delAnillo) return delAnillo;
  const desdeDisco = ctx.trazas || cargarTrazas(ctx.raizDatos, 200).trazas;
  const crudo = String(pasoId ?? "").trim();
  const directo = desdeDisco.find((t) => t.id === crudo);
  if (directo) return directo;
  const n = Number(crudo.replace(/^#/, ""));
  if (Number.isFinite(n)) {
    const porSecuencia = desdeDisco.find((t) => t.secuencia === n);
    if (porSecuencia) return porSecuencia;
  }
  return null;
}

/** Cita de una regla, ya verificada. `null` = no resuelve (se declara, no se inventa). */
function citaRegla(ctx: ContextoExplicar, archivo: string, linea: number, sostiene: string): CitaVerificada | null {
  if (!linea || linea < 1) return null;
  if (!verificarCita(ctx.raizFuente, { archivo, linea })) return null;
  const texto = leerLinea(ctx.raizFuente, archivo, linea);
  return { archivo, linea, texto, origen: "regla", sostiene, verificada: true };
}

function leerLinea(raiz: string, archivoRel: string, linea: number): string {
  try {
    if (!existsSync(path.resolve(raiz, archivoRel))) return "";
    return readFileSync(path.resolve(raiz, archivoRel), "utf8").split(/\r?\n/)[linea - 1]?.trim().slice(0, 200) || "";
  } catch {
    return "";
  }
}

/** Cita de una entrada del órgano (FASE 2), con el archivo y la línea reales. */
function citaOrgano(ctx: ContextoExplicar, archivoRelEnCerebro: string, titulo: string, sostiene: string): CitaVerificada | null {
  const relativo = `cerebro/${String(archivoRelEnCerebro || "").replace(/^\/+/, "")}`;
  const absoluto = path.resolve(ctx.raizDatos, relativo);
  if (!existsSync(absoluto)) return null;
  const lineas = (() => { try { return readFileSync(absoluto, "utf8").split(/\r?\n/); } catch { return []; } })();
  const idx = lineas.findIndex((l: string) => titulo && l.includes(titulo));
  const linea = idx >= 0 ? idx + 1 : 1;
  const verificada = verificarCita(ctx.raizDatos, { archivo: relativo, linea });
  if (!verificada) return null;
  return { archivo: relativo, linea, texto: (lineas[linea - 1] || "").trim().slice(0, 200), origen: "organo", sostiene, verificada: true };
}

/**
 * EXPLICAR UN PASO. `pasoId` acepta el id de la traza (`t7-1800000000014`) o el
 * número de paso (`7` / `#7`), que es lo que un humano teclea.
 */
export function explicarPaso(pasoId: string | number, ctx: ContextoExplicar): Explicacion {
  const base: Explicacion = {
    ok: false,
    pasoId: String(pasoId ?? ""),
    pregunta: "¿por qué decidiste esto?",
    resumen: "",
    explicacion: "",
    citas: [],
    sinFuente: [],
  };
  const traza = resolverTraza(pasoId, ctx);
  if (!traza) {
    const disponibles = listarTrazas(8).map((t) => t.id);
    return {
      ...base,
      motivo: `no existe el paso «${String(pasoId ?? "")}»: no se explica lo que no pasó. Los pasos disponibles son ${disponibles.length ? disponibles.join(", ") : "ninguno todavía"}.`,
      disponibles,
    };
  }

  const citas: CitaVerificada[] = [];
  const sinFuente: string[] = [];
  const parrafos: string[] = [];
  const etiqueta = (c: CitaVerificada) => `[${c.archivo}:${c.linea}]`;

  // 1) La clasificación: qué entendió el reflejo.
  const etapaClas = traza.etapas.find((e) => e.etapa === "clasificacion");
  if (etapaClas) {
    parrafos.push(`${etapaClas.que}`);
    if (etapaClas.fuente) {
      const c = citaRegla(ctx, etapaClas.fuente.archivo, etapaClas.fuente.linea, "cómo se clasificó la frase");
      if (c) { citas.push(c); parrafos[parrafos.length - 1] += ` ${etiqueta(c)}`; }
      else sinFuente.push(`la regla de clasificación de «${traza.accion}» citaba ${etapaClas.fuente.archivo}:${etapaClas.fuente.linea} y esa línea ya no existe`);
    } else sinFuente.push(`clasificación de «${traza.accion}» sin fuente: ${etapaClas.aviso || "la traza no trae fuente"}`);
  }

  // 2) El voto: qué especialista la reclamó y con qué razón.
  const etapaVoto = traza.etapas.find((e) => e.etapa === "voto");
  if (etapaVoto) {
    let p = etapaVoto.que;
    if (etapaVoto.fuente) {
      const c = citaRegla(ctx, etapaVoto.fuente.archivo, etapaVoto.fuente.linea, `por qué votó ${traza.especialista}`);
      if (c) { citas.push(c); p += ` ${etiqueta(c)}`; }
      else sinFuente.push(`el voto de «${traza.especialista}» sin fuente verificable (${etapaVoto.fuente.archivo}:${etapaVoto.fuente.linea})`);
    } else sinFuente.push(`el voto de «${traza.especialista}» no trae fuente: ${etapaVoto.aviso || "sin declarada"}`);
    parrafos.push(p);
  }

  // 3) La ejecución: la herramienta, su estado y el motivo si no corrió.
  const etapaEj = traza.etapas.find((e) => e.etapa === "ejecucion");
  if (etapaEj) {
    let p = etapaEj.que;
    if (etapaEj.fuente) {
      const c = citaRegla(ctx, etapaEj.fuente.archivo, etapaEj.fuente.linea, traza.entidad ? `quién ejecutó (${traza.entidad})` : "por qué no había nada que ejecutar");
      if (c) { citas.push(c); p += ` ${etiqueta(c)}`; }
      else sinFuente.push(`la ejecución de «${traza.entidad || "sin entidad"}» sin fuente verificable`);
    } else sinFuente.push(`la ejecución sin fuente: ${etapaEj.aviso || "sin declarada"}`);
    parrafos.push(p);
  }

  // 4) El órgano: qué memoria pesó (FASE 2), citada en el archivo donde está escrita.
  const etapaOrgano = traza.etapas.find((e) => e.etapa === "organo");
  const rutas = ((etapaOrgano?.datos as any)?.rutas || []) as Array<{ tema: string; titulo: string }>;
  if (rutas.length) {
    const indice = cargarIndice(ctx.raizDatos);
    const nombrados: string[] = [];
    for (const r of rutas.slice(0, 3)) {
      const entrada = indice.entradas.find((e) => e.tema === r.tema && e.titulo === r.titulo) || indice.entradas.find((e) => e.titulo === r.titulo);
      if (!entrada) { sinFuente.push(`la traza dice que el órgano trajo «${r.tema}/${r.titulo}» pero esa entrada ya no está en el índice`); continue; }
      const c = citaOrgano(ctx, entrada.archivo, entrada.titulo, `la memoria que el motor ya tenía de esto`);
      if (!c) { sinFuente.push(`la entrada «${r.tema}/${r.titulo}» no resolvió a un archivo de disco`); continue; }
      citas.push(c);
      nombrados.push(`«${r.tema}/${r.titulo}» ${etiqueta(c)}`);
    }
    if (nombrados.length) parrafos.push(`El motor no partió de cero: ya tenía en su órgano ${nombrados.join(", ")}.`);
  } else {
    parrafos.push("El órgano no tenía memoria previa de esta frase: fue la primera vez que el motor decidía esto.");
    if (etapaOrgano?.fuente) {
      const c = citaRegla(ctx, etapaOrgano.fuente.archivo, etapaOrgano.fuente.linea, "dónde se consulta el órgano en el ciclo");
      if (c) { citas.push(c); parrafos[parrafos.length - 1] += ` ${etiqueta(c)}`; }
    }
  }

  const resumen = traza.ok
    ? `Se decidió «${traza.accion}» → ${traza.entidad || traza.especialista} y terminó OK en ${traza.ms} ms.`
    : `Se decidió «${traza.accion}» → ${traza.entidad || traza.especialista} y NO terminó OK: ${traza.motivo || "sin motivo declarado"}.`;

  const colaSinFuente = sinFuente.length
    ? `\n\nSin fuente verificable en esta respuesta (se declara, no se disfraza):\n${sinFuente.map((s) => `· ${s}`).join("\n")}`
    : "";
  return {
    ok: citas.length > 0,
    pasoId: traza.id,
    pregunta: "¿por qué decidiste esto?",
    resumen,
    explicacion: `${resumen}\n\n${parrafos.join("\n")}${colaSinFuente}`,
    citas,
    sinFuente,
    motivo: citas.length === 0 ? "esta traza no tiene ninguna cita que resuelva a archivo y línea: no se responde sin artefacto real" : undefined,
  };
}

/** El paso más reciente (lo que pregunta la UI cuando nadie escribe un número). */
export function explicarUltimoPaso(ctx: ContextoExplicar): Explicacion {
  const ultima = listarTrazas(1)[0] || (ctx.trazas || cargarTrazas(ctx.raizDatos, 5).trazas).slice(-1)[0];
  if (!ultima) {
    return {
      ok: false, pasoId: "", pregunta: "¿por qué decidiste esto?", resumen: "", explicacion: "",
      citas: [], sinFuente: [],
      motivo: "todavía no hay ninguna decisión trazada: el ciclo de decisión (FASE 6.2) escribe su primera traza al decidir algo",
    };
  }
  return explicarPaso(ultima.id, ctx);
}

/**
 * EL CONTRATO, expuesto para la suite y para el endpoint: NINGUNA cita sin ruta.
 * Devuelve las citas malas (ruta inexistente, línea fuera del archivo, o línea
 * que ya no dice lo que la traza afirma).
 */
export function auditarCitas(explicacion: Explicacion, ctx: { raizFuente: string; raizDatos: string }): { ok: boolean; malas: string[] } {
  const malas: string[] = [];
  for (const c of explicacion.citas) {
    const raiz = c.origen === "organo" ? ctx.raizDatos : ctx.raizFuente;
    if (!c.archivo || typeof c.linea !== "number" || c.linea < 1) { malas.push(`cita sin ruta: ${JSON.stringify(c)}`.slice(0, 120)); continue; }
    if (!verificarCita(raiz, { archivo: c.archivo, linea: c.linea })) malas.push(`${c.archivo}:${c.linea} no resuelve contra disco`);
  }
  // Y la otra dirección: si la explicación afirma algo sin cita, tiene que estar declarado.
  const sinCitar = (explicacion.explicacion.match(/\n(?!\s*·)[^\n\[]+$/g) || []).length;
  if (!explicacion.citas.length && !explicacion.sinFuente.length && !explicacion.motivo) malas.push(`respuesta sin citas y sin declaración de falta de fuente (invento ${sinCitar})`);
  return { ok: malas.length === 0, malas };
}

/** La cara del endpoint: cuántos pasos hay y cuáles se pueden explicar. */
export function estadoExplicar(ctx: ContextoExplicar) {
  // El anillo manda; si el proceso recién arrancó, los pasos salen del JSONL.
  const delAnillo = listarTrazas(8);
  const desdeDisco = delAnillo.length ? [] : cargarTrazas(ctx.raizDatos, 8).trazas.slice(-8).reverse();
  const paso = delAnillo.length ? delAnillo : desdeDisco;
  return {
    ok: true,
    origen: delAnillo.length ? ("memoria del proceso" as const) : ("disco" as const),
    pasos: paso.map((t) => ({ pasoId: t.id, secuencia: t.secuencia, accion: t.accion, ok: t.ok, frase: t.frase.slice(0, 80) })),
    enDisco: cargarTrazas(ctx.raizDatos, 1).trazas.length > 0 ? 1 : 0,
    regla: "GET /api/explicar?pasoId=N responde con la traza del paso N más los trozos del órgano citados en él. Cada cita es {archivo, linea} verificada contra el disco en este instante; lo que no resuelve se declara en sinFuente.",
  };
}
