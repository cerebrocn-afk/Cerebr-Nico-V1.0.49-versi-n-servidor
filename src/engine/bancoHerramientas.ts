/**
 * bancoHerramientas.ts — v1.0.31 · EL BANCO DE ELECCIÓN DE HERRAMIENTAS (P0)
 * ========================================================================
 * QUÉ PROBLEMA MIDE
 * ─────────────────
 * Todo lo que se discute sobre «el modelo elige bien o mal la herramienta» se
 * discutía con impresiones. La propuesta v1.1.0 pide un banco reproducible con
 * prompts reales, y tiene una razón fuerte: sin número no hay decisión, y sin
 * decisión se cambia el prompt a ojo y se rompe lo que funcionaba.
 *
 * LA TRAMPA QUE ESTE MÓDULO ESQUIVA (y que un banco ingenuo comete)
 * ──────────────────────────────────────────────────────────────
 * Un modelo de 7B recibe 15 de las 105 herramientas. Si el banco le pregunta por
 * una de las 90 que NO ve, falla SIEMPRE — y ese fallo no dice nada del modelo ni
 * del manual: dice que la pregunta era imposible. Por eso la métrica principal es
 * **acierto CONDICIONAL a visibilidad**: de los casos en los que la herramienta
 * correcta estaba en el catálogo del turno, ¿cuántos acertó? El número absoluto
 * se informa igual, pero separado, y los casos imposibles se cuentan aparte
 * (`invisibles`), no se esconden dentro del porcentaje.
 *
 * TRES COSAS MÁS QUE UN BANCO HONESTO TIENE QUE HACER
 *   · Contar las llamadas que el modelo escribe EN TEXTO. Los modelos sin
 *     function-calling nativo no emiten `tool_calls`: emiten
 *     ```cerebronico:leer_archivo o `leer_archivo({"path":…})`. Si el banco solo
 *     mira `tool_calls`, declara «no eligió ninguna» a un modelo que sí eligió.
 *   · No contar como fallo el turno que el modelo NO respondió (timeout, corte):
 *     eso es disponibilidad, no elección.
 *   · Medir tokens y TTFT junto al acierto: un banco que solo mide acierto premia
 *     prompts gigantes, y el prompt gigante es lo que se quiere evitar.
 *
 * Capa PURA: sin red, sin fs, sin modelo. `npx tsx tests/bancoHerramientas.test.ts`
 */

export interface CasoBanco {
  /** Identificador corto y único (`ed-01`). */
  id: string;
  /** Categoría para poder leer el informe por tipo de trabajo. */
  categoria: string;
  /** Perfil al que se le hace la pregunta (`local7b`, `nube`, `grande`). */
  perfil: string;
  /** Lo que dice el usuario, tal cual. */
  prompt: string;
  /** La herramienta que resuelve el caso. */
  esperada: string;
  /** Otras que también resuelven el caso (acierto en el top-3). */
  aceptables?: string[];
  /** Servicios que el caso necesita (`red`, `pc`, `ollama`…). Sin ellos, no se pregunta. */
  servicios?: string[];
}

/** Un turno medido: qué se le ofreció y qué eligió. */
export interface TurnoMedido {
  caso: string;
  /** Nombres de herramientas que el modelo TENÍA en el prompt de ese turno. */
  visibles: string[];
  /** Nombres que llamó, en orden (vacío = contestó sin llamar). */
  llamadas: string[];
  /** De dónde salieron las llamadas: function-calling real o texto. */
  fuente?: "nativo" | "texto" | "ninguna";
  /** Si el turno no llegó a responder (timeout, corte, 429). */
  sinRespuesta?: boolean;
  tokensEntrada?: number;
  tokensSalida?: number;
  ttftMs?: number;
}

export interface ResultadoCaso {
  id: string;
  categoria: string;
  perfil: string;
  esperada: string;
  /** ¿La esperada estaba en el catálogo del turno? */
  visible: boolean;
  /** ¿Llamó a la esperada de primera? */
  acierto1: boolean;
  /** ¿Llamó a la esperada en las tres primeras? */
  acierto3: boolean;
  /** Contestó sin llamar a ninguna herramienta. */
  sinLlamada: boolean;
  /** El turno no respondió: no se juzga la elección. */
  sinRespuesta: boolean;
  fuente: "nativo" | "texto" | "ninguna";
}

