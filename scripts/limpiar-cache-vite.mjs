#!/usr/bin/env node
/**
 * limpiar-cache-vite.mjs — BLANCO v1 (el predev que corta la pantalla blanca)
 * ============================================================================
 * CUÁNDO duele: el proceso muere de golpe (apagón del PC, taskkill, apagado
 * forzado de Windows) MIENTRAS Vite optimizaba dependencias. En
 * node_modules/.vite quedan carpetas `deps_temp_*` a medias y un
 * `_metadata.json` que apunta a módulos que ya no existen. El navegador pide
 * /deps/*.js, recibe 404, ningún componente monta y la ventana se queda en
 * BLANCO sin decir palabra.
 *
 * QUÉ hace aquí: ANTES de arrancar el server de desarrollo, borra esos restos
 * temporales. El `deps/` activo NO se toca: si está corrupto, Vite lo nota por
 * su hash del package-lock y lo regenera solo.
 *
 * Por qué un script aparte y no líneas en server.ts: el contrato SUPERFICIE
 * (v1.10.0, Fase 2) prohíbe que server.ts crezca. La regla es partir, no
 * añadir. Este es un paso más de la cadena `predev`, a un lado del monolito.
 *
 * Regla de oro (misma que el postinstall): NUNCA aborta el arranque. Cualquier
 * error es un aviso y el código de salida es 0.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.on("uncaughtException", (e) => {
  console.log(`  \x1b[33m!\x1b[0m limpiar-cache-vite: ${(e && e.message) || e} (se continúa)`);
  process.exit(0);
});

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirCache = path.join(raiz, "node_modules", ".vite");
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`);

try {
  if (!fs.existsSync(dirCache)) {
    info("sin caché de Vite todavía (primer arranque: no hay nada que limpiar)");
  } else {
    let borrados = 0;
    for (const entrada of fs.readdirSync(dirCache)) {
      // deps_temp_* y deps_tmp_* son SEMÁFOROS de una optimización interrumpida.
      if (entrada.startsWith("deps_temp") || entrada.startsWith("deps_tmp")) {
        fs.rmSync(path.join(dirCache, entrada), { recursive: true, force: true });
        borrados++;
        console.log(`  \x1b[33m!\x1b[0m resto de optimización interrumpida borrado: node_modules/.vite/${entrada}`);
      }
    }
    if (borrados === 0) ok("caché de Vite sana (sin restos de cortes)");
    else ok(`limpieza hecha: ${borrados} resto(s) de cortes anteriores eliminados`);
  }
} catch (e) {
  console.log(`  \x1b[33m!\x1b[0m limpiar-cache-vite no pudo terminar: ${(e && e.message) || e} (se continúa)`);
}
process.exit(0);
