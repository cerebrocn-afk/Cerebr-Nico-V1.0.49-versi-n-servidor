// lib-cableado.mjs — NÚCLEO del diagnóstico de CABLEADO (v1.54 · valla global v1.67.0).
// Lógica PURA y reutilizable (Node v16, sin deps, sin red). La usan:
//   - scripts/verificar-cableado.mjs     (informe humano / markdown)
//   - tests/cableadoFases.test.mjs       (regresión de las Fases F4–F10)
//   - tests/presupuestoHuerfanos.test.mjs(★ v1.67.0 · el trinquete global)
//
// ══════════════════════════════════════════════════════════════════════════
// POR QUÉ EXISTE LA VALLA GLOBAL (HOJA DE RUTA v1.67 · PRIORIDAD 0)
// ══════════════════════════════════════════════════════════════════════════
// Este archivo nació mirando 19 módulos de 275: los del mapa `FASES` de v1.54.
// Con esa mira de tunel el proyecto informó «11 HUÉRFANO» durante doce versiones
// mientras la plaga real llegaba a 27 (9,8 % del árbol). Un diagnóstico que no
// puede crecer no diagnostica: sólo decora.
//
// Desde v1.67.0 el universo se DESCUBRE (se caminan `src/` y `server/`) y `FASES`
// pasa a ser lo que siempre debió ser: una ETIQUETA, no la lista de la compra.
//
// Dos vocabularios conviven a propósito, porque responden preguntas distintas:
//   · `estado` (histórico, por módulo de Fase): ¿lo llama EL MONOLITO? Conserva
//     la enumeración de v1.54 para no romper `cableado-baseline.json`.
//   · `vida`   (nuevo, para TODO el árbol):     ¿es LLEGABLE desde un punto de
//     entrada? Ahí mide `PRESUPUESTO_HUERFANOS`.
// «Me importa alguien» no es «estoy vivo»: lo que corta la plaga es la cadena de
// alcance desde `server.ts` / `src/main.tsx`, no la arista suelta.

import fs from 'node:fs';
import path from 'node:path';

// ─── Qué es un punto de entrada ───────────────────────────────────────────
// Un módulo está VIVO si hay una cadena de `import` desde alguno de estos.
// `scripts/` cuenta: son el ritual de validación, no código muerto «por si
// acaso». `tests/` NO cuenta: un test que es lo único que llama a un módulo es
// exactamente la plaga de v1.66.0 (verde en verde, ausente en vivo).
const ENTRADAS = new Set([
  'server.ts',
  'src/main.tsx',
  'vite.config.ts',
  'electron-main.cjs',
]);
const EXT = ['.ts', '.tsx', '.mjs', '.cjs', '.js'];

// Carpetas que NO son el motor (vendor, complementos y archivo muerto de otras
// versiones). Mismas que excluye `escanear_huerfanos.py`: los dos instrumentos
// tienen que contar el MISMO árbol o sus números no son comparables.
const EXCLUIDAS = new Set([
  'node_modules', 'vendor', 'extensions', 'mejoras', 'runtime', 'skills',
  '__pycache__', 'documentacion', 'memoria_history', 'manual-motor',
  'parches', 'ejemplos', 'espejos_servidor', '.vigilante',
  '.cerebro-papelera',
]);

// ─── Mapa de FASES → módulos (ETIQUETA desde v1.67.0, no censo) ──────────
export const FASES = {
  'F4 · Evidencia': [
    'src/engine/evidenciaTurno',
    'src/engine/motorEvidencia',
    'src/engine/matrizVerificacion',
  ],
  'F5 · Recuperación': [
    'src/engine/motorRecuperacion',
    'src/engine/estadoRescate',
    'src/engine/presupuestoReparacion',
  ],
  'F6 · Grafo / Regresión': [
    'src/engine/grafoProyecto',
    'src/engine/grafoRico',
    'src/engine/guardianRegresion',
  ],
  'F7 · Navegador': [
    'src/engine/navegadorReal',
  ],
  'F8 · Visual': [
    'src/engine/regresionVisual',
    'src/engine/redimensionPantalla',
    'src/engine/pantallaCompleta',
  ],
  'F9 · Model Router': [
    'src/engine/enrutadorModelo',
    'src/engine/modelTiers',
    'src/utils/providerRouting',
  ],
  'F10 · Memoria 3.0': [
    'src/engine/memoriaArquitectura',
    'src/engine/memoriaResiliente',
    'src/engine/memoriaNegativa',
  ],
};

