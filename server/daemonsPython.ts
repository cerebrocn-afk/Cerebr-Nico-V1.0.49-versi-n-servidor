import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export interface DaemonPythonDef {
  id: "motor" | "creador" | "memoria";
  puerto: number;
  script: string;
  variablePuerto: string;
  env: (raizDatos: string) => Record<string, string>;
}

const DAEMONS_PYTHON: DaemonPythonDef[] = [
  {
    id: "motor",
    puerto: 5103,
    script: "cerebro_motor.py",
    variablePuerto: "CN_MOTOR_PORT",
    env: (raizDatos) => ({
      CN_MOTOR_STORE: path.join(raizDatos, ".cerebro-db", "cerebro-motor.json"),
      CN_CEREBRO_MOTOR: path.join(raizDatos, ".cerebro-db", "cerebro-motor.json"),
    }),
  },
  {
    id: "creador",
    puerto: 5102,
    script: "creador_daemon.py",
    variablePuerto: "CN_CREATOR_PORT",
    env: (raizDatos) => ({
      CN_CREADOR_ROOT: path.join(raizDatos, ".creador"),
    }),
  },
  {
    id: "memoria",
    puerto: 5100,
    script: "hindsight_daemon.py",
    variablePuerto: "CN_MEMORY_PORT",
    env: (raizDatos) => ({
      CN_HINDSITE_MIRROR: path.join(raizDatos, "hindsight-mirror.json"),
    }),
  },
];

function portListening(port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: timeoutMs });
    const done = (ok: boolean) => {
      try {
        s.destroy();
      } catch {}
      resolve(ok);
    };
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
  });
}

async function healthReady(port: number, maxAttempts = 12, intervalMs = 250): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(800),
      });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function estaApagadoAMano(projectRoot: string, id: string): boolean {
  try {
    const ruta = path.join(projectRoot, "servicios.json");
    if (!fs.existsSync(ruta)) return false;
    const j = JSON.parse(fs.readFileSync(ruta, "utf-8"));
    return String(j?.[id] || "").trim().toLowerCase() === "apagado";
  } catch {
    return false;
  }
}

export function resolverInterpretePython(): string | null {
  const candidatos: string[] = [];
  if (process.env.CN_PYTHON && fs.existsSync(process.env.CN_PYTHON)) {
    candidatos.push(process.env.CN_PYTHON);
  }
  if (process.platform === "win32") {
    candidatos.push("python", "python3");
  } else {
    if (fs.existsSync("/usr/bin/python3")) candidatos.push("/usr/bin/python3");
    candidatos.push("python3", "python");
  }
  for (const bin of candidatos) {
    try {
      const chk = spawnSync(bin, ["--version"], {
        stdio: "ignore",
        timeout: 3000,
        windowsHide: true,
      });
      if (chk.status === 0) return bin;
    } catch {}
  }
  return null;
}

function resolverScriptDaemon(scriptName: string, installRoot: string): string | null {
  const bases = [installRoot, process.cwd()];
  for (const base of bases) {
    if (!base) continue;
    const candidate = path.join(base, "scripts", scriptName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export interface HandleDaemonsPython {
  kill: () => void;
  iniciados: Array<{ id: string; puerto: number; pid: number | undefined }>;
}

export async function arrancarDaemonsPython(opts: {
  installRoot: string;
  projectRoot: string;
}): Promise<HandleDaemonsPython> {
  if (process.env.CN_SANDBOX_CHILD === "1" || process.env.CN_DISABLE_BRIDGE === "1") {
    return { kill: () => {}, iniciados: [] };
  }

  const interprete = resolverInterpretePython();
  if (!interprete) {
    console.warn(
      "[CerebroNico] Python no detectado en el entorno: los daemons :5103/:5102/:5100 no se auto-inician (la IDE :3000 sigue funcionando)."
    );
    return { kill: () => {}, iniciados: [] };
  }

  const hijos: Array<{ id: string; puerto: number; proc: ChildProcess; logStream: fs.WriteStream | null }> = [];
  const iniciados: Array<{ id: string; puerto: number; pid: number | undefined }> = [];
  const logsDir = path.join(opts.projectRoot, "logs", "arranque");
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch {}

  for (const def of DAEMONS_PYTHON) {
    try {
      if (await portListening(def.puerto)) {
        console.log(`[CerebroNico] Daemon :${def.puerto} (${def.id}) ya escuchando: adoptado.`);
        continue;
      }
      if (estaApagadoAMano(opts.projectRoot, def.id)) {
        console.log(`[CerebroNico] Daemon :${def.puerto} (${def.id}) marcado «apagado» en servicios.json: omitido.`);
        continue;
      }
      const scriptPath = resolverScriptDaemon(def.script, opts.installRoot);
      if (!scriptPath) {
        console.warn(`[CerebroNico] Script scripts/${def.script} no encontrado: :${def.puerto} (${def.id}) omitido.`);
        continue;
      }

      const env: Record<string, string | undefined> = {
        ...process.env,
        [def.variablePuerto]: String(def.puerto),
        PROJECT_DIR: opts.projectRoot,
        CN_PROJECT_DIR: opts.projectRoot,
        PYTHONUTF8: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
        ...def.env(opts.projectRoot),
      };

      if (def.id === "memoria" && (await portListening(5103))) {
        env.HINDSITE_API_URL = "http://127.0.0.1:5103";
      }

      let logStream: fs.WriteStream | null = null;
      try {
        logStream = fs.createWriteStream(path.join(logsDir, `${def.id}.log`), { flags: "w" });
      } catch {
        logStream = null;
      }

      const proc = spawn(interprete, ["-u", scriptPath, "--port", String(def.puerto)], {
        cwd: path.dirname(path.dirname(scriptPath)),
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        windowsHide: true,
      });

      hijos.push({ id: def.id, puerto: def.puerto, proc, logStream });
      iniciados.push({ id: def.id, puerto: def.puerto, pid: proc.pid });

      proc.stdout?.on("data", (d: Buffer) => {
        if (logStream) logStream.write(d);
      });
      proc.stderr?.on("data", (d: Buffer) => {
        if (logStream) logStream.write(d);
      });
      proc.on("error", (err) => {
        console.warn(`[CerebroNico] Error al lanzar :${def.puerto} (${def.id}): ${err.message}`);
      });

      const listo = await healthReady(def.puerto, def.id === "motor" ? 12 : 10, 250);
      if (listo) {
        console.log(`[CerebroNico] Daemon :${def.puerto} (${def.id}) listo con ${interprete}.`);
      } else {
        console.warn(`[CerebroNico] Daemon :${def.puerto} (${def.id}) lanzado (PID ${proc.pid ?? "?"}), aún iniciando.`);
      }
    } catch (err: any) {
      console.warn(`[CerebroNico] Fallo arrancando daemon :${def.puerto} (${def.id}): ${err?.message || err}`);
    }
  }

  return {
    iniciados,
    kill: () => {
      for (const h of hijos) {
        try {
          if (!h.proc.killed) h.proc.kill();
        } catch {}
        try {
          h.logStream?.end();
        } catch {}
      }
    },
  };
}