export interface ResultadoBanco {
  casos: ResultadoCaso[];
  totales: {
    casos: number;
    conTurno: number;
    sinTurno: number;
    sinRespuesta: number;
    visibles: number;
    invisibles: number;
    acierto1: number;
    acierto3: number;
    /** Acierto@1 SOLO sobre los casos donde la esperada era visible. */
    acierto1Condicional: number;
    acierto3Condicional: number;
    porTexto: number;
    tokensEntrada: number;
    tokensSalida: number;
    ttftMedianaMs: number | null;
  };
  porCategoria: Array<{ categoria: string; casos: number; visibles: number; acierto1Condicional: number }>;
  porPerfil: Array<{ perfil: string; casos: number; visibles: number; acierto1Condicional: number }>;
}

const norm = (n: string): string => String(n || "").trim();
const pct = (n: number, d: number): string => (d > 0 ? `${Math.round((100 * n) / d)}%` : "—");

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

/**
 * Evalúa un banco contra los turnos medidos.
 *
 * Reglas (y por qué):
 *   · Un caso SIN turno medido no entra en ningún porcentaje: no se puede juzgar
 *     lo que no se ejecutó. Se cuenta en `sinTurno` y se nombra en el informe.
 *   · Un turno `sinRespuesta` se cuenta como disponibilidad, no como fallo de
 *     elección (no se incluye en acierto1Condicional).
 *   · La visibilidad se toma del TURNO, no de una tabla ideal: si el recorte real
 *     dejó fuera la herramienta, el caso es imposible y así se declara.
 */
export function evaluarBanco(casos: CasoBanco[], turnos: TurnoMedido[]): ResultadoBanco {
  const porId = new Map(turnos.map((t) => [norm(t.caso), t]));
  const resultados: ResultadoCaso[] = [];

  for (const c of casos || []) {
    const t = porId.get(norm(c.id));
    const visibles = new Set((t?.visibles || []).map(norm));
    const llamadas = (t?.llamadas || []).map(norm);
    const aceptables = new Set([norm(c.esperada), ...(c.aceptables || []).map(norm)]);
    const visible = visibles.has(norm(c.esperada));
    resultados.push({
      id: c.id,
      categoria: c.categoria,
      perfil: c.perfil,
      esperada: c.esperada,
      visible,
      // Si la esperada no estaba en el turno, el caso no se puede acertar: no es
      // un acierto aunque el turno traiga el nombre (dato sintético o registro
      // cambiado entre la medición y la lectura). El absoluto es, por definición,
      // un subconjunto del condicional.
      acierto1: !!t && !t.sinRespuesta && visible && llamadas[0] === norm(c.esperada),
      acierto3: !!t && !t.sinRespuesta && visible && llamadas.slice(0, 3).some((n) => aceptables.has(n)),
      sinLlamada: !!t && !t.sinRespuesta && llamadas.length === 0,
      sinRespuesta: !!t && t.sinRespuesta === true,
      fuente: t?.fuente || "ninguna",
    });
  }

  const conTurno = resultados.filter((r) => !r.sinRespuesta && porId.has(norm(r.id)));
  const sinRespuesta = resultados.filter((r) => r.sinRespuesta);
  const visibles = conTurno.filter((r) => r.visible);
  const invisibles = conTurno.filter((r) => !r.visible);
  const turnosValidos = conTurno.map((r) => porId.get(norm(r.id))!).filter(Boolean);

  const agrupar = (clave: (r: ResultadoCaso) => string): Array<{ clave: string; casos: number; visibles: number; acierto1Condicional: number }> => {
    const m = new Map<string, { casos: number; visibles: number; aciertos: number }>();
    for (const r of conTurno) {
      const k = clave(r) || "(sin nombre)";
      const acc = m.get(k) || { casos: 0, visibles: 0, aciertos: 0 };
      acc.casos++;
      if (r.visible) {
        acc.visibles++;
        if (r.acierto1) acc.aciertos++;
      }
      m.set(k, acc);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([clave, v]) => ({ clave, casos: v.casos, visibles: v.visibles, acierto1Condicional: v.visibles ? v.aciertos / v.visibles : 0 }));
  };

  return {
    casos: resultados,
    totales: {
      casos: resultados.length,
      conTurno: conTurno.length,
      sinTurno: resultados.filter((r) => !porId.has(norm(r.id))).length,
      sinRespuesta: sinRespuesta.length,
      visibles: visibles.length,
      invisibles: invisibles.length,
      acierto1: conTurno.filter((r) => r.acierto1).length,
      acierto3: conTurno.filter((r) => r.acierto3).length,
      acierto1Condicional: visibles.length ? visibles.filter((r) => r.acierto1).length / visibles.length : 0,
      acierto3Condicional: visibles.length ? visibles.filter((r) => r.acierto3).length / visibles.length : 0,
      porTexto: conTurno.filter((r) => r.fuente === "texto").length,
      tokensEntrada: turnosValidos.reduce((a, t) => a + (Number(t.tokensEntrada) || 0), 0),
      tokensSalida: turnosValidos.reduce((a, b) => a + (Number(b.tokensSalida) || 0), 0),
      ttftMedianaMs: mediana(turnosValidos.map((t) => Number(t.ttftMs)).filter((n) => Number.isFinite(n) && n > 0)),
    },
    porCategoria: agrupar((r) => r.categoria).map((x) => ({ categoria: x.clave, casos: x.casos, visibles: x.visibles, acierto1Condicional: x.acierto1Condicional })),
    porPerfil: agrupar((r) => r.perfil).map((x) => ({ perfil: x.clave, casos: x.casos, visibles: x.visibles, acierto1Condicional: x.acierto1Condicional })),
  };
}