// Fase declarada por archivo, para etiquetar las filas descubiertas.
const FASE_DE = new Map();
for (const [fase, mods] of Object.entries(FASES)) {
  for (const m of mods) if (!FASE_DE.has(m)) FASE_DE.set(m, fase);
}

// ══════════════════════════════════════════════════════════════════════════
// ★ LA VALLA · ÍTEM 0.1
// ══════════════════════════════════════════════════════════════════════════
// Techo de módulos sin cadena de alcance desde un punto de entrada.
// Un huérfano NO es código inofensivo: es un defecto que el usuario sigue
// sufriendo mientras el arreglo está en el repo, escrito y en verde, y nadie lo
// nota porque el test pasa. Ver HOJA_DE_RUTA-HUERFANOS v1.67 (`continuidadTurno`
// existió SEIS versiones describiendo exactamente la queja del usuario).
//
// BAJAR este número es siempre correcto. SUBIRLO exige añadir una fila a
// `PERMITIDOS_HUERFANOS` con su motivo y su versión de destino — y esa lista,
// como el trinquete de `server_lineas`, sólo puede achicarse.
// 27 (v1.66.1) → 24 (v1.67.0): fuera `dobleArbol` (jubilado), dentro
// `plantillaDefecto` (cableado al gate B4) y `jsonParcial` (fundido en
// `parsearArgsConEstado`). Las 24 restantes están NOMBRADAS abajo, con motivo.
// 24 → 27 (v1.52.0): entran `contextoMedido`, `parchesSemilla` y `compositorChat`,
// los tres módulos de la evolución de contexto X50. Estaban escritos, en verde y sin
// consumidor: el censo los veía huérfanos y el presupuesto se pasaba de 24 a 27.
// Cada uno tiene fila con motivo y destino v1.53 — no es un aplazamiento cosmético,
// es que los tres tocan una decisión de arquitectura que no se toma cableando.
// 27 (v1.52.0) → 26 (v1.0.9): sale `contextoMedido` (ya cableado en
// `src/engine/contextoMedido` → su consumidor real) y la papelera
// `.cerebro-papelera/` deja de censarse (es basura archivada, no un módulo del
// motor). La lista sólo se achica: 27 → 26, una fila menos, una decisión menos.
// 26 → 32 (v1.0.20): el techo estaba POR DEBAJO del censo real y la valla
// «se cumplía» sin que ninguna fila cubriera a los huérfanos verdaderos (32
// huérfanos, 26 perdones: la comparación agrupaba y el bucle de filas buscaba
// por nombre corto, así que seis módulos quedaban sin nombrar). Las seis filas
// nuevas están abajo, con motivo y destino; el techo sube a 32 porque ninguna de
// las seis se cablea hoy sin una decisión que no es mía (ver cada motivo).
// Lo que NO se hizo: subir el número a ciegas. Cada fila nueva es una decisión
// tomada con nombre y versión, y la lista sigue sin poder crecer sin pasar por
// este mismo trámite.
export const PRESUPUESTO_HUERFANOS = 32;
// 24 → 25 (v1.99.7): entra `autoLlamado`, con fila, motivo y destino v1.99.8. El órgano está
// cableado a nadie a propósito: su salida es un turno nuevo que CONSUME crédito del usuario, así
// que el cable tiene que traer interruptor persistido (apagado por defecto) y encolado visible y
// cancelable. Criterio en verde antes del permiso, nunca al revés.
// 24 (v1.67.0) → 26 (v1.99.0): entran `hemisferios` y `cerebroSemilla`, los dos con
// fila, motivo y destino v1.99.1. No son aplazamientos cosméticos: el segundo no se
// puede cablear todavia porque necesita el estado vectorial POR ENTRADA del sidecar,
// y enchufarlo con un proxy global diria «cobertura 100 %» sobre un cerebro vacio —
// exactamente la mentira que viene a matar.

