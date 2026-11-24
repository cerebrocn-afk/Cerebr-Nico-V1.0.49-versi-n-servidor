# Integración de la Especificación Maestra v3.0

Se integró la *Especificación Técnica y Arquitectura del Sistema Autónomo
(v3.0)* dentro del proyecto, junto con una comparativa punto por punto contra
el código real del IDE v1.56.7.

## Qué se agregó (dentro de `documentacion/`)

- **`documentacion/CerebrONico_Master_Specification_v3.0.md`**
  La especificación maestra, tal cual, guardada ya dentro del proyecto.
- **`documentacion/COMPARATIVA_SPEC_MASTER_v3.0.md`**
  El informe que revisa si cada protocolo de la spec está bien adaptado en el
  código, con veredicto (✅ cumple · 🟡 adaptado · ⚠️ diverge) y el archivo real
  donde vive cada cosa.

## Resultado de la comparación (resumen)

- El **espíritu** de la spec está muy bien implementado (anti-alucinación,
  puertas deterministas, memoria viva, cascada local-nube).
- **Diferencias deliberadas** a tener en cuenta:
  1. Timeout de nube **120s** (la spec decía 15s) — subido por experiencia real.
  2. Firma **AST real** aún pendiente: hoy es un fallback regex honesto
     (`validadorAST.ts`).
  3. El «orquestador» real es **TypeScript**, no Python; el puerto **5000** es
     el **puente de PC**, no un sandbox FastAPI.
- El resto (fragmentación/diff, anti-escritura-fantasma, wiring, memoria,
  checklist de integridad) está cubierto, en varios casos de forma más fuerte
  que lo que pedía la spec.

El detalle completo está en `documentacion/COMPARATIVA_SPEC_MASTER_v3.0.md`.
