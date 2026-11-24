/**
 * planRunner.ts — MULTITAREA EN SEGUNDO PLANO (v2.2)
 * ==================================================
 * El plan NO vive dentro de la petición HTTP. Se lanza, el chat recibe un id al
 * instante y sigue funcionando; el plan avanza por detrás y el panel lo muestra.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DETALLE QUE HACE QUE ESTO NO ROMPA LA MÁQUINA
 * ─────────────────────────────────────────────────────────────────────────────
 * El presupuesto del planificador es POR PLAN. Con dos planes en marcha a ×8, la
 * máquina recibiría el doble de tareas de las que el gobernador había calculado,
 * y en 8 GB eso es pagar. La conciencia de recursos es de la MÁQUINA, no del plan.
 *
 * Solución: un SEMÁFORO GLOBAL por peso, en la frontera del ejecutor. Cada plan
 * cree que lanza lo que le toca, pero ninguna tarea entra de verdad hasta que hay
 * hueco real. No hay que tocar el planificador: se envuelve el ejecutor.
 *
 *     plan A (hasta 8) ─┐
 *                       ├─► semáforo global (lo que la máquina aguanta) ─► Ollama / disco
 *     plan B (hasta 8) ─┘
 *
 * Y si el botón cambia de ×1 a ×8 en caliente, el semáforo se reajusta y las
 * tareas que estaban esperando entran solas.
 */

import { crearPlan as crearPlanBase, ejecutarPlan, solicitarCancelacion, type Ejecutor, type MedidorMaquina, type Peso, type Plan, type Tarea } from "./taskPlanner";
import { resolverPresupuesto, elegirMR, PERFILES_MR, type MRId } from "./memoriaResiliente";
// v1.82.0 · FASE 3: la recomendación del gobernante AHORA SE APLICA. El criterio
// es puro (gobernante.ts); el runner solo alimenta muestras y acata.
import { decisionGobernante, type DecisionGobernante } from "./gobernante";
import { prepararReanudacion, prepararReintentoTarea } from "./taskStore";
// v1.56.8 · el desatasco automático: la decisión es pura (tableroParalelo) y el
// hecho del cortacircuito se mide, no se supone (resilience).
import { planDeDesatasco } from "./tableroParalelo";
import { isCircuitOpen } from "./resilience";
import type { GestorPlanes } from "./taskStoreFs";

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo global (uno por peso)
// ─────────────────────────────────────────────────────────────────────────────

export class Semaforo {
  private enUso: Record<Peso, number> = { io: 0, cpu: 0 };
  private limites: Record<Peso, number>;
  private cola: Record<Peso, Array<() => void>> = { io: [], cpu: [] };

  constructor(limites: Record<Peso, number>) {
    this.limites = { io: Math.max(1, limites.io), cpu: Math.max(1, limites.cpu) };
  }

  /** Cuántas tareas de ese peso están esperando hueco. Es información de la buena. */
  esperando(peso: Peso): number {
    return this.cola[peso].length;
  }

  enCurso(peso: Peso): number {
    return this.enUso[peso];
  }

  private get limitesActuales(): Record<Peso, number> {
    return this.limites;
  }

  async adquirir(peso: Peso): Promise<void> {
    if (this.enUso[peso] < this.limitesActuales[peso]) {
      this.enUso[peso] += 1;
      return;
    }
    await new Promise<void>((r) => this.cola[peso].push(r));
    this.enUso[peso] += 1;
  }

  liberar(peso: Peso): void {
    this.enUso[peso] = Math.max(0, this.enUso[peso] - 1);
    // Al liberar, entra el siguiente de la cola. `ajustar` también drena, así que
    // subir el escalado despierta a los que esperaban sin tocar nada más.
    const siguiente = this.cola[peso].shift();
    if (siguiente) siguiente();
  }

  /** Sube o baja el tope en caliente (el botón ×1 ×2 ×4 ×6 ×8). */
  ajustar(limites: Record<Peso, number>): void {
    this.limites = { io: Math.max(1, limites.io), cpu: Math.max(1, limites.cpu) };
    for (const peso of ["io", "cpu"] as Peso[]) {
      while (this.cola[peso].length > 0 && this.enUso[peso] < this.limites[peso]) {
        const siguiente = this.cola[peso].shift();
        if (siguiente) siguiente();
      }
    }
  }

