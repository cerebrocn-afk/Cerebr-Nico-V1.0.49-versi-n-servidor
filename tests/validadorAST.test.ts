/**
 * validadorAST.test.ts — SUITE DEL VALIDADOR DE EDICIÓN POR PARCHE MULTI-ARCHIVO (PASO 5)
 * ======================================================================================
 * PASO 5 de la HOJA DE RUTA v1.54 (capacidad · BLOQUEADO por deps). Se ejecuta con
 * tsx (como el resto del motor). Verifica lo que SÍ es comprobable HOY: el FALLBACK
 * REGEX PROVISIONAL (balance de delimitadores con máquina de estados, extracción de
 * exports) y el ORQUESTADOR puro (clonar mundo, validar sintaxis por archivo y
 * cruzar invariantes entre archivos reutilizando importChecker como fuente única).
 * El analizador se marca `confiable:false` a propósito: sólo caza rotura GRUESA.
 *
 * El ANALIZADOR AST REAL (ts-morph/babel) exige red+node_modules: NO se corre aquí
 * y queda SIN VERIFICAR en dev. Se prueba, en cambio, que el contrato `AnalizadorAST`
 * es INYECTABLE (un analizador falso confiable se usa en lugar del fallback).
 *
 * Registrar en scripts/validar.mjs como:
 *   { id: "validadorAST", archivo: "tests/validadorAST.test.ts", que: "v1.53.9 · ..." }
 */
import assert from "node:assert";
import {
  esArchivoCodigo, balanceDelimitadores, extraerExports, nombresPorDefectoImport,
  resolverDestino, validarParcheMultiArchivo, analizadorRegexProvisional,
  aplicarParchesClon,
} from "../src/engine/validadorAST";
import type { AnalizadorAST, ResultadoArchivo } from "../src/engine/validadorAST";

let pasadas = 0;
function ok(cond: boolean, msg: string) { assert.ok(cond, msg); pasadas++; }
const J = (x: unknown) => JSON.stringify(x);
const mundoDe = (o: Record<string, string>) => new Map<string, string>(Object.entries(o));

// ── 1. balanceDelimitadores (máquina de estados) ──
ok(balanceDelimitadores("const a = foo(bar[0]);\n").length === 0, "código balanceado");
ok(balanceDelimitadores("const a = foo(bar;\n").length === 1, "paréntesis sin cerrar");
ok(balanceDelimitadores("const a = 1);\n").some((p) => /sin apertura/.test(p.mensaje)), "cierre sin apertura");
ok(balanceDelimitadores("const a = [1, 2};\n").some((p) => /no casa/.test(p.mensaje)), "delimitador que no casa");
ok(balanceDelimitadores('const s = "){]";\n').length === 0, "delimitadores en cadena NO cuentan");
ok(balanceDelimitadores("const a = 1; // ) no\n").length === 0, "comentario de línea NO cuenta");
ok(balanceDelimitadores("/* ) ] } */ const a = 1;\n").length === 0, "comentario de bloque NO cuenta");
ok(balanceDelimitadores("const s = `t } con ] llaves`;\n").length === 0, "texto de plantilla NO cuenta");
ok(balanceDelimitadores("const s = `v ${foo(}`;\n").length >= 1, "expresión de plantilla SÍ se analiza");
ok(balanceDelimitadores("const s = `v ${foo(bar)} fin`;\n").length === 0, "expresión de plantilla balanceada");
ok(balanceDelimitadores("const s = `abierta;\n").some((p) => /plantilla sin cerrar/.test(p.mensaje)), "plantilla sin cerrar");
ok(balanceDelimitadores("/* abierto a=1;\n").some((p) => /bloque sin cerrar/.test(p.mensaje)), "bloque sin cerrar");
ok(balanceDelimitadores('const s = "a\\"b (";\n').length === 0, "comilla escapada no cierra");
ok(balanceDelimitadores("const s = `a ${ { x: `b ${1}` } } z`;\n").length === 0, "plantillas anidadas");

// ── 2. extraerExports ──
ok(J(extraerExports("export const a=1; export function b(){} export class C {}").sort()) === J(["C", "a", "b"]), "exports de declaración");
ok(J(extraerExports("const x=1,y=2; export { x, y as z };").sort()) === J(["x", "z"]), "export { a as b } expone el alias");
ok(extraerExports("export default function f(){}").includes("default"), "export default");
ok(J(extraerExports("export type T=1; export interface I {} export enum E {}").sort()) === J(["E", "I", "T"]), "type/interface/enum");

// ── 3. nombresPorDefectoImport ──
ok(J(nombresPorDefectoImport('import Foo from "./x";', "./x")) === J(["Foo"]), "default simple");
ok(J(nombresPorDefectoImport('import Foo, { a, b } from "./x";', "./x")) === J(["Foo"]), "default + nombrados");
ok(J(nombresPorDefectoImport('import { a, b } from "./x";', "./x")) === J([]), "sólo nombrados: sin default");
ok(J(nombresPorDefectoImport('import * as NS from "./x";', "./x")) === J([]), "namespace no es default");

// ── 4. resolverDestino ──
{
  const ex = new Set(["src/engine/a.ts", "src/engine/dir/index.ts", "src/engine/b.tsx"]);
  ok(resolverDestino("src/engine/x.ts", "./a", ex) === "src/engine/a.ts", "resuelve con .ts");
  ok(resolverDestino("src/engine/x.ts", "./dir", ex) === "src/engine/dir/index.ts", "resuelve index");
  ok(resolverDestino("src/engine/sub/x.ts", "../a", ex) === "src/engine/a.ts", "sube con ..");
  ok(resolverDestino("src/engine/x.ts", "./noexiste", ex) === null, "no resuelve inexistente");
  ok(resolverDestino("src/engine/x.ts", "react", ex) === null, "specs de paquete se ignoran");
}

