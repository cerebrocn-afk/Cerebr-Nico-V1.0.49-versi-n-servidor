# Como actualizar a la version 1.45.4

**Que trae esta version:** Gemini (y en general los modelos de nube rapidos:
flash / lite / mini / turbo / haiku...) responde mas rapido porque ahora recibe
un "prompt de sistema" mucho mas corto. El modelo **conserva todas sus
herramientas** y la capacidad de agente; solo se le quita texto fijo que lo
hacia esperar antes de la primera palabra.

> Nota honesta: la IDE siempre lleva algo mas de contexto que la version
> "ligera" (porque es un agente completo, no un chat pelado). Esto la deja
> **muy cerca** en velocidad, pero puede no quedar identica.

---

## 1) Antes de nada: copia de seguridad

Antes de tocar nada, guarda una copia de tu carpeta actual por si queres
volver atras:

1. Cerra la aplicacion.
2. Copia la carpeta entera de tu version actual (por ejemplo
   `Cerebronico-v1.45.3`) y pegala al lado con otro nombre, por ejemplo
   `Cerebronico-v1.45.3-RESPALDO`.

Asi, si algo no te gusta, borras la nueva y renombras el respaldo. Listo.

---

## 2) Dos formas de actualizar

### Opcion A - Reemplazar la carpeta completa (lo recomendado)

Es lo mas simple y seguro:

1. Descomprimi el ZIP nuevo (`Cerebronico-v1.45.4.zip`).
2. Usa esa carpeta nueva como tu aplicacion.
3. La primera vez, abri una terminal dentro de la carpeta y ejecuta:
   ```
   npm install
   npm run dev
   ```
   (o tu atajo de siempre, `iniciar_todo`).

Tus datos del cerebro/memoria viven en la carpeta de datos de la app, no dentro
del codigo, asi que no se pierden al cambiar de carpeta.

### Opcion B - Actualizacion minima (solo 2 archivos de codigo)

Si preferis tocar lo menos posible y ya tenes la 1.45.3 funcionando, basta con
reemplazar **dos archivos** por los de la version nueva:

- `server.ts`
- `src/engine/modelTiers.ts`

Y, para que la app muestre el numero correcto, actualiza la version en:

- `package.json` -> `"version": "1.45.4"`
- `src/constants.ts` -> `const VERSION_SEMVER = "1.45.4";`

Despues volve a arrancar con `npm run dev`.

---

## 3) Como verificar que quedo aplicada

1. Abri la app: en el titulo/pie deberia figurar **V1.45.4**.
2. Elegi un modelo Gemini rapido (por ejemplo `gemini-3.6-flash`) y escribi un
   mensaje corto. La **primera palabra** deberia aparecer antes que en la 1.45.3.
3. Comproba que el agente sigue funcionando: pedile algo que use herramientas
   (por ejemplo leer o escribir un archivo). Debe seguir haciendolo igual.

---

## 4) Como revertir (volver a la 1.45.3)

- Si usaste la **Opcion A**: borra la carpeta 1.45.4 y volve a usar tu
  `...-RESPALDO` (renombralo de nuevo a su nombre normal).
- Si usaste la **Opcion B**: volve a poner los dos archivos originales
  (`server.ts` y `src/engine/modelTiers.ts`) desde tu respaldo y deja la version
  en `1.45.3` en `package.json` y `src/constants.ts`.

En ambos casos no se toca ni el cerebro ni la memoria, asi que no perdes nada.
