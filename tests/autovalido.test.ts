/**
 * tests/autovalido.test.ts — EL FISCAL DEL ÚLTIMO METRO (v1.49.0 · FASE 2)
 * ============================================================================
 * Se ejecuta con:  npx tsx tests/autovalido.test.ts
 *
 * autovalido.md: 6 casillas del §2 (siempre) + 5 del §8 (tarea pesada), el log
 * del §4, la cobertura honesta del §6.5 y la escalera a BLOQUEO del §5. Aquí se
 * prueba cada casilla por separado, el veredicto conjunto, la escalera que no
 * cede, el reinicio por turno y los artefactos que consumen el bucle y el panel.
 */
import {
  evaluarCriterios,
  evaluarEvidencia,
  evaluarFallos,
  evaluarHonestidad,
  evaluarPromesas,
  evaluarReversibilidad,
  evaluarIdea,
  evaluarCoherencia,
  evaluarContratos,
  evaluarEstadosLimite,
  evaluarSeguridad,
  evaluarCasillas,
  coberturaDe,
  componerLog,
  fiscalizar,
  reiniciarAutovalido,
  verContadores,
  coberturaAParte,
  actaBloqueoFiscal,
  contratoFiscalPrompt,
  UMBRAL_BLOQUEO_FISCAL,
  CASILLAS_BASE,
  CASILLAS_PESADA,
  CASILLA_MATRIZ,
  evaluarVerifMatriz,
  derivarEvidenciaPorCapa,
  parteMatrizPanel,
  AUTOVALIDO_KB_ENTRIES,
  type EntradaFiscal,
} from "../src/engine/autovalido";

let correctas = 0;
const fallos: string[] = [];
const comprobar = (que: string, condicion: unknown, detalle?: string) => {
  if (condicion) { correctas++; console.log(`  \u2713 ${que}`); }
  else { fallos.push(que + (detalle ? ` — ${detalle}` : "")); console.log(`  \u2717 ${que}${detalle ? ` — ${detalle}` : ""}`); }
};
const seccion = (t: string) => console.log(`\n${t}`);

// ── Constructores de las fuentes únicas (tipos erasados en runtime) ──────────
const contratoVacio = { abierto: false, pendientes: [], agotados: [], total: 0, verificacionTotal: 0 } as any;
const contratoVerde = { abierto: false, pendientes: [], agotados: [], total: 3, verificacionTotal: 3 } as any;
const contratoAbierto = {
  abierto: true,
  pendientes: [{ id: "t1", objetivo: "crear login", sinVerificar: ["compila", "el test pasa"] }],
  agotados: [],
  total: 2,
  verificacionTotal: 1,
} as any;
const contratoAgotado = { abierto: true, pendientes: [], agotados: ["t9"], total: 1, verificacionTotal: 0 } as any;

const evidVacio = { abierto: false, verificados: 0, total: 0, pendientes: [], fallidos: [] } as any;
const evidVerde = { abierto: false, verificados: 2, total: 2, pendientes: [], fallidos: [] } as any;
const evidPend = {
  abierto: true, verificados: 0, total: 1,
  pendientes: [{ id: "c1", afirmacion: "compila sin errores", estado: "SIN_VERIFICAR", comando: "tsc --noEmit" }],
  fallidos: [],
} as any;
const evidFallo = {
  abierto: true, verificados: 0, total: 1,
  pendientes: [{ id: "c2", afirmacion: "build ok", estado: "FALLO", comando: "npm run build" }],
  fallidos: ["c2"],
} as any;

const actaVacia = { leido: false, ejecutado: false, lectura: 0, ejecucion: 0, escritura: 0, conFallo: 0, herramientas: [] } as any;
const actaEjec = { leido: false, ejecutado: true, lectura: 0, ejecucion: 1, escritura: 0, conFallo: 0, herramientas: [] } as any;
const actaLeido = { leido: true, ejecutado: false, lectura: 1, ejecucion: 0, escritura: 0, conFallo: 0, herramientas: [] } as any;

