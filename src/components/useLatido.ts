import { useEffect, useState } from "react";
import { latidoConocido, suscribirLatido, type Latido } from "../engine/latido";

/**
 * useLatido — el último latido MEDIDO del servidor del IDE (:3000).
 * =================================================================
 * Lo consume el Header (la frase «motor listo») y el panel de puertos (la
 * etiqueta del 3000). Antes los dos llevaban un literal fijo — «motor listo» y
 * «ACTIVO» — escritos a mano, de modo que afirmaban salud sin preguntar nunca.
 *
 * Arranca con lo que ya se sepa (`latidoConocido()`), que puede ser
 * `vivo: null` = «sin medir». Ese null es el punto del asunto: mientras nadie
 * haya leído un 200 de `/api/coreo`, la pantalla no tiene derecho a decir «ok».
 */
export function useLatido(): Latido {
  const [latido, setLatido] = useState<Latido>(() => latidoConocido());
  useEffect(() => {
    setLatido(latidoConocido());
    return suscribirLatido(setLatido);
  }, []);
  return latido;
}
