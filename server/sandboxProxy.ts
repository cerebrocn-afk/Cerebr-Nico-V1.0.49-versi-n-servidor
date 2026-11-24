import http from "node:http";
import type { NextFunction, Request, Response } from "express";

const PREFIX = "/sandbox-preview";

function reescribirHtmlProxy(html: string): string {
  // Reescribe rutas absolutas de raíz (href="/...", src="/...", action="/...", "/vendor/...")
  // evitando protocol-relative ("//...") o rutas que ya incluyen /sandbox-preview/
  let out = html.replace(
    /(\b(?:src|href|action|poster)\s*=\s*["'])\/(?!\/|sandbox-preview\/)/gi,
    `$1${PREFIX}/`
  );
  // Importmaps (ej. three.js en /vendor/three/...)
  out = out.replace(
    /(["'])\/(vendor\/)/g,
    `$1${PREFIX}/$2`
  );
  return out;
}

function esReferrerDeSandbox(req: Request): boolean {
  const ref = req.headers.referer;
  if (!ref) return false;
  try {
    const u = new URL(ref);
    return u.pathname === PREFIX || u.pathname.startsWith(`${PREFIX}/`);
  } catch {
    return false;
  }
}

export function crearMiddlewareSandboxProxy(opts: {
  sandboxPort: number;
  sandboxVivo: () => boolean;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origUrl = req.originalUrl || req.url || "/";
    const esRutaPrefijo =
      origUrl === PREFIX ||
      origUrl.startsWith(`${PREFIX}/`) ||
      origUrl.startsWith(`${PREFIX}?`);

    const esRutaReferida =
      !esRutaPrefijo &&
      !origUrl.startsWith("/api/") &&
      origUrl !== "/favicon.ico" &&
      origUrl !== "/icono-cerebronico.png" &&
      opts.sandboxVivo() &&
      esReferrerDeSandbox(req);

    if (!esRutaPrefijo && !esRutaReferida) {
      return next();
    }

    let targetPath = origUrl;
    if (esRutaPrefijo) {
      targetPath = origUrl.slice(PREFIX.length) || "/";
      if (targetPath.startsWith("?")) targetPath = "/" + targetPath;
      if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
    }

    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    headers.host = `127.0.0.1:${opts.sandboxPort}`;
    // Evitar respuestas comprimidas si es HTML que debemos adaptar al prefijo
    if (esRutaPrefijo) {
      delete headers["accept-encoding"];
    }

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: opts.sandboxPort,
        path: targetPath,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        const status = proxyRes.statusCode || 200;
        const outHeaders: http.OutgoingHttpHeaders = { ...proxyRes.headers };
        delete outHeaders["x-frame-options"];
        if (typeof outHeaders["location"] === "string" && outHeaders["location"].startsWith("/")) {
          if (!outHeaders["location"].startsWith(PREFIX)) {
            outHeaders["location"] = PREFIX + outHeaders["location"];
          }
        }
        const ct = String(outHeaders["content-type"] || "").toLowerCase();
        if (ct.includes("text/html")) {
          const chunks: Buffer[] = [];
          proxyRes.on("data", (c: Buffer) => chunks.push(c));
          proxyRes.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            const rewritten = reescribirHtmlProxy(raw);
            delete outHeaders["content-length"];
            delete outHeaders["content-encoding"];
            res.writeHead(status, outHeaders);
            res.end(rewritten);
          });
          return;
        }
        res.writeHead(status, outHeaders);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", () => {
      if (res.headersSent) return;
      const acceptsHtml = String(req.headers.accept || "").includes("text/html");
      if (acceptsHtml) {
        res.status(503).type("html").send(
          `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Sandbox apagado</title></head>` +
            `<body style="margin:0;background:#05070d;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center">` +
            `<div style="max-width:440px;padding:24px;border:1px solid #1e293b;border-radius:12px;background:#0b1120">` +
            `<h2 style="margin:0 0 8px;font-size:16px;color:#38bdf8">Sandbox (:${opts.sandboxPort}) apagado</h2>` +
            `<p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8">El previsualizador nace bajo demanda. Pulsa <strong>Arrancar ahora</strong> en el panel Sandbox para iniciar el proyecto.</p>` +
            `</div></body></html>`
        );
      } else {
        res.status(503).json({
          ok: false,
          error: `Sandbox apagado en :${opts.sandboxPort}`,
        });
      }
    });

    if (req.readable && req.method !== "GET" && req.method !== "HEAD") {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  };
}
