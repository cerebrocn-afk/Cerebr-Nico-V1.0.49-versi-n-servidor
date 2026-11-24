/**
 * capacidadesMotor.ts — EL INTERRUPTOR QUE LLEGA AL MOTOR (v1.80.0)
 * ===============================================================
 * QUÉ CIERRA (FASE 1 del plano, punto 1): hasta hoy la puerta del relevo era
 * `localStorage` leído a mano en App.tsx. Un interruptor que solo vive en el
 * navegador no es una capacidad: es una costumbre. Este módulo es el puente —
 * fuente única de las capacidades del MOTOR en el navegador:
 *
 *   · `refrescarCapacidades()` lee `GET /api/features` (la misma fuente que
 *     pinta el panel del laboratorio);
 *   · `fijarCapacidad(id, valor)` escribe con `POST /api/features/toggle` y
 *     actualiza la cache ANTES de resolver, así quien escucha se entera al
     instante de que el panel cambió algo;
 *   · `suscribirCapacidades(fn)` avisa a los consumidores (App: relevo y
 *     respuesta ecléctica) sin que ninguno tenga que votar ni re-renderizar.
 *
 * En el navegador no hay disco: si el motor no responde, la cache conserva lo
 * último conocido y `capacidadActiva` responde con el valor conocido más
 * honesto (nunca inventa un «sí»). El localStorage viejo (`cn_auto_relay`)
 * sigue siendo respetado como preferencia del usuario cuando el motor no dice
 * nada todavía — borrarla a golpes sería perderle la decisión a alguien.
 */
export type CapacidadId = "auto_relay" | "consejo_eclectico" | string;

interface EstadoCapacidades {
  activos: Record<string, boolean>;
  conocido: boolean;
  ultimoError: string;
}

const estado: EstadoCapacidades = { activos: {}, conocido: false, ultimoError: "" };
const suscriptores = new Set<(e: EstadoCapacidades) => void>();

const notificar = () => {
  for (const fn of suscriptores) {
    try {
      fn(estado);
    } catch {
      /* un suscriptor roto no puede apagar a los demás */
    }
  }
};

/** Preferencia vieja de navegador: se respeta, no se reemplaza en silencio. */
function herenciaLocal(id: CapacidadId): boolean | undefined {
  try {
    if (id === "auto_relay") {
      const bruto = typeof localStorage !== "undefined" ? localStorage.getItem("cn_auto_relay") : null;
      if (bruto === "1") return true;
      if (bruto === "0") return false;
    }
  } catch {
    /* sin localStorage (servidor, tests): no hay herencia */
  }
  return undefined;
}

export function capacidadActiva(id: CapacidadId): boolean {
  if (estado.conocido && Object.prototype.hasOwnProperty.call(estado.activos, id)) return estado.activos[id] === true;
  const vieja = herenciaLocal(id);
  return vieja === true;
}

/** La lista cruda, para paneles y diagnósticos. */
export function capacidadesConocidas(): Record<string, boolean> {
  return { ...estado.activos };
}

export function erroresDeCapacidades(): string {
  return estado.ultimoError;
}

export async function refrescarCapacidades(): Promise<Record<string, boolean>> {
  try {
    const r = await fetch("/api/features");
    const j: any = await r.json();
    if (!j?.ok || !Array.isArray(j.features)) throw new Error(j?.error || "respuesta inválida");
    const activos: Record<string, boolean> = {};
    for (const f of j.features) if (f && f.id) activos[String(f.id)] = f.activada === true;
    estado.activos = activos;
    estado.conocido = true;
    estado.ultimoError = "";
    notificar();
    return { ...activos };
  } catch (e: any) {
    estado.ultimoError = String(e?.message || e).slice(0, 160);
    return { ...estado.activos };
  }
}

export async function fijarCapacidad(id: CapacidadId, activar: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/features/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: activar }),
    });
    const j: any = await r.json();
    if (!j?.ok) return { ok: false, error: String(j?.error || "no se pudo cambiar la capacidad") };
    estado.activos[id] = j.enabled === true;
    estado.conocido = true;
    estado.ultimoError = "";
    notificar();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 160) };
  }
}

export function suscribirCapacidades(fn: (e: EstadoCapacidades) => void): () => void {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

/** Solo para pruebas: devuelve la cache a cero. */
export function reiniciarCapacidadesParaPrueba(): void {
  estado.activos = {};
  estado.conocido = false;
  estado.ultimoError = "";
  suscriptores.clear();
}
