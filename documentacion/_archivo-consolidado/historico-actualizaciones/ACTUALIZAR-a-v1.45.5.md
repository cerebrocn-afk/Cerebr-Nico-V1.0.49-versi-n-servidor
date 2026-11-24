# Como actualizar a la version 1.45.5

**Que trae esta version:**
1. El GIF pesado (50 MB) convertido a un **GIF liviano de ~1,2 MB**.
2. **6 fondos tuyos** incluidos dentro de la app para cambiar el fondo desde el
   menu, sin internet.
3. El **icono del .exe** ahora es el **cerebro dentro de un hexagono**.

---

## 1) Copia de seguridad (siempre primero)
1. Cerra la aplicacion.
2. Copia tu carpeta actual y pegala al lado con otro nombre (por ejemplo
   `Cerebronico-RESPALDO`). Si algo no te gusta, volves a esa.

---

## 2) Como actualizar

### Opcion A - Carpeta completa (recomendado)
1. Descomprimi el ZIP nuevo (`Cerebronico-v1.45.5.zip`).
2. Usa esa carpeta como tu app.
3. La primera vez:
   ```
   npm install
   npm run dev
   ```
   (o tu atajo `iniciar_todo`).

### Opcion B - Actualizacion minima
Si ya tenes la version anterior andando y solo queres los fondos y el icono,
copia desde el ZIP nuevo:
- La carpeta **`public/fondos/`** entera (los 6 fondos).
- `src/utils/proSettings.ts` (agrega los fondos al menu).
- Los iconos: `build/icon.ico`, `icon.ico`, `icon.png`, `public/favicon.ico`,
  `public/icono-cerebronico.png`.

Y actualiza la version en `package.json` (`1.45.5`) y en `src/constants.ts`
(`VERSION_SEMVER = "1.45.5"`).

---

## 3) Donde elegir el fondo
Abri la app y anda a **Configuracion PRO -> Fondo**. Vas a ver los fondos
nuevos:
- Cerebro - hexagono
- Cerebro - anillo
- Cerebro - explosion
- Cerebro - datos
- Entrada de informacion
- Cerebro - entrada (animado)  <- este es el GIF liviano

Elegilo y se aplica al instante.

---

## 4) IMPORTANTE sobre el icono del .exe
El icono del cerebro-hexagono se **incrusta al generar el instalador**, no se
cambia en un .exe ya hecho. Para verlo en el ejecutable tenes que **volver a
empaquetar**:
```
npm run dist
```
(o el script de build que uses para generar el instalador). Dentro de la app
(ventana y pestana) el icono nuevo se ve en cuanto arrancas con `npm run dev`.

> Nota honesta: no pude compilar ni arrancar la app aqui (es un entorno Linux
> sin Windows/Electron), asi que conviene que lo pruebes en tu equipo.

---

## 5) Como revertir
- Opcion A: borra la carpeta 1.45.5 y volve a tu `...-RESPALDO`.
- Opcion B: restaura los archivos originales (`public/fondos/` no existia antes,
  podes borrarla; `proSettings.ts` y los iconos vuelven del respaldo) y deja la
  version en el numero anterior.
