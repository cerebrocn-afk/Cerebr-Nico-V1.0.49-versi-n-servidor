/**
 * protocoloDirecciones.test.ts — v1.0.20
 * La tabla de direcciones no puede divergir de `PORTS`, y la auditoría tiene que
 * cazar una dirección de ESCUCHA colada como destino (el defecto de las 3 sesiones).
 */
import { PORTS } from "../src/constants";
import {
  PROTOCOLO, filaDePuerto, lineasProtocolo, bloqueProtocoloParaPrompt,
  auditarDirecciones, resumenProtocolo,
} from "../src/engine/protocoloDirecciones";

let ok = 0; const rojos: string[] = [];
function c(t: string, cond: boolean, d = "") { if (cond) { ok++; console.log("  PASS   " + t); } else { rojos.push(t + (d ? " :: " + d : "")); console.log("  FALLO  " + t + (d ? "  → " + d : "")); } }

const puertosPorts = Object.values(PORTS).sort((a, b) => a - b);
const puertosProto = PROTOCOLO.map((f) => f.puerto).sort((a, b) => a - b);

c("cada puerto de PORTS tiene fila en el protocolo", JSON.stringify(puertosPorts) === JSON.stringify(puertosProto), JSON.stringify(puertosProto));
c("no hay puertos inventados en la tabla", PROTOCOLO.every((f) => puertosPorts.includes(f.puerto)));
c("no hay puertos repetidos", new Set(PROTOCOLO.map((f) => f.puerto)).size === PROTOCOLO.length);
c("toda fila dice dueño, habla y nunca", PROTOCOLO.every((f) => f.dueno.length > 3 && f.habla.length > 3 && f.nunca.length > 3));
c("toda url es http://127.0.0.1:<su puerto>", PROTOCOLO.every((f) => f.url.startsWith(`http://127.0.0.1:${f.puerto}`)), PROTOCOLO.map((f) => f.url).join(","));
c("ninguna url de la tabla es una dirección de escucha", PROTOCOLO.every((f) => !/0\.0\.0\.0|\[::\]|:0\/\//.test(f.url)));
c("el sandbox NO comparte puerto con la IDE", filaDePuerto(PORTS.SANDBOX)?.puerto !== PORTS.IDE);
c("filaDePuerto devuelve la fila correcta", filaDePuerto(PORTS.OLLAMA)?.nombre === "Ollama");
c("filaDePuerto devuelve undefined en un puerto ajeno", filaDePuerto(9) === undefined);
c("lineasProtocolo(): una línea por puerto", lineasProtocolo().length === PROTOCOLO.length);
c("lineasProtocolo() nombra «Puertos»/los números reales", lineasProtocolo().some((l) => l.includes(`:${PORTS.SANDBOX}`)) && lineasProtocolo().some((l) => l.includes(`:${PORTS.IDE}`)));
c("el bloque del prompt abre con la consigna de no inventar", /no inventes otras/.test(bloqueProtocoloParaPrompt()));
c("el bloque del prompt dice que el proyecto se sirve en el sandbox", /sandbox/i.test(bloqueProtocoloParaPrompt()));
c("resumenProtocolo() cabe en una línea", !resumenProtocolo().includes("\n") && resumenProtocolo().includes(String(PORTS.IDE)));

// ── auditoría: el defecto que costó tres sesiones ────────────────────────────
const sano = auditarDirecciones({});
c("sin variables de entorno la auditoría está limpia", sano.length === 0, sano.join(" | "));
const escucha = auditarDirecciones({ OLLAMA_HOST: "0.0.0.0:11434" });
c("una dirección de ESCUCHA se reporta", escucha.length > 0, escucha.join(" | "));
const localhost = auditarDirecciones({ OLLAMA_HOST: "localhost:11434" });
c("«localhost» se reporta como riesgo de ::1", localhost.some((h) => /localhost|::1/.test(h)), localhost.join(" | "));
const sinPuerto = auditarDirecciones({ OLLAMA_URL: "http://127.0.0.1" });
c("una base sin puerto explícito se reporta", sinPuerto.some((h) => /puerto/.test(h)), sinPuerto.join(" | "));
const bueno = auditarDirecciones({ OLLAMA_URL: "http://127.0.0.1:11434" });
c("una base explícita y correcta no genera ruido", bueno.length === 0, bueno.join(" | "));

console.log(`\n${"─".repeat(56)}\nPROTOCOLO DE DIRECCIONES (v1.0.20): ${ok} correctas · ${rojos.length} fallos`);
if (rojos.length) { console.log("FALLOS:\n  · " + rojos.join("\n  · ")); process.exitCode = 1; }
