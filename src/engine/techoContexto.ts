/**
 * techoContexto.ts — v1.57.14 · CUÁNTO CUESTA LA VENTANA QUE SE ESTÁ PIDIENDO
 * ============================================================================
 * RAÍZ (Guía de Optimización de Ollama del usuario + docs oficiales verificadas
 * el 15/10, https://docs.ollama.com/faq): el dinero de la RAM no lo pagan tanto
 * los pesos del modelo como la **KV-cache**, y la KV-cache escala con el
 * `num_ctx` de la petición. La propia documentación lo dice con la fórmula:
 * «Required RAM will scale by OLLAMA_NUM_PARALLEL * OLLAMA_CONTEXT_LENGTH».
 *
 * El proyecto ya sabía esto de memoria — el diary de la casa documenta el caso
 * real: la app de Ollama con el selector «Context length» en 256k sobre un
 * qwen3:4b pedía del orden de 25-38 GB de KV antes de cargar pesos, en una
 * máquina de 16 GB. Swap garantizado = «la PC se pone lenta y se corta la
 * comunicación». Y el panel Pro tiene desde v1.16 un dial de `num_ctx` que
 * llega hasta 131072 sin ninguna guarda: el mismo disparo, pero propio.
 *
 * QUÉ HACE ESTE MÓDULO: convierte «qué ventana se pidió» en «cuánta RAM vale» y
 * devuelve el mayor `num_ctx` que la máquina puede pagar, con el MOTIVO por
 * escrito. No es un bloqueo duro ni un capricho: el usuario sigue pudiendo
 * pedir lo que quiera, pero la petición que sale por la red es pagable y el
 * aviso dice por qué se recortó, en vez de dejar que Ollama truene en swap.
 *
 * QUÉ NO HACE: no inventa números. Si no tiene la arquitectura del modelo,
 * `costoKvPorToken` devuelve el PEOR CASO plausible y lo
 * declara (`origen: "defecto"`); si no sabe la RAM del equipo, NO opina y
 * devuelve el pedido intacto (`recortado: false`, `motivo` explicando que no se
 * midió). Un techo que adivina es peor que no tener techo: quita contexto que
 * hacía falta sin razón.
 *
 * LA FÓRMULA (cuando hay arquitectura — la de llama.cpp/GGUF, exacta):
 *   bytes/token = 2 (K y V) · nLayer · nKvHeads · headDim · bytesPorValor
 * Un qwen3:4b (36 capas, 8 cabezas KV, head_dim 128, f16=2 bytes) da
 * 147456 B/token ≈ 0,14 MB/token — el mismo orden que midió la casa (0,1-0,15)
 * y el motivo de que 16384 de contexto cuesten ~2,2 GB de KV en ese modelo.
 *
 * POR QUÉ UN DEFECTO Y NO UNA TABLA POR MODELO: con GQA/MQA la KV por token NO
 * crece con los parámetros (un 7B de 4 cabezas KV paga MENOS que un 4B de 8).
 * Cualquier estimación lineal en «B» saldría equivocada de dirección, así que
 * sin arquitectura se usa una cota conservadora única y se dice que es cota.
 */

/** Bytes por valor de la KV-cache: f16 = 2 (el default de Ollama), q8_0 = 1. */
export const BYTES_VALOR_F16 = 2;

/**
 * Cota conservadora de KV por token cuando NO se conoce la arquitectura:
 * 0,15 MB/token ≈ lo que paga un modelo de chat de 3-8B con 8 cabezas KV en
 * f16. Es PEOR CASO plausible, no promedio: a cambio de recortar de más en los
 * modelos GQA chicos, nunca deja pasar una petición que vuelque la máquina.
 */
export const MB_KV_POR_TOKEN_DEFECTO = 0.15;

/**
 * Fracción de la RAM total que puede ocupar la KV-cache. Regla de la casa
 * (diary 2026-10-14): hay que dejar ~40 % de la RAM libre para el SO, el
 * navegador y los propios pesos. Se aprieta a 0,35 porque aquí el presupuesto
 * compite contra los pesos, que `admisionRam` ya vigela por su lado.
 */
export const FRACCION_RAM_PARA_KV = 0.35;

/** Paso de las ventanas: Ollama trabaja en múltiplos de 1024 y el usuario no entiende 34817. */
export const PASO_CONTEXTO = 1024;

/**
 * Suelo del recorte: por debajo de 2048 ninguna ventana tiene sentido (un
 * turno del IDE con herramientas ya ocupa más). Si ni eso cabe, el techo NO
 * recorta: ese es territorio de `admisionRam`, que dice «no cargues este
 * modelo», que es la respuesta correcta — no un contexto inútil.
 */
export const SUELO_CONTEXTO = 2048;

export interface ArquitecturaKV {
  /** Capas del transformer (`*.block_count` en /api/show). */
  nLayer?: number;
  /** Cabezas de clave/valor (`*.attention.head_count_kv`) — no las Q. */
  nKvHeads?: number;
  /** Dimensión de cada cabeza (`*.attention.head_dim`). */
  headDim?: number;
  /** Bytes por valor guardado: 2 = f16 (default), 1 = q8_0. */
  bytesPorValor?: number;
}

export type OrigenEstimacion = "arquitectura" | "defecto";

export interface CostoKv {
  mbPorToken: number;
  origen: OrigenEstimacion;
}

/**
 * MB de KV-cache por token de contexto. Con arquitectura completa la cifra es
 * EXACTA (origen "arquitectura"); sin ella cae en la cota conservadora y lo
 * declara (origen "defecto"). `paramsB` entra solo para el motivo legible.
 */