const complOk = { ok: true, prometidoFalta: [], enlacesRotos: [], vacios: [], truncados: [], arranque: [] } as any;
const complMal = { ok: false, prometidoFalta: ["src/a.ts"], enlacesRotos: [], vacios: ["src/b.ts"], truncados: [], arranque: [] } as any;

// ═══ §2.1 CRITERIOS ═══
seccion("1. Casilla «criterios» (§2.1)");
{
  const sin = evaluarCriterios(contratoVacio);
  comprobar("sin criterios declarados → verde (cero regresi\u00f3n)", sin.estado === "verde");
  comprobar("sin criterios: directiva vac\u00eda", sin.directiva === "");
  comprobar("null contrato → verde", evaluarCriterios(null).estado === "verde");
  const verde = evaluarCriterios(contratoVerde);
  comprobar("3 criterios con evidencia → verde", verde.estado === "verde");
  comprobar("verde nombra el total", /3/.test(verde.motivo));
  const roja = evaluarCriterios(contratoAbierto);
  comprobar("contrato abierto → roja", roja.estado === "roja");
  comprobar("roja nombra el criterio sin verificar", /compila/.test(roja.motivo));
  comprobar("roja trae directiva de reparaci\u00f3n", /evidencia/i.test(roja.directiva));
  comprobar("token de casilla correcto", roja.casilla === "criterios");
  const agot = evaluarCriterios(contratoAgotado);
  comprobar("presupuesto agotado → roja", agot.estado === "roja");
  comprobar("roja nombra el agotado", /t9/.test(agot.motivo));
}

// ═══ §2.2 EVIDENCIA ═══
seccion("2. Casilla «evidencia» (§2.2)");
{
  const sin = evaluarEvidencia(evidVacio);
  comprobar("sin claims → sinProbar (no verde)", sin.estado === "sinProbar");
  comprobar("null evidencias → sinProbar", evaluarEvidencia(null).estado === "sinProbar");
  const verde = evaluarEvidencia(evidVerde);
  comprobar("2/2 VERIFICADOS → verde", verde.estado === "verde");
  comprobar("verde reporta la fracci\u00f3n", /2\/2/.test(verde.motivo));
  const pend = evaluarEvidencia(evidPend);
  comprobar("claim sin evidencia → roja", pend.estado === "roja");
  comprobar("roja cita el comando que falta", /tsc --noEmit/.test(pend.directiva));
  comprobar("roja nombra el id del claim", /c1/.test(pend.motivo));
  const fallo = evaluarEvidencia(evidFallo);
  comprobar("claim FALLIDO tiene prioridad → roja", fallo.estado === "roja");
  comprobar("roja de fallo nombra el id fallido", /c2/.test(fallo.motivo));
  comprobar("token de casilla correcto", pend.casilla === "evidencia");
}

// ═══ §2.3 FALLOS ═══
seccion("3. Casilla «fallos» (§2.3)");
{
  const verde = evaluarFallos(null);
  comprobar("sin fallo abierto → verde", verde.estado === "verde");
  const roja = evaluarFallos({ herramienta: "run_command", error: "exit 1: boom" });
  comprobar("fallo abierto → roja", roja.estado === "roja");
  comprobar("roja nombra la herramienta", /run_command/.test(roja.motivo));
  comprobar("roja nombra el error", /boom/.test(roja.motivo));
  const rep = evaluarFallos({ herramienta: "x", error: "e" }, 3);
  comprobar("firma repetida 3\u00d7 queda anotada", /3/.test(rep.motivo));
  comprobar("directiva ofrece reparar o declarar BLOQUEO", /BLOQUEO/.test(roja.directiva));
}