// Excepciones declaradas: cada fila es una DECISIÓN TOMADA, no un aplazamiento.
// `destino` es la versión en que deja de ser huérfano (cable, fusión o jubilación).
// Un módulo perdonado que deja de estar huérfano TAMBIÉN rompe el test: así la
// lista no se pudre de filas viejas.
export const PERMITIDOS_HUERFANOS = {
  // ── F5–F10: conflicto de autoridad. Dos implementaciones del mismo volante
  //    (una viva, otra muerta con su test en verde). Piden FUSIÓN o JUBILACIÓN,
  //    que son decisiones de diseño — no un cable. Patrón a copiar: `gateCierre`.
  'src/engine/motorRecuperacion': { motivo: 'F5. solapado con `sanacionDaemon` (vivo en server.ts). Decidir fusión o jubilación.', destino: 'v1.68' },
  'src/engine/presupuestoReparacion': { motivo: 'F5. unificaría los cupos a mano del ciclo (MAX_REEMPUJES/MAX_CONTINUIDAD/MAX_AUTORREVISION); toca el presupuesto de cierre, no es un cable.', destino: 'v1.68' },
  'src/engine/guardianRegresion': { motivo: 'F6. isla con `grafoRico`: se alimentan entre sí y a nadie.', destino: 'v1.68' },
  'src/engine/grafoRico': { motivo: 'F6. isla con `guardianRegresion`.', destino: 'v1.68' },
  'src/engine/navegadorReal': { motivo: 'F7. el puente PC ya existe por otro camino; verificar solape antes de duplicar.', destino: 'v1.68' },
  'src/engine/regresionVisual': { motivo: 'F8. su consumidor natural (`calidadProducto`) está muerto también.', destino: 'v1.68' },
  'src/engine/redimensionPantalla': { motivo: 'F8. mismo grupo que `regresionVisual`.', destino: 'v1.68' },
  'src/engine/enrutadorModelo': { motivo: 'F9. consume `modelTiers` (vivo, 29 refs) para clases de tarea: NO duplica el volante, pero cablearlo exige decidir DÓNDE se elige modelo por turno.', destino: 'v1.68' },
  'src/engine/memoriaArquitectura': { motivo: 'F10. libro de ADR sin consumidor: no hay quién escriba decisiones ni quién las consulte.', destino: 'v1.68' },
  'src/engine/memoriaNegativa': { motivo: 'F10. enganche real en el guard de repetición, pero necesita estado que sobreviva al turno (como `contextoBucle`).', destino: 'v1.68' },

  // ── Isla muerta de v1.53.8 (riesgo ALTO declarado en su propia ficha) ──
  'src/engine/ejecucionEspeculativa': { motivo: 'Especulativo REAL nunca verificado en dev; su ficha admite que el comportamiento no está probado. No se enchufa un lanzador paralelo al árbol sin probarlo.', destino: 'v1.68' },
  'src/engine/validadorAST': { motivo: 'Isla: lo importan solo `ejecucionEspeculativa` y su test.', destino: 'v1.68' },
  'src/engine/capaTransaccion': { motivo: 'Isla: clon/revierte del árbol, consumida solo por la especulación.', destino: 'v1.68' },

  // ── Decisiones de COMPORTAMIENTO del IDE (no líneas) ──
  'src/engine/busquedaWebNube': { motivo: 'Decisión de producto: cuándo el motor sale a la nube sin pedido explícito.', destino: 'v1.69' },
  'src/engine/disparadorChat': { motivo: 'Decisión de producto: qué dispara un turno sin que lo pida el usuario.', destino: 'v1.69' },
  'src/engine/concienciaArtista': { motivo: 'Decisión de producto: criterio estético activo en la entrega.', destino: 'v1.69' },
  'src/engine/puenteAdaptativo': { motivo: 'Decisión de producto: negociadora del puente IA CN.', destino: 'v1.69' },
  'src/engine/ejecucionReal': { motivo: 'Ejecución real del sandbox como capa propia; hoy el camino vivo es otro.', destino: 'v1.69' },
  'src/engine/rendimiento': { motivo: 'Citado POR STRING desde `src/App.tsx` sin importar: UI que muestra algo que ya no se calcula. Arreglar la UI o jubilar el módulo — no cablear a ciegas.', destino: 'v1.68' },
  'src/engine/calidadProducto': { motivo: 'Consumidor natural de F8; entra con el grupo visual.', destino: 'v1.68' },
  'src/engine/configEstructurada': { motivo: 'JSON estricto por proveedor (`response_format`/`responseMimeType`): 0 ocurrencias vivas en el repo. Engancha en los constructores de request, que son del monolito → trinquete.', destino: 'v1.69' },
  'src/engine/parcheRango': { motivo: 'Parche por rango de líneas: su consumidor (`edit_file`) vive en `server.ts`, por encima del contrato de `server_lineas`. Va con la extracción de las herramientas.', destino: 'v1.69' },
  'src/resumidorContexto': { motivo: '`compactor` (vivo) comprime SALIDA de herramienta; esto resume HISTÓRICO entre turnos. Fusionar exige tocar el presupuesto de contexto, no añadir una llamada.', destino: 'v1.69' },

  // ── El único que pide un CONTRATO DE UI (Prioridad 1.1) ──
  // No es perez: `depurarChatParaUsuario` saca del chat TODA la cerca de código.
  // Cablearlo sin destino para `artefactos` es ESCONDERLE al usuario código que
  // pidió ver. Necesita el evento SSE `{ artefacto: { tipo, contenido, file } }`
  // y su manejo en `src/App.tsx` (editor/terminal). Por eso es el último a propósito.
  'src/engine/disciplinaChat': { motivo: 'Requiere contrato de UI nuevo (SSE `artefacto` + destino editor/terminal). Sin destino real para los bloques, cablearlo = esconder código que el usuario pidió ver.', destino: 'v1.68' },

  // ── v1.99.7 · el autollamado: órgano listo, cable que toca el turno ──
  // No es aplazamiento cosmético: `decidirAutoLlamado` decide SI el motor se re-entra, pero el
  // re-entrarse significa **encolar un turno que gasta crédito del modelo pago**. Cablearlo exige
  // tres cosas que no existen todavía: el interruptor persistido del usuario (nace APAGADO), el
  // evento/consulta que le avise a la vista que hay un turno propio esperando, y el contador por
  // conversación. Poner la criterio sin esas tres sería que la IDE hable sola sin permiso.
  // El destino empezó en v1.99.8 y ese número se fue en la RAM sin cablearlo; se corrigió a v2.1.0
  // (el primer corte del arco 2.x). No es un retraso administrativo — el cable sigue atado a una
  // decisión del usuario (encender un lazo que gasta crédito), así que el destino real es «cuando
  // diga que lo prende».

  // ── v1.52.0 · los tres módulos de la evolución de contexto ──
  // Entraron con la evolución de contexto X50 y quedaron escritos, en verde y sin
  // consumidor. No se cablean a ciegas: cada uno toca una decisión que no es mía.
  'src/engine/parchesSemilla': { motivo: 'v1.52.0. Aplica parches con id único sobre la semilla del motor. La semilla ya se compone en `knowledgeBase.ts` con `SEMILLA_COMPLETA`; este módulo es la vía para parchearla EN CALIENTE sin recompilar, y eso necesita un punto de escritura que hoy no existe (el conocimiento se sirve, no se muta en runtime). Cablearlo antes de tener ese punto sería un segundo camino de escritura sobre la misma semilla.', destino: 'v1.53' },
  // ── v1.0.20 · los seis que la valla no nombraba (el censo sí los veía) ──
  // Cada uno está ESCRITO y EN VERDE, y ninguno se puede enchufar sin tocar una
  // decisión viva del turno. No es aplazamiento administrativo: es el mismo
  // criterio que las filas de arriba.
  'src/engine/arranquePuertos': { motivo: 'La regla de apertura de la ventana (decidirApertura). Su consumidor real es el .exe, que NO puede cargar .ts: hoy corre la copia `scripts/arranquePuertos.cjs` y esta fuente es la que la suite compara contra ella. Cablearla al Electron exige un paso de empaquetado (dist/engine/*.cjs) que hoy no existe para este módulo.', destino: 'v1.0.21' },
  'src/engine/brechaArranque': { motivo: 'El retrato de la brecha de arranque (quién subió, quién se cayó). `PlanificationPanel` ya describe su semántica en un comentario pero no lo llama: pintarlo exige decidir dónde vive ese retrato en la pantalla de arranque, que es la que decide el .exe.', destino: 'v1.0.21' },
  'src/engine/contextoDeclarado': { motivo: 'Topa el contexto al que declara el proveedor. `escaleraContexto` ya lee el MISMO campo (`contextoDeclarado`) por su cuenta: dos caminos para la misma cifra. Se resuelve fusionándolo en la escalera, no añadiendo una llamada.', destino: 'v1.0.21' },
  'src/engine/turnoLargo': { motivo: 'La vigilancia del turno de 20-30 min (silencio tolerado, aviso cada 5 min, muerto a los 20). Enchufarlo cambia CUÁNDO el motor da un turno por caído y, por tanto, qué se pierde: es la decisión de comportamiento exacta que produjo la queja del 15/11. Se cablea cuando Mario diga qué prefiere (¿aviso? ¿mantener? ¿cortar?), no antes.', destino: 'v1.0.21' },
  'src/engine/vozDeTareas': { motivo: 'La barra de tareas en español («escribió index.html (2 341 bytes)») pedida el 09/11. Está lista y probada, pero pintarla exige que la barra reciba la acción completa; hoy recibe sólo el id de la herramienta. El cable es de contrato de vista, no una llamada más.', destino: 'v1.0.21' },
  'src/utils/idPedidoProveedor': { motivo: 'Resuelve ids de pago y sus alias. Enchufarlo al constructor de peticiones exige el trinquete de `server_lineas` (el constructor vive en el monolito): se hace con la extracción de los constructores, igual que `configEstructurada`.', destino: 'v1.0.21' },
  'src/engine/compositorChat': { motivo: 'v1.52.0. Compone la respuesta del chat por piezas. Su consumidor natural es el ensamblado del mensaje en `server.ts`, que está por encima del contrato de `server_lineas`: cablearlo ahí exige la extracción de la capa de composición, no una llamada más. Mismo patrón que `parcheRango`.', destino: 'v1.53' },
};