/**
 * Informe legible. Regla de redacción: primero el número que decide (condicional),
 * después el absoluto, y SIEMPRE al lado el número de casos imposibles. Un informe
 * que solo dice «42 % de acierto» sin decir «y 61 de 105 casos eran imposibles»
 * hace tomar la decisión contraria a la correcta.
 */
export function informeBanco(r: ResultadoBanco, etiqueta = ""): string {
  const t = r.totales;
  const lineas = [
    `BANCO DE ELECCIÓN${etiqueta ? ` · ${etiqueta}` : ""}`,
    `· casos: ${t.casos} · medidos ${t.conTurno} · sin turno ${t.sinTurno} · sin respuesta ${t.sinRespuesta}`,
    `· visibilidad: ${t.visibles} con la esperada a la vista · ${t.invisibles} imposibles (la herramienta no estaba en el turno)`,
    `· acierto@1 CONDICIONAL: ${pct(t.acierto1Condicional * t.visibles, t.visibles)} (${Math.round(t.acierto1Condicional * t.visibles)}/${t.visibles}) — es el número que decide`,
    `· acierto@3 CONDICIONAL: ${pct(t.acierto3Condicional * t.visibles, t.visibles)} (${Math.round(t.acierto3Condicional * t.visibles)}/${t.visibles})`,
    `· acierto@1 ABSOLUTO: ${pct(t.acierto1, t.conTurno)} (${t.acierto1}/${t.conTurno}) — incluye los imposibles, sirve para comparar entre perfiles`,
    `· llamadas emitidas en TEXTO (sin function-calling nativo): ${t.porTexto}`,
    `· coste: ${t.tokensEntrada} tokens de entrada · ${t.tokensSalida} de salida · TTFT mediana ${t.ttftMedianaMs ?? "—"} ms`,
  ];
  if (r.porCategoria.length) {
    lineas.push("", "por categoría (acierto@1 condicional):");
    for (const c of r.porCategoria) lineas.push(`  · ${c.categoria}: ${pct(c.acierto1Condicional * c.visibles, c.visibles)} de ${c.visibles} visibles (${c.casos} casos)`);
  }
  if (r.porPerfil.length) {
    lineas.push("", "por perfil (acierto@1 condicional):");
    for (const p of r.porPerfil) lineas.push(`  · ${p.perfil}: ${pct(p.acierto1Condicional * p.visibles, p.visibles)} de ${p.visibles} visibles (${p.casos} casos)`);
  }
  return lineas.join("\n");
}

