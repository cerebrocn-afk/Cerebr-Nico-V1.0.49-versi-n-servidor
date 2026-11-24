/**
 * persistenciaHibrida.test.ts — Suite de persistencia híbrida, Gemini 4 server-side, imagen y RAG
 * =================================================================================================
 * Cubre las garantías de v1.0.41:
 *   1. Fusión determinista, límites y saneamiento anti-secretos/entradas hostiles en persistenciaHibrida.ts
 *   2. Pureza del módulo (cero imports Node builtins/DOM)
 *   3. Router real /api/persistencia/estado y /api/persistencia/guardar (escritura atómica, merge, cuarentena)
 *   4. /api/system/stats informa geminiServidorDisponible booleano sin filtrar GEMINI_API_KEY
 *   5. MODELOS_GEMINI conserva gemini-3.1-flash-image en el índice 0 e incluye modelos 3.1 lite/preview
 *   6. LocalRAG usa embeddings de Gemini cuando Ollama no está disponible y falla limpiamente ante defecto sembrado
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { fileURLToPath } from "node:url";
import {
  combinarInstantaneaPersistencia,
  crearSnapshotVacio,
  fusionarChatsGuardados,
  fusionarEliminaciones,
  fusionarLecciones,
  fusionarMetricas,
  sanearSnapshotPersistencia,
} from "../src/engine/persistenciaHibrida";
import { MODELOS_GEMINI } from "../src/engine/imageGen";
import { LocalRAG } from "../src/engine/localRAG";
import { registrarPersistencia, rutaArchivoPersistencia } from "../server/routers/persistencia";
import { registrarTelemetria } from "../server/routers/telemetria";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");

let correctas = 0;
let fallidas = 0;

function comprobar(nombre: string, cond: boolean) {
  if (cond) {
    correctas++;
    console.log("  ✓ " + nombre);
  } else {
    fallidas++;
    console.error("  ✗ " + nombre);
  }
}

async function main() {
  console.log("\n· 1) Persistencia híbrida: fusión determinista y saneamiento de entrada hostil");
  {
    const chatsA = [
      {
        id: "chat-1",
        title: "Chat inicial",
        createdAt: 100,
        updatedAt: 200,
        messages: [{ id: "m1", role: "user" as const, content: "Hola", timestamp: 100 }],
      },
      {
        id: "chat-2",
        title: "Local único",
        createdAt: 150,
        updatedAt: 150,
        messages: [{ id: "m2", role: "user" as const, content: "Paso local", timestamp: 150 }],
      },
    ];
    const chatsB = [
      {
        id: "chat-1",
        title: "Chat actualizado remoto",
        createdAt: 100,
        updatedAt: 500,
        messages: [
          { id: "m1", role: "user" as const, content: "Hola", timestamp: 100 },
          { id: "m1b", role: "assistant" as const, content: "Respuesta guardada", timestamp: 500 },
        ],
      },
      {
        id: "chat-3",
        title: "Remoto único",
        createdAt: 300,
        updatedAt: 300,
        messages: [{ id: "m3", role: "user" as const, content: "Paso remoto", timestamp: 300 }],
      },
    ];
    const mergedChats = fusionarChatsGuardados(chatsA, chatsB);
    comprobar("fusionarChatsGuardados conserva unión de 3 chats sin duplicar chat-1", mergedChats.length === 3);
    comprobar("gana la versión con mayor updatedAt en colisión de id", mergedChats.find((c) => c.id === "chat-1")?.title === "Chat actualizado remoto");

    const lecc = fusionarLecciones(
      [{ id: "l1", kind: "entorno", text: "Usar puerto 3000 siempre", tags: ["server"], used: 1, helped: 1, createdAt: 10, weight: 0.7 }],
      [
        { id: "l1", kind: "entorno", text: "Usar puerto 3000 siempre", tags: ["dev"], used: 4, helped: 3, createdAt: 10, weight: 0.9 },
        { id: "l2", kind: "entorno", text: "Usar puerto 3000 siempre", tags: ["dup"], used: 9, helped: 9, createdAt: 11, weight: 1.0 },
      ]
    );
    comprobar("fusionarLecciones deduplica por id/texto y conserva los contadores mayores", lecc.length === 1 && lecc[0].used === 4 && lecc[0].tags.includes("dev"));

    const mets = fusionarMetricas(
      [{ at: 1000, provider: "gemini", model: "gemini-4-hydrogen", totalMs: 220, ok: true }],
      [
        { at: 1000, provider: "gemini", model: "gemini-4-hydrogen", totalMs: 220, ok: true },
        { at: 2000, provider: "gemini", model: "gemini-4-hydrogen", totalMs: 180, ok: true },
      ]
    );
    comprobar("fusionarMetricas deduplica por (at|provider|model)", mets.length === 2 && mets[0].at === 1000 && mets[1].at === 2000);

    // entrada hostil: tipos rotos, mensajes sin texto, archivos .env/.key/.pem y clave falsa
    const hostil = sanearSnapshotPersistencia({
      updatedAt: "NaN",
      modoArranque: "invalido",
      savedChats: [
        null,
        { id: "vacio", messages: [{ role: "invalid", content: 123 }] },
        { id: "ok", title: "Válido", messages: [{ id: "x", role: "user", content: "hola", timestamp: 50 }] },
      ],
      lessons: [null, { id: "mal", text: "ab" }],
      turnMetrics: [{ at: -5, model: "", totalMs: -1 }],
      workspacePrevio: [
        { path: ".env", content: "GEMINI_API_KEY=SECRET" },
        { path: "certs/privada.key", content: "PRIVATE KEY" },
        { path: "src/app.ts", content: "export const ok = 1;" },
      ],
    });
    comprobar("entrada hostil queda saneada sin lanzar y descarta .env / .key / chats vacíos",
      hostil.savedChats.length === 1 &&
      hostil.savedChats[0].id === "ok" &&
      hostil.lessons.length === 0 &&
      hostil.turnMetrics.length === 0 &&
      hostil.workspacePrevio.length === 1 &&
      hostil.workspacePrevio[0].path === "src/app.ts"
    );

    const combinado = combinarInstantaneaPersistencia(
      { ...crearSnapshotVacio(), updatedAt: 500, modoArranque: "restaurar", savedChats: chatsA },
      { ...crearSnapshotVacio(), updatedAt: 400, savedChats: chatsB }
    );
    comprobar("combinarInstantaneaPersistencia conserva modoArranque y combina chats", combinado.modoArranque === "restaurar" && combinado.savedChats.length === 3);

    // ─── v1.0.44 · BORRAR ES BORRAR (la queja de Mario del 21/11) ─────────────
    // «los borro y al abrir la app siguen estando, y se van acumulando».
    // Raíz: cliente y servidor fusionaban por `id` haciendo UNIÓN, y una unión
    // no distingue «no lo tengo» de «lo borré». La lápida (id + fecha) sí.
    {
      const viejo = { ...chatsA[0], updatedAt: 1_000 };
      const lapida = [{ id: viejo.id, at: 2_000 }];
      const trasBorrar = fusionarChatsGuardados([], [viejo], lapida);
      comprobar("un chat borrado NO vuelve aunque el disco lo tenga (copia anterior a la lápida)", trasBorrar.length === 0);

      const rearchivado = { ...viejo, updatedAt: 3_000 };
      const vuelve = fusionarChatsGuardados([], [rearchivado], lapida);
      comprobar("pero si el hilo se vuelve a archivar DESPUÉS del borrado, se queda", vuelve.length === 1 && vuelve[0].id === viejo.id);

      const combinado2 = combinarInstantaneaPersistencia(
        { ...crearSnapshotVacio(), updatedAt: 3_000, savedChats: [], chatsEliminados: lapida },
        { ...crearSnapshotVacio(), updatedAt: 1_000, savedChats: [viejo] }
      );
      comprobar("el servidor aplica la lápida al fusionar y el borrado llega al disco", combinado2.savedChats.length === 0 && combinado2.chatsEliminados.length === 1);

      const ida = fusionarEliminaciones([{ id: "a", at: 100 }], [{ id: "a", at: 300 }, { id: "b", at: 200 }]);
      comprobar("dos lápidas del mismo chat se quedan con la fecha más reciente", ida.length === 2 && ida.find((e) => e.id === "a")?.at === 300);

      const saneado = sanearSnapshotPersistencia({ chatsEliminados: [{ id: "a", at: 5 }, { id: "", at: 6 }, { id: "b", at: "no" }, { id: "c", at: -3 }] });
      comprobar("el saneo descarta lápidas sin id, con fecha no numérica o negativa", saneado.chatsEliminados.length === 1 && saneado.chatsEliminados[0].id === "a");

      const sinCampo = sanearSnapshotPersistencia(crearSnapshotVacio());
      comprobar("un snapshot viejo (sin el campo) sigue leyéndose igual", Array.isArray(sinCampo.chatsEliminados) && sinCampo.chatsEliminados.length === 0);
    }
  }

  console.log("\n· 2) Pureza del módulo compartido");
  {
    const fuente = fs.readFileSync(path.join(RAIZ, "src/engine/persistenciaHibrida.ts"), "utf8");
    const tieneNode = /from\s+["'](?:node:|fs|path|child_process|os)/.test(fuente);
    comprobar("persistenciaHibrida.ts es 100% puro (sin Node builtins)", !tieneNode);
  }

  console.log("\n· 3) Router real /api/persistencia/* en Express con raíz temporal y cuarentena corrupta");
  {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cn-persistencia-"));
    try {
      const app = express();
      app.use(express.json());
      registrarPersistencia(app, { raizDatos: tmpRoot });

      const srv = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
      });
      const port = (srv.address() as any).port;
      const base = `http://127.0.0.1:${port}`;

      try {
        const r0 = await fetch(`${base}/api/persistencia/estado`);
        const j0: any = await r0.json();
        comprobar("GET /api/persistencia/estado inicial responde ok=true sin errores", r0.ok && j0.ok === true && j0.snapshot.savedChats.length === 0);

        const r1 = await fetch(`${base}/api/persistencia/guardar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot: {
              updatedAt: 1000,
              savedChats: [{ id: "c1", title: "Sesión 1", createdAt: 1000, updatedAt: 1000, messages: [{ id: "m1", role: "user", content: "Prueba persistente", timestamp: 1000 }] }],
              lessons: [{ id: "l1", kind: "patrón", text: "Validar persistencia atómica", tags: ["test"], used: 1, helped: 1, createdAt: 1000, weight: 0.8 }],
              workspacePrevio: [{ path: ".env", content: "SECRETO=NO" }, { path: "index.ts", content: "console.log(1);" }],
            },
          }),
        });
        const j1: any = await r1.json();
        comprobar("POST /api/persistencia/guardar guarda chats, lecciones y filtra .env",
          r1.ok && j1.ok === true && j1.resumen.savedChats === 1 && j1.resumen.lessons === 1 && j1.resumen.workspacePrevio === 1
        );

        const r2 = await fetch(`${base}/api/persistencia/estado`);
        const j2: any = await r2.json();
        comprobar("GET /api/persistencia/estado recupera lo escrito en disco", j2.snapshot.savedChats.length === 1 && j2.snapshot.workspacePrevio[0].path === "index.ts");

        // Defecto sembrado: archivo corrupto en disco -> debe cuarentenar sin tumbar la ruta
        const archivo = rutaArchivoPersistencia(tmpRoot);
        fs.writeFileSync(archivo, "{json_roto_sin_cerrar", "utf8");
        const r3 = await fetch(`${base}/api/persistencia/estado`);
        const j3: any = await r3.json();
        const archivosDb = fs.readdirSync(path.dirname(archivo));
        comprobar("JSON corrupto en disco se cuarentena y devuelve snapshot vacío sin error 500",
          r3.ok && j3.corruptoRecuperado === true && archivosDb.some((n) => n.includes(".corrupt-"))
        );
      } finally {
        (srv as any).closeAllConnections?.();
        await new Promise<void>((resolve) => srv.close(() => resolve()));
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }

  console.log("\n· 4) /api/system/stats expone geminiServidorDisponible sin filtrar la clave");
  {
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "AIza-TEST-SECRET-NO-FILTRAR-12345";
    const app = express();
    registrarTelemetria(app, {
      ollamaUrl: "http://127.0.0.1:1",
      workerPort: 5000,
      sandboxPort: 3500,
      sandboxVivo: () => false,
      sandboxPid: () => null,
    });
    const srv = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = (srv.address() as any).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/system/stats`);
      const text = await res.text();
      const json = JSON.parse(text);
      comprobar("geminiServidorDisponible es true cuando GEMINI_API_KEY está configurada", json.geminiServidorDisponible === true);
      comprobar("la respuesta HTTP jamás contiene el valor literal de GEMINI_API_KEY", !text.includes("AIza-TEST-SECRET-NO-FILTRAR-12345"));
    } finally {
      (srv as any).closeAllConnections?.();
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  }

  console.log("\n· 5) imageGen MODELOS_GEMINI y respaldo LocalRAG con Gemini");
  {
    comprobar("MODELOS_GEMINI conserva gemini-3.1-flash-image en el índice 0", MODELOS_GEMINI[0] === "gemini-3.1-flash-image");
    comprobar("MODELOS_GEMINI incluye gemini-3.1-flash-lite-image y preview",
      MODELOS_GEMINI.includes("gemini-3.1-flash-lite-image") && MODELOS_GEMINI.includes("gemini-3.1-flash-image-preview")
    );

    const tmpRag = fs.mkdtempSync(path.join(os.tmpdir(), "cn-rag-gem-"));
    const origFetch = globalThis.fetch;
    const prevKey = process.env.GEMINI_API_KEY;
    let callsGemini = 0;
    try {
      process.env.GEMINI_API_KEY = "AIza-MOCK-RAG-KEY";
      globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input);
        if (url.includes("/api/embed")) {
          throw new Error("Ollama offline en test");
        }
        if (url.includes(":batchEmbedContents")) {
          callsGemini++;
          const body = JSON.parse(String(init?.body || "{}"));
          const reqs = Array.isArray(body.requests) ? body.requests : [];
          return new Response(
            JSON.stringify({
              embeddings: reqs.map((_r: unknown, idx: number) => ({
                values: [idx === 0 ? 0.9 : 0.2, 0.4, 0.1, 0.8],
              })),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not Found", { status: 404 });
      }) as typeof fetch;

      const rag = new LocalRAG(tmpRag);
      rag.setEnabled(true);
      const idxRes = await rag.reindex([
        { nombre: "memoria.md", texto: "Arquitectura de CerebróNico IDE con persistencia híbrida y servidor Gemini 4 para desarrollo continuo sin fricción.\n\nDetalles adicionales sobre RAG vectorial y voz TTS integrada." },
      ]);
      comprobar("LocalRAG usa gemini-embedding cuando Ollama falla y hay GEMINI_API_KEY", idxRes.modelUsed.includes("(Gemini)") && idxRes.dim === 4);
      const hits = await rag.search("persistencia híbrida", 2);
      comprobar("LocalRAG search reutiliza embedGemini sin caer a hash cuando el índice es Gemini", hits.length >= 1 && callsGemini >= 2);
    } finally {
      globalThis.fetch = origFetch;
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
      fs.rmSync(tmpRag, { recursive: true, force: true });
    }
  }

  console.log(`\nResultado persistenciaHibrida: ${correctas} correctas · ${fallidas} fallidas`);
  assert.equal(fallidas, 0);
  // v1.0.42 — LA ASERCIÓN DE LIBUV EN WINDOWS (async.c:94).
  //
  // Raíz medida: aquí había `process.exit(0)`. `fetch` deja sockets keep-alive
  // del agente global y `process.exit` mata el bucle mientras libuv está
  // cerrando esos handles: en Windows eso dispara
  //   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94
  // El proceso moría DESPUÉS de los 17 ✓ y ANTES de imprimir el resumen, así
  // que el ritual lo contaba como «suite no ejecutada» con todo en verde.
  // Se sale por `exitCode` y se deja drenar el bucle: mismo veredicto, sin
  // matar handles a medio cerrar.
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(err);
  // Mismo motivo que arriba: matar el proceso desde el catch era justo el
  // segundo camino que reproducía la aserción de libuv.
  process.exitCode = 1;
});
