/**
 * tests/previewAntiCache.test.ts — npx tsx tests/previewAntiCache.test.ts
 * Prueba la matemática PURA del refresco anti-caché del preview (v1.60.14).
 */
import { urlConAntiCache } from "../src/utils/previewAntiCache";

let ok = 0;
let fail = 0;
function eq(nombre: string, got: unknown, esperado: unknown) {
  if (got === esperado) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fail++;
    console.error(`  ✗ ${nombre}\n      got: ${JSON.stringify(got)}\n      esp: ${JSON.stringify(esperado)}`);
  }
}

console.log("previewAntiCache — refresco duro del preview");

// 1) URL simple: añade ?cn_r
eq("simple", urlConAntiCache("http://127.0.0.1:3500", 1), "http://127.0.0.1:3500?cn_r=1");

// 2) URL con barra final
eq("barra final", urlConAntiCache("http://127.0.0.1:3500/", 7), "http://127.0.0.1:3500/?cn_r=7");

// 3) Ya traía query: usa & y la conserva
eq("query previa", urlConAntiCache("http://x/app?foo=1", 3), "http://x/app?foo=1&cn_r=3");

// 4) Idempotente: un cn_r viejo se REEMPLAZA, no se acumula
eq("idempotente", urlConAntiCache("http://x/app?cn_r=99", 5), "http://x/app?cn_r=5");
eq("idempotente+otros", urlConAntiCache("http://x/app?a=1&cn_r=99&b=2", 5), "http://x/app?a=1&b=2&cn_r=5");

// 5) Preserva el hash/ancla
eq("hash", urlConAntiCache("http://x/app#seccion", 2), "http://x/app?cn_r=2#seccion");
eq("query+hash", urlConAntiCache("http://x/app?a=1#s", 2), "http://x/app?a=1&cn_r=2#s");

// 6) Token distinto => URL distinta (clave del fallo de caché garantizado)
const u1 = urlConAntiCache("http://127.0.0.1:3500", 10);
const u2 = urlConAntiCache("http://127.0.0.1:3500", 11);
eq("tokens distintos dan URLs distintas", u1 !== u2, true);

// 7) URL vacía: no hay nada que refrescar
eq("vacía", urlConAntiCache("", 1), "");

// 8) Token string también sirve
eq("token string", urlConAntiCache("http://x/", "abc"), "http://x/?cn_r=abc");

console.log(`\nResultado: ${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
