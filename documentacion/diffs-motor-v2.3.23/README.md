# Diff del motor: árbol 1.0.x vs ZIP v2.3.23 — qué se trajo y qué se midió

Pedido: «4 diff» (punto 4 de la deuda declarada). Cada módulo tiene su parche en
`documentacion/diffs-motor-v2.3.23/<modulo>.patch` (unified diff, dirección
`arbol-1.0.x → zip-2.3.23`); la versión que estaba en tu árbol quedó guardada en
`respaldo-arbol/<modulo>.ts`; la lectura de símbolos exportados está en `_resumen.json`.

**Cómo se decidió (no a ojo):** línea base de 31 suites que miran esos módulos, copia de
hoja → núcleo, y **reversión individual si alguna valla se ponía roja**. Contar líneas o
hacer `grep` de símbolos no cuenta como prueba.

| módulo | líneas árbol | líneas ZIP | + | − | símbolos nuevos | suites que lo miran | resultado |
|---|---|---|---|---|---|---|---|
| `conciencia` | 368 | 607 | 533 | 294 | 6 | 10 | **APLICADO** |
| `manuals` | 263 | 531 | 426 | 158 | 1 | 6 | **APLICADO** |
| `motorContexto` | 1022 | 1180 | 890 | 732 | 7 | 6 | **APLICADO (re-medido)** |
| `kbMotor` | 470 | 477 | 441 | 434 | 0 | 1 | **APLICADO** |
| `knowledgeBase` | 423 | 505 | 352 | 270 | 6 | 4 | **APLICADO (re-medido)** |
| `parchesSemilla` | 299 | 376 | 305 | 228 | 6 | 2 | **APLICADO** |
| `dependenciasProyecto` | 282 | 356 | 244 | 170 | 5 | 2 | **APLICADO** |
| `importChecker` | 282 | 304 | 188 | 166 | 2 | 2 | **APLICADO** |
| `grafoProyecto` | 168 | 231 | 177 | 114 | 4 | 2 | **APLICADO** |
| `recetarioUI` | 150 | 194 | 150 | 106 | 0 | 0 | **APLICADO** |
| `kbArquitectura` | 205 | 226 | 202 | 181 | 0 | 1 | **APLICADO** |
| `kbCodigo` | 493 | 536 | 492 | 449 | 0 | 3 | **APLICADO** |
| `kbPoderX50` | 113 | 141 | 139 | 111 | 0 | 0 | **APLICADO** |

## Los dos que parecían fallar y no fallaban

`knowledgeBase.ts` y `motorContexto.ts` fueron revertidos en la primera pasada porque las
suites morían con `ERR_MODULE_NOT_FOUND`. Con el error en mano, el fallo era **de mi
entorno de pruebas, no del código**:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'js-yaml' imported from
  src/engine/perfiles/perfilParches.ts
```

`js-yaml` es dependencia declarada de tu `package.json` (línea 95) y el sandbox no tenía
`node_modules`. Con `js-yaml` disponible, las cuatro suites afectadas quedaron verdes
(**41·0, 96·0, 54·0, 22·0**) y los dos módulos quedaron aplicados: **13 de 13**.

## Rojos de la base que eran del entorno (y el que no)

| suite | antes | después | qué era |
|---|---|---|---|
| `permisos` | 31 · 2 rojos | **33 · 0** | falso rojo del entorno |
| `capasSkills` | crash de módulo | **25 · 0** | falso rojo del entorno |
| `perfilParches` | crash de módulo | **31 · 0** | faltaba `js-yaml` **y** `_f8f9.md` debía estar fuera (lo exige la propia valla) |
| `parchesSemilla` | 35 · 4 rojos | 38 · **1** | el parche nuevo arregla 3; el que queda (`atómico: la línea dice REVERTIDO`) **falla igual con la versión vieja**: es preexistente y queda declarado |
| `resiliencia` | 34 · 1 rojo | 34 · 1 rojo | preexistente, ajeno a esta pasada |

## Restaurar

```
cp documentacion/diffs-motor-v2.3.23/respaldo-arbol/<modulo>.ts src/engine/
patch -R -p1 < documentacion/diffs-motor-v2.3.23/<modulo>.patch
```