// ═══ §2.4 HONESTIDAD ═══
seccion("4. Casilla «honestidad» (§2.4)");
{
  comprobar("texto vac\u00edo → sinProbar", evaluarHonestidad("", actaVacia).estado === "sinProbar");
  comprobar("null texto → sinProbar", evaluarHonestidad(null).estado === "sinProbar");
  const en = evaluarHonestidad("The task is done and everything works fine now.", actaVacia);
  comprobar("prosa en ingl\u00e9s → roja (idioma)", en.estado === "roja");
  comprobar("roja de idioma lo dice", /espa\u00f1ol/i.test(en.motivo));
  const miente = evaluarHonestidad("Listo, ya funciona todo correctamente.", actaVacia);
  comprobar("afirma «funciona» con acta vac\u00eda → roja", miente.estado === "roja");
  comprobar("roja explica la falta de ejecuci\u00f3n/lectura", /ejecuci\u00f3n|lectura/i.test(miente.motivo));
  const conEjec = evaluarHonestidad("Listo, ya funciona.", actaEjec);
  comprobar("afirma «funciona» con ejecuci\u00f3n en acta → verde", conEjec.estado === "verde");
  const conLeido = evaluarHonestidad("Hecho, el archivo existe.", actaLeido);
  comprobar("afirma «hecho» con lectura en acta → verde", conLeido.estado === "verde");
  const neutro = evaluarHonestidad("Voy a revisar el c\u00f3digo del login paso a paso.", actaVacia);
  comprobar("prosa sin cierre y en espa\u00f1ol → verde", neutro.estado === "verde");
  comprobar("token de casilla correcto", miente.casilla === "honestidad");
}

// ═══ §2.5 PROMESAS ═══
seccion("5. Casilla «promesas» (§2.5)");
{
  comprobar("sin completitud → sinProbar", evaluarPromesas(null).estado === "sinProbar");
  const verde = evaluarPromesas(complOk);
  comprobar("completitud ok → verde", verde.estado === "verde");
  const roja = evaluarPromesas(complMal);
  comprobar("prometido sin disco → roja", roja.estado === "roja");
  comprobar("roja nombra lo prometido que falta", /src\/a\.ts/.test(roja.motivo));
  comprobar("roja nombra el 0 bytes", /src\/b\.ts/.test(roja.motivo));
  comprobar("directiva pide completar y reverificar", /verific/i.test(roja.directiva));
  comprobar("token de casilla correcto", roja.casilla === "promesas");
}

// ═══ §2.6 REVERSIBILIDAD ═══
seccion("6. Casilla «reversibilidad» (§2.6)");
{
  comprobar("nada irreversible → verde", evaluarReversibilidad(false).estado === "verde");
  comprobar("undefined → verde (cero regresi\u00f3n)", evaluarReversibilidad(undefined).estado === "verde");
  const roja = evaluarReversibilidad(true);
  comprobar("irreversible sin confirmar → roja", roja.estado === "roja");
  comprobar("directiva exige confirmaci\u00f3n humana", /confirm/i.test(roja.directiva));
}

// ═══ §8.7 IDEA ═══
seccion("7. Casilla «idea» (§8.7, tarea pesada)");
{
  comprobar("idea confirmada → verde", evaluarIdea(true).estado === "verde");
  comprobar("idea NO confirmada → roja", evaluarIdea(false).estado === "roja");
  comprobar("sin dato → sinProbar", evaluarIdea(null).estado === "sinProbar");
  comprobar("undefined → sinProbar", evaluarIdea(undefined).estado === "sinProbar");
  comprobar("roja pide reformular y confirmar", /reformul/i.test(evaluarIdea(false).directiva));
}

// ═══ §8.8 COHERENCIA ═══
seccion("8. Casilla «coherencia» (§8.8)");
{
  comprobar("sin auditar → sinProbar", evaluarCoherencia(null).estado === "sinProbar");
  comprobar("cadena vac\u00eda → sinProbar", evaluarCoherencia("").estado === "sinProbar");
  const roja = evaluarCoherencia("l\u00f3gica de red metida en el componente de UI");
  comprobar("incoherencia detectada → roja", roja.estado === "roja");
  comprobar("roja cita la incoherencia", /UI/.test(roja.motivo));
}

