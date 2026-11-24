/**
 * puertoLibre.ts — v1.0.15 · QUÉ HACER SI EL PUERTO ESTÁ OCUPADO
 * ==============================================================
 * El sandbox sirve en :3500. Cuando ese puerto lo tiene tomado OTRA app del
 * usuario (no un resto nuestro), la guarda-zombie intentaba matarla; si no se
 * puede (sin permisos, o el usuario la quiere viva), el preview quedaba en
 * blanco sin decir por qué. Este módulo sondea puertos libres de verdad
 * (abriendo un listener efímero en 127.0.0.1) para ofrecer un alterno concreto.
 *
 * Puro respecto al dominio: sólo usa `node:net`. No mata nada ni decide política;
 * el llamador (server.ts /api/sandbox/start) decide qué hacer con el número.
 */
import net from "node:net";

/** ¿Se puede abrir un listener en `puerto`@`host`? true = libre. */
export function puertoEstaLibre(puerto: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => {
      try { s.close(); } catch { /* ya cerrado */ }
      resolve(false);
    });
    s.once("listening", () => {
      s.close(() => resolve(true));
    });
    try {
      s.listen(puerto, host);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Primer puerto libre desde `preferido` (inclusive) probando hasta `intentos`
 * consecutivos. Devuelve `null` si ninguno está libre en ese rango.
 */
export async function puertoLibre(preferido: number, intentos = 20, host = "127.0.0.1"): Promise<number | null> {
  const base = Math.max(1, Math.floor(preferido));
  for (let p = base; p < base + Math.max(1, intentos); p++) {
    if (p > 65535) break;
    if (await puertoEstaLibre(p, host)) return p;
  }
  return null;
}

/**
 * v1.0.15 · Cuerpo JSON del 409 cuando :puerto lo retiene OTRA app y no se pudo
 * liberar. Centraliza el mensaje accionable (pista con netstat/taskkill y, si hay
 * uno, el puerto alterno) para que el call site del sandbox quede en una línea.
 */
export function cuerpo409PuertoOcupado(puerto: number, alterno: number | null): {
  ok: false; error: string; puertoOcupado: number; puertoAlterno: number | null; pista: string;
} {
  const matar = `Windows: netstat -ano | findstr ":${puerto}"  →  taskkill /PID <pid> /F`;
  const pista = alterno
    ? `Cerrá la app que usa el ${puerto} (${matar}), o arrancá el sandbox en el puerto ${alterno} con la variable SANDBOX_PORT=${alterno}.`
    : `Cerrá la app que usa el ${puerto} (${matar}) y reintentá.`;
  return {
    ok: false,
    error: `El puerto ${puerto} del sandbox está ocupado por OTRA aplicación y no se pudo liberar.`,
    puertoOcupado: puerto,
    puertoAlterno: alterno,
    pista,
  };
}
