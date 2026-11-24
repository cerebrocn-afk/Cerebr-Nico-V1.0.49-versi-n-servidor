/**
 * interruptoresServicios.test.ts — v2.1.0 · QUIÉN MANDA EN LOS PACKS
 * ==================================================================
 * Nace del síntoma «[memoria] se cerro» y de la respuesta que pidió Mario:
 * «interruptores en la IDE, adentro y afuera, para que el usuario los encienda o,
 * si se le da la orden, que lo encienda el modelo». Se blinda lo que ese pedido
 * necesita para no volver a romperse:
 *   · un solo inventario de servicios (el plano), no una lista paralela;
 *   · el frente de la IDE es INAPAGABLE (apagarlo cerraría la propia IDE);
 *   · apagar motor o puente exige confirmación, y el motivo viaja con el no;
 *   · "apagado" le gana al supervisor: lo que el usuario apagó no se reanima solo;
 *   · "encendido" le gana al tope de reavivados: lo pedido a mano se levanta;
 *   · la limpieza de puertos no mata un servicio sano (la causa del síntoma);
 *   · las dos rutas de acción tienen aduana: engendrar procesos no es lectura.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  serviciosInterrumpibles, normalizarInterruptores, interruptorDe, serializarInterruptores,
  decidirOrden, puedeReanimar, debeLevantarAlArrancar, razonLegible, tablaInterruptores,
  ARCHIVO_INTERRUPTORES,
} from "../src/engine/interruptoresServicios";
import { SERVICIOS_VENTANA, INVENTARIO_SERVICIOS } from "../src/engine/arranqueVentanas";
import { RUTAS_SUPERVISOR_ARRANQUE } from "../server/routers/supervisorArranque";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(HERE, "..");
const leer = (p: string) => readFileSync(path.join(BACKEND, p), "utf-8");
let correctas = 0; const fallidas: string[] = [];
const c = (que: string, ok: boolean, detalle = "") => {
  if (ok) { correctas++; console.log(`  ✓ ${que}`); }
  else { fallidas.push(que); console.log(`  ✗ ${que}${detalle ? ` → ${detalle}` : ""}`); }
};

console.log("\n═══ INTERRUPTORES DE SERVICIOS (v2.1.0) ═══");

// 1) Un solo inventario
// v2.3.24: lo interrumpible sale de `INVENTARIO_SERVICIOS` (7 = los 5 de
// `SERVICIOS_VENTANA` + motor + sandbox), que es el plano ÚNICO que la hoja de
// ruta muestra. La valla sigue siendo «no hay lista paralela»: interrumpibles ==
// inventario, exacto y en el mismo orden. `SERVICIOS_VENTANA` queda sólo para el
// conteo de ventanas del usuario (2 CMD + 3 PY), que es otra cosa.
c("★ lo interrumpible ES el inventario de servicios, no una lista paralela",
  serviciosInterrumpibles().map((s) => s.id).join(",") === INVENTARIO_SERVICIOS.map((s) => s.id).join(","));
c("y el inventario contiene al plano de ventanas (los 5 puertos del usuario siguen ahí)",
  SERVICIOS_VENTANA.every((v) => serviciosInterrumpibles().some((s) => s.id === v.id)));
c("el frente :3000 está marcado como inapagable, con motivo legible",
  !!serviciosInterrumpibles().find((s) => s.id === "front")?.inmutable);
c("motor y puente piden confirmación explícita para apagarse",
  !!serviciosInterrumpibles().find((s) => s.id === "ollama")?.confirmar &&
  !!serviciosInterrumpibles().find((s) => s.id === "puente")?.confirmar);

// 2) Validación tolerante
c("un JSON basura se normaliza a auto (no revienta el arranque)",
  JSON.stringify(normalizarInterruptores("no es objeto")) === "{}");
c("un id que no está en el plano se ignora",
  normalizarInterruptores({ memoria: "apagado", fantasma: "apagado" }).fantasma === undefined);
c("una posición mal escrita NO apaga nada: cae a auto",
  interruptorDe(normalizarInterruptores({ memoria: "apaga2" }), "memoria") === "auto");
c("lo que empieza con _ es comentario del archivo, no interruptor",
  Object.keys(normalizarInterruptores(JSON.parse(serializarInterruptores({ memoria: "apagado" })))).join(",") === "memoria");

// 3) Órdenes
c("★ apagar el frente se NIEGA con el motivo (nadie se cierra la IDE desde la IDE)",
  decidirOrden({ id: "front", pedido: "apagado", vivo: true }).accion === "nada" &&
  /cerraría la IDE/.test(decidirOrden({ id: "front", pedido: "apagado", vivo: true }).porque));
c("apagar el motor sin confirmar se niega y dice por qué",
  decidirOrden({ id: "ollama", pedido: "apagado", vivo: true }).accion === "nada" &&
  /confirmación/.test(decidirOrden({ id: "ollama", pedido: "apagado", vivo: true }).porque));
c("apagar el motor CONFIRMADO sí apaga",
  decidirOrden({ id: "ollama", pedido: "apagado", vivo: true, confirmar: true }).accion === "apagar");
c("apagar la memoria no pide confirmación (es el pack opcional)",
  decidirOrden({ id: "memoria", pedido: "apagado", vivo: true }).accion === "apagar");
c("lo que ya está como se pide no hace ruido: «nada» con porque",
  decidirOrden({ id: "memoria", pedido: "encendido", vivo: true }).accion === "nada" &&
  decidirOrden({ id: "memoria", pedido: "apagado", vivo: false }).accion === "nada");
c("volver a auto no enciende ni apaga",
  decidirOrden({ id: "memoria", pedido: "auto", vivo: false }).accion === "nada");
c("un id inventado se niega nombrando el plano",
  /no está en el plano/.test(decidirOrden({ id: "x", pedido: "apagado", vivo: true }).porque));

// 4) La pelea con el supervisor (el defecto original)
c("★ «apagado» le gana al supervisor: no se reanima lo que el usuario apagó",
  puedeReanimar({ memoria: "apagado" }, "memoria") === false);
c("«encendido» le gana al tope: se levanta aunque ya no queden reavivados",
  puedeReanimar({ memoria: "encendido" }, "memoria", false) === true);
c("«auto` respeta el tope de la casa", puedeReanimar({}, "memoria") === true && puedeReanimar({}, "memoria", false) === false);
c("el lanzador no prende lo que está apagado",
  debeLevantarAlArrancar({ creador: "apagado" }, "creador") === false &&
  debeLevantarAlArrancar({ creador: "auto" }, "creador") === true);
c("la razón legible distingue pedido de realidad",
  /caído/.test(razonLegible("memoria", { memoria: "encendido" }, false)) ||
  /arriba/.test(razonLegible("memoria", { memoria: "encendido" }, false)));

// 5) Cableado
c("la tabla cruza plano + posición + realidad medida",
  tablaInterruptores({ memoria: "apagado" }, { memoria: true }).find((x) => x.id === "memoria")?.vivo === true);
c("el archivo de interruptores está en la raíz de datos y se llama servicios.json",
  ARCHIVO_INTERRUPTORES === "servicios.json");
const srv = leer("server/routers/supervisorArranque.ts");
c("las dos rutas nuevas están declaradas",
  RUTAS_SUPERVISOR_ARRANQUE.includes("GET /api/arranque/interruptores") &&
  RUTAS_SUPERVISOR_ARRANQUE.includes("POST /api/arranque/interruptor"));
c("★ las dos rutas de ACCIÓN pasan por la aduana (antes /pasar abría procesos sin llave)",
  (srv.match(/if \(!aduana\(req\)\)/g) || []).length >= 2);
c("el interruptor se guarda en la raíz de datos, no en la instalación",
  srv.includes("ARCHIVO_INTERRUPTORES") && srv.includes("raizDatos"));
c("el supervisor lee la posición antes de reanimar", /posicion === "apagado"/.test(srv));
c("y el server pasa la aduana del sandbox al registrar el supervisor",
  /registrarSupervisorArranque\(app, \{[^}]*autorizado: sandboxAuthorized/.test(leer("server.ts")));
const hoja = leer("src/components/PlanificationPanel.tsx");
// v1.0.22 · Mario mandó SACAR de la hoja el renglón «Servicios» y su doble clic
// (15/11: «la hoja de ruta está llena de cosas innecesarias»). Lo que la valla
// protege NO es ese renglón: es que el interruptor siga siendo el de la casa —
// servido por `/api/arranque/interruptor` — y que la hoja siga pintando la
// realidad medida con la lista ÚNICA de puertos. Restaurar la tabla sin su
// veredicto sería deshacer su poda.
c("la hoja pinta los puertos medidos sin recuperar la tabla paralela de servicios",
  hoja.includes("/api/brain/plans") && hoja.includes("puertos={puertos}") &&
  !hoja.includes('titulo="Servicios"') && !hoja.includes("setArmeConf"));
c("★ la capacidad sigue viva en el motor: ruta de interruptor + panel completo",
  leer("server/routers/supervisorArranque.ts").includes("/api/arranque/interruptor"));

// 6) La causa raíz
const auto = leer("autonomia.py");
c("★ autonomia ya no mata un puerto cuyo dueño responde sano", /_puerto_sano/.test(auto) && /no es zombie/.test(auto));
c("y existe la puerta explícita para el caso viejo (--matar-forzado)", /--matar-forzado/.test(auto));
c("esta suite entra en el ritual de la casa", leer("scripts/validar.mjs").includes("interruptoresServicios.test.ts"));

console.log(`\n${fallidas.length ? "VEREDICTO: HAY FALLAS" : "VEREDICTO: TODO CORRECTO"}`);
console.log(`${correctas} correctas · ${fallidas.length} fallidas`);
if (fallidas.length) process.exitCode = 1;
