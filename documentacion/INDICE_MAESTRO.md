<!-- ESTADO v1.74.1 -->
# ESTADO v1.74.1 · 2026-10-26 — REVOLUCIÓN DE LA DOCUMENTACIÓN (un ejemplar actual por documento)

Pedido de Mario: «actualiza la carpeta documentacion, solo deja un ejemplar
actual de cada archivo con toda la información actualizada».

- **21 partes por versión absorbidos** dentro de sus maestros (patrón
  `unificar-papeleo.mjs`, marca `UNIFICADO-v1.74.1`): informes y análisis →
  `audits/AUDITS_MAESTRO.md`; hojas de ruta viejas (v1.54–v1.55) y cambios
  antiguos → `ROADMAP_MAESTRO.md`; credenciales → `ide/SEGURIDAD_CREDENCIALES.md`;
  recordatorios → `ide/MEMORANDUM_MAESTRO.md`; LEEME del quirófano →
  `LEEME_ENTREGA.txt`. Originales recuperables en
  `_archivo-consolidado/UNIFICADO-v1.74.1/` — nada borrado.
- **Copias muertas de memoria** (`MEMORY.md`, `memoria-patente.md`) archivadas:
  la memoria viva son `memoria.md` + `cerebro.md` (gobernanza) y, desde
  v1.74.0, `LECCIONES.md` (autoaprendizaje en tiempo real, en la raíz del
  proyecto).
- **Dónde vive la verdad hoy**: historia completa → `CHANGELOG.md` (maestro
  único, sin archivos por versión); superficie real → `contrato-rutas.json` /
  `SUPERFICIE_RUTAS.md`; integridad del paquete → `MANIFIESTO_SHA256_v<versión>.txt`
  (el vigente lo genera `npm run manifiesto`); arquitectura → 
  `ARQUITECTURA_CEREBRONICO_V8.md`; spec → `CerebrONico_Master_Specification_v3.0.md`.

---

# INDICE MAESTRO DE DOCUMENTACION — CerebroNico IDE

_Actualizado el 2026-10-05. Orden en la casa: la documentacion versionada quedo
unificada en archivos **_MAESTRO** por familia. Los originales se conservan,
intactos y reversibles, en `_archivo-consolidado/` (espejo de carpetas).
_

## Archivos MAESTRO (uno por familia)

| Maestro | Familia unificada | N.o docs |
|---|---|---|
| `INFORME_SANDBOX_MAESTRO.md` | Pruebas de sandbox (v1.6.24 → v1.13.0) | 11 |
| `MANIFIESTO_SHA256_MAESTRO.txt` | Manifiestos de entrega firmados (v1.6.32 → v1.15.0) | 12 |
| `INFORME_V8_MAESTRO.md` | Auditoria e informes de la linea V8 | 4 |
| `ROADMAP_MAESTRO.md` | Hojas de ruta y revisiones | 4 |
| `PLANES_MAESTRO.md` | Planes de capacidad v1 | 5 |
| `CONCIENCIA_MAESTRO.md` | Diseno + protocolo + resumen del organo | 3 |
| `historico-actualizaciones/HISTORICO_ACTUALIZACIONES_MAESTRO.md` | Notas ACTUALIZAR-a-vX | 6 |
| `ide/LEEME_CAMBIOS_MAESTRO.md` | Notas de cambios del IDE | 5 |
| `ide/MEMORANDUM_MAESTRO.md` | Memorandos del IDE | 2 |
| `audits/AUDITS_MAESTRO.md` | Auditorias de linaje | 4 |
| `plan-maestro/PLAN_MAESTRO_MAESTRO.md` | Plan maestro V2 PRO + anexos + tablero | 4 |

## Documentos sueltos (unicos, no versionados) que se conservan tal cual

- `2026-09-24 (1).md`
- `ANALISIS_BUNDLE_TOP_REPOS_v1.17.0.md`
- `ANALISIS_CUELLOS_INDEXADOR.md`
- `ARQUITECTURA_CEREBRONICO_V8.md`
- `BIBLIOGRAFIA_EVOLUCION_CEREBRONICO.md`
- `CerebroNico-RESUMEN-AGENTE-PC.md`
- `COMO-MONTAR-ingeniero-senior.md`
- `CREDENCIALES-y-papeleo.md`
- `DISENO_CONTENEDOR_GENERAL.md`
- `hoja-de-datos-errores-y-mejoras.md`
- `INFORME_IMPLEMENTACION_v1.16.4_BAJO_CONSUMO.md`
- `INFORME_QUIROFANO_v1.1_HD.md`
- `INFORME_VALIDACION_EDITOR-V2_v1.16.6.md`
- `INFORME_VEREDICTO_v1.6.31_vs_ARBOL-LIMPIO.md`
- `LEEME_ENTREGA.txt`
- `LEEME_QUIROFANO_v1.txt`
- `MEJORA_MODO_BAJO_CONSUMO_v1.md`
- `memoria-patente.md`
- `MEMORY.md`
- `PUENTE_LENGUAJE_Y_MEDICION.md`
- `SANDBOX_CONFIG_Y_ARRANQUE_v1.md`
- **audits/** (carpeta)
- **datos/** (carpeta)
- **historico-actualizaciones/** (carpeta)
- **ide/** (carpeta)
- **plan-maestro/** (carpeta)

## Nota de reversibilidad

Nada se borro. Cada original vive en `_archivo-consolidado/<subcarpeta>/`.
Para restaurar un documento basta con moverlo de vuelta a su carpeta.
