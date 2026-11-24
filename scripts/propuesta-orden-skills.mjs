#!/usr/bin/env node
/**
 * scripts/propuesta-orden-skills.mjs — FASE 15: LA LISTA PARA DECIDIR DELANTE (v2.3.22)
 * ==================================================================================
 * El plano cierra FASE 15 así: «la herramienta de auditoría sirve, el catálogo se
 * arregla con ella, **el orden se decide con él delante**». Esta script produce ese
 * «delante»: agrupa las skills rotas **por arreglo**, no por skill, porque decidir 78
 * rutas de a una no lo hace nadie.
 *
 * NO TOCA NADA. Escribe un markdown en `documentacion/` y sale. Si en el futuro
 * someone lo convierte en «y de paso renombra», deja de ser un borrador y pasa a ser
 * el cambio silencioso que la FASE 11 viene cazando desde el primer día.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditarRaiz, textoDelActa } from "./auditar-skills.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ACCIONES = {
  nombre_distinto:
    "Alinear carpeta y `name:`. Es mecánico y toca rutas: una reasignación masiva es UNA decisión tuya, no mía. Elegir criterio: ¿manda el frente (renombrar 78 carpetas) o manda la ruta (reescribir 78 frentes)?",
  "nombre_distinto+nombre_invalido":
    "Igual, y además el frente usa mayúsculas o espacios: hay que normalizarlo a `minúsculas-con-guiones` antes de alinear. Dos decisiones en una, conviene hacerlas juntas.",
  "nombre_invalido+nombre_distinto":
    "El mismo par de arriba, listado por otro orden de detección.",
  sin_frontmatter:
    "Escribir el frente (`name` + `description`). Son las peores para el índice: sin metadata, nadie las enruta y existen sólo si el usuario las nombra a mano.",
  sin_descripcion:
    "Añadir `description`: es lo que lee el modelo para decidir si cargar la skill. Sin descripción, la skill está muerta en vida.",
  "sin_descripcion+nombre_distinto":
    "Describir y alinear el nombre en la misma pasada.",
  cuerpo_corto:
    "O se le escribe cuerpo, o se la borra. Una skill de dos líneas no le enseña nada a nadie y ocupa un renglón del índice.",
};

const a = auditarRaiz(path.join(RAIZ, "skills"));
const grupos = {};
for (const r of a.rotas) {
  const clave = r.fallos.join("+");
  (grupos[clave] = grupos[clave] || []).push(r);
}
const orden = Object.keys(grupos).sort((x, y) => grupos[y].length - grupos[x].length);

const L = [];
L.push("# Borrador de orden del catálogo de skills — FASE 15 (PARA REVISAR, NADA APLICADO)");
L.push("");
L.push("## 0 · Lectura de 30 segundos");
L.push("");
L.push(
  `**${a.total} skills · ${a.sanas.length} sanas · ${a.rotas.length} rotas.** Con \`capa:\` ${a.conCapa}, con \`cuando_no_usar:\` ${a.conCuandoNoUsar}.`,
);
L.push("");
L.push(
  "Agrupado **por arreglo**, no por skill: decidir 78 rutas de a una no lo hace nadie, y esta es la lista que el plano pide tener delante antes de tocar nada. Nada de lo que sigue fue aplicado.",
);
L.push("");
L.push("## 1 · Los grupos");
L.push("");
for (const k of orden) {
  const listado = grupos[k];
  L.push(`### \`${k}\` — ${listado.length} skills`);
  L.push("");
  L.push(`**Qué hay que decidir:** ${ACCIONES[k] || "ver el acta por skill; la causa está nombrada línea por línea."}`);
  L.push("");
  const muestra = listado.slice(0, 10);
  for (const r of muestra) {
    const dicho = r.nombre && r.nombre !== r.nombreCarpeta ? ` — el frente dice \`${r.nombre}\`` : "";
    L.push(`- \`${r.nombreCarpeta}\`${dicho}`);
  }
  if (listado.length > muestra.length) L.push(`- … y ${listado.length - muestra.length} más (listado completo: \`npm run skills:auditar -- --json\`)`);
  L.push("");
}
L.push("## 2 · Lo que este borrador NO propone");
L.push("");
L.push("- **Borrar ni fusionar nada.** Las 15 `cn-*` con frente YAML ilegible ya se repararon en la causa (generador comillado, FASE 15/v2.3.18) y eso sí está aplicado y vallado.");
L.push("- **Renombrar en caliente.** Rearmar 78 rutas sin que veas la lista es el cambio silencioso que este repo persigue desde la FASE 11.");
L.push("- **Tocar el catálogo de tu PC.** Este conteo es de `app/skills`, el que viaja en el paquete. El tuyo se mide con `npm run skills:auditar:pc` y sale con el mismo formato.");
L.push("");
L.push("## 3 · Cómo se ejecuta la decisión, cuando la tome");
L.push("");
L.push("1. Elegís criterio (¿manda el frente o manda la carpeta?) y si las `cuerpo_corto` se escriben o se retiran.");
L.push("2. Lo aplico sobre la lista de arriba, en un solo asiento de versión, con `auditar-skills` corriendo antes y después y los números en el CHANGELOG.");
L.push("3. Si algún nombre se usa en otro lado del repo, lo busca la valla de conexiones: renombrar sin ajustar al que llama es cómo una skill reparada deja de estar viva.");
L.push("");
const destino = path.join(RAIZ, "documentacion", "PROPUESTA-ORDEN-SKILLS.md");
writeFileSync(destino, L.join("\n") + "\n");
process.stdout.write("propuesta escrita en documentacion/PROPUESTA-ORDEN-SKILLS.md · " + L.length + " líneas\n");
process.stdout.write(textoDelActa(a).split("\n").slice(0, 4).join("\n") + "\n");