  estado(): { io: { enUso: number; limite: number; esperando: number }; cpu: { enUso: number; limite: number; esperando: number } } {
    return {
      io: { enUso: this.enUso.io, limite: this.limites.io, esperando: this.cola.io.length },
      cpu: { enUso: this.enUso.cpu, limite: this.limites.cpu, esperando: this.cola.cpu.length },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesRunner {
  /** Ejecutor real de las tareas (modelo, herramienta, lo que sea). */
  ejecutar: Ejecutor;
  medir: MedidorMaquina;
  gestor: GestorPlanes;
  perfilForzado?: MRId;
  /** Escalado del botón: ×1 ×2 ×4 ×6 ×8. */
  escalado?: number;
  onAviso?: (linea: string) => void;
  /** v1.79.0 · EL BUCLE EN SINCRONÍA CON LA RUTA: se llama cuando una tarea
   *  (ruta relativa) termina, después de que el gestor la haya avisado. El
   *  manual de la perfección la recorre ahí: validada con evidencia, fallida
   *  con causa, o cerrada sin evidencia. */
  onTareaTerminada?: (plan: Plan, tarea: Tarea) => void;
  /**
   * v1.82.0 · FASE 3 punto 1: espejo vivo de la capacidad `parallel_workers`
   * del panel. Apagada, el runner usa la base del perfil (comportamiento
   * histórico intacto); encendida, los workers salen de los núcleos MEDIDOS:
   * clamp(2, núcleos-1, 8). Sin tocar ninguna configuración.
   */
  paralelismoActivo?: () => boolean;
}

export interface ResultadoLanzamiento {
  ok: boolean;
  planId: string;
  motivo: string;
}

export class PlanRunner {
  private op: OpcionesRunner;
  private corriendo = new Map<string, Promise<Plan>>();
  private semaforo: Semaforo;
  private escalado: number;
  /** v1.82.0 · muestras de RAM usada (0..1), la más reciente al final. */
  private ramHistorial: number[] = [];
  private ultimaDecision: DecisionGobernante | null = null;
  /** Historial corto de avisos, para el panel. */
  private historialAvisos: string[] = [];

  constructor(op: OpcionesRunner) {
    this.op = op;
    this.escalado = Math.max(1, op.escalado ?? 1);
    this.semaforo = new Semaforo(this.calcularLimitesGlobales());
  }

  /** v1.82.0 · acumula la presión de RAM para la regla del 70 % sostenido. */
  private registrarMuestraRam(m: { ramMedidaGB: number; ramLibreGB: number }): void {
    if (!m || !(m.ramMedidaGB > 0)) return;
    const usada = Math.min(1, Math.max(0, 1 - m.ramLibreGB / m.ramMedidaGB));
    this.ramHistorial.push(usada);
    if (this.ramHistorial.length > 12) this.ramHistorial.shift();
  }

  private medirAhora() {
    try {
      return this.op.medir();
    } catch {
      // Si el medidor falla, se asume el peor caso razonable: se sigue, no se cae.
      return { ramMedidaGB: 8, ramLibreGB: 4, nucleos: 4 };
    }
  }

  /** El presupuesto de la MÁQUINA con el escalado actual; el semáforo se dimensiona con él. */
  private calcularLimitesGlobales(): Record<Peso, number> {
    const m = this.medirAhora();
    this.registrarMuestraRam(m);
    const activo = this.op.paralelismoActivo ? this.op.paralelismoActivo() === true : false;
    const perfil = this.op.perfilForzado ? PERFILES_MR[this.op.perfilForzado] : elegirMR(m.ramMedidaGB);
    const decision = decisionGobernante({
      cores: m.nucleos,
      muestrasRam: this.ramHistorial,
      paralelismoActivo: activo,
      cpuBasePerfil: perfil?.cpuBase ?? 1,
    });
    const cambio = !this.ultimaDecision
      || this.ultimaDecision.cpuBase !== decision.cpuBase
      || this.ultimaDecision.degradadoPorRam !== decision.degradadoPorRam;
    this.ultimaDecision = decision;
    if (activo && decision.motivo && cambio) this.avisar(decision.motivo);
    const p = resolverPresupuesto({
      ...m,
      perfilForzado: this.op.perfilForzado,
      escalado: this.escalado,
      cpuBaseAdaptativa: activo ? decision.cpuBase : undefined,
    });
    return { io: p.io, cpu: p.cpu };
  }

  /** v1.82.0 · qué está aplicando el gobernador AHORA (panel, /api/brain/runner). */
  estadoGobernante(): { workers: number; adaptado: boolean; degradadoPorRam: boolean; motivo: string; ramUsadaPct: number } {
    const u = this.ultimaDecision;
    const ult = this.ramHistorial[this.ramHistorial.length - 1];
    return {
      workers: u ? u.cpuBase : 0,
      adaptado: u ? u.adaptado : false,
      degradadoPorRam: u ? u.degradadoPorRam : false,
      motivo: u ? u.motivo : "",
      ramUsadaPct: Number.isFinite(ult) ? Math.round(ult * 100) : 0,
    };
  }

  /** Botón «cerebro resiliente ×N». Reajusta en caliente, sin reiniciar planes. */
  escalar(n: number): { ok: boolean; escalado: number; limites: ReturnType<Semaforo["estado"]>; motivo: string } {
    this.escalado = Math.max(1, Math.floor(n));
    const limites = this.calcularLimitesGlobales();
    this.semaforo.ajustar(limites);
    const p = resolverPresupuesto({ ...this.medirAhora(), perfilForzado: this.op.perfilForzado, escalado: this.escalado });
    const motivo = p.degradado
      ? `Escalado ×${this.escalado} aceptado, pero la máquina no da para tanto. Reparto real: ${limites.io} io / ${limites.cpu} cpu. ${p.motivo.slice(-1)[0] || ""}`.trim()
      : `Escalado ×${this.escalado}: ${limites.io} tareas de espera y ${limites.cpu} de cálculo a la vez.`;
    this.avisar(motivo);
    return { ok: true, escalado: this.escalado, limites: this.semaforo.estado(), motivo };
  }

  escaladoActual(): number {
    return this.escalado;
  }

  /**
   * Fija el tramo MR a mano (o lo devuelve a automático pasando `undefined`).
   * Se recalcula el semáforo y se avisa del reparto real: forzar 32 GB en una
   * máquina de 8 GB está permitido —«es bueno terminar aunque no lo soporte»—,
   * pero se dice lo que va a pasar.
   */
  fijarTramo(mr?: MRId): { ok: boolean; tramo: MRId | null; limites: ReturnType<Semaforo["estado"]>; motivo: string } {
    this.op.perfilForzado = mr;
    const limites = this.calcularLimitesGlobales();
    this.semaforo.ajustar(limites);
    const p = resolverPresupuesto({ ...this.medirAhora(), perfilForzado: mr, escalado: this.escalado });
    const motivo = mr
      ? `Tramo fijado a ${p.perfil.nombre} (${p.perfil.ramGB} GB). Reparto: ${limites.io} tareas de espera y ${limites.cpu} de cálculo.`
      : `Tramo automático: ${p.perfil.nombre} (${p.perfil.ramGB} GB según la máquina). Reparto: ${limites.io} y ${limites.cpu}.`;
    this.avisar(motivo);
    return { ok: true, tramo: mr ?? null, limites: this.semaforo.estado(), motivo };
  }

  /** El tramo forzado, o null si va en automático. */
  tramoActual(): MRId | null {
    return this.op.perfilForzado ?? null;
  }

  private avisar(linea: string): void {
    // Se guarda un historial corto para que el panel pueda mostrar QUÉ pasó sin
    // tener que leer el log del servidor. Es información, no decoración.
    this.historialAvisos.push(linea);
    if (this.historialAvisos.length > 60) this.historialAvisos.splice(0, this.historialAvisos.length - 60);
    try {
      this.op.onAviso?.(linea);
    } catch {}
  }

  /** Últimos avisos, para el panel. */
  avisosRecientes(): string[] {
    return [...this.historialAvisos];
  }

  /** Todos los planes conocidos (los vivos y los que están en disco). */
  listaPlanes(): Plan[] {
    return this.op.gestor.lista();
  }

  /** Crea un plan y lo deja guardado, SIN ejecutarlo. Devuelve el plan. */
  crear(objetivo: string, tareas: Array<Partial<Tarea> & { titulo: string }>): Plan {
    const plan = crearPlanBase(objetivo, tareas, this.op.gestor.nuevoId());
    this.op.gestor.registrar(plan);
    this.avisar(`Plan ${plan.id} creado con ${plan.tareas.length} tarea(s): «${objetivo}».`);
    return plan;
  }

  /**
   * Lanza el plan EN SEGUNDO PLANO y vuelve al instante. La promesa no se espera:
   * se guarda para poder saber si sigue vivo y para parar en un apagado limpio.
   */
  lanzar(planId: string): ResultadoLanzamiento {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, planId, motivo: `No existe el plan ${planId}.` };
    if (this.corriendo.has(planId)) return { ok: false, planId, motivo: `El plan ${planId} ya se está ejecutando.` };

    const promesa = this.ejecutarEnSegundoPlano(plan);
    this.corriendo.set(planId, promesa);
    void promesa.finally(() => {
      this.corriendo.delete(planId);
      void this.op.gestor.guardar();
    });

    return { ok: true, planId, motivo: `Plan ${planId} lanzado en segundo plano. El chat sigue disponible.` };
  }

  private async ejecutarEnSegundoPlano(plan: Plan): Promise<Plan> {
    return ejecutarPlan(plan, {
      // El semáforo va en la frontera: el plan cree que lanza lo suyo, pero
      // ninguna tarea empieza de verdad sin hueco REAL en la máquina.
      ejecutar: async (tarea, senal) => {
        await this.semaforo.adquirir(tarea.peso);
        try {
          return await this.op.ejecutar(tarea, senal);
        } finally {
          this.semaforo.liberar(tarea.peso);
        }
      },
      medir: () => this.medirAhora(),
      // También como función: el selector de tramo se aplica a lo que ya corre.
      perfilForzado: () => this.op.perfilForzado,
      // Función, no valor: el plan consulta el escalado en cada vuelta, así que
      // pulsar ×8 se aplica a los planes que YA están corriendo.
      escalado: () => this.escalado,
      log: (linea) => this.avisar(linea),
      alTerminarTarea: (p, t) => {
        this.op.gestor.avisarTareaTerminada(p, t);
        // v1.79.0 — la ruta relativa se recorre en el MISMO punto donde el
        // bucle la terminó: el plan y el manual no pueden desincronizarse.
        try {
          this.op.onTareaTerminada?.(p, t);
        } catch {
          /* el manual es cara del bucle, no su freno: jamás tumba la ejecución */
        }
      },
    });
  }

  /** Cancelar es inmediato (el planificador despierta en el acto). */
  cancelar(planId: string): { ok: boolean; motivo: string } {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, motivo: `No existe el plan ${planId}.` };
    solicitarCancelacion(plan);
    this.avisar(`Cancelación pedida para el plan ${planId}.`);
    return { ok: true, motivo: "Cancelación pedida." };
  }

  /** Reanuda un plan pausado (por reinicio) o cancelado. Lo ya hecho no se repite. */
  reanudar(planId: string): ResultadoLanzamiento {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, planId, motivo: `No existe el plan ${planId}.` };
    if (this.corriendo.has(planId)) return { ok: false, planId, motivo: `El plan ${planId} ya se está ejecutando.` };
    prepararReanudacion(plan);
    void this.op.gestor.guardar();
    return this.lanzar(planId);
  }