// ── 5. aplicarParchesClon (no muta el original) ──
{
  const mundo = mundoDe({ "a.ts": "A", "b.ts": "B" });
  const clon = aplicarParchesClon(mundo, [{ ruta: "a.ts", contenido: "A2" }, { ruta: "b.ts", contenido: null }, { ruta: "c.ts", contenido: "C" }]);
  ok(clon.get("a.ts") === "A2" && !clon.has("b.ts") && clon.get("c.ts") === "C", "edita/borra/crea en el clon");
  ok(mundo.get("a.ts") === "A" && mundo.has("b.ts") && !mundo.has("c.ts"), "NO muta el mundo original");
}

// ── 6. validarParcheMultiArchivo con el fallback regex ──
{
  const mundo = mundoDe({
    "src/engine/util.ts": "export function suma(a, b) { return a + b; }\n",
    "src/engine/main.ts": 'import { suma } from "./util";\nexport const r = suma(1, 2);\n',
  });
  const v1 = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/main.ts", contenido: 'import { suma } from "./util";\nexport const r = suma(3, 4);\n' }]);
  ok(v1.ok === true, "parche sano se acepta");
  ok(v1.confiable === false && v1.motor === "regex-provisional", "el fallback NO es confiable");

  const v2 = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/main.ts", contenido: 'import { suma } from "./util";\nexport const r = suma(3, 4;\n' }]);
  ok(v2.ok === false && v2.archivos.some((a) => !a.ok && /main\.ts$/.test(a.ruta)), "sintaxis rota se rechaza");

  const v3 = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/util.ts", contenido: null }]);
  ok(v3.ok === false && v3.cruces.some((c) => c.tipo === "import-a-borrado" && /main\.ts$/.test(c.archivo)), "borrar archivo importado se rechaza");

  const v4 = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/util.ts", contenido: "export function resta(a, b) { return a - b; }\n" }]);
  ok(v4.ok === false && v4.cruces.some((c) => c.tipo === "export-perdido"), "perder un export usado se rechaza");

  const mundo2 = mundoDe({
    "src/engine/mod.ts": "const x = 1; export default x;\n",
    "src/engine/app.ts": 'import Cualquiera from "./mod";\nexport const y = Cualquiera;\n',
  });
  const v5 = validarParcheMultiArchivo(mundo2, [{ ruta: "src/engine/app.ts", contenido: 'import OtroNombre from "./mod";\nexport const y = OtroNombre;\n' }]);
  ok(v5.ok === true, "import por defecto NO genera falso positivo de export perdido");
}

// ── 7. encogimiento anómalo (contrato que se desploma) ──
{
  const grande = "export const a = 1;\n" + "// relleno\n".repeat(50);
  const mundo = mundoDe({ "src/engine/g.ts": grande });
  const v = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/g.ts", contenido: "export const a = 1;\n" }]);
  ok(v.cruces.some((c) => c.tipo === "encogimiento-anormal"), "encogimiento >35% se marca");
  const v2 = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/g.ts", contenido: grande + "export const b = 2;\n" }]);
  ok(!v2.cruces.some((c) => c.tipo === "encogimiento-anormal"), "crecer NO se marca");
  const vNuevo = validarParcheMultiArchivo(new Map<string, string>(), [{ ruta: "src/engine/nuevo.ts", contenido: "export const a = 1;\n" }]);
  ok(!vNuevo.cruces.some((c) => c.tipo === "encogimiento-anormal"), "archivo nuevo no dispara encogimiento");
}

// ── 8. analizador AST inyectable (contrato) ──
{
  let visto = 0;
  const falso: AnalizadorAST = {
    nombre: "ts-morph", confiable: true,
    analizar: (ruta: string, _contenido: string): ResultadoArchivo => { visto++; return { ruta, ok: true, motor: "ts-morph", confiable: true, problemas: [] }; },
  };
  const mundo = mundoDe({ "src/engine/x.ts": "export const a = 1;\n" });
  const v = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/x.ts", contenido: "export const a = 2;\n" }], { analizador: falso });
  ok(visto === 1 && v.motor === "ts-morph" && v.confiable === true, "usa el analizador inyectado");
  ok(!/PROVISIONAL/.test(v.parte), "el parte no avisa de provisional cuando es confiable");
}

// ── 9. archivos no-código se ignoran ──
ok(esArchivoCodigo("a.ts") && esArchivoCodigo("a.TSX") && !esArchivoCodigo("a.json"), "clasifica por extensión");
{
  const mundo = mundoDe({ "datos.json": "{ roto" });
  const v = validarParcheMultiArchivo(mundo, [{ ruta: "datos.json", contenido: "{ sigue roto" }]);
  ok(v.ok === true && v.archivos.length === 0, "los .json no se validan como JS");
}

// ── 10. parte honesto ──
{
  const mundo = mundoDe({ "src/engine/x.ts": "export const a = 1;\n" });
  const v = validarParcheMultiArchivo(mundo, [{ ruta: "src/engine/x.ts", contenido: "export const a = 1;\n" }]);
  ok(/PROVISIONAL/.test(v.parte) && /SIN VERIFICAR/.test(v.parte), "el parte del fallback confiesa su límite");
}
ok(analizadorRegexProvisional.confiable === false, "el analizador por defecto se declara NO confiable");

console.log(`\u2705 validadorAST: ${pasadas} comprobaciones OK`);
