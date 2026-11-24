export interface DeclaracionDeContexto {
  /** Cuántos tokens de contexto admite el modelo ENTRENADO (n_ctx_train). 0 = no lo declara. */
  entrenado: number;
  /** Cuántos pide el perfil / el dial para esta máquina. 0 = no se sabe. */
  pedido: number;
}

export interface VeredictoContexto {
  /** El `num_ctx` que hay que MANDAR a Ollama. Nunca 0. */
  numCtx: number;
  /** Se bajó porque el modelo declara menos de lo que se le pide. */
  topado: boolean;
  /** Una línea en español, o "" si no hay nada que contar. */
  aviso: string;
}

/**
 * v2.3.25 · NO SE LE PIDE A UN MODELO MÁS CONTEXTO DEL QUE APRENDIÓ.
 * ================================================================
 * Log del 15/11 (log_ollama.json), con un modelo local de la casa:
 *
 *   «requested context size too large for model»   num_ctx=4096  n_ctx_train=512
 *   «input (730 tokens) is too large to process ... current batch size: 512»
 *   500 en /api/embeddings · «llama-server terminated exit status 1»
 *
 * El síntoma que vio Mario fue «el modelo local se cae». No se caía: se le pedían
 * 4096 tokens de ventana a un modelo entrenado con 512, Ollama abortaba la carga y
 * el proceso moría con exit 1. Y como el embedder de la memoria pedía vectores del
 * mismo modelo, cada turno volvía a morir.
 *
 * La regla es la de la casa: el techo REAL manda. Si el modelo declara 512, se
 * mandan 512 y se dice por qué. Si no declara nada, se respeta lo pedido (no se
 * inventa un techo que nadie midió). Nunca se baja de 256: por debajo de eso ya no
 * cabe un turno.
 *
 * PURA: entra lo declarado, sale el número. Sin red, sin fs.
 */
export function topadoAlContextoDeclarado(d: DeclaracionDeContexto): VeredictoContexto {
  const pedido = Math.floor(Number(d.pedido) || 0);
  const entrenado = Math.floor(Number(d.entrenado) || 0);
  if (pedido <= 0 && entrenado <= 0) return { numCtx: 0, topado: false, aviso: "" };
  if (entrenado <= 0) return { numCtx: pedido, topado: false, aviso: "" };
  if (pedido <= entrenado) return { numCtx: pedido || entrenado, topado: false, aviso: "" };
  const numCtx = Math.max(256, entrenado);
  return {
    numCtx,
    topado: true,
    aviso:
      `ventana bajada a ${numCtx} tokens: el modelo declara solo ${entrenado} de entrenamiento ` +
      `(se le pedían ${pedido}). Pedirle más lo mata al cargar («requested context size too large for model»).`,
  };
}