// ═══ §8.9 CONTRATOS ═══
seccion("9. Casilla «contratos» (§8.9)");
{
  comprobar("null → sinProbar", evaluarContratos(null).estado === "sinProbar");
  comprobar("no-array → sinProbar", evaluarContratos(undefined).estado === "sinProbar");
  comprobar("[] (auditado limpio) → verde", evaluarContratos([]).estado === "verde");
  const roja = evaluarContratos(["IUser.email", "api/get"]);
  comprobar("contratos rotos → roja", roja.estado === "roja");
  comprobar("roja nombra la interfaz rota", /IUser\.email/.test(roja.motivo));
}

// ═══ §8.10 ESTADOS LÍMITE ═══
seccion("10. Casilla «estados_limite» (§8.10)");
{
  comprobar("cubiertos → verde", evaluarEstadosLimite(true).estado === "verde");
  comprobar("solo camino feliz → roja", evaluarEstadosLimite(false).estado === "roja");
  comprobar("sin dato → sinProbar", evaluarEstadosLimite(null).estado === "sinProbar");
  comprobar("roja enumera estados a cubrir", /vac\u00edo|cargando|error/i.test(evaluarEstadosLimite(false).directiva));
}

// ═══ §8.11 SEGURIDAD ═══
seccion("11. Casilla «seguridad» (§8.11)");
{
  comprobar("sin auditar → sinProbar", evaluarSeguridad(null).estado === "sinProbar");
  comprobar("escaneo limpio → verde", evaluarSeguridad({ escaneoLimpio: true }).estado === "verde");
  comprobar("secretos incrustados → roja", evaluarSeguridad({ secretos: true }).estado === "roja");
  comprobar("endpoint sin control → roja", evaluarSeguridad({ endpointSinControl: true }).estado === "roja");
  comprobar("entradas sin validar → roja", evaluarSeguridad({ entradasSinValidar: true }).estado === "roja");
  const roja = evaluarSeguridad({ secretos: true, endpointSinControl: true });
  comprobar("roja lista todos los problemas", /secretos/.test(roja.motivo) && /endpoint/.test(roja.motivo));
  comprobar("se\u00f1ales incompletas → sinProbar", evaluarSeguridad({}).estado === "sinProbar");
}

// ═══ §2.7 VERIF-MATRIZ (SOFTWARE QA MATRIX cableada al fiscal) ═══
seccion("11b. Casilla «verifMatriz» (§2.7) — SOFTWARE QA MATRIX");
{
  const actaTsc = { herramientas: [ { clase: "ejecucion", comando: "tsc --noEmit", muestra: "ok", muestraFinal: "Found 0 errors." } ] } as any;
  const actaVacia = { herramientas: [] } as any;
  const actaSoloLectura = { herramientas: [ { clase: "lectura", comando: "", muestra: "readme" } ] } as any;

  comprobar("CASILLA_MATRIZ es verifMatriz", CASILLA_MATRIZ === "verifMatriz");
  comprobar("verifMatriz es casilla base", CASILLAS_BASE.includes(CASILLA_MATRIZ));
  comprobar("sin acta → sinProbar", evaluarVerifMatriz(null).estado === "sinProbar");
  comprobar("undefined → sinProbar (cero regresión)", evaluarVerifMatriz(undefined).estado === "sinProbar");
  comprobar("acta sin herramientas → sinProbar", evaluarVerifMatriz(actaVacia).estado === "sinProbar");
  comprobar("solo lectura (no ejecución) → sinProbar", evaluarVerifMatriz(actaSoloLectura).estado === "sinProbar");

  const evid = derivarEvidenciaPorCapa(actaTsc);
  comprobar("derivarEvidenciaPorCapa: tsc → capa tipos", typeof evid.tipos === "string" && evid.tipos.length > 0);
  comprobar("solo-lectura no deriva ninguna capa", Object.keys(derivarEvidenciaPorCapa(actaSoloLectura)).length === 0);

  const resTsc = evaluarVerifMatriz(actaTsc);
  comprobar("con una capa corrida ya NO es sinProbar", resTsc.estado !== "sinProbar");
  comprobar("faltan obligatorias → roja", resTsc.estado === "roja");
  comprobar("roja adjunta el dictamen tabular (matriz)", !!resTsc.matriz);
  comprobar("roja trae directiva de qué falta", resTsc.directiva.length > 0);
  comprobar("token de casilla correcto", resTsc.casilla === "verifMatriz");
  comprobar("perfil ausente → base (no explota)", evaluarVerifMatriz(actaTsc, null).casilla === "verifMatriz");

  // parteMatrizPanel: el formateo para el panel desde el dictamen del fiscal.
  const dictConMatriz = fiscalizar({ texto: "revisando", acta: actaTsc } as any);
  const parte = parteMatrizPanel(dictConMatriz);
  comprobar("parteMatrizPanel formatea cuando hay matriz", /SOFTWARE QA MATRIX/.test(parte));
  comprobar("parteMatrizPanel: null → cadena vacía", parteMatrizPanel(null) === "");
  comprobar("parteMatrizPanel: dictamen sin capas → vacío", parteMatrizPanel(fiscalizar({ texto: "x" } as any)) === "");
}

