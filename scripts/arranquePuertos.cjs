// scripts/arranquePuertos.cjs — LA REGLA DE APERTURA, EN JS PLANO (v2.3.25)
// El .exe de Electron NO carga TypeScript: la fuente única sigue siendo
// src/engine/arranqueVentanas.ts (inventarioConCriticos / decidirApertura) y este
// archivo es su copia ejecutable. La suite arranquePuertos.test.ts compara las dos
// para que no divergan.
const PUERTOS_CRITICOS = [3000, 5000, 5100, 5102, 5103];
const PLANO = [
  { id: "ide", puerto: 3000, rol: "La propia IDE" },
  { id: "sandbox", puerto: 3500, rol: "Sandbox / preview" },
  { id: "puente", puerto: 5000, rol: "Puente PC" },
  { id: "memoria", puerto: 5100, rol: "Memoria hibrida" },
  { id: "creador", puerto: 5102, rol: "Creador de sitios" },
  { id: "motor", puerto: 5103, rol: "Motor del cerebro" },
  { id: "ollama", puerto: 11434, rol: "Inferencia local" },
];
function inventarioConCriticos() {
  return PLANO.map((s) => ({ ...s, critico: PUERTOS_CRITICOS.indexOf(s.puerto) >= 0 }));
}
// Misma regla que src/engine/arranquePuertos.ts (la suite compara las dos).
function decidirApertura(opts) {
  const o = opts || {};
  // v1.0.20 · el «7» era el tamaño del plano de aquel entonces disfrazado de
  // regla: con una foto de 6 servicios decía «1 opcional fuera» que no existía.
  // El total es el de la foto; si no viene, se cuenta el inventario.
  const total = Number(o.total) || (o.inventory || []).length || (o.vivos || []).length;
  const arriba = new Set(o.vivos || []);
  const paciencia = Number(o.pacienciaMs) || 0;
  const t = Number(o.transcurridoMs) || 0;
  const caidos = PUERTOS_CRITICOS.filter((p) => !arriba.has(p));
  // Los nombres que faltan salen del inventario que traiga la foto (la lista de
  // PUERTOS_CRITICOS solo tiene números): la cabecera dice «falta ollama:11434»,
  // no «falta 11434».
  const nombre = (p) => {
    const f = (o.inventory || []).filter((x) => Number(x.puerto) === p)[0];
    return f && f.quien ? f.quien + ":" + p : String(p);
  };
  if (caidos.length === 0) {
    return {
      abrir: true,
      estado: "listo",
      faltan: [],
      motivo: "los " + (o.inventory && o.inventory.length
        ? o.inventory.filter((x) => x && x.critico).length
        : PUERTOS_CRITICOS.length) + " criticos arriba" +
        (arriba.size < total ? " (" + (total - arriba.size) + " opcional(es) fuera)" : ""),
    };
  }
  if (t >= paciencia) {
    return {
      abrir: true,
      estado: "parcial",
      faltan: caidos.slice(),
      motivo: "se acabo la paciencia (" + Math.round(paciencia / 1000) + " s): falta(n) " + caidos.map(nombre).join(", ") +
        " — se entra igual y el supervisor lo reintenta",
    };
  }
  return {
    abrir: false,
    estado: "esperando",
    faltan: caidos.slice(),
    motivo: "esperando (" + Math.round(t / 1000) + "/" + Math.round(paciencia / 1000) + " s): falta(n) " + caidos.map(nombre).join(", "),
  };
}
module.exports = { PUERTOS_CRITICOS, inventarioConCriticos, decidirApertura };
