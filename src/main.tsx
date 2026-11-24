import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";
import { IDE_BRAND, LS_KEYS } from "./constants";
import { prepararServidor } from "./utils/clienteServidor";
import { aplicarPaleta, paletaActual } from "./engine/paleta"; // PALETA v1
import "./index.css";

// PALETA v1 — se tiñe ANTES del primer pintado. Si esto colgara del montaje de
// App (o del de la tarjeta de Aspecto, que además vive escondida en el Header),
// el arranque mostraría un parpadeo azul-noche antes de pasar a papel cuando el
// usuario eligió claro: exactamente la sensación de «no se guarda el tema».
aplicarPaleta(paletaActual());

// v2.1 — El título de la ventana se fija desde UNA sola fuente de verdad.
// Estaba escrito a mano en index.html ("CerebroNico V2.1") mientras la carpeta y
// los archivos decían "v2.0": dos versiones distintas a la vez, y ninguna era
// la real. Así el título no puede volver a desincronizarse.
document.title = `${IDE_BRAND.NAME} ${IDE_BRAND.VERSION}`;

const rootElement = document.getElementById("root");
async function iniciar() {
  if (!await prepararServidor(LS_KEYS)) return;
  if ((window as any).__CN_SERVER_MODE__) document.title += " · Servidor";
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <GlobalErrorBoundary>
        <App />
      </GlobalErrorBoundary>
    </React.StrictMode>
  );
}

}
void iniciar();
