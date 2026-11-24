# ÍNDICE ÚNICO DE DOCUMENTACIÓN — CerebroNico IDE

> **v1.0.10 · la regla de la casa (pedido de Mario, 09/11/2026):** un documento = un archivo,
> sin versiones conviviendo. Los textos de versiones viejas NO se acumulan en la raíz: se
> consolidan aquí y su historia vive en `documentacion/_archivo-consolidado/` y
> `documentacion/historico-actualizaciones/`. El manifiesto de hashes es UN solo archivo
> rolling: `MANIFIESTO_SHA256.txt` (la versión viaja dentro de su cabecera).

## Dónde está cada cosa

### Raíz — documentos VIVOS (el motor o las pruebas los nombran)
| Archivo | Qué es |
|---|---|
| `README.md` | Puerta de entrada: qué es la IDE y cómo arranca. |
| `LEEME-PRIMERO.txt` | Instrucciones de arranque para humanos (Windows). |
| `CHANGELOG.md` | **El** changelog maestro (uno solo; los viejos por versión fueron absorbidos, v1.69.0). |
| `memoria.md` | Memoria del IDE que el propio motor lee y escribe. |
| `cerebro.md` · `cerebro_backend.md` · `cerebro_frontend.md` | Semillas de conocimiento del cerebro (nombradas por `src/engine/hemisferios.ts` y `advancedFeatures.ts`). |
| `perfeccion.md` · `autovalido.md` | Política de perfeccionamiento y autovalido del motor. |
| `RUTAS-DEL-SISTEMA.md` | Verdad de rutas del sistema (el resumen breve vive en `src/engine/rutasSistema.ts`, que es el que ve el modelo). |
| `SUPERFICIE_RUTAS.md` | Superficie HTTP generada (orden de trabajo del trinquete; generado por `scripts/superficie.mjs`). |
| `SKILLS.md` · `ACTIVAR-SKILLS-OAUTH.md` | Catálogo de skills y su activación OAuth. |
| `CLAUSULAS-DE-ADJUNTO.md` | Cláusulas del adjunto (política de envíos). |
| `CORRECCIONES.md` | Registro de correcciones maestro (uno solo, v1.69.0). |
| `HOJA_DE_RUTA_PERFECCION.md` · `HOJA_DE_RUTA_EVOLUCION_v2.3.8.md` | Hojas de ruta activas (nombradas por el código y las pruebas). |
| **`HOJA_DE_RUTA_TRES_COSAS.md`** | **La hoja de ruta de la INTERFAZ, reducida a sus tres cosas (15/11): reconexión de puertos, pasos de la tarea y entregable final. Documento vivo; supersede el formato de chat de v2.0.1.** |
| **`EVOLUCION-PERFECCION-Y-AUTOMEJORA.md`** | **El plan maestro de evolución/perfección/automejora (v1.0.10): requisitos salidos de la sesión exportada + estado + política de automejora.** |
| `SUPERFICIE_UI.md` | Inventario GENERADO de la interfaz (botones × endpoints × duplicados). Regenerar: `node scripts/superficie-ui.mjs`. |
| `MANIFIESTO-UNICO.md` | Cómo funciona el manifiesto consolidado y dónde está la historia. |
| `COMODIDAD-Y-LIMPIEZA-v1.0.2.md` · `MANIFIESTO-LIMPIEZA.md` | Informes de limpieza vigentes (los pide `tests/puertosCableados.test.ts`). |
| `LEEME-EMPAQUETADO.md` · `GUIA-INSTALADOR-EXE-Y-APK.md` | Receta de empaquetado y guías de instalador. |
| `EXPORT-CONTEXTO.md` | Volcado de contexto regenerado por `scripts/exportar-contexto.mjs` (estado, no autoría). |

### `documentacion/` — la biblioteca
`INDICE_MAESTRO.md` (índice histórico interno), especificación master, arquitectura,
informes maestros, `audits/` (incluye `analisis-sesion-requisitos.md`: los requisitos
extraídos de la sesión exportada 1794120824912 — el insumo de v1.0.10), `plan-maestro/`,
`ide/`, y dos archivos de depósito:
- `historico-actualizaciones/` — documentos de versiones pasadas ya sin referencias (movidos 09/11).
- `_archivo-consolidado/` — papeleo absorbido en fusiones (v1.69.0) y `MANIFIESTOS-HISTORICOS/` (los 45 manifiestos por versión, archivados 09/11; no viajan en el paquete).

### `docs/` — manuales de operación puntuales
Mapa entidad-suite, manual de empaquetado/particionado y sesiones de trabajo fechadas.

### `manual-motor/` — el manual del motor para el modelo
Formatos de llamada (native/json/texto-libre) que el turno inyecta según proveedor.

## Reglas para que ésto no vuelva a llenarse
1. **Nunca** crear `X-v<versión>.md`: actualizar `X.md`; la historia la guarda el CHANGELOG.
2. El manifiesto se regenera (`npm run manifiesto`) y se llama siempre `MANIFIESTO_SHA256.txt`.
3. Documento nacido para una sola versión → nace en `documentacion/historico-actualizaciones/`.
4. `scripts/unificar-papeleo.mjs` es el precedente de consolidación: si dudás, fusionar y archivar, no acumular.
