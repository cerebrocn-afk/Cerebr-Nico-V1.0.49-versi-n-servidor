# Cómo actualizar a CerebróNico v1.45.3

Esta versión agrega un **sonido de ambiente** (misterio / investigación /
suspenso) que suena **en bucle indefinido** mientras trabajas, con un control
para encenderlo/apagarlo y bajarle el volumen.

## Qué verás
- Un botón flotante abajo a la izquierda: **Ambiente ON / OFF** y una barrita de
  volumen.
- Al pulsarlo, empieza a sonar y se repite solo, sin fin, hasta que lo apagues.
- La app recuerda si lo dejaste encendido y a qué volumen.

## Importante (no es un error)
Los navegadores y Electron NO dejan que un audio suene **antes** de que toques
la ventana. Por eso el sonido arranca cuando pulsas el botón (o, si lo dejaste
encendido, en tu primer clic/tecla al abrir la app). Es la regla del navegador,
no un fallo de la app.

---

## Antes de nada: copia de seguridad
Copia tu carpeta actual y renombra la copia a algo como `...-RESPALDO`. Así, si
no te gusta, vuelves a ella.

## Opción A (recomendada) — reemplazar la carpeta completa
1. Descomprime `Cerebronico-v1.45.3.zip`.
2. Usa esa carpeta como tu proyecto.
3. Dentro de la carpeta: `npm install` y luego `npm run dev` (o tu `iniciar_todo`).

## Opción B — actualización mínima (solo lo que cambió)
Copia del ZIP nuevo encima de tu carpeta actual:

- `src/components/AudioAmbiente.tsx`  (archivo nuevo)
- `src/App.tsx`
- `public/audio/misterio-loop.mp3`  (archivo nuevo — crea la carpeta `public/audio`)
- `package.json`
- `src/constants.ts`

Luego: `npm install` y `npm run dev`.

---

## Cómo cambiar el sonido por otro tuyo
¿Quieres otra pista? Solo reemplaza el archivo `public/audio/misterio-loop.mp3`
por tu propio MP3 con el MISMO nombre. No hay que tocar código.

## Cómo verificar
1. La versión en la app debe decir **V1.45.3**.
2. Abajo a la izquierda aparece el botón **Ambiente**. Púlsalo: debe sonar y
   repetirse solo.

## Cómo revertir
- Vuelve a tu carpeta `...-RESPALDO`, o
- Si usaste la Opción B: quita el montaje de `<AudioAmbiente />` de `src/App.tsx`
  y borra el componente y el MP3. Luego `npm run dev`.

---

## Nota honesta
No pude compilar ni arrancar en Windows desde mi entorno. El cambio es de bajo
riesgo y está aislado (un componente nuevo + un archivo de audio). Si al correr
`npm run dev` ves algún error, pásame el texto exacto y lo ajusto.
