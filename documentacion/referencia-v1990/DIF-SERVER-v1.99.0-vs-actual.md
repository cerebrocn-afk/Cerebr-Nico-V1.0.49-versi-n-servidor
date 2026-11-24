DIF ENTRE EL `server.ts` DE LA v1.99.0 Y EL DE HOY (v2.2.5)
================================================================

Origen: `CN-cruce-de-datos.zip` aportado por Mario el 03/11. Trae el `server.ts`
de la **v1.99.0** (SHA del paquete completo: 8ed40261f7f55a615cb7f75292f2766f2366f9b9c44d0ca2682036a5e5f00dcf,
ver `MANIFIESTO-CHECKSUMS-v1.99.0.txt`), es decir el servidor de la versión que él
recuerda andando antes de la serie 2.1.x.

El diff completo son 17 líneas. La ÚNICA con comportamiento es el middleware de
plazo que entró en v2.1.5. No hay otro cambio en el monolito entre «funcionaba» y
«se quedó mudo».

```
71a72
> import { plazoApi } from "./server/middleware/plazoApi"; // v2.1.7 · FALTA ESTA LÍNEA en 2.1.6: `plazoApi()` se llamaba sin importar (ReferenceError en el arranq
488a490
> import { resolverOllama } from "./src/engine/direccionOllama";
566c568,578
< const OLLAMA_DEFAULT = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
---
> // v2.2.2 · OLLAMA_HOST es una direccion de ESCUCHA (el .bat la pone en
> // 0.0.0.0:11434 para que Ollama acepte red). Copiarla tal cual al client era
> // llamar a un destino inalcanzable: /api/ollama/models devolvia lista vacia
> // con HTTP 200, el embedder no media, y el chat local no arrancaba. Se
> // interpreta (ver src/engine/direccionOllama.ts) y el arreglo se avisa en el
> // arranque, porque un entorno roto tiene que decirlo una vez y en voz alta.
> const __ollama = resolverOllama(process.env);
> const OLLAMA_DEFAULT = __ollama.base;
> for (const __oa of __ollama.avisos) {
>   console.log(`[CerebroNico] ⚠ dirección de Ollama corregida (desde ${__ollama.origen}): ${__oa}`);
> }
6552a6565,6567
>   // v2.1.5 · el plazo de toda ruta /api vive en su módulo (el monolito no engorda).
>   app.use("/api", plazoApi());
> 
```

Lectura:
1. `import { plazoApi }` y `app.use("/api", plazoApi())` — el reloj de 20 s sobre
   las 191 rutas. Es la causa del «el mensaje no sale» (modelo frío: 28 s medidos)
   y colabora con los paneles congelados (`/api/telemetry/ports` sondea 35 s).
2. El bloque de `resolverOllama` es de v2.2.2 (trampa latente: `OLLAMA_HOST` es una
   dirección de ESCUCHA). Estaba también en la 1.99.0 en su forma cruda, o sea que
   NO es la regresión de la serie 2.1.x: es un defecto latente que solo muerde si
   la variable llega al entorno del server.
3. Lo demás son comentarios.

En el mismo zip venían, además, `rutasSistema.ts`, `RUTAS-DEL-SISTEMA.md`,
`scripts/empaquetar.mjs` y tres vallas. `tests/espejosServidorCableado.test.ts`
está IDÉNTICO a hoy (0 líneas distintas); el que más se desvió es
`scripts/empaquetar.mjs` (568 líneas distintas).