  /** Intentos de desatasco automático por plan: el techo evita un bucle infinito. */
  private desatascos = new Map<string, number>();

  /**
   * DESATASCO AUTOMÁTICO (v1.56.8 · evolución de bucles).
   *
   * El reclamo de Mario: la pestaña de planificación «quedaba con el cartel de
   * atascada sin resolver los problemas». Era exacto: `diagnosticar` pone el cartel
   * y nadie actúa. El cortacircuito enfría a los 60 s, las tareas bloqueadas siguen
   * bloqueadas para siempre, y la única salida era un botón que relanza TODO.
   *
   * Aquí el motor se hace cargo, con tres frenos:
   *   · no interviene si algo corre o espera hueco (eso es tráfico, no atasco);
   *   · solo libera cuyo circuito **ya cerró** y cuyas dependencias están hechas —
   *     los hechos se miden con `isCircuitOpen`, no se suponen;
   *   · techo de intentos por plan: si se libera y vuelve a caer tres veces, el
   *     problema ya no es de programación (es clave, cuota o modelo) y se DECLARA
   *     en vez de gastar recursos eternamente.
   */
  desatascarAutomatico(planId: string): {
    accion: "ninguna" | "liberar_circuito" | "requiere_intervencion";
    tareas: string[];
    motivo: string;
    relanzado: boolean;
  } {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { accion: "ninguna", tareas: [], motivo: `No existe el plan ${planId}.`, relanzado: false };
    if (this.corriendo.has(planId)) {
      return { accion: "ninguna", tareas: [], motivo: "el plan está corriendo: no se interviene", relanzado: false };
    }

    const hechas = new Set(plan.tareas.filter((t) => t.estado === "hecha").map((t) => t.id));
    const bloqueadas = plan.tareas.filter((t) => t.estado === "bloqueada");
    const decision = planDeDesatasco({
      bloqueadas: bloqueadas.map((t) => ({
        id: t.id,
        // Hecho medido: el circuito de ESTE recurso, ahora. No «ya habrá pasado el
        // minuto».
        circuitoCerradoAhora: !t.claveCircuito || !isCircuitOpen(t.claveCircuito),
        dependeDePendiente: (t.dependeDe || []).some((d) => !hechas.has(d)),
      })),
      enCurso: plan.tareas.filter((t) => t.estado === "en_curso").length,
      esperando: plan.tareas.filter((t) => (t as any).esperaHasta).length,
      listas: plan.tareas.filter((t) => t.estado === "lista").length,
      pendientes: plan.tareas.filter((t) => t.estado === "pendiente").length,
      desatascosHechos: this.desatascos.get(planId) || 0,
    });

    if (decision.accion !== "liberar_circuito") {
      if (decision.accion === "requiere_intervencion") {
        console.warn(`[runner] plan ${planId} ATASCADO sin solución automática: ${decision.motivo}`);
      }
      return { ...decision, relanzado: false };
    }

    this.desatascos.set(planId, (this.desatascos.get(planId) || 0) + 1);
    for (const t of bloqueadas) {
      if (!decision.tareas.includes(t.id)) continue;
      t.estado = "pendiente";
      t.bloqueoCircuito = false;
      t.esperasCircuito = 0;
      (t as any).esperaHasta = undefined;
      t.motivoEspera = undefined;
      t.error = undefined;
    }
    plan.estado = "pendiente";
    plan.log = plan.log || [];
    plan.log.push(
      `[plan ${plan.id}] 🔄 desatasco automático #${this.desatascos.get(planId)}: ${decision.tareas.join(", ")} — ${decision.motivo}`
    );
    void this.op.gestor.guardar();
    console.log(`[runner] plan ${planId} desatascado automáticamente: ${decision.tareas.join(", ")}`);
    const r = this.lanzar(planId);
    return { ...decision, relanzado: r.ok };
  }