export function costoKvPorToken(arq?: ArquitecturaKV): CostoKv {
  const nLayer = arq?.nLayer, nKvHeads = arq?.nKvHeads, headDim = arq?.headDim;
  const completo =
    typeof nLayer === "number" && nLayer > 0 &&
    typeof nKvHeads === "number" && nKvHeads > 0 &&
    typeof headDim === "number" && headDim > 0;
  if (!completo) return { mbPorToken: MB_KV_POR_TOKEN_DEFECTO, origen: "defecto" };
  const bytesPorValor = typeof arq?.bytesPorValor === "number" && arq!.bytesPorValor! > 0
    ? arq!.bytesPorValor!
    : BYTES_VALOR_F16;
  const bytes = 2 * nLayer! * nKvHeads! * headDim! * bytesPorValor;
  return { mbPorToken: bytes / (1024 * 1024), origen: "arquitectura" };
}

/** GB que cuesta una ventana dada. `null` = no se sabe cuánto cuesta un token. */
export function gbKvParaVentana(numCtx: number, mbPorToken: number): number | null {
  if (!Number.isFinite(numCtx) || numCtx <= 0 || !Number.isFinite(mbPorToken) || mbPorToken <= 0) return null;
  return Math.round(((numCtx * mbPorToken) / 1024) * 100) / 100;
}

export interface EntradaTecho {
  /** El `num_ctx` que se quiere pedir (dial del usuario o el de la escalera). */
  numCtxPedido: number;
  /** RAM total del equipo en GB. Sin medida => no se opina (honestidad). */
  ramGb?: number;
  /** Costo por token; omitido => cota conservadora declarada. */
  arq?: ArquitecturaKV;
}

export interface VeredictoTecho {
  /** El `num_ctx` que hay que enviar. Siempre ≤ pedido, nunca 0. */
  numCtx: number;
  /** true si se bajó del pedido. Falso = intacto (aunque no se haya podido medir). */
  recortado: boolean;
  /** Cuánto costaba la ventana pedida, en GB. null = sin medir. */
  costoPedidoGb: number | null;
  /** Cuánto cuesta la ventana aprobada. */
  costoFinalGb: number | null;
  /** Presupuesto de KV que daba la máquina. */
  presupuestoGb: number | null;
  origen: OrigenEstimacion;
  /** Frase para el usuario. Nunca vacía: si no recorta, dice por qué no. */
  motivo: string;
}

/** El mayor múltiplo de PASO_CONTEXTO que no pasa de `tope` (y no baja del suelo). */
export function redondearALaBaja(tope: number): number {
  if (!Number.isFinite(tope) || tope <= 0) return SUELO_CONTEXTO;
  const pasos = Math.floor(tope / PASO_CONTEXTO);
  return Math.max(SUELO_CONTEXTO, pasos * PASO_CONTEXTO);
}

/**
 * Techo de contexto para una petición. PURA: no lee `os`, no lee el perfil, no
 * toca la red — recibe los hechos y devuelve el número con su motivo.
 */
export function techoDeContexto(entrada: EntradaTecho): VeredictoTecho {
  const pedido = Math.max(1, Math.round(Number(entrada.numCtxPedido) || 0));
  const costo = costoKvPorToken(entrada.arq);
  const base: Pick<VeredictoTecho, "origen" | "costoPedidoGb" | "costoFinalGb" | "presupuestoGb"> = {
    origen: costo.origen,
    costoPedidoGb: gbKvParaVentana(pedido, costo.mbPorToken),
    costoFinalGb: null,
    presupuestoGb: null,
  };
  const ram = Number(entrada.ramGb);
  if (!Number.isFinite(ram) || ram <= 0) {
    return {
      ...base,
      numCtx: pedido,
      recortado: false,
      motivo: `Ventana de ${pedido} sin recortar: no se midió la RAM del equipo, y adivinarla recortaría contexto que puede hacer falta.`,
    };
  }
  const presupuesto = Math.round(ram * FRACCION_RAM_PARA_KV * 100) / 100;
  const maxTokens = Math.floor((presupuesto * 1024) / costo.mbPorToken);
  const tope = redondearALaBaja(maxTokens);
  if (tope >= pedido) {
    return {
      ...base,
      numCtx: pedido,
      recortado: false,
      presupuestoGb: presupuesto,
      costoFinalGb: base.costoPedidoGb,
      motivo: `Ventana de ${pedido} cabe: cuesta ~${base.costoPedidoGb} GB de KV sobre un presupuesto de ${presupuesto} GB (${Math.round(ram * 10) / 10} GB de RAM).`,
    };
  }
  const costoFinal = gbKvParaVentana(tope, costo.mbPorToken);
  return {
    ...base,
    numCtx: tope,
    recortado: true,
    presupuestoGb: presupuesto,
    costoFinalGb: costoFinal,
    motivo:
      `Pediste ${pedido} de contexto y eso cuesta ~${base.costoPedidoGb} GB de KV-cache, más de los ` +
      `${presupuesto} GB que esta máquina de ${Math.round(ram * 10) / 10} GB puede reservar para la ventana ` +
      `(el resto lo pagan el SO, el navegador y los pesos). Se manda ${tope}, que cuesta ~${costoFinal} GB. ` +
      `Para una ventana más grande hace falta más RAM, o pagar la KV más barata: flash attention y ` +
      `OLLAMA_KV_CACHE_TYPE=q8_0 la reducen a la mitad.`,
  };
}
