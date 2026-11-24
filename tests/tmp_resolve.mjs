import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const p of ["../src/engine/hormaChat", "../src/engine/hormaChat.ts", "../src/engine/hormaChat.js"]) {
  try {
    console.log(p, "->", require.resolve(p));
  } catch (e) {
    console.log(p, "-> ERROR", e.code);
  }
}
const m = await import("../src/engine/hormaChat.ts");
console.log("HORMAS del import del test:", m.HORMAS.map((h) => `${h.paso}=${h.px}`).join(" "));