  /**
   * Reintento de UNA tarea (v1.56.8). `reanudar` relanza todo lo no hecho; esto
   * relanza solo la tarea pedida y sus dependientes, así que un plan de 10 tareas
   * donde falló una no vuelve a pagar las nueve buenas. Devuelve `reiniciadas`
   * para que la UI diga exactamente qué se va a rehacer.
   */
  reintentarTarea(
    planId: string,
    tareaId: string,
  ): ResultadoLanzamiento & { reiniciadas?: string[] } {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, planId, motivo: `No existe el plan ${planId}.` };
    if (this.corriendo.has(planId)) {
      return { ok: false, planId, motivo: `El plan ${planId} ya se está ejecutando; espera o cancélalo.` };
    }
    const { motivo, reiniciadas } = prepararReintentoTarea(plan, tareaId);
    if (motivo) return { ok: false, planId, motivo };
    void this.op.gestor.guardar();
    const r = this.lanzar(planId);
    return { ...r, reiniciadas };
  }

  /**
   * Borra un plan por completo (v1.46.7). Un plan EN CURSO no se borra sin
   * cancelar antes: se rechaza con motivo para que el usuario lo pare primero.
   */
  borrar(planId: string): { ok: boolean; motivo: string } {
    const plan = this.op.gestor.obtener(planId);
    if (!plan) return { ok: false, motivo: `No existe el plan ${planId}.` };
    if (this.corriendo.has(planId)) {
      return { ok: false, motivo: `El plan ${planId} se está ejecutando. Cáncelalo antes de borrarlo.` };
    }
    const quitado = this.op.gestor.borrar(planId);
    if (!quitado) return { ok: false, motivo: `No se pudo borrar el plan ${planId}.` };
    this.avisar(`Plan ${planId} borrado.`);
    return { ok: true, motivo: "Plan borrado." };
  }

  /** Planes vivos ahora mismo. */
  activos(): string[] {
    return [...this.corriendo.keys()];
  }
  enSegundoPlano(planId: string): boolean {
    return this.corriendo.has(planId);
  }

  estadoSemaforo() {
    return this.semaforo.estado();
  }

  /**
   * Parada limpia (apagado del servidor): se pide cancelar a todo y se espera un
   * margen. Lo que no llegue a cerrar se queda como «en curso» en disco, y al
   * volver aparecerá PAUSADO — nunca se pierde.
   */
  async pararTodo(margenMs = 3000): Promise<{ parados: string[]; pendientes: string[] }> {
    const parados = this.activos();
    for (const id of parados) this.cancelar(id);
    if (this.corriendo.size > 0) {
      await Promise.race([
        Promise.allSettled([...this.corriendo.values()]),
        new Promise((r) => setTimeout(r, margenMs)),
      ]);
    }
    await this.op.gestor.guardar();
    await this.op.gestor.vaciar();
    const pendientes = this.activos();
    if (pendientes.length > 0) {
      this.avisar(`Quedaron ${pendientes.length} plan(es) sin cerrar del todo; al volver aparecerán PAUSADOS para reanudar.`);
    }
    return { parados, pendientes };
  }
}
