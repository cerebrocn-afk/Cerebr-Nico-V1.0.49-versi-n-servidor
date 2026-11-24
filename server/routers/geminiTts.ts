/**
 * server/routers/geminiTts.ts — v1.62.0
 * ============================================================================
 * 🎙️ GEMINI TTS — texto a voz con VARIAS VOCES (cloud).
 *
 * Antes soló existía `speechSynthesis` del navegador (1-2 voces del SO). Ahora el
 * botón «Escuchar» usa Gemini TTS (modelo gemini-2.5-flash-preview-tts) con 30
 * voces prebuilt y cae al navegador SOLO si no hay GEMINI_API_KEY o la llamada
 * falla. Doc: https://ai.google.dev/gemini-api/docs/speech-generation
 *
 * v1.62.0 · FASE 2 («partir, no añadir»): este dominio sale del monolito. El
 * contador de reescritura entre-turnos (v1.62.0, item 2) añadió líneas a
 * server.ts por encima del presupuesto; en vez de subir el techo, se EXTRAE un
 * bloque cohesivo (voces + conversión PCM→WAV + rutas /api/tts/*) que no tiene
 * acoplamiento con el estado del monolito salvo `getGenAI`, que se inyecta.
 */
import type { Request, Response, Application } from "express";
import type { GoogleGenAI } from "@google/genai";
import { clasificarErrorTTS, recortarDetalle } from "../ttsErrores";

/** 30 voces prebuilt de Gemini TTS (nombre + estilo). */
export const VOCES_GEMINI_TTS: Array<{ id: string; estilo: string }> = [
  { id: "Zephyr", estilo: "Brillante" },
  { id: "Puck", estilo: "Animada" },
  { id: "Charon", estilo: "Informativa" },
  { id: "Kore", estilo: "Firme" },
  { id: "Fenrir", estilo: "Entusiasta" },
  { id: "Leda", estilo: "Juvenil" },
  { id: "Orus", estilo: "Firme" },
  { id: "Aoede", estilo: "Despejada" },
  { id: "Callirrhoe", estilo: "Relajada" },
  { id: "Autonoe", estilo: "Brillante" },
  { id: "Enceladus", estilo: "Susurrante" },
  { id: "Iapetus", estilo: "Clara" },
  { id: "Umbriel", estilo: "Relajada" },
  { id: "Algieba", estilo: "Suave" },
  { id: "Despina", estilo: "Suave" },
  { id: "Erinome", estilo: "Clara" },
  { id: "Algenib", estilo: "Ronca" },
  { id: "Rasalgethi", estilo: "Informativa" },
  { id: "Laomedeia", estilo: "Animada" },
  { id: "Achernar", estilo: "Suave" },
  { id: "Alnilam", estilo: "Firme" },
  { id: "Schedar", estilo: "Plana" },
  { id: "Gacrux", estilo: "Madura" },
  { id: "Pulcherrima", estilo: "Decidida" },
  { id: "Achird", estilo: "Amigable" },
  { id: "Zubenelgenubi", estilo: "Casual" },
  { id: "Vindemiatrix", estilo: "Gentil" },
  { id: "Sadachbia", estilo: "Vivaz" },
  { id: "Sadaltager", estilo: "Erudita" },
  { id: "Sulafat", estilo: "C\u00e1lida" },
];

// v1.46.3 — ID REAL: el modelo TTS vigente de la API es `*-preview-tts`.
export const MODELO_GEMINI_TTS = "gemini-2.5-flash-preview-tts";

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Convierte PCM base64 (24 kHz, 16-bit, mono) en WAV base64 reproducible en <audio>. */
export function pcm16ToWavBase64(pcmBase64: string): string {
  const pcm = Buffer.from(pcmBase64, "base64");
  const numChannels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav.toString("base64");
}

/**
 * Registra las rutas de Gemini TTS. `getGenAI` se inyecta (UNA sola fuente de
 * verdad sobre las credenciales de nube vive en el monolito).
 */
export function registrarGeminiTts(
  app: Application,
  getGenAI: (explicitKey?: string) => GoogleGenAI | null,
): void {
  app.get("/api/tts/voices", (_req: Request, res: Response) => {
    res.json({ ok: true, voces: VOCES_GEMINI_TTS, modelo: MODELO_GEMINI_TTS });
  });

  app.post("/api/tts/gemini", async (req: Request, res: Response) => {
    const text = String(req.body?.text ?? "").trim();
    const voice = String(req.body?.voice ?? "Kore").trim();
    if (!text) return res.status(400).json({ ok: false, motivo: "No hay texto para leer." });
    if (text.length > 5000) return res.status(400).json({ ok: false, motivo: "Texto demasiado largo (m\u00e1x. 5000 caracteres)." });
    if (!VOCES_GEMINI_TTS.some((v) => v.id === voice)) {
      return res.status(400).json({ ok: false, motivo: `Voz \u00ab${voice}\u00bb no v\u00e1lida.` });
    }
    const apiKey = (req.headers["x-gemini-key"] as string) || process.env.GEMINI_API_KEY;
    const ai = getGenAI(apiKey);
    if (!ai) {
      return res.status(503).json({ ok: false, motivo: "Falta GEMINI_API_KEY. Sin clave se usa la voz del navegador." });
    }

    // Retry: Gemini TTS devuelve ocasionalmente tokens de texto en vez de audio (500).
    //
    // v1.13.0 — PERO NO SE REINTENTA LO QUE NO VA A MEJORAR.
    // Con la cuota agotada (429) o una clave inv\u00e1lida, insistir tres veces solo
    // retrasa la ca\u00edda a la voz del navegador, gasta m\u00e1s cuota y acaba ense\u00f1ando un
    // volcado de JSON. `clasificarErrorTTS` dice qu\u00e9 es y si tiene sentido insistir.
    let lastErr: any = null;
    let ultimo = clasificarErrorTTS(null);
    for (let intento = 0; intento < 3; intento++) {
      try {
        const resp: any = await ai.models.generateContent({
          model: MODELO_GEMINI_TTS,
          // v1.57.21 — el texto VIAJA SOLO: este modelo lee TODO lo que recibe y
          // la consigna «Lee en voz alta…» empezaba SONANDO en el audio (ver CHANGELOG).
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          } as any,
        });
        const data = resp?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!data) throw new Error("la respuesta no trajo audio (vino texto).");
        const wavBase64 = pcm16ToWavBase64(data);
        return res.json({ ok: true, audioBase64: wavBase64, mime: "audio/wav", voice, modelo: MODELO_GEMINI_TTS });
      } catch (err: any) {
        lastErr = err;
        ultimo = clasificarErrorTTS(err);
        if (!ultimo.reintentable) break; // cuota/clave: no se arregla insistiendo
        await sleepMs(160 * (intento + 1));
      }
    }
    // Al usuario, la causa en una frase; el volcado de Google, al registro.
    return res.status(502).json({
      ok: false,
      clase: ultimo.clase,
      motivo: ultimo.motivo,
      detalle: recortarDetalle(lastErr),
    });
  });
}
