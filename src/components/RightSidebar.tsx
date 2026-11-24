import React, { useEffect, useRef, useState } from "react";
// v1.83.0 · FASE 4: la botonera del explorador deja de gritar — registro puro en
// src/engine/contratoSuperficie.ts, pieza visual en ./Avanzado.
import { Avanzado } from "./Avanzado";
// v1.56.9 · exportar → APK con un clic (vivir aquí, no en este monstruo de 1800
// líneas: el panel trae su propio estado y su propio sondeo).
import { PanelAndroid } from "./PanelAndroid";
import {
  Check,
  Code,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  Loader2,
  Paperclip,
  Play,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  Zap,
  ChevronDown,
  ChevronRight,
  X,
  FilePlus2,
  AlertTriangle,
  Power,
  RefreshCw,
} from "lucide-react";
import { WorkspaceFile } from "../types";
import { insigniaArbol, inferirArbol, contarArboles } from "../utils/arbolWorkspace"; // v1.60.5 — insignia 📥/🏗️ por archivo + conteo
import { CodeEditor } from "./CodeEditor";
// v1.6.33 · CATÁLOGO HONESTO: aquí vivía `import { SKILLS_LIST_100, SkillDefinition }`
// sin un solo uso (grep: 1 sola aparición, la del propio import). Se retira:
// el catálogo honesto ya se consume desde contextCache/catalogoHonesto.
import { LS_KEYS, SANDBOX_URL as SANDBOX_URL_CONST, resolverUrlSandbox, IDE_BRAND, EXPLORER_LIMITS } from "../constants";
import { urlConAntiCache } from "../utils/previewAntiCache";
import { decidirVigiliaSandbox } from "../engine/estadoSandbox"; // v1.84.3 — el vigía decide sobre datos, no sobre la ausencia de puerto
// v1.90.1 · decisión PURA de foco del preview (el teclado llega a la app del :3500).
import { decidirAccionFoco, type EventoPreview } from "../engine/focoPreview";

const SANDBOX_URL = typeof window !== "undefined" ? resolverUrlSandbox() : SANDBOX_URL_CONST;

// v1.43.0 lote 3 — 🐞 EL FOCO SE QUEDA ATRAPADO EN EL IFRAME AL BORRAR
// -------------------------------------------------------------------
// BUG REPORTADO (Mario): «cuando BORRO los archivos del sandbox se tranca el
// click del chat y tengo que minimizar/reabrir para que ande». Causa real:
// al borrar / Forzar Limpieza, el <iframe> de :3500 (otro documento) se destruye
// y se remonta. Chromium/Electron deja el FOCO nativo colgado del frame que ya
// no existe, así que la ventana padre deja de enrutar clics: el chat queda
// «muerto» hasta minimizar/reabrir — justo lo que fuerza un ciclo de foco.
// ARREGLO: tras cada destrucción/remontaje del iframe devolvemos el foco a la
// ventana a mano. Mismo efecto que minimizar/reabrir, pero automático e
// invisible. Es la red de seguridad hermana del «velo» del resize.
export function rescatarFocoDeLaVentana() {
  try {
    const activo = document.activeElement as HTMLElement | null;
    if (activo && activo.tagName === "IFRAME" && typeof activo.blur === "function") activo.blur();
  } catch {}
  try { window.focus(); } catch {}
  // Un segundo pase en el siguiente frame: cubre el caso en que el iframe toma
  // el foco justo al terminar de montarse (onload tardío).
  try {
    requestAnimationFrame(() => {
      try {
        const a2 = document.activeElement as HTMLElement | null;
        if (a2 && a2.tagName === "IFRAME" && typeof a2.blur === "function") a2.blur();
      } catch {}
      try { window.focus(); } catch {}
    });
  } catch {}
}

interface RightSidebarProps {
  files: WorkspaceFile[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCloseFile: (fileId: string) => void;
  onUpdateFileContent: (fileId: string, newContent: string) => void;
  onCreateNewFile: () => void;
  onPromoteFile?: (fileId: string) => void; // v1.60.5 — promover de árbol Entrada (📥) a Sandbox (🏗️)
  onDeleteFile: (fileId: string) => void;
  onAttachFiles: (files: File[]) => void;
  onDeleteAllFiles: () => void;
  onRestoreTemplate?: () => void;
  onDownloadZip: () => void;
  terminalLogs: string[];
  onSyncProject?: () => Promise<number> | undefined;
  onAutoSync?: () => Promise<number> | undefined;
  onPullProject?: () => void;
  onBuildProject?: () => void;
  /** v1.72.0 — estado visible del bucle autonomo «compilar y corregir». */
  buildFix?: { active: boolean; iteration: number; max: number };
  // 🔧 Soporte extensión .cn (CerebroNico) para guardar/abrir workspace completo
  onExportCnFile?: () => void;
  onImportCnFile?: (file: File) => void;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) {
    return <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
  }
  if (["json"].includes(ext)) {
    return <FileJson className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  if (["md", "txt", "rtf", "doc"].includes(ext)) {
    return <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  }
  return <FileCode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
}

// ============================================================
// ÁRBOL DE ARCHIVOS VERTICAL (estilo explorador lateral)
// ============================================================
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  file?: WorkspaceFile;
  children: TreeNode[];
}

function buildFileTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isFolder: true, children: [] };
  for (const f of files) {
    const parts = (f.path || f.name).split("/").filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const p = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.name === part && c.isFolder === !isLast);
      if (!next) {
        next = {
          name: part,
          path: p,
          isFolder: !isLast,
          file: isLast ? f : undefined,
          children: [],
        };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children;
}