// ═══ evaluarCasillas: base vs pesada ═══
seccion("12. evaluarCasillas: §2 siempre, §8 solo en tarea pesada");
{
  const base = evaluarCasillas({ texto: "revisando" });
  comprobar("tarea normal → 7 casillas", base.length === 7);
  comprobar("las 7 son las del §2", base.every((c) => CASILLAS_BASE.includes(c.casilla)));
  const pesada = evaluarCasillas({ texto: "revisando", tareaPesada: true });
  comprobar("tarea pesada → 12 casillas", pesada.length === 12);
  comprobar("incluye las 5 del §8", CASILLAS_PESADA.every((k) => pesada.some((c) => c.casilla === k)));
  comprobar("CASILLAS_BASE tiene 7", CASILLAS_BASE.length === 7);
  comprobar("CASILLAS_PESADA tiene 5", CASILLAS_PESADA.length === 5);
}

// ═══ coberturaDe ═══
seccion("13. Cobertura honesta (§6.5)");
{
  const cas = evaluarCasillas({ texto: "revisando" });
  const cob = coberturaDe(cas);
  comprobar("total = 7", cob.total === 7);
  comprobar("suma de estados = total", cob.verde + cob.roja + cob.sinProbar === cob.total);
  const todoVerde = coberturaDe([
    { casilla: "criterios", estado: "verde", motivo: "", directiva: "" },
    { casilla: "fallos", estado: "verde", motivo: "", directiva: "" },
  ]);
  comprobar("2 verdes contadas", todoVerde.verde === 2 && todoVerde.roja === 0);
  const mix = coberturaDe([
    { casilla: "criterios", estado: "roja", motivo: "", directiva: "" },
    { casilla: "evidencia", estado: "sinProbar", motivo: "", directiva: "" },
  ]);
  comprobar("1 roja + 1 sinProbar", mix.roja === 1 && mix.sinProbar === 1);
  comprobar("no promedia: sinProbar ≠ verde", mix.verde === 0);
}

// ═══ componerLog (§4) ═══
seccion("14. Log del §4: una l\u00ednea por casilla roja");
{
  const log = componerLog([
    { casilla: "criterios", estado: "roja", motivo: "falta X", directiva: "hac\u00e9 Y" },
    { casilla: "fallos", estado: "roja", motivo: "boom", directiva: "repar\u00e1" },
  ]);
  comprobar("formato [AUTOVALIDO/RECHAZADO]", /\[AUTOVALIDO\/RECHAZADO\]/.test(log));
  comprobar("trae casilla=", /casilla=criterios/.test(log));
  comprobar("trae motivo=", /motivo=falta X/.test(log));
  comprobar("trae directiva=", /directiva=hac\u00e9 Y/.test(log));
  comprobar("una entrada por casilla roja", (log.match(/casilla=/g) || []).length === 2);
  comprobar("log vac\u00edo si no hay rojas", componerLog([]) === "");
}