function leer(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function listarTs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (EXCLUIDAS.has(e.name)) continue;
      listarTs(path.join(dir, e.name), acc);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

// Exports de VALOR (function/const/class/{...}) — ignora 'export type'/interface.
function exportsDeValor(src) {
  const out = new Set();
  const reDirecto = /export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = reDirecto.exec(src))) out.add(m[1]);
  const reLlaves = /export\s*\{([^}]*)\}/g;
  while ((m = reLlaves.exec(src))) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part || part.startsWith('type ')) continue;
      const alias = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(alias)) out.add(alias);
    }
  }
  return [...out];
}

function importaDe(src, modBase) {
  const nombre = modBase.split('/').pop();
  const re = new RegExp('from\\s+[\'"][^\'"]*/' + nombre + '[\'"]');
  return re.test(src);
}

// Símbolos realmente IMPORTADOS desde modBase en src (maneja import multilínea; sin braces anidadas).
function simbolosImportados(src, modBase) {
  const nombre = modBase.split('/').pop();
  const re = new RegExp('import\\s*(?:type\\s*)?\\{([^{}]*)\\}\\s*from\\s+[\'"][^\'"]*/' + nombre + '[\'"]', 'g');
  const out = new Set();
  let m;
  while ((m = re.exec(src))) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part || part.startsWith('type ')) continue;
      const alias = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(alias)) out.add(alias);
    }
  }
  return [...out];
}

