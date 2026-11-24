# Cómo actualizar a CerebroNico V1.45.1

**Qué trae esta actualización:** arregla el error de comunicación con los
modelos Gemini (el cuadro rojo «Error de comunicación con
gemini-3.5-flash-lite»). Ya puedes volver a usar los modelos con normalidad.

No necesitas una clave API nueva: tu clave actual sigue siendo válida.

---

## Antes de empezar

- **Haz una copia de seguridad** de tu carpeta actual de CerebroNico (por si
  quieres volver atrás).
- Ten a mano el archivo **`Cerebronico-v1.45.1.zip`** que recibiste.
- Cierra la aplicación CerebroNico si la tienes abierta.

---

## Opción A — La más sencilla (recomendada): reemplazar la carpeta

Ideal si usas la app tal cual, sin compilarla tú.

1. Cierra CerebroNico por completo.
2. Descomprime `Cerebronico-v1.45.1.zip`. Obtendrás una carpeta llamada
   **`Cerebronico-v1.45.1`**.
3. Mueve o copia tus datos personales desde tu instalación anterior a la nueva
   carpeta, si los tienes fuera (por ejemplo, tu archivo de claves o tus
   proyectos). La configuración de las claves API se conserva normalmente al
   iniciar la nueva versión.
4. Abre la carpeta nueva y arranca la app como siempre (por ejemplo, con
   `iniciar_todo_windows.bat`).
5. Comprueba que arriba aparece **V1.45.1**.

> Ventaja: no te juegas nada de tu instalación vieja; la nueva queda aparte.

---

## Opción B — Actualización mínima (solo un archivo)

Si prefieres tocar lo menos posible y mantener tu carpeta actual:

1. Cierra CerebroNico.
2. Del ZIP nuevo, copia el archivo:
   `Cerebronico-v1.45.1/src/engine/herramientasNube.ts`
3. Pégalo en tu instalación actual, en la misma ruta
   (`src/engine/herramientasNube.ts`), **sobrescribiendo** el que ya tienes.
4. (Opcional, para que la app muestre el número nuevo) actualiza también:
   - `package.json` → cambia `"version": "1.45.0"` por `"version": "1.45.1"`.
   - `src/constants.ts` → cambia `VERSION_SEMVER = "1.45.0"` por `"1.45.1"`.
5. Vuelve a arrancar la app.

---

## Si compilas la app tú mismo (desarrolladores)

Desde la carpeta `Cerebronico-v1.45.1`:

```bash
npm install
npm run validar      # verificación / tests
```

En Windows puedes usar los scripts incluidos:

```
probar_todo_windows.bat     # pruebas
compilar_exe_windows.bat    # generar el ejecutable
```

---

## Cómo saber que quedó bien

1. Abre CerebroNico y confirma que en la parte superior dice **V1.45.1**.
2. En Config → Gemini, deja tu clave API como la tenías.
3. Selecciona un modelo Gemini (por ejemplo `gemini-3.5-flash-lite`) y envía un
   mensaje de prueba.
4. El modelo debe responder con normalidad, **sin** el cuadro rojo de «Error de
   comunicación».

---

## ¿Algo salió mal?

- **Sigue apareciendo el error rojo:** asegúrate de que realmente estás abriendo
  la carpeta/instalación nueva (que diga V1.45.1) y no la antigua.
- **Quiero volver atrás:** usa la copia de seguridad que hiciste al principio.
- **Dudas con las claves API:** no hace falta generar una nueva; tu clave de
  `aistudio.google.com/apikey` sigue sirviendo.