// ═══ fiscalizar: veredicto conjunto ═══
seccion("15. fiscalizar: CONFIRMADO vs RECHAZADO");
{
  reiniciarAutovalido();
  const todoBien: EntradaFiscal = {
    texto: "Listo, ya funciona.", contrato: contratoVerde, evidencias: evidVerde,
    ultimoFallo: null, acta: actaEjec, completitud: complOk, irreversibleSinConfirmar: false,
  };
  const d1 = fiscalizar(todoBien);
  comprobar("todo verde → CONFIRMADO", d1.veredicto === "CONFIRMADO");
  comprobar("CONFIRMADO: sin rojas", d1.rojas.length === 0);
  comprobar("CONFIRMADO: log vac\u00edo", d1.log === "");
  comprobar("CONFIRMADO: no bloquea", d1.bloqueo === false);

  reiniciarAutovalido();
  const mal: EntradaFiscal = {
    texto: "Listo, ya funciona.", contrato: contratoAbierto, evidencias: evidFallo,
    ultimoFallo: { herramienta: "run_command", error: "exit 1" }, acta: actaVacia, completitud: complMal,
  };
  const d2 = fiscalizar(mal);
  comprobar("con rojas → RECHAZADO", d2.veredicto === "RECHAZADO");
  comprobar("RECHAZADO: al menos una roja", d2.rojas.length >= 1);
  comprobar("RECHAZADO: log no vac\u00edo", d2.log.length > 0);
  comprobar("log del dictamen trae el formato", /\[AUTOVALIDO\/RECHAZADO\]/.test(d2.log));
  comprobar("cobertura total refleja las casillas", d2.cobertura.total === d2.casillas.length);
}

// ═══ escalera a BLOQUEO (§5) ═══
seccion("16. Escalera: la misma casilla que no cede → BLOQUEO (§5)");
{
  reiniciarAutovalido();
  const insiste: EntradaFiscal = { texto: "", ultimoFallo: { herramienta: "build", error: "boom" } };
  const r1 = fiscalizar(insiste);
  comprobar("1er rechazo: no bloquea a\u00fan", r1.veredicto === "RECHAZADO" && !r1.bloqueo);
  comprobar("1er rechazo: contador en 1", r1.rechazosConsecutivos === 1);
  const r2 = fiscalizar(insiste);
  comprobar("2\u00ba rechazo: contador en 2", r2.rechazosConsecutivos === 2);
  comprobar("2\u00ba rechazo: a\u00fan sin bloqueo (umbral 3)", !r2.bloqueo);
  const r3 = fiscalizar(insiste);
  comprobar("3er rechazo: alcanza el umbral", r3.rechazosConsecutivos === UMBRAL_BLOQUEO_FISCAL);
  comprobar("3er rechazo: BLOQUEO", r3.bloqueo === true);
  comprobar("3er rechazo: casilla bloqueada = fallos", r3.casillaBloqueada === "fallos");
  comprobar("UMBRAL_BLOQUEO_FISCAL es 3", UMBRAL_BLOQUEO_FISCAL === 3);
}

seccion("17. Escalera: ceder una casilla resetea su contador");
{
  reiniciarAutovalido();
  const conFallo: EntradaFiscal = { texto: "", ultimoFallo: { herramienta: "b", error: "e" } };
  const sinFallo: EntradaFiscal = { texto: "" };
  fiscalizar(conFallo); fiscalizar(conFallo);
  comprobar("tras 2 rojas el contador de fallos es 2", verContadores().fallos === 2);
  fiscalizar(sinFallo);
  comprobar("al ponerse verde, el contador vuelve a 0", verContadores().fallos === 0);
  const vuelve = fiscalizar(conFallo);
  comprobar("vuelve a roja: cuenta desde 1, no desde 3", vuelve.rechazosConsecutivos === 1 && !vuelve.bloqueo);
}

seccion("18. reiniciarAutovalido: un turno, un fiscal");
{
  reiniciarAutovalido();
  const f: EntradaFiscal = { texto: "", ultimoFallo: { herramienta: "b", error: "e" } };
  fiscalizar(f); fiscalizar(f);
  comprobar("contador acumulado antes del reinicio", verContadores().fallos === 2);
  reiniciarAutovalido();
  comprobar("reinicio limpia los contadores", Object.keys(verContadores()).length === 0);
  const tras = fiscalizar(f);
  comprobar("tras reiniciar, la escalera empieza de 0", tras.rechazosConsecutivos === 1);
}