/**
 * Valida el banco ANTES de medir. Un banco con ids repetidos o con una esperada
 * que no existe mide ruido: el «fallo» que reporta es un error de escritura.
 */
export function validarCasos(casos: CasoBanco[], conocidas: string[]): string[] {
  const problemas: string[] = [];
  const nombres = new Set(conocidas.map(norm));
  const ids = new Set<string>();
  const categorias = new Set<string>();
  for (const c of casos || []) {
    if (!norm(c.id)) problemas.push("caso sin id");
    else if (ids.has(norm(c.id))) problemas.push(`id repetido: ${c.id}`);
    else ids.add(norm(c.id));
    if (!norm(c.prompt)) problemas.push(`${c.id}: sin prompt`);
    if (!norm(c.esperada)) problemas.push(`${c.id}: sin esperada`);
    else if (nombres.size && !nombres.has(norm(c.esperada))) problemas.push(`${c.id}: la esperada «${c.esperada}» no existe en el registro`);
    for (const a of c.aceptables || []) {
      if (nombres.size && !nombres.has(norm(a))) problemas.push(`${c.id}: la aceptable «${a}» no existe en el registro`);
    }
    if (norm(c.categoria)) categorias.add(norm(c.categoria));
  }
  if (casos.length && casos.length < 40) problemas.push(`el banco tiene ${casos.length} casos: por debajo de 40 no distingue un cambio de ruido`);
  if (casos.length && categorias.size < 6) problemas.push(`solo ${categorias.size} categorías: el banco no cubre tipos de trabajo distintos`);
  return problemas;
}

/**
 * Extrae nombres de herramienta de una respuesta EN TEXTO. Los modelos sin
 * function-calling escriben la llamada de varias formas, y todas se vieron en
 * sesiones reales:
 *
 *   1. Bloque de código con la herramienta: ```cerebronico:write_file
 *   2. Nombre + JSON:                     write_file({"path":"a"})
 *   3. Etiqueta tipo XML:                 <tool_call>{"name":"write_file"}</tool_call>
 *   4. Objeto JSON suelto:                {"name": "write_file", "arguments": {…}}
 *
 * Devuelve los nombres EN ORDEN de aparición, sin repetir consecutivos, y solo
 * los que están en `conocidas` (si se pasa): una prosa que dice «voy a leer el
 * archivo» no es una llamada, y una herramienta inventada no se cuenta como
 * elección válida (se informa aparte con `inventadas`).
 */
export function parsearLlamadasDeTexto(texto: string, conocidas?: string[]): { llamadas: string[]; inventadas: string[] } {
  const s = String(texto || "");
  const crudos: string[] = [];
  const push = (n: string) => { if (n && crudos[crudos.length - 1] !== n) crudos.push(n); };

  // 1 · ```cerebronico:nombre  /  ```nombre
  for (const m of s.matchAll(/```\s*(?:cerebronico:)?([a-z][a-z0-9_]{2,40})\b/g)) push(m[1]);
  // 2 · nombre({ … })  o  nombre{ … }  (también con espacio antes del paréntesis)
  for (const m of s.matchAll(/\b([a-z][a-z0-9_]{2,40})\s*\(\s*\{/g)) push(m[1]);
  // 3 · <tool_call>{"name":"x"}</tool_call> y variantes <function=x>
  for (const m of s.matchAll(/<tool_call>\s*\{?[^<]*?"name"\s*:\s*"([a-z][a-z0-9_]{2,40})"/g)) push(m[1]);
  for (const m of s.matchAll(/<function[=:\s]+"?([a-z][a-z0-9_]{2,40})"?/g)) push(m[1]);
  // 4 · {"name": "x", "arguments": …}
  for (const m of s.matchAll(/\{\s*"name"\s*:\s*"([a-z][a-z0-9_]{2,40})"\s*,\s*"arguments"\s*:/g)) push(m[1]);

  if (!conocidas || !conocidas.length) return { llamadas: crudos, inventadas: [] };
  const set = new Set(conocidas.map(norm));
  return {
    llamadas: crudos.filter((n) => set.has(n)),
    inventadas: crudos.filter((n) => !set.has(n)),
  };
}
