/**
 * modoArranque.ts — QUÉ HACER CUANDO VITE NO ESTÁ (v1.57.0 · extraído del monolito)
 * ==================================================================================
 * Nace del fallo del EXE medido en la máquina de Mario (2026-10-12): el paquete
 * lanzaba `dist/server.mjs` sin `NODE_ENV`, la rama de desarrollo pedía Vite
 * (devDependency que viaja fuera del paquete a propósito) y el server salía con
 * code=1 TENIENDO el cliente compilado al lado.
 *
 * La decisión completa vive acá —pura, sin fs, sin process— y `server.ts` solo
 * aporta los hechos medidos (¿existe el index.html hermano? ¿qué dice NODE_ENV?).
 * Así el monolito no acumula ni la prosa del fallback: el trinquete de líneas
 * (≤12190) se respeta con bisturí, no con podar comentarios ajenos.
 */

export interface HechosArranque {
  /** Ruta absoluta del `index.html` HERMANO del server (junto al server.mjs). */
  distHermano: string;
  /** Medido por el llamante con `fs.existsSync`: ¿hay cliente compilado al lado? */
  distHermanoExiste: boolean;
  /** Valor de `process.env.NODE_ENV` (posible undefined: se dice, no se disfraza). */
  nodeEnv?: string;
  /** `message` del error que lanzó `import("vite")` — viaja al aviso, no se pierde. */
  viteError?: string;
}

export interface VeredictoArranque {
  /** true → servir `dist/` en producción; false → no hay nada que servir, salir. */
  servirProduccion: boolean;
  /** Líneas para `console.warn` (decisión tomada con hecho). */
  avisos: string[];
  /** Líneas para `console.error` (rendición honesta antes del exit 1). */
  errores: string[];
}

/**
 * Sin Vite disponible, ¿servir el dist hermano o declararse muerto?
 *
 * La regla: un server que PUEDE servir y se muere miente sobre su propio estado;
 * un server que NO puede servir y sigue vivo anuncia un puerto que no responde
 * (el bug de v1.6.0). Las dos salidas son ruidosas; ninguna es silenciosa.
 */
export function veredictoArranqueSinVite(h: HechosArranque): VeredictoArranque {
  if (h.distHermanoExiste) {
    return {
      servirProduccion: true,
      avisos: [
        "[CerebroNico] Sin Vite disponible, pero existe el cliente compilado junto al server " +
        `(${h.distHermano}): sirviendo MODO PRODUCCIÓN. (NODE_ENV=${h.nodeEnv ?? "sin definir"})`,
      ],
      errores: [],
    };
  }
  return {
    servirProduccion: false,
    avisos: [],
    errores: [
      "[CerebroNico] No se pudo cargar Vite, que sirve la interfaz en modo DESARROLLO: " +
      (h.viteError || "sin detalle del error"),
      "[CerebroNico] Y tampoco hay dist/index.html junto al server para servir producción.",
      "[CerebroNico] Opcion A: npm install               (instala tambien las de desarrollo)",
      "[CerebroNico] Opcion B: npm run build && npm run start:isolated    (modo produccion, sirve dist/)",
    ],
  };
}
