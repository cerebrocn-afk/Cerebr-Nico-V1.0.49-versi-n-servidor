/**
 * entregaRitual.ts — EL RITUAL COMO FUNCION, NO COMO COSTUMBRE (v1.83.0 · FASE 5)
 * ==============================================================================
 * Todo lo que el armado de un paquete sabe hacer se puso acá, PURO: el plan de
 * corte en 4 partes, el render del manifiesto, y la decision del RECEPTOR
 * (reensamblar o rechazar). Los scripts `scripts/entregar.mjs` y
 * `scripts/entregar-verificar.mjs` son cables tontos sobre estas funciones; la
 * suite `entregaAutoverificada.test.ts` las congela, incluida la prueba que el
 * plano pide: una parte con 1 byte modificado => el receptor SE NIEGA y dice
 * cual. Un ritual que nadie puede probar es una supersticion con SHA256.
 */
import { createHash } from "node:crypto";

export const sha256hex = (buf: Uint8Array | string): string =>
  createHash("sha256").update(buf as any).digest("hex");

/** Plan de corte: n partes binarias, la ultima puede pesar menos. */
export function planSplit(totalBytes: number, n = 4): Array<{ i: number; desde: number; hasta: number }> {
  const total = Math.max(0, Math.floor(totalBytes));
  if (total === 0 || n < 1) return [];
  const tam = Math.ceil(total / n);
  const partes: Array<{ i: number; desde: number; hasta: number }> = [];
  for (let i = 0, desde = 0; i < n && desde < total; i++, desde = i * tam) {
    partes.push({ i: i + 1, desde, hasta: Math.min(total, desde + tam) });
  }
  return partes;
}

export interface PiezaManifiesto { nombre: string; bytes: number; sha256: string }

/** Manifiesto legible: lo que el .BAT y el receptor van a batir. */
export function renderManifiesto(opts: {
  version: string;
  zip: PiezaManifiesto;
  partes: PiezaManifiesto[];
  validaciones: string[];
}): string {
  const L: string[] = [];
  L.push(`CerebroNico-IDE v${opts.version} · manifiesto autogenerado por npm run entregar`);
  L.push("=".repeat(72));
  L.push(`Zip: ${opts.zip.nombre} ${opts.zip.bytes.toLocaleString("de-AT")} bytes`);
  L.push(`  SHA256  ${opts.zip.sha256}`);
  L.push("");
  L.push("Partes (reunion: cat parte1 parte2 parte3 parte4 > zip; o reunir-y-verificar.bat):");
  for (const p of opts.partes) L.push(`  ${p.nombre}  ${p.bytes.toLocaleString("de-AT")} bytes\n  SHA256  ${p.sha256}`);
  L.push("");
  L.push("Verificaciones declaradas por el ritual (medidas por el script, no a mano):");
  for (const v of opts.validaciones) L.push("  · " + v);
  return L.join("\n") + "\n";
}

export interface VeredictoReceptor {
  ok: boolean;
  accion: "reunir-y-batir" | "rechazar";
  motivo: string;
  /** Parte culpable cuando hay una (el plano exige nombrarla). */
  parteMala?: string;
}

/**
 * Lo que hace el RECEPTOR antes de abrir nada: bate cada parte contra el
 * manifiesto; una sola maldad (1 byte) y la entrega se RECHAZA diciendo cual
 * parte vino mal. Nunca se reensambla sobre partes dudosas.
 */
export function decidirRecepcion(manifiesto: string, partes: Array<{ nombre: string; sha256: string }>): VeredictoReceptor {
  const esperado = new Map<string, string>();
  let m: RegExpExecArray | null;
  const re = /(CerebroNico-IDE-v[\d.]+-parte-\d+de4\.zip)\s+([\d.,\u00A0 ]+) bytes\n  SHA256  ([0-9a-f]{64})/g;
  while ((m = re.exec(manifiesto))) esperado.set(m[1], m[3]);
  for (const p of partes) {
    const want = esperado.get(p.nombre);
    if (!want) return { ok: false, accion: "rechazar", motivo: `el manifiesto no conoce a ${p.nombre}: sobra una parte o falta el manifiesto`, parteMala: p.nombre };
    if (want !== p.sha256) return { ok: false, accion: "rechazar", motivo: `hash no coincide: ${p.nombre} llego corrupta (o el manifiesto es de otra entrega)`, parteMala: p.nombre };
  }
  if (partes.length !== esperado.size) {
    const faltan = [...esperado.keys()].filter((k) => !partes.some((p) => p.nombre === k));
    return { ok: false, accion: "rechazar", motivo: `faltan partes: ${faltan.join(", ")}`, parteMala: faltan[0] };
  }
  return { ok: true, accion: "reunir-y-batir", motivo: "las 4 partes baten contra el manifiesto" };
}
/** El batido final del zip reensamblado: mismo hash o no es el mismo paquete. */
export function zipReensambladoBate(zipSha: string, reunidoSha: string): boolean {
  return typeof zipSha === "string" && zipSha.length === 64 && zipSha === reunidoSha;
}