const FileRow: React.FC<{
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  collapsed: Set<string>;
  toggleFolder: (path: string) => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onPromote?: (id: string) => void; // v1.60.5
}> = ({ node, depth, activeFileId, collapsed, toggleFolder, onSelect, onClose, onPromote }) => {
  if (node.isFolder) {
    const isCollapsed = collapsed.has(node.path);
    return (
      <div>
        <button
          onClick={() => toggleFolder(node.path)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-zinc-300 hover:bg-zinc-800/60 transition-colors text-left select-none"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          title={node.path}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
          )}
          {isCollapsed ? (
            <Folder className="w-3.5 h-3.5 text-cyan-500/80 shrink-0" />
          ) : (
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}
          <span className="truncate text-xs font-medium">{node.name}</span>
          <span className="ml-auto text-[9px] text-zinc-600 font-mono shrink-0">
            {node.children.length}
          </span>
        </button>
        {!isCollapsed && (
          <div>
            {node.children.map((child) => (
              <FileRow
                key={child.path + (child.isFolder ? "/" : "")}
                node={child}
                depth={depth + 1}
                activeFileId={activeFileId}
                collapsed={collapsed}
                toggleFolder={toggleFolder}
                onSelect={onSelect}
                onClose={onClose}
                onPromote={onPromote}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFileId === node.file?.id;
  return (
    <div
      onClick={() => node.file && onSelect(node.file.id)}
      title={node.path}
      className={`group flex items-center gap-1.5 pr-1.5 py-1.5 rounded-md cursor-pointer transition-colors text-left select-none ${
        isActive
          ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border border-transparent"
      }`}
      style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
    >
      {getFileIcon(node.name)}
      <span className="truncate text-xs font-mono flex-1">{node.name}</span>
      {/* v1.60.5 — insignia de árbol: 📥 Entrada (adjunto en aduana) / 🏗️ Sandbox */}
      {node.file && (() => {
        const ins = insigniaArbol(inferirArbol(node.file));
        return (
          <span className="text-[11px] shrink-0 select-none" title={ins.titulo}>
            {ins.icono}
          </span>
        );
      })()}
      {/* v1.60.5 — PROMOVER solo en archivos del árbol de Entrada */}
      {node.file && onPromote && inferirArbol(node.file) === "entrada" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (node.file) onPromote(node.file.id);
          }}
          className="opacity-0 group-hover:opacity-100 hover:bg-emerald-600/30 p-0.5 rounded text-emerald-400 hover:text-emerald-300 transition-opacity shrink-0"
          title="Promover a Sandbox (🏗️)"
        >
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
      {node.file?.modified && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Modificado" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (node.file) onClose(node.file.id);
        }}
        className="opacity-0 group-hover:opacity-100 hover:bg-zinc-700/80 p-0.5 rounded text-zinc-500 hover:text-zinc-200 transition-opacity shrink-0"
        title="Cerrar archivo"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export const RightSidebar: React.FC<RightSidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCloseFile,
  onUpdateFileContent,
  onCreateNewFile,
  onPromoteFile,
  onDeleteFile,
  onAttachFiles,
  onDeleteAllFiles,
  onRestoreTemplate,
  onDownloadZip,
  terminalLogs,
  onSyncProject,
  onAutoSync,
  onPullProject,
  onBuildProject,
  buildFix,
  onExportCnFile,
  onImportCnFile,
}) => {
  const SANDBOX_URL = (window as any).__CN_SERVER_PREVIEW__ || SANDBOX_URL_CONST;
  const [activeTab, setActiveTab] = useState<"sandbox" | "editor" | "deliverables" | "terminal">(
    "editor"
  );
  const [fileSearch, setFileSearch] = useState("");
  // v1.72.0 — FUERA skillSearch / selectedSkillCategory: quedaron del panel
  // «Skills (100)», eliminado a propósito en v1.6.33 (las skills las inyecta el
  // motor desde contextCache.ts, no se listan ni se activan desde la barra).
  // Sobrevivían como dos useState sin una sola lectura: ni buscador ni filtro
  // operaban sobre nada. Ver nota en la pestaña, línea ~1087.
  const [copied, setCopied] = useState(false);

  // Árbol vertical: carpetas colapsadas (por defecto todo expandido)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // ============================================================
  // v2.1 — DESPLAZADOR DEL EXPLORADOR (pedido dos veces).
  // ------------------------------------------------------------
  // La columna del árbol estaba FIJADA a 210 px, así que los nombres largos de
  // archivo se cortaban ("back…", "ma…", "vit…") y no había forma de leerlos
  // porque el ancho no se podía mover. Ahora hay una barra arrastrable entre el
  // árbol y el editor, con el ancho recordado entre sesiones.
  // ============================================================
  const [explorerWidth, setExplorerWidth] = useState<number>(() => {
    try {
      const guardado = Number(localStorage.getItem(LS_KEYS.EXPLORER_WIDTH));
      if (Number.isFinite(guardado) && guardado >= EXPLORER_LIMITS.MIN && guardado <= EXPLORER_LIMITS.MAX) {
        return guardado;
      }
    } catch {}
    return EXPLORER_LIMITS.DEFAULT;
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.EXPLORER_WIDTH, String(explorerWidth));
    } catch {}
  }, [explorerWidth]);

  /** Arrastre horizontal del desplazador del explorador. */
  const startExplorerDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = explorerWidth;
    const mover = (ev: MouseEvent) => {
      const nuevo = Math.max(
        EXPLORER_LIMITS.MIN,
        Math.min(EXPLORER_LIMITS.MAX, w0 + (ev.clientX - x0))
      );
      setExplorerWidth(nuevo);
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  };
  const toggleFolder = (p: string) =>
    setCollapsedFolders((prev) => {
      const nx = new Set(prev);
      nx.has(p) ? nx.delete(p) : nx.add(p);
      return nx;
    });

  // Real terminal state
  const [commandInput, setCommandInput] = useState("");
  const [termLines, setTermLines] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const termEndRef = useRef<HTMLDivElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  // 🔧 Ref para el input oculto de importar archivos .cn (CerebroNico)
  const cnImportInputRef = useRef<HTMLInputElement>(null);

  // 🔧 ANTI-BUCLE: contador de reintentos consecutivos del autopiloto con backoff.
  // Si sandboxAutoPilot falla N veces seguidas, espera exponencialmente antes de
  // reintentar (1s, 2s, 4s, 8s… hasta 60s) para no saturar la CPU intentando
  // levantar el puerto 3500 cada milisegundo.
  const sbRetryCountRef = useRef(0);
  const sbNextRetryAtRef = useRef(0); // timestamp ms

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [termLines, activeTab]);

  const runCommand = async () => {
    const cmd = commandInput.trim();
    if (!cmd || isRunning) return;
    setIsRunning(true);
    setTermLines((prev) => [...prev, `$ ${cmd}`]);
    setCmdHistory((prev) => [cmd, ...prev].slice(0, 50));
    setHistoryIdx(-1);
    setCommandInput("");
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, timeoutMs: 120000 }),
      });
      const data = await res.json();
      const out: string[] = [];
      if (data.stdout) out.push(...data.stdout.replace(/\n$/, "").split("\n"));
      if (data.stderr) out.push(...data.stderr.replace(/\n$/, "").split("\n"));
      out.push(
        data.exitCode === 0
          ? "[ok]"
          : `[exit ${data.exitCode}]${data.timedOut ? " (timeout)" : ""}${data.error ? ` ${data.error}` : ""}`
      );
      setTermLines((prev) => [...prev, ...out]);
    } catch (err: any) {
      setTermLines((prev) => [...prev, `[error] ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const activeFile = files.find((f) => f.id === activeFileId) || files[0] || null;

  const handleCopyCode = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadSingleFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ============================================================
  // SANDBOX 100% AUTOMÁTICO (puerto 3500, sin chocar con la IDE :3000)
  // Piloto automático: sincroniza -> instala -> arranca -> preview vivo
  // ============================================================
  const [sbOnline, setSbOnline] = useState<boolean>(false);
  const [sbInstalled, setSbInstalled] = useState<boolean>(false);
  const [sbHasProject, setSbHasProject] = useState<boolean>(false);
  const [sbBusy, setSbBusy] = useState<string | null>(null); // 'install' | 'start' | 'stop' | 'auto' | null
  // v1.0.16 · BARRA LIMPIA DEL SANDBOX (Mario, pedido explícito «quitar todo,
  // solo un botón»): la botonera secundaria (AUTO, Sync, Pull, npm install,
  // Detener, Reiniciar, Recargar, Forzar Limpieza, Abrir) se retiró de la barra.
  // Solo queda el botón verde «Arrancar ahora / Reiniciar preview». El piloto
  // automático sigue vivo por dentro; esas acciones viven aún en la pestaña
  // Terminal (Sync/Pull) y en el flujo automático, no en esta barra.
  // v2.1 — El historial del sandbox se restaura al volver. El trabajo sigue en
  // el servidor (npm install, arranque), pero el log era estado del componente:
  // si el panel se desmontaba, el historial desaparecía y parecía que la tarea
  // se había detenido.
  const [sbLogs, setSbLogs] = useState<string[]>(() => {
    try {
      // CONSOLA LIMPIA v1 (a pedido de Mario): cada apertura de la interfaz
      // arranca sin diálogo previo. El registro vive en memoria durante la
      // sesión; ya no se resucita entre arranques.
      const g: string[] = [];
      return Array.isArray(g) ? g.slice(-40) : [];
    } catch {
      return [];
    }
  });
  const [iframeKey, setIframeKey] = useState(0);
  useEffect(() => { const refrescar = () => setIframeKey(k => k + 1); window.addEventListener("cn:server-workspace", refrescar); return () => window.removeEventListener("cn:server-workspace", refrescar); }, []);
  const forzandoRef = useRef(false); // FUERZA v1
  // v1.16.5 — RECURSIÓN v2: la copia anidada de la propia IDE ya NO se
  // arranca "con aviso" automático. El primer clic informa; el SEGUNDO clic
  // confirma. (El auto-continuo de v1 encendía dos IDEs compartiendo RAM y el
  // preview "se quedaba": el arranque que el usuario esperaba de SU app nunca
  // llegaba porque lo que arrancaba era la propia IDE dentro del sandbox.)
  const recursionPendienteRef = useRef(false);
  // v1.97.0 · LA PUERTA DE LA RAÍZ (ok de Mario, 30/10). Cuando el server responde
  // `pide_eleccion_de_raiz` NO se arranca nada y este estado guarda la pregunta con sus
  // opciones. Antes la única alternativa era servir el entregable más reciente en silencio —
  // de ahí «lo que se ve es un proyecto viejo» y el reinicio manual de puertos.
  const [elegirRaiz, setElegirRaiz] = useState<{ raiz: string; candidatos: { ruta: string; nombre: string }[]; aviso: string } | null>(null);
  // 🔧 Estado del src del iframe: cuando se vacía (""), el iframe se desmontea
  // completamente (destrucción del contexto), matando cualquier página fantasma.
  const [iframeSrc, setIframeSrc] = useState<string>(SANDBOX_URL);
  // v1.95.1 · QUÉ ESTÁ SERVIDIENDO EL :3500, EN PANTALLA (Mario, 30/10: «en el
  // previsualizador está una cosa y si toco Abrir abre otro proyecto viejo, de otra
  // versión — así podía corroborar que la IDE es capaz de crear y soportar su propio
  // código»). `/api/sandbox/status` devuelve `raizSandbox` y `raizProyectoResuelta`
  // ABSOLUTAS desde la v8.0.4, pero este panel solo leía `online`, `installed` y
  // `hasProject` (:565-569): la identidad existía y se tiraba a la basura. Sin ella,
  // «está lo mismo» no se puede corroborar ni refutar, y el usuario tiene que abrir
  // una pestaña del navegador para enterarse — que es justo lo que hizo.
  const [raizServida, setRaizServida] = useState<string>("");
  const [sirveRaizWorkspace, setSirveRaizWorkspace] = useState<boolean>(false);

  // Piloto automático (ON por defecto): el preview se levanta y mantiene solo.
  // v1.78.0 · EL SANDBOX SE AUTOMATIZÓ SOLO (Mario 26/10: «automatiza el
  // sandbox, quita los botones y pasa todo a segundo plano automático»):
  //   · arranca en ON siempre;
  //   · un «0» viejo en localStorage — dejado por el sandbox cuando se rindió
  //     con el editor vacío o sin proyecto, no por orden del usuario — se
  //     migra a ON UNA sola vez (clave versionada);
  //   · si a partir de ahora el usuario lo apaga a mano desde ⚙ Avanzado, se
  //     respeta su decisión hasta que él lo vuelva a encender.
  const [sbAuto, setSbAuto] = useState<boolean>(() => {
    try {
      const MIGRACION = "codigo0_sandbox_auto_v178";
      if (localStorage.getItem(MIGRACION) !== "1") {
        localStorage.setItem(MIGRACION, "1");
        localStorage.setItem(LS_KEYS.SANDBOX_AUTO, "1");
        return true;
      }
    } catch {}
    return localStorage.getItem(LS_KEYS.SANDBOX_AUTO) !== "0";
  });
  const [sbPhase, setSbPhase] = useState<string>("idle"); // idle|sync|install|start|wait|live|error
  const sbAutoRef = useRef(sbAuto);
  sbAutoRef.current = sbAuto;
  const sbOnlineRef = useRef(false);
  const sbWorkingRef = useRef(false);
  const everLiveRef = useRef(false);
  // v1.84.3 — ritmo del aviso "proceso vivo, esperando primera compilación"
  // (uno cada 30 s como máximo, para no llenar el log mientras Vite despierta).
  const avisoArranqueVivoRef = useRef(0);
  // 🔧 v1.70.0 — PREVIEW HONESTO (sesión 1792793541672: «el previsualizador no
  // termina de cargar pero en localhost:3500 está la página»). El <iframe> no
  // tenía onLoad ni onError: si la carga moría, NADA lo sabía, y el único
  // refresco de URL ocurría en la PRIMERA transición a vivo (:520 y :822, ambas
  // bajo if (!everLiveRef.current)). Con un arranque lento la primera carga se
  // iba al vacío y el panel se quedaba mirando una request muerta mientras el
  // servidor ya respondía — exactamente el síntoma reportado.
  const cargaVivaRef = useRef(false);
  // v1.90.1 · referencia al iframe del preview: sin esto, la tecla caía en el IDE
  // (:3000) y cualquier app de teclado del :3500 no arrancaba.
  const previewRef = useRef<HTMLIFrameElement>(null);
  const aplicarFocoPreview = (evento: EventoPreview) => {
    const { accion } = decidirAccionFoco(evento, cargaVivaRef.current);
    if (accion === "rescate-ventana") { rescatarFocoDeLaVentana(); return; }
    if (accion === "foco-iframe") {
      try { previewRef.current?.focus({ preventScroll: true } as FocusOptions); } catch { try { previewRef.current?.focus(); } catch {} }
    }
  };
  const reintentosPreviewRef = useRef(0);
  const [previewSinCarga, setPreviewSinCarga] = useState<boolean>(false);
  const sbPhaseRef = useRef<string>("idle");
  const setPhase = (p: string) => {
    sbPhaseRef.current = p;
    setSbPhase(p);
  };

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.SANDBOX_AUTO, sbAuto ? "1" : "0");
    } catch {}
  }, [sbAuto]);

  const sbLog = (line: string) =>
    setSbLogs((prev) => {
      const next = [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${line}`];
      // v2.1 — Se persiste cada línea para que el historial sobreviva al cambio
      // de vista (ver la inicialización de sbLogs).
      try {
        localStorage.setItem(LS_KEYS.SANDBOX_LOG, JSON.stringify(next));
      } catch {}
      return next;
    });

  // v1.43.0 — BORRAR TODO EL LOG DEL SANDBOX (a pedido de Mario): vacía el
  // registro en memoria Y el espejo persistido en localStorage, para que la
  // consola quede limpia de verdad (no vuelve a resucitar al cambiar de vista).
  const limpiarSbLog = () => {
    setSbLogs([]);
    try {
      localStorage.removeItem(LS_KEYS.SANDBOX_LOG);
    } catch {}
  };

  const refreshSandboxStatus = async () => {
    try {
      const res = await fetch("/api/sandbox/status");
      const d = await res.json();
      const online = Boolean(d.online);
      setSbOnline(online);
      sbOnlineRef.current = online;
      setSbInstalled(Boolean(d.installed));
      setSbHasProject(Boolean(d.hasProject));
      // Identidad: la raíz que el sandbox RESOLVIÓ contra la raíz del workspace.
      const raizRes: string = String(d.raizProyectoResuelta || "");
      const raizWs: string = String(d.raizSandbox || "");
      setRaizServida(raizRes);
      setSirveRaizWorkspace(Boolean(raizRes && raizWs && raizRes === raizWs));
      if (online) {
        // 🔧 Restaurar el src del iframe si estaba vacío (tras un Forzar Limpieza)
        if (!iframeSrc) setIframeSrc(SANDBOX_URL);
        if (!everLiveRef.current) {
          everLiveRef.current = true;
          setIframeKey((k) => k + 1);
        }
        if (sbPhaseRef.current !== "live") setPhase("live");
      } else if (sbPhaseRef.current === "live") {
        setPhase("idle");
      }
      return d;
    } catch {
      setSbOnline(false);
      sbOnlineRef.current = false;
      return null;
    }
  };

  // Piloto automático: hace TODO el flujo sin que el usuario toque un botón
  const sandboxAutoPilot = async () => {
    if (sbWorkingRef.current || !sbAutoRef.current) return;
    // 🔧 ANTI-BUCLE: respetar backoff exponencial — si reintentos consecutivos fallaron,
    // esperar hasta sbNextRetryAtRef antes de intentar de nuevo.
    const now = Date.now();
    if (now < sbNextRetryAtRef.current) {
      const waitS = Math.ceil((sbNextRetryAtRef.current - now) / 1000);
      sbLog(`AUTO · Esperando ${waitS}s antes de reintentar (backoff anti-zombies)…`);
      return;
    }

    // 🔧 FIX CRÍTICO: si el workspace del editor está vacío, NO intentar arrancar el sandbox.
    // Antes el autopilot seguía en bucle: sincronizaba (0 archivos), npm install, arrancar → error.
    if (files.length === 0) {
      sbLog("AUTO · ⚠️ Workspace del editor vacío. El sandbox necesita al menos package.json para arrancar.");
      sbLog("AUTO · Solución: 1) Usa 'Plantilla' en el explorador para restaurar la plantilla base, o 2) Crea/abre un proyecto .cn. Luego vuelve aquí y pulsa 'Arrancar ahora'.");
      // v1.78.0 · EL PILOTO YA NO SE RINDE SOLO: un editor vacío es un estado
      // transitorio (el chat está por escribir los archivos), no una orden de
      // apagarse hasta el próximo arranque del navegador. Espera 60 s y
      // reintenta por su cuenta; el usuario no toca nada.
      sbNextRetryAtRef.current = Date.now() + 60000;
      setPhase("idle");
      return;
    }

    sbWorkingRef.current = true;
    setSbBusy("auto");
    try {
      let st: any = await refreshSandboxStatus();
      if (st?.online) {
        // 🔧 ÉXITO: reiniciar contador de backoff
        sbRetryCountRef.current = 0;
        sbNextRetryAtRef.current = 0;
        return; // ya está vivo, nada que hacer
      }

      // 1) Sincronizar el workspace del editor al sandbox (disco real)
      setPhase("sync");
      sbLog("AUTO · Sincronizando archivos del editor al sandbox…");
      try {
        const written = await (onAutoSync || onSyncProject)?.();
        if (typeof written === "number") {
          sbLog(`AUTO · ${written} archivo(s) escrito(s) en .proyectos/.`);
        }
      } catch (e: any) {
        sbLog(`AUTO · Error al sincronizar: ${e?.message || e}`);
      }

      st = await refreshSandboxStatus();

      // ============================================================
      // v2.0 — ANTES DE RENDIRSE: ¿está el proyecto en una subcarpeta?
      // ------------------------------------------------------------
      // Caso real: subes un ZIP y el sandbox dice "no se encontró package.json".
      // El package.json EXISTÍA, pero un nivel más adentro (el ZIP traía carpeta
      // contenedora: Proyecto/ide/backend/package.json). El motor ahora busca por
      // niveles y, si lo encuentra, aplana la raíz y sigue arrancando solo.
      // ============================================================
      // ============================================================
      // v2.1 — 🐞 FUSIONAR TAMBIÉN CUANDO LA RAÍZ YA TIENE PROYECTO.
      // ------------------------------------------------------------
      // Antes esto solo se ejecutaba `if (!st.hasProject)`. Pero el sync escribe
      // SIEMPRE el árbol anidado (el workspace guarda las rutas con su carpeta
      // contenedora), así que en cuanto la raíz tuvo un package.json —cosa que
      // pasa en el primer aplanado— la condición nunca volvía a cumplirse y el
      // proyecto nuevo se quedaba dentro SIN SUBIR, para siempre.
      // Si el «src» de la raíz era viejo, el preview cargaba el título y devolvía
      // 404 en todos los /src/components/*.
      // Ahora, si el sandbox informa de una copia anidada, se fusiona: manda la
      // versión del editor.
      // ============================================================
      const copiaAnidada = String((st as any)?.paqueteAnidado || "");
      if (!st?.hasProject || copiaAnidada) {
        const candidates = (st as any)?.packageJsonCandidates as string[] | undefined;
        if (copiaAnidada) {
          sbLog(`AUTO · El editor tiene una copia más nueva del proyecto en «${copiaAnidada}/». Fusionándola con la raíz…`);
        } else if (candidates && candidates.length > 0) {
          sbLog(`AUTO · El package.json está en «${candidates[0]}/», no en la raíz del sandbox. Aplanando la raíz…`);
        }
        if (copiaAnidada || (candidates && candidates.length > 0)) {
          try {
            const r = await fetch("/api/sandbox/flatten-root", { method: "POST" });
            const j = await r.json().catch(() => ({}));
            sbLog(`AUTO · ${j?.message || (j?.ok ? "Raíz aplanada." : "No se pudo aplanar la raíz.")}`);
            // v2.1 — el aplanado ahora también FUNDE lo que ya existía en la raíz
            // (antes lo saltaba en silencio y dejaba un «src» viejo para siempre).
            // Cuenta como cambio cualquiera de las tres cosas.
            if (j?.ok && (j?.moved || 0) + (j?.merged || 0) + (j?.replaced || 0) > 0) {
              st = await refreshSandboxStatus();
              if (st?.hasProject) {
                sbLog("AUTO · ✅ Proyecto detectado en la raíz tras aplanar. Continuando con el arranque…");
              }
            }
          } catch (e: any) {
            sbLog(`AUTO · Error al aplanar la raíz: ${e?.message || e}`);
          }
        }
      }

      // ============================================================
      // v8.0.4 — 🐞 ESTE MENSAJE ERA FALSO Y ADEMÁS DESVIABA AL MODELO
      // ------------------------------------------------------------
      // Decía, literal: «❌ No se encontró package.json en el sandbox tras
      // sincronizar» + «Solución: asegúrate de que tu workspace tenga un
      // package.json». Dos problemas, y el segundo hizo daño real:
      //
      //  · Es FALSO como diagnóstico: el sandbox acepta muchos marcadores
      //    (ADUANA v2) y una web estática con index.html es un proyecto válido
      //    que no necesita npm. Decir «falta package.json» cuando lo que hay es
      //    una web perfecta es diagnosticar la enfermedad equivocada.
      //  · Es una ORDEN para el modelo. El log del usuario lo enseña: el modelo
      //    leyó ese texto y respondió «el sandbox no tiene un proyecto
      //    reconocido; voy a crear un proyecto Node.js básico». Se puso a
      //    montar un proyecto npm que el usuario NO necesitaba, por culpa de una
      //    frase nuestra.
      //
      // El mensaje ahora informa de lo que de verdad ha pasado, y si no hay nada
      // reconocible DICE DÓNDE se ha buscado y qué había ahí. Adivinar es lo que
      // convirtió un preview en blanco en una tarde de vueltas.
      // ============================================================
      if (!st?.hasProject) {
        const donde = String((st as any)?.buscadoEn || ".proyectos");
        const contenido: string[] = Array.isArray((st as any)?.contenidoRaiz) ? (st as any).contenidoRaiz : [];
        sbLog("AUTO · ❌ No hay ningún proyecto reconocible en el sandbox tras sincronizar.");
        sbLog(
          `AUTO · Buscado en: ${donde} (y hasta 3 niveles de subcarpetas). Contenido de la raíz: ` +
            (contenido.length ? contenido.join(", ") : "vacía o ilegible")
        );
        // Alternativas REALES, en orden de coste. Se dice el marcador que sirve
        // para cada caso en vez de prescribir package.json a ciegas.
        sbLog(
          "AUTO · Qué sirve como proyecto: una web con index.html (no necesita npm), o bien package.json, " +
            "requirements.txt, Cargo.toml, go.mod, pom.xml, Dockerfile o Makefile. Con index.html el sandbox " +
            "lo sirve tal cual en :3500."
        );
        sbLog(
          "AUTO · Si el modelo escribió la web dentro de una subcarpeta, pulsa 'Sync' y el sandbox la detectará " +
            "ella sola; si el workspace está vacío, usa 'Plantilla' o 'Abrir .cn'."
        );
        // v1.78.0 · antes esto APAGABA el piloto (captura 26/10: «AUTO OFF» con
        // el chat trabajando). El proyecto puede estar a mitad de escritura
        // por el propio motor: apagar era perder el preview por un timing.
        // Ahora espera 60 s y reintenta solo, sin salir del piloto.
        setPhase("idle");
        sbRetryCountRef.current = 0;
        sbNextRetryAtRef.current = Date.now() + 60000;
        return;
      }

      // 2) Instalar dependencias solo si faltan (normalmente solo la 1ª vez)
      if (st && !st.installed) {
        setPhase("install");
        sbLog("AUTO · npm install en curso (solo la primera vez, puede tardar)…");
        try {
          const res = await fetch("/api/exec", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "npm install --no-audit --no-fund", timeoutMs: 300000 }),
          });
          const d = await res.json();
          if (d.exitCode === 0) {
            sbLog("AUTO · Dependencias instaladas correctamente.");
          } else {
            sbLog(`AUTO · npm install con errores: ${(d.stderr || d.error || "").slice(-240)}`);
          }
        } catch (e: any) {
          sbLog(`AUTO · Error instalando: ${e.message}`);
        }
      }

      // 3) Arrancar el servidor del proyecto en el puerto 3500
      setPhase("start");
      sbLog("AUTO · Arrancando la app del sandbox en el puerto 3500…");
      try {
        let res = await fetch("/api/sandbox/start", { method: "POST" });
        let d = await res.json();
        if (d?.pide_eleccion_de_raiz) {
          // El piloto NO elige por el usuario: aparca la pregunta en el panel y se detiene.
          setElegirRaiz({ raiz: d.raiz || "", candidatos: d.candidatos || [], aviso: d.aviso || "" });
          sbLog(`AUTO · RAÍZ · ${d.aviso || "hay más de un entregable y hace falta elegir cuál se previsualiza."}`);
          return;
        }
        if (d?.requiereConfirmacion) {
          // v1.97.4 · EL PILOTO NO CONFIRMA LA RECURSIÓN. Antes «aviso y
          // continúo» arrancaba la propia IDE dentro del sandbox (preview de
          // CerebróNico en vez de la app) y, peor: el modelo editaba el
          // código fuente de la IDE VIVA — de ahí salieron suites rojas en
          // copias limpias y el «sandbox vacío pero sale cerebronico». La
          // confirmación de recursión es EXCLUSIVA del segundo clic manual
          // (RECURSIÓN v2, abajo); el piloto solo se detiene y deja constancia.
          sbLog(`AUTO · ⛔ NO se arrancó nada: ${d.aviso}`);
          sbLog("AUTO · Si el sandbox contiene la propia IDE, desvincula la carpeta del chat (canal directo) y arranca tu app: el espejo no es un proyecto.");
          setSbBusy(null);
          return;
        }
        if (d?.error) sbLog(`AUTO · No se pudo arrancar: ${d.error}`);
      } catch (e: any) {
        sbLog(`AUTO · Error arrancando: ${e.message}`);
      }

      // 4) Esperar a que el puerto responda (cold start de Vite incluido)
      // v1.84.3 · 60 → 240 s (Mario 27/10: «dale más tiempo en el timeout del
      // sandbox a la carga, la app no alcanza a cargar»). Seis segundos de
      // sondeo no eran presupuesto para la PRIMERA compilación en un equipo de
      // 8 GB: el piloto vencía, el vigía cantaba "se detuvo" y el ciclo
      // relanzaba el arranque desde cero para siempre. El tope nuevo es de
      // 4 minutos, pero la espera no es a ciegas: si el server responde y
      // informa el proceso MUERTO (`running:false`) tres sondeos seguidos
      // (~7,5 s de estabilidad, para no tragar el latido del spawn), se corta
      // antes y se aplica el backoff — un proceso muerto no merece cuatro minutos.
      setPhase("wait");
      const deadline = Date.now() + 240000;
      let up = false;
      let muertosConsecutivos = 0;
      let sondeos = 0;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const chk = await refreshSandboxStatus();
        sondeos += 1;
        if (chk?.online) {
          up = true;
          break;
        }
        // La muerte solo se cuenta pasados ~10 s de arranque: en los primeros
        // sondeos el spawn puede no haber registrado el PID todavía, y contar
        // cadáveres ahí sería el mismo fantasma que este arreglo viene a curar.
        if (sondeos > 4 && decidirVigiliaSandbox(chk) === "detenido") {
          muertosConsecutivos += 1;
          if (muertosConsecutivos >= 3) {
            sbLog("AUTO · El proceso del sandbox murió durante el arranque: no espero más, reintento con backoff.");
            break;
          }
        } else if (decidirVigiliaSandbox(chk) !== "detenido") {
          muertosConsecutivos = 0;
        }
      }
      if (up) {
        // 🔧 ÉXITO: reiniciar contador de backoff
        sbRetryCountRef.current = 0;
        sbNextRetryAtRef.current = 0;
        sbLog("AUTO · Preview en vivo listo en :3500 ✅ (los cambios del editor se reflejan solos)");
        // ============================================================
        // v2.1 — 🐞 "LISTO" NO BASTABA: EL PUERTO RESPONDE Y LA PÁGINA PUEDE
        // QUEDAR EN BLANCO. Comprobación real, del lado del servidor, de que los
        // módulos /src/* se sirven de verdad. Sin esto, el éxito del puerto
        // tapaba un preview vacío y el usuario se quedaba sin ninguna pista.
        // ============================================================
        try {
          const vr = await fetch("/api/sandbox/verify-preview");
          const vj = await vr.json();
          if (vj?.message) sbLog(`AUTO · ${vj.ok ? "✅" : "❌"} ${vj.message}`);
          if (vj?.ok === false) {
            sbLog("AUTO · El sandbox está vivo pero sirve una página vacía: revisa el aviso de arriba y pulsa «Arrancar ahora» tras un Sync completo.");
          }
        } catch {}
      } else {
        // 🔧 FALLO: incrementar contador y aplicar backoff exponencial (1s, 2s, 4s, 8s… 60s max)
        sbRetryCountRef.current += 1;
        const backoffMs = Math.min(1000 * Math.pow(2, sbRetryCountRef.current - 1), 60000);
        sbNextRetryAtRef.current = Date.now() + backoffMs;
        setPhase("error");
        const waitS = Math.ceil(backoffMs / 1000);
        const porMuerte = muertosConsecutivos >= 3;
        sbLog(
          `AUTO · ${porMuerte ? "El proceso del sandbox murió antes de levantar el puerto 3500" : "El puerto 3500 no respondió en 4 min (intento #" + sbRetryCountRef.current + ")"} · ` +
          `Próximo reintento en ${waitS}s (backoff exponencial para evitar procesos zombie).` +
          (porMuerte ? "" : " Si es la primera compilación en un disco lento, puede necesitar más de un intento: el vigía YA no reinicia el arranque mientras el proceso esté vivo.")
        );
      }
    } finally {
      sbWorkingRef.current = false;
      setSbBusy(null);
    }
  };

  // Al entrar a la pestaña Sandbox: chequea y, si hace falta, activa el piloto
  // 🔧 FIX imagen blanca: NO activar el piloto si el workspace está vacío.
  // El sandbox en :3500 no tiene nada que servir y el iframe se queda en blanco.
  useEffect(() => {
    if (activeTab === "sandbox") {
      refreshSandboxStatus().then((st) => {
        // Solo activar el piloto si hay archivos en el workspace
        if (!st?.online && sbAutoRef.current && files.length > 0) {
          sandboxAutoPilot();
        } else if (!st?.online && files.length === 0) {
          sbLog("INFO · Workspace vacío: el sandbox necesita al menos 1 archivo (ej: package.json) para arrancar.");
          sbLog("INFO · Usa 'Plantilla' en el explorador para restaurar la plantilla base, o adjunta archivos.");
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, files.length]);

  // 🔧 Escuchar evento de auto-sync: cuando la IA genera código y se sincroniza
  // al disco, refrescar el iframe del sandbox para mostrar los cambios en vivo.
  useEffect(() => {
    const handleAutoSync = () => {
      if (sbOnlineRef.current) {
        sbLog("AUTO-SYNC · Refrescando preview del sandbox...");
        setIframeKey((k) => k + 1);
      }
    };
    window.addEventListener("cerebronico:autosync-done", handleAutoSync);
    return () => window.removeEventListener("cerebronico:autosync-done", handleAutoSync);
  }, []);

  // 🔧 v1.70.0 — VIGILA-CARGA: el puerto arriba NO es carga terminada. Cada `src`
  // nuevo arma una cuenta; si en ese tiempo el iframe no disparó onLoad y
  // el sandbox sigue arriba, la carga estaba muerta: se refresca con URL nueva (el
  // anti-caché ya garantiza que no es la copia vieja) hasta 3 veces. Al tercero se
  // dice la verdad y se da el enlace directo, en vez de dejar esperando para siempre.
  // v1.84.3 · PRESUPUESTO DISTINTO PARA LA PRIMERA CARGA (Mario 27/10: «la app no
  // alcanza a cargar»): con la caché de Vite fría, el primer /src/main.tsx se
  // transforma pidiéndole al compilador todo el grafo de dependencias — en 8 GB
  // pasa holgadamente de 12 s. Recargar a los 12 s cancelaba en el navegador los
  // módulos que estaban por llegar y tiraba el progreso: el primer intento espera
  // 30 s; los siguientes (con el compilador ya despierto) siguen en 12 s.
  useEffect(() => {
    if (activeTab !== "sandbox" || !sbOnline) return;
    cargaVivaRef.current = false;
    const presupuestoMs = reintentosPreviewRef.current === 0 ? 30000 : 12000;
    const t = window.setTimeout(() => {
      if (cargaVivaRef.current) return;
      if (reintentosPreviewRef.current >= 3) {
        setPreviewSinCarga(true);
        sbLog("PREVIEW · el puerto 3500 responde pero el previsualizador no terminó de cargar en 3 intentos. Abrilo directo en http://localhost:3500: si ahí sí aparece, lo que falla es el documento que sirve el proyecto (o un service worker viejo), no este panel.");
        return;
      }
      reintentosPreviewRef.current += 1;
      sbLog(`PREVIEW · carga muerta tras ${Math.round(presupuestoMs / 1000)} s con el puerto arriba: reintentando (${reintentosPreviewRef.current}/3)…`);
      setIframeKey((k) => k + 1);
    }, presupuestoMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeKey, sbOnline, activeTab]);

  // Vigilancia continua: si el sandbox se cae con la pestaña abierta, lo re-levanta solo
  useEffect(() => {
    if (activeTab !== "sandbox" || !sbAuto) return;
    const iv = setInterval(() => {
      if (sbWorkingRef.current) return;
      fetch("/api/sandbox/status")
        .then((r) => {
          // Guard: un 401/500 no debe interpretarse como "sandbox caído"
          // (antes disparaba el autopiloto en bucle ante errores del server).
          if (!r.ok) throw new Error(`status ${r.status}`);
          return r.json();
        })
        .then((d) => {
          const online = Boolean(d?.online);
          setSbOnline(online);
          sbOnlineRef.current = online;
          setSbInstalled(Boolean(d?.installed));
          setSbHasProject(Boolean(d?.hasProject));
          if (online) {
            // 🔧 Restaurar el src del iframe si estaba vacío (tras un Forzar Limpieza)
            if (!iframeSrc) setIframeSrc(SANDBOX_URL);
            if (!everLiveRef.current) {
              everLiveRef.current = true;
              setIframeKey((k) => k + 1);
            }
            if (sbPhaseRef.current !== "live") setPhase("live");
          } else if (!sbWorkingRef.current) {
            // ═══════════════════════════════════════════════════════════════
            // v1.84.3 · VIVO PERO SIN PUERTO NO ES "SE DETUVO" (queja de Mario
            // 27/10 con captura: «la app no alcanza a cargar y se reinicia
            // solo el piloto automatico»). El server ya responde en /status
            // con `running` (el proceso `npm run dev` está vivo) aunque el
            // puerto 3500 todavía no escuche: en la primera compilación (la
            // pantalla «despierta las dependencias») eso son minutos en un
            // equipo de 8 GB. El vigía solo miraba `online`, cantaba
            // «se detuvo», y el piloto relanzaba el arranque DESDE CERO cada
            // 8 s: la compilación no terminaba jamás. Ahora: proceso vivo =
            // esperar (un aviso cada 30 s, no un log cada tanda); proceso
            // muerto de verdad = piloto, como siempre.
            // ═══════════════════════════════════════════════════════════════
            const vigilia = decidirVigiliaSandbox(d);
            // «arrancando» (proceso vivo, puerto tibio) y «sin_server» (payload
            // sin datos bastantes) NO autorizan reiniciar: el primero es una
            // compilación legítima en curso; sobre el segundo no se decide.
            if (vigilia === "arrancando" || vigilia === "sin_server") {
              if (vigilia === "arrancando" && Date.now() - avisoArranqueVivoRef.current > 30000) {
                avisoArranqueVivoRef.current = Date.now();
                sbLog("AUTO · El proceso del sandbox está vivo pero el puerto aún no escucha (primera compilación: puede tardar varios minutos). El piloto ESPERA sin reiniciar.");
              }
              if (vigilia === "arrancando" && sbPhaseRef.current !== "wait" && sbPhaseRef.current !== "start") setPhase("wait");
              return;
            }
            if (everLiveRef.current) sbLog("AUTO · El sandbox se detuvo: reactivando automáticamente…");
            sandboxAutoPilot();
          }
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sbAuto]);

  // Sincronización automática de archivos: editás en la IDE y el preview se actualiza solo
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstFilesRenderRef = useRef(true);
  // ──────────────────────────────────────────────────────────────────────────
  // v1.92.0 · «ABRIR EL SANDBOX LUEGO DE EDITAR LOS ARCHIVOS EN EL EDITOR DEL
  // ÁRBOL» (Mario, 30/10). Se anota el instante de la última edición hecha A MANO
  // en el editor del árbol; cuando esa tanda se escribe en el disco del sandbox,
  // el panel derecho salta al sandbox y refresca el preview. Es un sello de tiempo
  // y no un booleano a propósito: con booleano, la primera escritura del agente o
  // la recarga de un archivo abrían el preview sin que nadie hubiera tocado nada.
  // Anti-bucle (toda señal que abre UI necesita su tope): la marca se consume al
  // abrir y hay una ventana de gracia de 8 s entre aperturas. El sandbox NUNCA se
  // abre sobre un servidor muerto (lección v1.84.3): si el puerto no está arriba,
  // la marca queda viva para el próximo tick.
  // ────────────────────────────────────────────────────────────────────────────
  const ultimaEdicionEnArbolRef = useRef(0);
  const ultimaAperturaPorEdicionRef = useRef(0);
  const avisoAutoApagadoRef = useRef(false);
  const COOLDOWN_APERTURA_MS = 8000;

  useEffect(() => {
    if (firstFilesRenderRef.current) {
      firstFilesRenderRef.current = false;
      return;
    }
    if (!sbAuto) {
      // Con el piloto apagado nadie escribe en el sandbox: se dice UNA vez por
      // tanda (si no, cada tecla agrega una línea al log y el log se traga la UI).
      if (ultimaEdicionEnArbolRef.current && !avisoAutoApagadoRef.current) {
        avisoAutoApagadoRef.current = true;
        sbLog("SANDBOX · editaste en el árbol, pero el AUTO está apagado: nada se escribió todavía. Pulsá Sync (terminal) o activá AUTO y el sandbox se abre solo.");
      }
      return;
    }
    avisoAutoApagadoRef.current = false;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(async () => {
      if (sbWorkingRef.current || !sbOnlineRef.current) return;
      try {
        await (onAutoSync || onSyncProject)?.(); // silencioso; Vite HMR refresca el iframe solo
      } catch {}
      if (!ultimaEdicionEnArbolRef.current) return;
      if (Date.now() - ultimaAperturaPorEdicionRef.current < COOLDOWN_APERTURA_MS) return;
      ultimaEdicionEnArbolRef.current = 0;
      ultimaAperturaPorEdicionRef.current = Date.now();
      setActiveTab("sandbox");
      setIframeKey((k) => k + 1);
      sbLog("SANDBOX · abierto tras editar en el árbol (los archivos ya están escritos en el :3500)");
    }, 2500);
    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, sbAuto]);

  // v1.0.17 · Los avisos del SYNC en su propia función: el onClick queda con la
  // secuencia (escribir → contar → abrir el sandbox) y aquí vive el texto largo.
  // Nunca dice «listo» con 0 archivos: esa era la pantalla blanca de la v1.0.16.
  const informarSync = async (count: number) => {
    sbLog("SYNC · Escribiendo archivos del editor al disco del sandbox…");
    if (count === 0) {
      // La causa de la pantalla blanca: el sandbox NO tenía archivos nuevos que
      // escribir. Si antes decía «listo», ese «listo» era el trabajo de antes que
      // ya estaba en el disco, no esta Sync.
      sbLog("SYNC · 0 archivos escritos: el proyecto NO tenía archivos nuevos que mandar al sandbox.");
      sbLog("SYNC · Si ves algo «listo», es el trabajo anterior que ya estaba en el disco (de antes), NO lo que acabás de sincronizar: por eso el preview sale en blanco.");
      sbLog("SYNC · Qué hacer: escribí o pegá tu app (p.ej. index.html) en el editor y volvé a pulsar Sync; recién ahí habrá archivos que escribir.");
      return;
    }
    // Y con archivos escritos se dice DÓNDE quedaron: un «listo» sin ruta no dice
    // sobre qué carpeta, y el aviso de proyecto duplicado se pinta igual (gana la
    // raíz, la web anidada no se ve).
    const st = await refreshSandboxStatus();
    const raizAbs = String((st as any)?.raizSandbox || (st as any)?.raizProyectoResuelta || "el disco del sandbox");
    const raizProy = String((st as any)?.raizProyectoResuelta || raizAbs);
    sbLog(`SYNC · ${count} archivo(s) escrito(s) en ${raizAbs}`);
    sbLog(`SYNC · Proyecto reconocido en: ${raizProy}`);
    const duplicado = (st as any)?.avisoProyectoDuplicado; if (duplicado) sbLog(`SYNC · ⚠️ ${duplicado}`);
    sbLog("SYNC · Proyecto listo. Clic en 'Arrancar ahora'.");
  };

  const handleSandboxInstall = async () => {
    if (sbBusy) return;
    setSbBusy("install");
    sbLog("Sincronizando archivos del editor al sandbox…");
    try {
      await onSyncProject?.();
    } catch {}
    sbLog("npm install en curso (puede tardar minutos en la primera vez)…");
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "npm install --no-audit --no-fund", timeoutMs: 300000 }),
      });
      const d = await res.json();
      if (d.exitCode === 0) {
        sbLog("Dependencias instaladas correctamente.");
      } else {
        sbLog(`npm install falló: ${(d.stderr || d.error || "").slice(-300)}`);
      }
    } catch (e: any) {
      sbLog(`Error instalando: ${e.message}`);
    }
    await refreshSandboxStatus();
    setSbBusy(null);
  };

  const handleSandboxStart = async (opts?: { confirmarRaiz?: boolean; destino?: string }) => {
    if (sbBusy) return;
    setSbBusy("start");
    sbLog("Sincronizando archivos del editor al sandbox…");
    try {
      await onSyncProject?.();
    } catch {}
    sbLog("Arrancando servidor del proyecto en el puerto 3500…");
    // VIGILA-ARRANQUE v1: «le cuesta el arranque» era silencio puro mientras el
    // servidor instalaba dependencias (minutos) antes de spawnear. Un latido
    // cada 20 s dice que NO está colgado: está trabajando.
    let segArranque = 0;
    const vigia = window.setInterval(() => {
      segArranque += 20;
      // v1.70.0 — el latido viejo AFIRMABA «instalando dependencias» sin saberlo: el
      // texto estaba fijo, y con el proyecto de la sesión 1792793541672 la decisión
      // real (elegirViaPreview con esa huella) era vía estática con
      // requiereInstalar: false. Un diagnóstico que señala la fase equivocada hace
      // esperar algo que no está pasando. Y no tenía tope: 9 latidos sin decir nunca
      // «esto se pasó de tiempo».
      if (segArranque >= 200) {
        window.clearInterval(vigia);
        sbLog(`ARRANQUE · ${segArranque} s y el puerto 3500 sigue sin responder. El panel no sabe en qué fase está tu proyecto: mirá la Terminal (npm run dev) o abrí http://localhost:3500 para comprobar si responde por fuera.`);
        return;
      }
      sbLog(`ARRANQUE · ${segArranque} s esperando que responda el puerto 3500 (el proyecto se está preparando; la vía y las dependencias se informan al terminar). No cierres la página.`);
    }, 20000);
    try {
      const cuerpoArranque = JSON.stringify({ ...(opts?.confirmarRaiz ? { confirmarRaiz: true } : {}), ...(opts?.destino ? { destino: opts.destino } : {}) });
      let res = await fetch("/api/sandbox/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpoArranque });
      let d = await res.json();
      if (d?.pide_eleccion_de_raiz) {
        setElegirRaiz({ raiz: d.raiz || "", candidatos: d.candidatos || [], aviso: d.aviso || "" });
        sbLog(`RAÍZ · No se arrancó nada. ${d.aviso || ""}`);
        setSbBusy(null); // el semáforo se limpia acá: el botón no puede quedarse gris (lección de la RECURSIÓN v2)
        return;
      }
      if (d?.requiereConfirmacion) {
        // RECURSIÓN v2: STOP, no auto-continúo. El aviso se lee entero y la
        // confirmación es un segundo clic explícito del usuario.
        if (!recursionPendienteRef.current) {
          recursionPendienteRef.current = true;
          sbLog(`⚠ ${d.aviso}`);
          sbLog("RECURSIÓN · NO se arrancó nada. Si lo que quieres es TRABAJAR en ese proyecto, ábrelo en el Editor (tab «Editor») y vuelve con tu app en el sandbox. Si de verdad quieres la IDE dentro de la IDE, pulsa «Arrancar ahora» otra vez para confirmarlo.");
          // DEPURACIÓN v1.16.5 — este return se comía el setSbBusy(null) del
          // final: el semáforo se quedaba en "start" y TODOS los botones del
          // sandbox morían gris (el «se queda» del usuario, versión UI). El
          // finally limpia el vigía; el botón lo suelta acá.
          setSbBusy(null);
          return;
        }
        sbLog("RECURSIÓN · confirmado por el segundo clic: arrancando la copia anidada (dos IDEs compartiendo RAM — lento a sabiendas)…");
        res = await fetch("/api/sandbox/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar: "recursion" }) });
        d = await res.json();
      }
      // La confirmación pendiente solo vale para el intento siguiente; un
      // arranque que no pide confirmación la borra (si el usuario limpió el
      // proyecto anidado, nadie queda autorizado por un clic viejo).
      if (!d?.requiereConfirmacion) recursionPendienteRef.current = false;
      if (d.error) {
        sbLog(`No se pudo arrancar: ${d.error}`);
      } else if (d.online) {
        setElegirRaiz(null);
        sbLog(`App viva en ${SANDBOX_URL} (pid ${d.pid ?? "externo"})`);
        setIframeKey((k) => k + 1);
      } else {
        // ============================================================
        // v2.1 — 🐞 Antes solo se decía "no responde", y eso no ayuda a nadie:
        // el proceso puede haber muerto por falta de una dependencia, por un
        // puerto ya ocupado o por un error de arranque, y todo se veía igual.
        // Ahora el servidor devuelve la causa probable (d.hint) y las últimas
        // líneas REALES del proceso (d.logTail), justo aquí abajo.
        // ============================================================
        sbLog(
          d.hint ||
            "El proceso arrancó pero el puerto 3500 aún no responde. Revisa la Terminal (npm run dev)."
        );
        if (d.logTail) {
          const lineas = String(d.logTail)
            .split("\n")
            .filter((l: string) => l.trim())
            .slice(-8);
          for (const linea of lineas) sbLog(`   ${linea}`);
        }
      }
    } catch (e: any) {
      sbLog(`Error arrancando: ${e.message}`);
    } finally {
      window.clearInterval(vigia);
    }
    await refreshSandboxStatus();
    setSbBusy(null);
  };

  // v1.16.5 — REINICIAR: detener y volver a arrancar el SERVIDOR (distinto de
  // «Recargar», que solo refresca el iframe, y de «Forzar Limpieza», que además
  // lo destruye). Es el botón que pedía el usuario: un clic para resucitar un
  // sandbox colgado sin tocar cinco teclas.
  const handleSandboxReiniciar = async () => {
    if (sbBusy) return;
    setSbBusy("restart");
    sbLog("REINICIAR · deteniendo el servidor del sandbox…");
    try {
      await fetch("/api/sandbox/stop", { method: "POST" });
    } catch {}
    setSbBusy(null);
    await handleSandboxStart();
  };

  const handleSandboxStop = async () => {
    if (sbBusy) return;
    setSbBusy("stop");
    sbLog("Deteniendo el servidor del sandbox…");
    try {
      await fetch("/api/sandbox/stop", { method: "POST" });
      sbLog("Servidor del sandbox detenido.");
    } catch (e: any) {
      sbLog(`Error deteniendo: ${e.message}`);
    }
    await refreshSandboxStatus();
    setSbBusy(null);
  };

  const openSandboxExternal = () => {
    // v1.95.1 · LA ASIMETRÍA ERA EL BUG. El iframe carga con
    // `urlConAntiCache(..., iframeKey)` (línea 1573) y este botón abría la raíz
    // PELADA. El servicio viejo cacheaba precisamente esa clave («./» y
    // «./index.html» en el precache de su sw.js), así que el navegador respondía
    // con el proyecto anterior sin tocar el disco: preview e «Abrir» mostrando
    // dos cosas distintas bajo la misma dirección. Mismo URL, misma petición,
    // misma respuesta — o el usuario no tiene forma de comparar nada.
    window.open(urlConAntiCache(SANDBOX_URL, Date.now()), "_blank");
  };

  const fileTree = buildFileTree(files);
  const filteredTree = fileSearch.trim()
    ? files
        .filter((f) => f.path.toLowerCase().includes(fileSearch.toLowerCase()))
        .sort((a, b) => a.path.localeCompare(b.path))
    : null;

  return (
    <aside data-cn="paneles" className="w-full h-full flex flex-col bg-[#000000] border-l border-[#121824] overflow-hidden text-xs select-text">
      {/* Top Main Navigation Tabs */}
      <div className="h-10 bg-[#04060c] border-b border-[#121824] flex items-center justify-between px-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar py-0.5">
          <button
            onClick={() => setActiveTab("sandbox")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "sandbox"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Sandbox</span>
          </button>

          <button
            onClick={() => setActiveTab("editor")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "editor"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Editor ({files.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("deliverables")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "deliverables"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Entregables</span>
          </button>

          {/* 🔧 Pestaña "Skills (100)" ELIMINADA: las 100 skills viven en el motor
              (se inyectan vía contextCache en el system prompt), no es necesario
              verlas como panel separado. El usuario puede pedirlas por chat. */}

          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "terminal"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
            title="Terminal de telemetría"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* (Descargas: el ZIP total vive en el botón verde del header y la de archivo individual en el editor — sin duplicados) */}
        <div className="flex items-center gap-1" />
      </div>

      {/* ============================================================
          TAB CONTENT: SANDBOX REAL (preview en vivo del proyecto en :3500)
          ============================================================ */}
      {activeTab === "sandbox" && (
        <div className="flex-1 flex flex-col bg-[#03050a] relative overflow-hidden">
          {/* Barra de control del sandbox */}
          <div className="bg-[#060912] border-b border-[#141d2e] px-3 py-2 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    sbBusy
                      ? "bg-amber-400 animate-pulse"
                      : sbOnline
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-zinc-600"
                  }`}
                />
                <span className="font-mono text-zinc-300 text-[11px]">
                  Sandbox Preview · {SANDBOX_URL.replace(/^https?:\/\//, "")}
                  {raizServida ? (
                    <span
                      className={`ml-2 px-1.5 py-[1px] rounded border font-sans text-[10px] ${
                        sirveRaizWorkspace
                          ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
                          : "text-zinc-400 border-zinc-600/50"
                      }`}
                      title={raizServida}
                    >
                      {sirveRaizWorkspace ? "⚠ raíz del workspace" : "📁"} {raizServida.split(/[\\/]/).filter(Boolean).pop()}
                    </span>
                  ) : null}
                </span>
              </div>
              <span className="text-zinc-500 font-mono text-[10px]">
                {sbBusy === "auto"
                  ? `AUTO · ${sbPhase === "sync" ? "sincronizando" : sbPhase === "install" ? "instalando deps" : sbPhase === "start" || sbPhase === "wait" ? "arrancando :3500" : "trabajando"}…`
                  : sbOnline
                  ? "EN VIVO"
                  : sbPhase === "error"
                  ? "REINTENTANDO…"
                  : "APAGADO"}{" "}
                · IDE en :3000 · App en :3500
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* v1.78.0 · UN SOLO BOTÓN A LA VISTA (Mario 26/10 y de nuevo ahora:
                  «quitar todo, un solo botón»): el verde dispara el piloto completo
                  — sync → npm install si falta → arrancar :3500 → preview vivo — y
                  si ya está vivo, reinicia todo en un clic. La botonera secundaria
                  se retiró de esta barra (v1.0.16); el piloto sigue por dentro y
                  Sync/Pull viven en la pestaña Terminal. */}
              <button
                onClick={() => {
                  if (!sbAutoRef.current) {
                    setSbAuto(true);
                    sbLog("AUTO · Piloto ACTIVADO: el sandbox se maneja solo.");
                  }
                  if (sbOnlineRef.current) {
                    void handleSandboxReiniciar();
                  } else {
                    void sandboxAutoPilot();
                  }
                }}
                disabled={!!sbBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/25 hover:bg-emerald-600/40 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-200 border border-emerald-500/60 rounded-md font-bold text-[11px] transition-all"
                title="Un clic hace TODO: sincroniza el editor, instala dependencias, arranca el puerto 3500 y mantiene el preview vivo"
              >
                {sbBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {sbOnline ? "Reiniciar preview" : "Arrancar ahora"}
              </button>

              {/* Mostrar advertencia clara si el workspace del editor está vacío */}
              {files.length === 0 && (
                <span className="text-[10px] text-amber-400 font-mono px-2 py-1 bg-amber-950/40 border border-amber-700/40 rounded-md shrink-0">
                  ⚠️ Editor vacío — usa "Plantilla" o "Abrir .cn"
                </span>
              )}

            </div>

            {sbLogs.length > 0 && (
              <div className="bg-[#04060d] border border-[#131c2c] rounded-md">
                <div className="flex items-center justify-between px-2 py-1 border-b border-[#131c2c]">
                  <span className="font-mono text-[9px] uppercase tracking-wide text-zinc-500">
                    Log del sandbox · {sbLogs.length} línea{sbLogs.length === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={limpiarSbLog}
                    className="flex items-center gap-1 px-1.5 py-0.5 bg-red-600/15 hover:bg-red-600/30 text-red-300 border border-red-500/40 rounded font-medium text-[10px] transition-all"
                    title="Borrar todo el log del sandbox (memoria y persistencia)"
                  >
                    <Trash2 className="w-3 h-3" />
                    Borrar log
                  </button>
                </div>
                <div className="max-h-16 overflow-y-auto custom-scrollbar px-2 py-1 font-mono text-[10px] leading-relaxed text-zinc-400">
                  {elegirRaiz && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 mb-1.5 text-[10px] leading-snug">
                      <div className="text-amber-300 font-semibold mb-1">¿Qué querés previsualizar?</div>
                      <div className="text-zinc-400 mb-1.5">{elegirRaiz.aviso}</div>
                      <div className="flex flex-wrap gap-1">
                        {elegirRaiz.candidatos.map((cd) => (
                          <button
                            key={cd.ruta}
                            onClick={() => { setElegirRaiz(null); handleSandboxStart({ destino: cd.ruta, confirmarRaiz: true }); }}
                            className="px-1.5 py-0.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                            title={cd.ruta}
                          >
                            {cd.nombre}
                          </button>
                        ))}
                        <button
                          onClick={() => { setElegirRaiz(null); handleSandboxStart({ confirmarRaiz: true }); }}
                          className="px-1.5 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-700/40"
                          title={`Usar ${elegirRaiz.raiz} igual (por recencia)`}
                        >
                          Usar la elegida
                        </button>
                        <button
                          onClick={() => { setElegirRaiz(null); sbLog("RAÍZ · Para no volver a preguntar: fijá la carpeta del proyecto (CANAL DIRECTO) desde el botón de carpetas del panel izquierdo. Mientras esté fijada, el sandbox no elige solo."); }}
                          className="px-1.5 py-0.5 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-700/40"
                        >
                          Cómo fijarla
                        </button>
                      </div>
                    </div>
                  )}
                  {sbLogs.map((l, i) => (
                    <div key={i} className="whitespace-pre-wrap break-words">
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Preview iframe o estado vacío */}
          {sbOnline ? (
            <div className="flex flex-col flex-1 min-h-0">
            {previewSinCarga && (
              <div className="px-3 py-2 text-[11px] leading-relaxed bg-amber-950/60 border-b border-amber-800/60 text-amber-200">
                El puerto 3500 responde pero esta vista no terminó de cargar. Abrila directo en{' '}
                <a href={SANDBOX_URL} target="_blank" rel="noreferrer" className="underline">{SANDBOX_URL}</a>
                {' '}o pulsá «Recargar». Si ahí sí aparece, el problema es el documento que sirve el proyecto.
              </div>
            )}
            <iframe
              key={iframeKey}
              ref={previewRef}
              src={urlConAntiCache(iframeSrc || SANDBOX_URL, iframeKey)}
              onLoad={() => {
                cargaVivaRef.current = true;
                reintentosPreviewRef.current = 0;
                setPreviewSinCarga(false);
                aplicarFocoPreview("carga-viva");
              }}
              onError={() => { cargaVivaRef.current = false; setPreviewSinCarga(true); }}
              onMouseEnter={() => aplicarFocoPreview("raton-encima")}
              onClick={() => aplicarFocoPreview("click-usuario")}
              tabIndex={0}
              className="flex-1 w-full bg-white"
              title="Sandbox Preview"
              sandbox={typeof window !== "undefined" && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ? "allow-scripts allow-forms" : "allow-scripts allow-same-origin allow-forms allow-popups"}
            />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
              <div className="p-5 bg-[#070b16] border border-[#172238] rounded-2xl max-w-sm shadow-2xl">
                {sbBusy === "auto" ? (
                  <>
                    <Loader2 className="w-8 h-8 text-amber-400 mx-auto mb-3 animate-spin" />
                    <h4 className="text-sm font-semibold text-zinc-100 mb-1">Piloto automático trabajando…</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-1">
                      {sbPhase === "sync" && "Sincronizando tus archivos del editor al sandbox…"}
                      {sbPhase === "install" && "Instalando dependencias (solo la primera vez)…"}
                      {(sbPhase === "start" || sbPhase === "wait") && "Levantando tu app en el puerto 3500…"}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono">No toques nada: el preview aparece solo.</p>
                  </>
                ) : (
                  <>
                    <Eye className="w-8 h-8 text-cyan-400 mx-auto mb-3" />
                    <h4 className="text-sm font-semibold text-zinc-100 mb-1">Sandbox automático</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                      {typeof window !== "undefined" && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
                        ? "Edición servidor: el modelo y el editor trabajan en el mismo workspace. Arrancar ahora publica la vista previa por HTTPS; el alojamiento debe permitir ejecutar el proyecto."
                        : sbAuto
                        ? "El piloto automático está activo: al entrar aquí se sincroniza, instala y arranca tu proyecto en :3500 sin clicks. Si se cae, se re-levanta solo."
                        : "Piloto automático apagado a mano desde ⚙ Avanzado. Con un clic en el verde vuelve a manejarlo todo."}
                    </p>
                    {/* v1.78.0 · un solo botón verde también acá: enciende el
                        piloto (si estaba apagado) y hace todo el flujo. */}
                    <button
                      onClick={() => {
                        if (!sbAutoRef.current) {
                          setSbAuto(true);
                          sbLog("Piloto automático ACTIVADO: el sandbox se maneja solo.");
                        }
                        setTimeout(sandboxAutoPilot, 50);
                      }}
                      disabled={!!sbBusy}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-semibold text-xs shadow transition-colors flex items-center gap-1.5 mx-auto"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Arrancar ahora
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          TAB CONTENT: EDITOR CON ÁRBOL DE ARCHIVOS VERTICAL
          ============================================================ */}
      {activeTab === "editor" && (
        <div className="flex-1 flex overflow-hidden bg-[#030509]">
          {/* ---- EXPLORADOR VERTICAL (columna izquierda) ---- */}
          <div
            style={{ width: `${explorerWidth}px` }}
            className="shrink-0 bg-[#05080f] flex flex-col overflow-hidden"
          >
            <div className="h-9 px-2 flex items-center justify-between border-b border-[#10182a] shrink-0">
              <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                Explorador
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{files.length}</span>
            </div>

            {/* ACCIONES DEL EXPLORADOR: adjuntar + borrar todo + restaurar plantilla + .cn */}
            <div className="flex items-center gap-1 px-1.5 pt-1.5 shrink-0">
              <button
                onClick={() => attachInputRef.current?.click()}
                className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 border border-cyan-800/60 hover:border-cyan-600 rounded-md transition-colors flex items-center justify-center gap-1"
                title="Adjuntar archivos de CUALQUIER tipo (zip, pdf, imágenes, código...) — los zip se extraen solos"
              >
                <Paperclip className="w-3 h-3" />
                Adjuntar
              </button>
              <input
                ref={attachInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length > 0) onAttachFiles(picked);
                  e.target.value = ""; // permite re-adjuntar el mismo archivo
                }}
              />
            </div>

            {/* v1.83.0 · FASE 4 (contrato "explorador"): Borrar todo, Plantilla,
                .cn y Abrir .cn siguen existiendo; viven plegadas por defecto
                detras del ⚙. Adjuntar — la que hace todo — es la unica visible. */}
            <Avanzado panel="explorador">
              <button
                onClick={() => {
                  if (files.length === 0) return;
                  // v1.6.23 — RESCATE v1: el confirm dice la verdad completa.
                  // Este botón también nuklea .proyectos (automatizado en
                  // handleDeleteAllFiles → /api/fs/nuclear-wipe), y el motor
                  // primero muda el estado de CerebroNico antes de borrar.
                  if (window.confirm(`¿Borrar TODOS los ${files.length} archivos del workspace?\nEl workspace quedará vacío y TAMBIÉN se vaciará el sandbox (.proyectos al completo, node_modules incluido): así no queda ninguna app pegada que el :3500 siga reproduciendo.\nEl estado de CerebroNico (conocimiento, espejos, bóveda, MEMORIA/skills) se MUDA primero a la carpeta de la app; si el rescate fallara, el borrado se ABORTA y se avisa.\nPodrás restaurar la plantilla base con el botón "Restaurar plantilla".`)) {
                    onDeleteAllFiles();
                  }
                }}
                className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-red-400/90 hover:text-red-300 hover:bg-red-500/10 border border-red-900/60 hover:border-red-600 rounded-md transition-colors flex items-center justify-center gap-1"
                  title="Borra el workspace y VACÍA EL SANDBOX (su raíz de datos, la que muestra el log) — el estado de CerebroNico se muda antes, no se borra"
              >
                <Trash2 className="w-3 h-3" />
                Borrar todo
              </button>

            {/* 🔧 Segunda fila: Restaurar plantilla + Exportar .cn + Importar .cn
                🐞 v2.0 — "esos botones volando por encima de la otra pestaña":
                los tres botones con texto ("Plantilla", ".cn", "Abrir .cn") no
                caben en el panel estrecho y se desbordaban FUERA de su recuadro,
                pisando la barra de pestañas. Ahora la fila hace flex-wrap (bajan a
                una segunda línea dentro del panel) y cada botón puede encogerse. */}
            <div className="flex flex-wrap items-center gap-1 px-1.5 pt-1 shrink-0 min-w-0 overflow-hidden">
              {onRestoreTemplate && (
                <button
                  onClick={() => {
                    if (files.length > 0) {
                      if (!window.confirm(`¿Restaurar la plantilla base? Se añadirán package.json, MEMORIA.md, skills.md, README.md y server.ts al workspace actual (${files.length} archivos existentes).`)) return;
                    }
                    onRestoreTemplate();
                  }}
                  className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10 border border-emerald-800/60 hover:border-emerald-600 rounded-md transition-colors flex items-center justify-center gap-1"
                  title="Restaurar la plantilla base (package.json, MEMORIA.md, skills.md, README.md, server.ts)"
                >
                  <FilePlus2 className="w-3 h-3" />
                  Plantilla
                </button>
              )}
              {onExportCnFile && (
                <button
                  onClick={onExportCnFile}
                  className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-white bg-emerald-600/80 hover:bg-emerald-500 border border-emerald-500 rounded-md transition-colors flex items-center justify-center gap-1 shadow-sm"
                  title={`Guardar workspace en archivo .${IDE_BRAND.EXTENSION} (contenedor ZIP con todos los archivos + manifest.json). Preguntará el nombre del archivo. Adentro entra cualquier tipo: código, imágenes, PDFs, etc.`}
                >
                  <Download className="w-3 h-3" />
                  .{IDE_BRAND.EXTENSION}
                </button>
              )}
              {onImportCnFile && (
                <button
                  onClick={() => cnImportInputRef.current?.click()}
                  className="flex-1 px-1.5 py-1.5 text-[10px] font-semibold text-violet-300 hover:text-violet-200 hover:bg-violet-500/10 border border-violet-800/60 hover:border-violet-600 rounded-md transition-colors flex items-center justify-center gap-1"
                  title={`Abrir archivo .${IDE_BRAND.EXTENSION} (también acepta .zip y .json). Restaura el workspace completo desde un contenedor ZIP.`}
                >
                  <FolderOpen className="w-3 h-3" />
                  Abrir .{IDE_BRAND.EXTENSION}
                </button>
              )}
              <input
                ref={cnImportInputRef}
                type="file"
                accept={`.${IDE_BRAND.EXTENSION},.zip,.json,application/zip,application/json,application/x-zip-compressed`}
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked && onImportCnFile) onImportCnFile(picked);
                  e.target.value = "";
                }}
              />
            </div>
            </Avanzado>

            <div className="p-1.5 shrink-0">
              <div className="relative">
                <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1.5" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Filtrar archivos…"
                  className="w-full bg-[#0c1220] border border-zinc-800 rounded-md pl-6 pr-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-1 pb-2">
              {/* v1.60.5 — doble árbol VISIBLE: conteo por rama (📥 Entrada / 🏗️ Sandbox) */}
              {(() => {
                const c = contarArboles(files);
                return (
                  <div className="flex items-center gap-3 px-2 py-1 mb-1 text-[10px] font-mono text-zinc-500 select-none" title="📥 Entrada = adjuntos admitidos por la aduana · 🏗️ Sandbox = árbol de trabajo del proyecto">
                    <span className="text-amber-300/80">📥 {c.entrada}</span>
                    <span className="text-cyan-300/80">🏗️ {c.sandbox}</span>
                  </div>
                );
              })()}
              {filteredTree
                ? filteredTree.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onSelectFile(f.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-1.5 text-xs transition-colors ${
                        activeFile?.id === f.id
                          ? "bg-cyan-500/15 text-cyan-300"
                          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                      }`}
                      title={f.path}
                    >
                      {getFileIcon(f.path)}
                      <span className="truncate font-mono flex-1">{f.path}</span>
                    </button>
                  ))
                : fileTree.map((node) => (
                    <FileRow
                      key={node.path + (node.isFolder ? "/" : "")}
                      node={node}
                      depth={0}
                      activeFileId={activeFileId}
                      collapsed={collapsedFolders}
                      toggleFolder={toggleFolder}
                      onSelect={onSelectFile}
                      onClose={onCloseFile}
                      onPromote={onPromoteFile}
                    />
                  ))}
              {filteredTree && filteredTree.length === 0 && (
                <div className="text-zinc-600 text-[11px] px-2 py-3">Sin coincidencias.</div>
              )}
            </div>

            <button
              onClick={onCreateNewFile}
              className="m-1.5 mt-0 px-2 py-1.5 text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 rounded-md border border-dashed border-zinc-700 transition-colors flex items-center justify-center gap-1 text-[11px] shrink-0"
              title="Crear nuevo archivo en el workspace"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo archivo
            </button>
          </div>

          {/* ---- DESPLAZADOR: redimensiona el árbol de archivos ---- */}
          <div
            onMouseDown={startExplorerDrag}
            onDoubleClick={() => setExplorerWidth(EXPLORER_LIMITS.DEFAULT)}
            className="w-[6px] shrink-0 cursor-col-resize bg-[#0a1018] hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors flex items-center justify-center group"
            title="Arrastra para ensanchar o estrechar el árbol de archivos · doble clic para restablecer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar el árbol de archivos"
          >
            <div className="w-[2px] h-10 rounded-full bg-zinc-700 group-hover:bg-cyan-300 transition-colors" />
          </div>

          {/* ---- COLUMNA DEL EDITOR ---- */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Cabecera del archivo activo */}
            <div className="h-10 bg-[#060912] border-b border-[#141d2e] flex items-center px-3 gap-2 shrink-0">
              {activeFile ? (
                <>
                  {getFileIcon(activeFile.path)}
                  <span className="truncate font-mono text-xs text-zinc-200 flex-1" title={activeFile.path}>
                    {activeFile.path}
                    {activeFile.modified && (
                      <span className="ml-2 text-amber-400 text-[10px]">● modificado</span>
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                    {Math.round(activeFile.size / 1024)} KB
                  </span>
                  <button
                    onClick={handleDownloadSingleFile}
                    className="p-1.5 bg-zinc-850 hover:bg-zinc-750 text-zinc-300 hover:text-emerald-300 rounded border border-zinc-700 transition-all"
                    title="Descargar este archivo"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleCopyCode}
                    className="p-1.5 bg-zinc-850 hover:bg-zinc-750 text-zinc-300 hover:text-cyan-300 rounded border border-zinc-700 transition-all flex items-center gap-1"
                    title="Copiar código al portapapeles"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </>
              ) : (
                <span className="text-zinc-500 text-xs">Sin archivo activo</span>
              )}
            </div>

            {activeFile ? (
              <CodeEditor
                file={activeFile}
                onUpdateContent={(id, contenido) => {
                  // v1.92.0 · la edición a mano en el editor del árbol es la que
                  // pide ver el resultado: se anota y el auto-sync abre el sandbox.
                  ultimaEdicionEnArbolRef.current = Date.now();
                  onUpdateFileContent(id, contenido);
                }}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                <FileCode className="w-10 h-10 text-zinc-600 mb-2" />
                <p>No hay ningún archivo abierto en el editor.</p>
                <button
                  onClick={onCreateNewFile}
                  className="mt-3 px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs"
                >
                  Crear Primer Archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: DELIVERABLES */}
      {activeTab === "deliverables" && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar bg-[#090d16]/85 backdrop-blur-md">
          {/* v1.92.0 · EL ENTREGABLE SE ENTIENDE DE UN VISTAZO (Mario, 30/10:
              «mejora la estética para mejor comprensión … al igual de los
              entregables»). Antes era una lista plana: 40 rutas monoespaciadas,
              sin tamaño total, sin decir cuál quedó sin escribir en el disco. La
              medida va arriba (archivos, peso, pendientes), lo pendiente sube
              primero, y las rutas se agrupan por carpeta: la estructura del
              proyecto es la que el usuario quiere ver. No se agregó ninguna
              acción nueva —regla de superficie V8 §7.2: esto ordena, no grita. */}
          {(() => {
            const pesos = files.reduce((n, f) => n + (Number(f.size) || 0), 0);
            const pendientes = files.filter((f) => f.modified).length;
            const carpeta = (p: string) => {
              const i = String(p || "").replace(/\\/g, "/").lastIndexOf("/");
              return i <= 0 ? "raíz del proyecto" : String(p).replace(/\\/g, "/").slice(0, i);
            };
            const grupos = new Map<string, typeof files>();
            for (const f of [...files].sort((a, b) => String(a.path).localeCompare(String(b.path)))) {
              const c = carpeta(f.path);
              if (!grupos.has(c)) grupos.set(c, []);
              grupos.get(c)!.push(f);
            }
            const orden = [...grupos.entries()].sort((a, b) => {
              const pa = a[1].some((f) => f.modified) ? 0 : 1;
              const pb = b[1].some((f) => f.modified) ? 0 : 1;
              return pa - pb || a[0].localeCompare(b[0]);
            });
            return (
              <>
                <div className="mb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-zinc-200">Paquete de Entregables</h3>
                    <span className="rounded border border-[#16233b] bg-[#060b14] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400" title="Archivos del workspace">
                      {files.length} archivos
                    </span>
                    <span className="rounded border border-[#16233b] bg-[#060b14] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400" title="Peso total del paquete">
                      {pesos >= 1024 * 1024 ? `${(pesos / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(pesos / 1024)} KB`}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${pendientes > 0 ? "border-amber-800/60 bg-amber-950/30 text-amber-300" : "border-emerald-900/60 bg-emerald-950/25 text-emerald-300"}`}
                      title={pendientes > 0 ? "Editados acá y todavía no escritos en el disco del sandbox" : "Todo lo que se ve en el editor está escrito en el sandbox"}
                    >
                      {pendientes > 0 ? `${pendientes} sin sincronizar` : "todo sincronizado"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-zinc-400">
                    dev en puerto 3500 · cada archivo individual se abre desde el árbol; hay DOS ZIP según lo que busques:
                  </p>
                  {/* v1.97.4 · EL ENTREGABLE ES UN SOLO ZIP (pedido 31/10): lo que
                      el agente escribió directo en el sandbox NO está en este
                      árbol (workspace del editor), y el ZIP de la barra no lo
                      llevaba. Este botón arma el paquete en el SERVIDOR desde el
                      disco del sandbox: TODO lo escrito + RECORDATORIO.md (o el
                      README/LEEME del proyecto si ya existe). */}
                  <a
                    href="/api/sandbox/zip"
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-900/40"
                    title="Un solo ZIP con todo lo escrito en el sandbox (web o app) + documentación adentro"
                  >
                    ⬇ ZIP del entregable (TODO lo escrito en el sandbox)
                  </a>
                  <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                    El botón verde «Descargar ZIP» de la barra sigue disponible para este árbol del editor.
                  </p>
                </div>

                {/* v1.56.9 · el clic que faltaba: generar → compilar → descargar APK */}
                <PanelAndroid />

                <div className="mt-3 space-y-2.5">
                  {files.length === 0 && (
                    <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-500">
                      Todavía no hay archivos en el workspace. Se crean solos cuando el agente escribe, o con «Adjuntar» en el editor del árbol.
                    </div>
                  )}
                  {orden.map(([ruta, grupoFiles]) => (
                    <div key={ruta}>
                      <div className="mb-1 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate">{ruta}</span>
                        <span className="ml-auto shrink-0 tabular-nums text-zinc-600">{grupoFiles.length}</span>
                      </div>
                      <div className="space-y-1">
                        {[...grupoFiles]
                          .sort((a, b) => (a.modified === b.modified ? 0 : a.modified ? -1 : 1))
                          .map((f) => (
                            <div
                              key={f.id}
                              onClick={() => {
                                onSelectFile(f.id);
                                setActiveTab("editor");
                              }}
                              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-1.5 hover:border-cyan-500/40 cursor-pointer transition-colors"
                              title={`Abrir ${f.path} en el editor`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                {getFileIcon(f.path)}
                                <span className="truncate font-mono text-xs text-zinc-200">
                                  {String(f.path).replace(/\\/g, "/").split("/").pop()}
                                </span>
                                {f.modified && (
                                  <span className="shrink-0 rounded border border-amber-800/60 bg-amber-950/40 px-1 py-px font-mono text-[9px] text-amber-300" title="Aún no escrito en el sandbox: sincroniza o espera al AUTO">
                                    sin sincronizar
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums">
                                {f.size >= 1024 * 1024 ? `${(f.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteFile(f.id);
                                }}
                                className="shrink-0 p-1 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 rounded transition-colors"
                                title="Eliminar archivo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 🔧 Pestaña Skills (100) ELIMINADA de la UI.
          Las 100 skills viven dentro del motor (contextCache.ts las inyecta
          al system prompt en el turno 1 como mensajes ocultos). No es necesario
          verlas como panel separado — el usuario puede pedirlas por chat:
          "lista las skills", "activa la skill de parsing", etc. */}

      {/* TAB CONTENT: TERMINAL / LOGS */}
      {activeTab === "terminal" && (
        <div className="flex-1 flex flex-col bg-[#020306] overflow-hidden">
          {/* Terminal toolbar */}
          <div className="h-9 bg-[#060912] border-b border-[#141d2e] px-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-cyan-400 font-bold">TERMINAL</span>
              <span className="text-zinc-600 text-[10px] hidden sm:inline">sandbox real · .proyectos</span>
            </div>
            <div className="flex items-center gap-1">
              {onSyncProject && (
                <button
                  onClick={async () => {
                    // v1.0.17 · SYNC del terminal: escribe el workspace y, si hay algo
                    // nuevo que ver, abre el sandbox. Los textos largos viven en
                    // informarSync(); aquí queda la secuencia, escrita de un tirón.
                    const n = await onSyncProject?.();
                    const count = Number(n) || 0;
                    // v1.0.19 · el Sync del terminal abre el preview si HUBO archivos
                    // escritos: antes `count` era una constante 0 y la rama nunca entraba.
                    if (count > 0 && sbOnlineRef.current && !sbWorkingRef.current) {
                      ultimaEdicionEnArbolRef.current = 0;
                      ultimaAperturaPorEdicionRef.current = Date.now();
                      setActiveTab("sandbox");
                      setIframeKey((k) => k + 1);
                    }
                    await informarSync(count);
                  }}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 text-[10px] font-mono transition-colors"
                  title="Escribir archivos del workspace en el disco del sandbox (y abrir el preview si editaste en el árbol)"
                >
                  <Download className="w-3 h-3" />
                  Sync
                </button>
              )}
              {onPullProject && (
                <button
                  onClick={onPullProject}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 text-[10px] font-mono transition-colors"
                  title="Traer del sandbox al editor los archivos que el agente creó"
                >
                  <FolderOpen className="w-3 h-3" />
                  Pull
                </button>
              )}
              {onBuildProject && (
                // v1.72.0 — el boton refleja el bucle: mientras corre muestra la
                // vuelta y queda apagado. Antes parecia libre y un segundo clic
                // montaba otro bucle encima (la guarda esta en App).
                <button
                  onClick={onBuildProject}
                  disabled={!!buildFix?.active}
                  className={"flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono transition-colors " + (buildFix?.active ? "bg-cyan-950 text-cyan-500 border-cyan-900 cursor-wait" : "bg-cyan-800 hover:bg-cyan-700 text-cyan-100 border-cyan-600")}
                  title={buildFix?.active ? "Bucle autonomo en marcha" : "Compilar y corregir automáticamente (bucle autónomo)"}
                >
                  <Play className="w-3 h-3" />
                  {buildFix?.active ? "Compilando " + (buildFix.iteration + 1) + "/" + buildFix.max : "Compilar"}
                </button>
              )}
            </div>
          </div>

          {/* Output area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-mono text-[11px] leading-relaxed text-zinc-300">
            <div className="text-zinc-500 mb-1">=== TELEMETRÍA Y LOGS ===</div>
            {terminalLogs.length === 0 ? (
              <div className="text-zinc-600">Sin registros del sistema.</div>
            ) : (
              terminalLogs.map((log, i) => (
                <div key={`sys-${i}`} className="py-0.5 text-zinc-500">
                  {log}
                </div>
              ))
            )}
            <div className="text-zinc-500 mt-2 mb-1 border-t border-zinc-800 pt-2">=== COMANDOS ===</div>
            {termLines.length === 0 && (
              <div className="text-zinc-600">Escribe un comando abajo (ej: ls, node -v, npm run build).</div>
            )}
            {termLines.map((line, i) => (
              <div
                key={`t-${i}`}
                className={`whitespace-pre-wrap break-words ${
                  line.startsWith("$ ")
                    ? "text-cyan-300"
                    : line.startsWith("[exit") || line.startsWith("[error")
                    ? "text-red-400"
                    : "text-zinc-300"
                }`}
              >
                {line}
              </div>
            ))}
            <div ref={termEndRef} />
          </div>

          {/* Command input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runCommand();
            }}
            className="h-9 bg-[#060912] border-t border-[#141d2e] flex items-center gap-2 px-2 shrink-0 font-mono"
          >
            <span className="text-emerald-400 text-[11px]">$</span>
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (cmdHistory.length > 0) {
                    const idx = historyIdx < 0 ? 0 : Math.min(historyIdx + 1, cmdHistory.length - 1);
                    setHistoryIdx(idx);
                    setCommandInput(cmdHistory[idx]);
                  }
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  if (historyIdx >= 0) {
                    const idx = historyIdx - 1;
                    setHistoryIdx(idx);
                    setCommandInput(idx < 0 ? "" : cmdHistory[idx]);
                  }
                }
              }}
              placeholder="ls / node -v / npm run build / python x.py..."
              className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-600 outline-none text-[11px]"
              disabled={isRunning}
            />
            <button
              type="submit"
              disabled={isRunning || !commandInput.trim()}
              className="p-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded transition-colors"
              title="Ejecutar comando"
            >
              {isRunning ? (
                <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
