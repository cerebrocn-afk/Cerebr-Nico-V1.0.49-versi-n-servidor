# Validación de la edición servidor 1.0.55

Base: fuente v1.0.49 modificado por Gemini. Repositorio de servidor independiente; no reemplaza la edición PC.

## Última ejecución completa, sin interrupciones

```text
VEREDICTO: TODO CORRECTO — 12844 comprobaciones, 0 fallos.
Tipos: 0 errores · 344 suites ejecutadas · 0 sin correr · 0 del catálogo ausentes.
```

La ejecución definitiva se hizo con Node 22 y dependencias instaladas en una carpeta nueva, sin enlaces compartidos. `npm ci --ignore-scripts`, compilación del SDK vendor, `tsc --noEmit`, `npm run validar:server` y `npm run build` terminaron con salida 0. La instalación sin scripts evita descargar Electron, que no se requiere para esta edición.

Se incluyen el registro completo y las salidas literales individuales de las 344 suites en `validacion-servidor/definitiva/`. Es evidencia local, no un veredicto de despliegue. Los registros no deben subirse a GitHub.

## Causas de los rojos corregidos

- Metadatos Electron e icono original ausentes: restaurados para conservar los contratos heredados; no se construyó ni entrega un EXE.
- Vallas de texto seguían leyendo funciones movidas fuera del monolito: se dirigen al módulo real y conservan las pruebas de comportamiento.
- Sondeos: se conserva la pausa de Gemini cuando la pestaña está oculta. El BAT conserva CRLF, protegido con `.gitattributes`.
- Catálogo de suites y lector de resultados: todas las suites declaradas; N/M y FAIL contabilizados sin convertir fallos sembrados por una prueba en fallos del proyecto.
- La pasada final-v2 tuvo 3 fallos de sinClaves por un `claves-externas.json` sintético residual de una prueba interrumpida en la copia de validación. No era una clave del usuario. La pasada definitiva comenzó con auditoría limpia y terminó sin ese residuo, sin rojos y sin suites pendientes.
- El lockfile conserva verificación de integridad; se corrigió la entrada de tapable cuyo hash no coincidía con el registro.

## Qué se comprobó y qué no

Las pruebas de servidor utilizan rutas simuladas, archivos temporales reales y credenciales ficticias: autenticación obligatoria y fail-closed, raíz explícita válida, workspace modelo/editor común, guardado JSON, aislamiento de la API key por petición y preview de lectura con ticket limitado. No se ejecutó aquí la IDE con herramientas de shell/archivos expuestas por HTTP.

El cliente y backend compilados están incluidos, junto al SDK vendor. La versión es 1.0.55 en package, lockfile, constantes y título de la interfaz. La auditoría anti-claves final debe estar limpia antes de empaquetar.

## Pendiente de tu veredicto en el alojamiento

- Construir/desplegar la receta Docker: no ejecutado aquí.
- Arranque protegido por HTTPS en tu dominio y rechazo de API sin login.
- Inferencia con el proveedor elegido, escritura real por el modelo y aparición en el editor.
- Guardado manual y preview HTTPS visual con recursos del proyecto.
- Continuidad del proyecto y chat al reiniciar con volumen durable real.

Crear `/datos` en una imagen no da persistencia. Mantener una sola instancia y un único usuario de confianza; esta edición no implementa aislamiento de procesos multiusuario. Ollama y su API key son opcionales. La suite local no acredita el despliegue público.