function referenciasEnCuerpo(src, simbolo) {
  const re = new RegExp('\\b' + simbolo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
  let total = 0;
  for (const linea of src.split('\n')) {
    if (/^\s*import\b/.test(linea) || /^\s*}\s*from\s/.test(linea)) continue;
    const hits = linea.match(re);
    if (hits) total += hits.length;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────
// GRAFO REAL DE IMPORTS (v1.67.0) — el instrumento de la valla.
// A diferencia de `importaDe` (que empareja por nombre de archivo y por tanto
// sobre-reporta), ÉSTE resuelve el especificador relativo a una ruta concreta,
// igual que `escanear_huerfanos.py`. Ver `resolver()`.
// ─────────────────────────────────────────────────────────────────────────
const RE_IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^;'"()]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Todos los módulos del árbol (relativos, con extensión), excluyendo lo de siempre. */
function moduloDe(rutaAbs, RAIZ) {
  return path.relative(RAIZ, rutaAbs).split(path.sep).join('/');
}

/** `src/engine/x.ts` → `src/engine/x`: la forma en que el proyecto se importa a sí mismo. */
function sinExt(p) {
  return p.replace(/\.[mc]?[jt]sx?$/, '');
}

function esTest(p) { return p.startsWith('tests/'); }

/** Camina una carpeta aceptando TODAS las extensiones del grafo (mismo censo que el .py). */
function listarModulos(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUIDAS.has(e.name)) continue;
      listarModulos(full, acc);
    } else if (EXT.some((x) => e.name.endsWith(x))) {
      acc.push(full);
    }
  }
  return acc;
}

