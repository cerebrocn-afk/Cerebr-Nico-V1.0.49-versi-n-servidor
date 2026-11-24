/**
 * avisosProveedor.ts — EL AVISO DE PROVEEDOR CORREGIDO, UNA SOLA VEZ (v1.57.21)
 * ==============================================================================
 * QUÉ ES: el deduplicador del aviso 🧩 que lanza la guarda «el modelo elegido
 * manda sobre el proveedor heredado» (server.ts, v1.56.2).
 * PARA QUÉ SIRVE: para que la corrección siga pasando pero el log deje de
 * gritarla en CADA turno.
 *
 * EL SÍNTOMA (log de Mario, v1.57.20, 16/10):
 *   [CerebroNico] 🧩 El modelo "gemma4:31b-cloud" es LOCAL (Ollama) pero el
 *   turno llegó con provider="zai" ... (×7, una por turno, idéntica)
 *
 * La guarda hacía su trabajo — cada turno se corregía a "ollama" y respondía
 * bien — pero avisar siete veces lo mismo no informa siete veces: la primera
 * línea es el diagnóstico, las otras seis son ruido que tapa los errores que
 * sí hay que leer. Y la causa raíz del proveedor "pegado" (cambiar el MOTOR sin
 * cambiar el modelo, o el modelo sin cambiar el motor) ahora se cierra en el
 * frontend (`cambiarMotor`/`cambiarModelo` en App.tsx): si el frente hace bien
 * su trabajo, este aviso debería verse cero o una vez.
 *
 * LA REGLA: un aviso por par (modelo, proveedor) por proceso. La corrección NO
 * depende del aviso: `avisarProveedorCorregido` solo imprime, devuelve `true`
 * si lo imprimió y `false` si ya lo había dicho. Así se prueba sin consola.
 */

const yaAvisados = new Set<string>();

/**
 * Imprime (una sola vez por par) el aviso de que el proveedor recibido no
 * corresponde al modelo elegido y se corrige a "ollama".
 * Devuelve true si esta llamada ESCRIBIÓ el aviso; false si ya estaba dicho.
 */
export function avisarProveedorCorregido(model: string, provider: string): boolean {
  const clave = `${model}|${provider}`;
  if (yaAvisados.has(clave)) return false;
  yaAvisados.add(clave);
  console.warn(
    `[CerebroNico] 🧩 El modelo "${model}" es LOCAL (Ollama) pero el turno llegó con provider="${provider}" ` +
      `(heredado de un mensaje anterior). Se corrige a "ollama": el modelo elegido manda. ` +
      `Si querías la nube, cambia también el MOTOR, no solo el nombre del modelo. ` +
      `(Este aviso no se repite por turno: cada combinación modelo+motor se dice una sola vez por arranque.)`
  );
  return true;
}

/** Cuántos avisos distintos se dijeron (para tests y para el registro). */
export function avisosProveedorEmitidos(): number {
  return yaAvisados.size;
}
