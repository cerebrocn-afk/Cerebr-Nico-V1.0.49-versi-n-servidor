/**
 * server/routers/persistencia.ts — PERSISTENCIA HÍBRIDA EN DISCO DEL SERVIDOR (v1.0.41)
 * ====================================================================================
 * Guarda y fusiona el estado no-secreto de la IDE en `<raizDatos>/.cerebro-db/persistencia-sesion.json`:
 *   - historial de chats guardados (`savedChats`)
 *   - lecciones y métricas de autosuperación (`lessons`, `turnMetrics`)
 *   - último workspace aparcado (`workspacePrevio`) y preferencia de arranque
 *
 * Nunca almacena API keys ni credenciales. Las escrituras son atómicas (`.tmp` + `renameSync`)
 * y cualquier JSON corrupto en disco se cuarentena con aviso sin tumbar la sesión.
 */

import fs from "node:fs";
import path from "node:path";
import type express from "express";
import type { Request, Response } from "express";
import {
  combinarInstantaneaPersistencia,
  crearSnapshotVacio,
  sanearSnapshotPersistencia,
  type SnapshotPersistencia,
} from "../../src/engine/persistenciaHibrida";

export interface DepsPersistencia {
  raizDatos: string;
}

export const RUTAS_PERSISTENCIA = [
  "GET /api/persistencia/estado",
  "POST /api/persistencia/guardar",
] as const;

export function rutaArchivoPersistencia(raizDatos: string): string {
  return path.join(raizDatos, ".cerebro-db", "persistencia-sesion.json");
}

function leerSnapshotDisco(archivo: string): { snapshot: SnapshotPersistencia; corrupto: boolean } {
  if (!fs.existsSync(archivo)) {
    return { snapshot: crearSnapshotVacio(), corrupto: false };
  }
  try {
    const crudo = fs.readFileSync(archivo, "utf-8");
    if (!crudo.trim()) return { snapshot: crearSnapshotVacio(), corrupto: false };
    const parsed = JSON.parse(crudo);
    return { snapshot: sanearSnapshotPersistencia(parsed), corrupto: false };
  } catch {
    try {
      fs.renameSync(archivo, `${archivo}.corrupt-${Date.now()}`);
    } catch {
      /* noop */
    }
    return { snapshot: crearSnapshotVacio(), corrupto: true };
  }
}

function escribirSnapshotAtomico(archivo: string, snapshot: SnapshotPersistencia): void {
  const dir = path.dirname(archivo);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${archivo}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2), "utf-8");
  fs.renameSync(tmp, archivo);
}

export function registrarPersistencia(app: express.Express, deps: DepsPersistencia): void {
  const archivo = rutaArchivoPersistencia(deps.raizDatos);

  /** Devuelve el snapshot híbrido almacenado en disco (sin claves ni secretos). */
  app.get("/api/persistencia/estado", (_req: Request, res: Response) => {
    const { snapshot, corrupto } = leerSnapshotDisco(archivo);
    return res.json({
      ok: true,
      archivo,
      corruptoRecuperado: corrupto,
      snapshot,
    });
  });

  /** Fusiona el estado enviado por el cliente con el de disco y lo escribe atómicamente. */
  app.post("/api/persistencia/guardar", (req: Request, res: Response) => {
    try {
      const entrante = sanearSnapshotPersistencia(req.body?.snapshot ?? req.body);
      const actual = leerSnapshotDisco(archivo).snapshot;
      const combinado = combinarInstantaneaPersistencia(entrante, actual);
      escribirSnapshotAtomico(archivo, combinado);
      return res.json({
        ok: true,
        updatedAt: combinado.updatedAt,
        resumen: {
          savedChats: combinado.savedChats.length,
          lessons: combinado.lessons.length,
          turnMetrics: combinado.turnMetrics.length,
          workspacePrevio: combinado.workspacePrevio.length,
        },
        snapshot: combinado,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}