function esEntrada(p) {
  return ENTRADAS.has(p) || p.startsWith('scripts/');
}

/** Candidato a censo: código del motor (no test, no entrada, no declaración/config). */
function esCandidato(p) {
  if (!p.startsWith('src/') && !p.startsWith('server/')) return false;
  if (esEntrada(p)) return false;
  if (p.endsWith('.d.ts') || p.endsWith('.config.ts') || p.endsWith('.test.ts') || p.endsWith('.test.tsx')) return false;
  return true;
}

/** Construye { nodos, importadores } sobre todo el árbol. */
export function grafoDeImports(RAIZ) {
  const nodos = [];
  for (const carpeta of ['src', 'server', 'tests', 'scripts']) {
    const abs = path.join(RAIZ, carpeta);
    if (fs.existsSync(abs)) listarModulos(abs).forEach((f) => nodos.push(moduloDe(f, RAIZ)));
  }
  // Entradas sueltas en la raíz (server.ts, main.tsx…) y los .mjs/.cjs de scripts.
  for (const e of ENTRADAS) if (fs.existsSync(path.join(RAIZ, e))) nodos.push(e);

  const unicos = [...new Set(nodos)].sort();
  const conjunto = new Set(unicos);
  const contenido = new Map();
  for (const m of unicos) contenido.set(m, leer(path.join(RAIZ, m)) || '');

  const resolver = (desde, esp) => {
    if (!esp || !esp.startsWith('.')) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(desde), esp));
    for (const c of [...EXT.map((e) => base + e), ...EXT.map((e) => base + '/index' + e)]) {
      if (conjunto.has(c)) return c;
    }
    return null;
  };

  const importadores = new Map();
  const importa = new Map();
  for (const m of unicos) { importadores.set(m, new Set()); importa.set(m, new Set()); }

  for (const m of unicos) {
    const txt = contenido.get(m);
    RE_IMPORT.lastIndex = 0;
    let g;
    while ((g = RE_IMPORT.exec(txt))) {
      const esp = g[1] || g[2] || g[3] || g[4];
      const d = resolver(m, esp);
      if (d && d !== m) { importadores.get(d).add(m); importa.get(m).add(d); }
    }
  }
  return { nodos: unicos, conjunto, contenido, importadores, importa };
}

/**
 * Veredicto de VIDA para todo el árbol.
 *   VIVO       → cadena de `import` hasta un punto de entrada
 *   SOLO-TEST  → sólo lo importa su test      ← la plaga de v1.66.0
 *   HUÉRFANO   → nadie lo importa
 *   CLUSTER    → sólo lo importan otros muertos (rama muerta en bloque)
 */
export function descubrir(RAIZ) {
  const { nodos, contenido, importadores, importa } = grafoDeImports(RAIZ);
  const tests = new Set(nodos.filter(esTest));
  const entradas = new Set(nodos.filter(esEntrada));
  const candidatos = nodos.filter(esCandidato);

  // Ramas que SÍ arrancan desde una entrada: propagación hacia adelante.
  const alcanzados = new Set();
  const pila = [...entradas];
  while (pila.length) {
    const x = pila.pop();
    if (alcanzados.has(x)) continue;
    alcanzados.add(x);
    for (const d of importa.get(x) || []) if (!alcanzados.has(d)) pila.push(d);
  }

  const filas = [];
  for (const m of candidatos) {
    const imps = importadores.get(m) || new Set();
    const vivos = [...imps].filter((i) => alcanzados.has(i) && !esTest(i));
    let vida;
    if (vivos.length) vida = 'VIVO';
    else if (imps.size === 0) vida = 'HUÉRFANO';
    else if ([...imps].every((i) => esTest(i))) vida = 'SOLO-TEST';
    else vida = 'CLUSTER';

    // ÍTEM 0.2 — «cableado» ≠ «cableado que hace algo».
    // Un import NO es un uso: `evidenciaTurno` daba CABLEADO con refs=4 mientras
    // `setEvidencia()` llevaba meses definido y NUNCA llamado. Aquí se mide, por
    // export de VALOR, si alguien lo referencia FUERA de su propia línea de import.
    // Ojo con la extensión: los especificadores relativos del proyecto van SIN
    // `.ts`, así que se compara contra la base pelada. Pasarla con extensión hacía
    // que `simbolosImportados` no casara NUNCA y todo el árbol pareciera «sin uso»
    // (248 falsos positivos en la primera corrida de este ítem).
    const base = sinExt(m);
    const exps = exportsDeValor(contenido.get(m) || '');
    const llamadoEn = [];
    let refsReales = 0;
    for (const e of exps) {
      let n = 0;
      for (const i of imps) {
        const src = contenido.get(i);
        if (!src) continue;
        const c = simbolosImportados(src, base).includes(e) ? referenciasEnCuerpo(src, e) : 0;
        n += c;
      }
      if (n > 0) { refsReales += n; llamadoEn.push(e + '(' + n + ')'); }
    }

    filas.push({
      modBase: base,
      mod: path.posix.basename(base),
      ruta: m,
      fase: FASE_DE.get(base) || null,
      existe: true,
      vida,
      huerfano: vida !== 'VIVO',
      exportadores: exps.length,
      refsReales,
      llamadoEn,
      importadores: [...imps].sort(),
      probadoPor: [...imps].filter(esTest).sort(),
    });
  }

  const huerfanos = filas.filter((f) => f.huerfano);
  const resumen = {};
  for (const f of filas) resumen[f.vida] = (resumen[f.vida] || 0) + 1;
  return { filas, huerfanos, resumen, totalAnalizados: filas.length };
}

