// preload.cjs — EL PUENTE MÍNIMO PARA MIRAR EL FOTOGRAMA (v1.0.8)
// ==================================================================
// POR QUÉ EXISTE. `electron-main.cjs` crea sus ventanas con `contextIsolation:
// true` y sin ningún preload, así que el renderer (la IDE) no tenía forma de pedir
// una captura de la escena del sandbox. Sin este puente, «no se pudo mirar» y
// «se miró y no se mueve» eran la misma pantalla: el defecto que v1.0.8 cierra.
//
// SUPERFICIE MÍNIMA, A PROPÓSITO. Se expone UNA sola función
// (`cerebronico.capturarEscena`) por `contextBridge`. NADA de módulos de disco,
// de lanzar procesos hijos (ni spawn ni fork), ni de navegación externa: un
// preload es código privilegiado y cada cosa que exponga es superficie de ataque.
// El renderer pide «capturame la escena en este scroll» y recibe un VEREDICTO
// (el criterio lo dicta el motor, no este archivo); los PNG nunca cruzan al
// renderer.
//
// Si la IDE corre con `npm run dev` (sin .EXE) no hay `ipcRenderer`: la función
// devuelve `{ ok:false, error }` con el motivo, en vez de romperse en silencio.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cerebronico", {
  /**
   * Pide al proceso principal que capture la escena del preview local en dos
   * posiciones de scroll y devuelva el veredicto de `fotogramas.ts`.
   * @param {{ base?: string, ruta?: string, scrollA?: number, scrollB?: number }} opciones
   * @returns {Promise<object>} veredicto + sha256 (sin imágenes)
   */
  capturarEscena: (opciones) => {
    if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
      return Promise.resolve({ ok: false, error: "no se pudo mirar: esta build no tiene puente IPC (¿corriendo con npm run dev sin Electron?)." });
    }
    return ipcRenderer.invoke("cn:capturar-escena", opciones || {});
  },
});