// ═══ artefactos para bucle y panel ═══
seccion("19. coberturaAParte y actaBloqueoFiscal");
{
  reiniciarAutovalido();
  const d = fiscalizar({ texto: "Listo, ya funciona.", contrato: contratoVerde, evidencias: evidVerde, acta: actaEjec, completitud: complOk });
  const parte = coberturaAParte(d);
  comprobar("el parte nombra el veredicto", /CONFIRMADO/.test(parte));
  comprobar("el parte cuenta verdes", /verde/.test(parte));
  comprobar("el parte cuenta sin probar", /sin probar/.test(parte));

  reiniciarAutovalido();
  const f: EntradaFiscal = { texto: "", ultimoFallo: { herramienta: "build", error: "boom boom" } };
  fiscalizar(f); fiscalizar(f);
  const bloq = fiscalizar(f);
  const acta = actaBloqueoFiscal(bloq);
  comprobar("acta de bloqueo dice BLOQUEADO", /BLOQUEADO/.test(acta));
  comprobar("acta nombra la casilla que no cede", /fallos/.test(acta));
  comprobar("acta pide decisi\u00f3n humana", /humano/i.test(acta));
  comprobar("acta incluye el log del dictamen", /\[AUTOVALIDO\/RECHAZADO\]/.test(acta));
}

// ═══ el contrato para el prompt ═══
seccion("20. contratoFiscalPrompt (ley inyectada en tarea pesada)");
{
  const p = contratoFiscalPrompt();
  comprobar("la ley menciona el \u00faltimo metro", /\u00faltimo metro/i.test(p));
  comprobar("menciona CONFIRMADO", /CONFIRMADO/.test(p));
  comprobar("recuerda que leer ≠ ejecutar", /leer/i.test(p) && /ejecutar/i.test(p));
  comprobar("recuerda que escribir no prueba", /escribir NO prueba/i.test(p));
  comprobar("menciona el BLOQUEO honesto", /BLOQUEO/.test(p));
  comprobar("no es vac\u00edo", p.length > 100);
}

// ═══ semillas de KB ═══
seccion("21. AUTOVALIDO_KB_ENTRIES (saber del fiscal en la base)");
{
  comprobar("hay 3 entradas", AUTOVALIDO_KB_ENTRIES.length === 3);
  comprobar("todas van a la tabla recetario-ui", AUTOVALIDO_KB_ENTRIES.every((e) => e.table === "recetario-ui"));
  comprobar("todas tienen id ba-fiscal-*", AUTOVALIDO_KB_ENTRIES.every((e) => /^ba-fiscal-/.test(e.id)));
  comprobar("ids \u00fanicos", new Set(AUTOVALIDO_KB_ENTRIES.map((e) => e.id)).size === 3);
  comprobar("todas en espa\u00f1ol", AUTOVALIDO_KB_ENTRIES.every((e) => e.lang === "es"));
  comprobar("todas con body no trivial", AUTOVALIDO_KB_ENTRIES.every((e) => e.body.length > 80));
  comprobar("todas con keys", AUTOVALIDO_KB_ENTRIES.every((e) => Array.isArray(e.keys) && e.keys.length > 0));
  comprobar("la de evidencia habla de leer vs ejecutar", AUTOVALIDO_KB_ENTRIES.some((e) => /leer/.test(e.body) && /ejecutar/.test(e.body)));
}

console.log("\n" + "\u2500".repeat(58));
if (fallos.length === 0) console.log(`\u2550\u2550\u2550 FISCAL DEL \u00daLTIMO METRO: ${correctas} correctas · 0 fallidas \u2550\u2550\u2550`);
else { console.log(`\u2550\u2550\u2550 FISCAL DEL \u00daLTIMO METRO: ${correctas} correctas · ${fallos.length} FALLIDAS \u2550\u2550\u2550`); fallos.forEach((f) => console.log("  \u2717 " + f)); process.exit(1); }