// ─── Clasificación histórica F4–F10 (contra el monolito) ────────────────
/** Analiza el cableado. Devuelve { filas, resumen } — `filas` cubre TODO el árbol. */
export function analizar(RAIZ) {
  const serverSrc = leer(path.join(RAIZ, 'server.ts'));
  if (serverSrc == null) throw new Error('NO se encontró server.ts en ' + RAIZ);
  const todosTs = listarTs(path.join(RAIZ, 'src'));
  const testsTs = listarTs(path.join(RAIZ, 'tests'));
  const { filas: descubiertas } = descubrir(RAIZ);
  const porRuta = new Map(descubiertas.map((f) => [f.modBase, f]));

  const filas = [];
  for (const [fase, modulos] of Object.entries(FASES)) {
    for (const modBase of modulos) {
      const abs = path.join(RAIZ, modBase + '.ts');
      const modSrc = leer(abs);
      const existe = modSrc != null;
      const exps = existe ? exportsDeValor(modSrc) : [];
      const importadoEnServer = importaDe(serverSrc, modBase);

      const impNombres = importadoEnServer ? simbolosImportados(serverSrc, modBase) : [];
      let refsServer = 0;
      const simbolosUsados = [];
      for (const e of impNombres) {
        const n = referenciasEnCuerpo(serverSrc, e);
        if (n > 0) { refsServer += n; simbolosUsados.push(e + '(' + n + ')'); }
      }

      const importadores = [];
      for (const f of todosTs) {
        if (path.resolve(f) === path.resolve(abs)) continue;
        const s = leer(f);
        if (s && importaDe(s, modBase)) importadores.push(path.relative(RAIZ, f).split(path.sep).join('/'));
      }

      const probadoPor = [];
      for (const f of testsTs) {
        const s = leer(f);
        if (s && importaDe(s, modBase)) probadoPor.push(path.relative(RAIZ, f).split(path.sep).join('/'));
      }

      let estado;
      if (!existe) estado = 'NO-EXISTE';
      else if (importadoEnServer && refsServer > 0) estado = 'CABLEADO';
      else if (importadoEnServer && refsServer === 0) estado = 'IMPORTADO-SIN-USO';
      else if (!importadoEnServer && importadores.length > 0) estado = 'INDIRECTO';
      else estado = 'HUÉRFANO';

      const d = porRuta.get(modBase);
      filas.push({
        fase, modBase, mod: modBase.split('/').pop(), existe, estado,
        importadoEnServer, refsServer, simbolosUsados, importadores, probadoPor, nExps: exps.length,
        // Complemento v1.67.0: el veredicto de alcance real del módulo completo.
        vida: d ? d.vida : null,
        refsReales: d ? d.refsReales : 0,
      });
    }
  }

  const resumen = {};
  for (const f of filas) resumen[f.estado] = (resumen[f.estado] || 0) + 1;
  return { filas, resumen };
}
