import React, { useState, useEffect } from "react";
// v1.98.0 · el embedder sale a la luz: qué modelo vectoriza, por qué ese y cuánto falta.
import PanelEmbedder from "./PanelEmbedder";
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  Cpu,
  Globe,
  HardDrive,
  Key,
   Layers,
   Network,
   Radio,
   RefreshCw,
   Server,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Zap,
  Plus,
  Trash2,
  BookOpen,
  Wand2,
  ArrowRight,
} from "lucide-react";
import { ChatMessage, ModelProvider, PortTelemetry, SubagentItem } from "../types";
import {
  addMemoryRule,
  autoImproveMemory,
  deleteMemoryRule,
  loadMemoryRules,
  MemoryRule,
} from "../utils/memory";
import {
  addLanguageMemoryEntry,
  deleteLanguageMemoryEntry,
  LanguageMemoryEntry,
  loadLanguageMemories,
} from "../utils/languageMemory";
// v2.2.4 · Este panel ya no pinta puertos (la lista única vive en Tareas), así que
// tampoco escucha el latido. Era un SEGUNDO sondeo de `/api/coreo` corriendo junto
// al de la espina: dos consumidores del mismo latido, dos interpretaciones. La salud
// medida del 3000 la sigue leyendo quien la muestra: `EspinaActividad`.

interface LeftSidebarProps {
  provider: ModelProvider;
  onSelectProvider: (p: ModelProvider) => void;
  currentModel: string;
  onSelectModel: (m: string) => void;
  availableModels: { name: string; size?: number; details?: any }[];
  ollamaUrl: string;
  onUpdateOllamaUrl: (url: string) => void;
  temperature: number;
  onUpdateTemperature: (t: number) => void;
  telemetry: PortTelemetry;
  onRefreshTelemetry: () => void;
  subagents?: { bridge: string; items: SubagentItem[] };
  pcMode?: boolean;
  onTogglePcMode?: () => void;
  onReconnectAll?: () => void;
  isReconnecting?: boolean;
  onOpenModelSelector: () => void;
  onOpenApiKeyModal?: () => void;
  maxRamGb?: number;
  onUpdateMaxRam?: (ram: number) => void;
  onPurgeMemory?: () => void;
  chatMessages?: ChatMessage[];
  onAppendToMemoriaFile?: (ruleText: string) => void;
  openrouterApiKey?: string;
  onUpdateOpenrouterApiKey?: (key: string) => void;
  customServerUrl?: string;
  onUpdateCustomServerUrl?: (url: string) => void;
  customApiKey?: string;
  onUpdateCustomApiKey?: (key: string) => void;
  onRefreshModels?: () => void;
  isRefreshingModels?: boolean;
  /**
   * v1.16.3.1 · BAJO CONSUMO: qué tiene Ollama residente en RAM ahora mismo
   * (llega de /api/system/stats → bloque ollama, medido, no supuesto).
   */
  ollamaStats?: { vivo: boolean; residenteMb: number; modelos: { model: string; sizeMb: number | null; until: string; expirado: boolean }[]; error?: string } | null;
  onExpulsarModelos?: () => void;
  isExpulsando?: boolean;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  provider,
  onSelectProvider,
  currentModel,
  onSelectModel,
  availableModels,
  ollamaUrl,
  onUpdateOllamaUrl,
  temperature,
  onUpdateTemperature,


  subagents,
  pcMode = false,
  onTogglePcMode,

  isReconnecting = false,
  onOpenModelSelector,
  onOpenApiKeyModal,
  maxRamGb = 8,
  onUpdateMaxRam,
  onPurgeMemory,
  chatMessages = [],
  onAppendToMemoriaFile,
  openrouterApiKey = "",
  onUpdateOpenrouterApiKey,
  customServerUrl = "",
  onUpdateCustomServerUrl,
  customApiKey = "",
  onUpdateCustomApiKey,
  onRefreshModels,
  isRefreshingModels = false,
  ollamaStats = null,
  onExpulsarModelos,
  isExpulsando = false,
}) => {
  const [activeTab, setActiveTab] = useState<"config" | "memory" | "ports">("config");

  // Memory & Brain State
  const [memoryRules, setMemoryRules] = useState<MemoryRule[]>([]);
  const [langMemories, setLangMemories] = useState<LanguageMemoryEntry[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [newInstruction, setNewInstruction] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryRule["category"]>("architecture");
  const [autoImproveFeedback, setAutoImproveFeedback] = useState<string | null>(null);
  const [isAutoImproveEnabled, setIsAutoImproveEnabled] = useState(true);
  const [memorySubTab, setMemorySubTab] = useState<"rules" | "add" | "autolearn" | "idioms">("rules");

  // Load rules on mount
  useEffect(() => {
    setMemoryRules(loadMemoryRules());
    setLangMemories(loadLanguageMemories());
  }, []);

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim() || !newInstruction.trim()) return;

    const created = addMemoryRule({
      topic: newTopic.trim(),
      instruction: newInstruction.trim(),
      category: newCategory,
    });

    setMemoryRules(loadMemoryRules());
    if (onAppendToMemoriaFile) {
      onAppendToMemoriaFile(`\n- **${created.topic}**: ${created.instruction}`);
    }

    setNewTopic("");
    setNewInstruction("");
    setMemorySubTab("rules");
    setAutoImproveFeedback(`Regla añadida al cerebro: "${created.topic}"`);
    setTimeout(() => setAutoImproveFeedback(null), 3000);
  };

  const handleDeleteRule = (id: string) => {
    deleteMemoryRule(id);
    setMemoryRules(loadMemoryRules());
  };

  const handleRunAutoImprove = () => {
    const result = autoImproveMemory(chatMessages);
    setMemoryRules(loadMemoryRules());
    setAutoImproveFeedback(result.summary);
    if (onAppendToMemoriaFile && result.addedRules.length > 0) {
      result.addedRules.forEach((r) => {
        onAppendToMemoriaFile(`\n- **[Automejora] ${r.topic}**: ${r.instruction}`);
      });
    }
    setTimeout(() => setAutoImproveFeedback(null), 4000);
  };


  return (
    <aside data-cn="explorador" className="w-full h-full flex flex-col bg-[#03050a] border-r border-[#121a2c] overflow-hidden text-xs">
      {/* Tab Navigation */}
      <div className="h-10 bg-[#060912] border-b border-[#121a2c] flex items-center justify-around px-1 shrink-0">
        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-all ${
            activeTab === "config"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          title="Configuración de Modelos y Servidores"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Motor</span>
        </button>

        <button
          onClick={() => setActiveTab("memory")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-all ${
            activeTab === "memory"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          title="Banco de Memoria CerebroNico"
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Memoria</span>
        </button>

        <button
          onClick={() => setActiveTab("ports")}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-medium transition-all ${
            activeTab === "ports"
              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
          title="Motor local — residencia de Ollama, embedder y subagentes (la lista de servicios vive en Tareas)"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Puertos</span>
        </button>
      </div>

      {/* TAB CONTENT: CONFIG & ENGINE */}
      {activeTab === "config" && (
        <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar bg-[#020408]/85 backdrop-blur-md">
          {/* Quick API Slots Banner — botón único al modal completo */}
          <div className="p-3 bg-gradient-to-r from-cyan-950/60 to-blue-950/60 border border-cyan-500/40 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Ranuras de API Keys</h4>
                <p className="text-[10px] text-zinc-400">OpenAI · Gemini · OpenRouter · Custom · Groq · Cerebras</p>
              </div>
            </div>
            {onOpenApiKeyModal && (
              <button
                onClick={onOpenApiKeyModal}
                className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 rounded-md text-[11px] font-medium transition-all"
              >
                Abrir Ranuras
              </button>
            )}
          </div>

          {/* Provider Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
              Proveedor de Inferencia
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["ollama", "gemini", "zai", "groq", "cerebras", "together", "mistral", "deepseek", "fireworks", "openrouter", "custom"] as ModelProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onSelectProvider(p)}
                  className={`px-3 py-2 rounded-lg border text-left font-mono font-medium capitalize transition-all ${
                    provider === p
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                      : "bg-[#060913] border-[#131b2c] text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  {p === "ollama" ? "🦙 Ollama" : p === "gemini" ? "✨ Gemini" : p === "zai" ? "🔮 Z.ai" : p === "groq" ? "⚡ Groq" : p === "cerebras" ? "🧠 Cerebras" : p === "together" ? "🤝 Together" : p === "mistral" ? "🌀 Mistral" : p === "deepseek" ? "🔍 DeepSeek" : p === "fireworks" ? "🎆 Fireworks" : p === "openrouter" ? "🌐 OpenRouter" : p}
                </button>
              ))}
            </div>
          </div>

          {/* Ollama Host URL */}
          {provider === "ollama" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                Endpoint Servidor Ollama
              </label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => onUpdateOllamaUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="w-full bg-[#060913] border border-[#182338] rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono outline-none focus:border-cyan-500"
              />
            </div>
          )}

          {/* 🔧 Ranuras de API eliminadas del LeftSidebar — ahora solo viven en el
              modal "Ranuras de API Keys" (botón "Abrir Ranuras" arriba).
              Antes estaban duplicadas aquí y en el ApiKeyModal, ocupando espacio innecesario. */}

          {/* Active Model Selector Card */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                Modelo Activo
              </label>
              <div className="flex items-center gap-2">
                {onRefreshModels && (
                  <button
                    onClick={onRefreshModels}
                    disabled={isRefreshingModels}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 transition-colors"
                    title="Autodetectar modelos locales en Ollama"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingModels ? "animate-spin text-amber-400" : ""}`} />
                    <span>{isRefreshingModels ? "Buscando..." : "Autodetectar"}</span>
                  </button>
                )}
                <button
                  onClick={onOpenModelSelector}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Catálogo ({availableModels.length})
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#050811] border border-cyan-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-cyan-300 text-sm truncate">
                  {currentModel}
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/40">
                  Activo
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Asignado para orquestación, compilación de archivos y refactorización continua.
              </p>
              <button
                onClick={onOpenModelSelector}
                className="w-full py-1.5 bg-[#0a101f] hover:bg-[#0f172e] border border-[#182338] text-zinc-200 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                <span>Explorar Modelos & Autodetección</span>
              </button>
            </div>
          </div>

          {/* Temperature Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-zinc-300">
              <label className="text-[11px] font-semibold uppercase tracking-wider">
                Temperatura de Inferencia
              </label>
              <span className="font-mono text-cyan-300">{temperature}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.2"
              step="0.05"
              value={temperature}
              onChange={(e) => onUpdateTemperature(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>0.1 (Precisión Técnica)</span>
              <span>1.2 (Creativo)</span>
            </div>
          </div>

          {/* RAM Regulator (Regulador de Max RAM para optimizar recursos en segundo plano) */}
          <div className="p-3 bg-[#050811] border border-[#131b2c] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-200">
                  Regulador de Max RAM
                </span>
              </div>
              <span className="font-mono text-indigo-300 font-bold text-xs">{maxRamGb} GB</span>
            </div>
            <input
              type="range"
              min="2"
              max="32"
              step="2"
              value={maxRamGb}
              onChange={(e) => onUpdateMaxRam && onUpdateMaxRam(parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
              <span>2 GB (Mínimo)</span>
              <span>16 GB</span>
              <span>32 GB (Máximo)</span>
            </div>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] text-zinc-400">Limita buffers en segundo plano</span>
              {onPurgeMemory && (
                <button
                  type="button"
                  onClick={onPurgeMemory}
                  className="px-2 py-1 bg-[#090e1c] hover:bg-[#0f172e] text-indigo-300 hover:text-indigo-200 rounded text-[10px] font-mono border border-[#182338] transition-colors"
                >
                  Liberar RAM
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MEMORY & BRAIN MANAGEMENT & AUTO-IMPROVEMENT */}
      {activeTab === "memory" && (
        <div className="flex-1 p-3.5 space-y-3 overflow-y-auto custom-scrollbar bg-[#020408]/85 backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-cyan-400" />
              <span>Cerebro & Banco de Memoria</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 bg-cyan-950/80 text-cyan-300 rounded border border-cyan-800 font-mono">
              {memoryRules.length} Reglas
            </span>
          </div>

          {/* Feedback banner */}
          {autoImproveFeedback && (
            <div className="p-2 bg-emerald-950/80 border border-emerald-700/80 rounded-lg text-[11px] text-emerald-300 font-mono flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{autoImproveFeedback}</span>
            </div>
          )}

          {/* Sub-tabs */}
          <div className="grid grid-cols-3 gap-1 bg-[#111726] p-1 rounded-lg border border-zinc-800 text-[11px]">
            <button
              onClick={() => setMemorySubTab("rules")}
              className={`py-1 rounded font-medium transition-all ${
                memorySubTab === "rules"
                  ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Reglas ({memoryRules.length})
            </button>
            <button
              onClick={() => setMemorySubTab("add")}
              className={`py-1 rounded font-medium flex items-center justify-center gap-1 transition-all ${
                memorySubTab === "add"
                  ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Plus className="w-3 h-3" />
              <span>Añadir</span>
            </button>
            <button
              onClick={() => setMemorySubTab("autolearn")}
              className={`py-1 rounded font-medium flex items-center justify-center gap-1 transition-all ${
                memorySubTab === "autolearn"
                  ? "bg-amber-600/30 text-amber-300 border border-amber-500/40"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Automejora</span>
            </button>
          </div>

          {/* SUB-VIEW 1: ACTIVE RULES */}
          {memorySubTab === "rules" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Directivas activas en memoria:</span>
                <button
                  onClick={() => setMemorySubTab("add")}
                  className="text-cyan-400 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Añadir Nueva
                </button>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                {memoryRules.map((rule, idx) => (
                  <div
                    key={rule.id}
                    className="p-2.5 bg-zinc-900/90 border border-zinc-800/90 rounded-lg group hover:border-cyan-800/60 transition-all text-xs"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="font-mono text-[10px] text-zinc-500">#{idx + 1}</span>
                        <span className="font-semibold text-zinc-200 truncate">{rule.topic}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono uppercase ${
                            rule.category === "architecture"
                              ? "bg-blue-950 text-blue-300 border border-blue-800"
                              : rule.category === "language"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : rule.category === "ports"
                              ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                              : "bg-purple-950 text-purple-300 border border-purple-800"
                          }`}
                        >
                          {rule.category}
                        </span>
                      </div>
                      {rule.id.startsWith("mem-") && memoryRules.length > 2 && (
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-950 text-zinc-500 hover:text-rose-400 rounded transition-all"
                          title="Eliminar regla de memoria"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-400 text-[11px] mt-1 leading-relaxed pl-4 border-l border-zinc-800">
                      {rule.instruction}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUB-VIEW 2: ADD NEW MEMORY RULE */}
          {memorySubTab === "add" && (
            <form onSubmit={handleAddRule} className="space-y-3 bg-[#111726] p-3 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Añadir Información al Cerebro</span>
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">Persistencia Local</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Tópico / Título</label>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="Ej: Estilo de Backend o Regla de UI..."
                  className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Categoría</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-500"
                >
                  <option value="architecture">Arquitectura & Código</option>
                  <option value="language">Idioma & Español Técnico</option>
                  <option value="ports">Puertos (motor local — la lista de 7 vive en Tareas)</option>
                  <option value="anti-slop">Diseño & Anti-Slop</option>
                  <option value="attachments">Procesamiento de Adjuntos</option>
                  <option value="lists">Continuidad Numérica</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase">Instrucción / Directiva</label>
                <textarea
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  placeholder="Describe la regla exacta que CerebroNico debe aplicar siempre..."
                  rows={3}
                  className="w-full bg-[#0a0e17] border border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-200 outline-none focus:border-cyan-500 resize-none leading-relaxed"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-cyan-950/40"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Guardar en el Cerebro / Memoria</span>
              </button>
            </form>
          )}

          {/* SUB-VIEW 3: AUTOMEJORA CONTINUA (SELF-IMPROVEMENT ENGINE) */}
          {memorySubTab === "autolearn" && (
            <div className="space-y-3 bg-[#050811] p-3 rounded-xl border border-amber-900/40 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Motor de Automejora Continua</span>
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                El motor de automejora evalúa las correcciones y requerimientos de cada interacción para consolidar nuevas reglas técnicas y enriquecer el archivo <span className="font-mono text-cyan-300">MEMORIA.md</span>.
              </p>

              {/* Auto-learn switch */}
              <div className="p-2.5 bg-[#03060c] border border-[#141d2e] rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-medium text-zinc-200 text-[11px]">Aprendizaje en Segundo Plano</div>
                  <div className="text-[10px] text-zinc-500">Detecta preferencias automáticamente</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAutoImproveEnabled((p) => !p)}
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                    isAutoImproveEnabled ? "bg-amber-500" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      isAutoImproveEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Run manual synthesis button */}
              <button
                onClick={handleRunAutoImprove}
                className="w-full py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-medium rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>⚡ Sintetizar y Automejorar Ahora</span>
              </button>

              {/* Summary of learned items */}
              <div className="pt-2 border-t border-[#131b2c]">
                <div className="text-[10px] font-mono text-zinc-400 mb-1.5 uppercase">
                  Mapeos Idiomáticos & Jerga Técnica ({langMemories.length})
                </div>
                <div className="space-y-1 max-h-[140px] overflow-y-auto">
                  {langMemories.slice(0, 4).map((lm) => (
                    <div key={lm.id} className="p-1.5 bg-[#020408]/85 backdrop-blur-md rounded border border-[#131b2c] text-[10px] flex items-center justify-between">
                      <span className="text-amber-300 font-mono truncate max-w-[140px]">"{lm.term}"</span>
                      <span className="text-zinc-400 font-mono text-[9px]">{lm.equivalent}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: PORTS */}
      {activeTab === "ports" && (
        <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar bg-[#020408]/85 backdrop-blur-md">
          {/* v2.2.4 · LA LISTA DE PUERTOS YA NO VIVE ACÁ (pedido de Mario 03/11:
              «solo deberías dejar uno… esa pestaña usarla para otra cosa»). La única
              lista con reinicio y encendido/apagado es `Servicios`, en la pestaña
              Tareas, y desde esta versión lee la MISMA muestra de telemetría que leía
              este panel: no hay dos criterios de «arriba» que puedan contradecirse.
              El botón Reconectar viajó con la lista. Acá queda lo que sí es propio de
              esta vista: el motor local. */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>Motor local</span>
            </h3>
            <span className="text-[10px] font-mono text-zinc-500">RAM · embedder · subagentes</span>
          </div>

           {/* 🦙 v1.16.3.1 · MODO BAJO CONSUMO — RAM residente de Ollama, medida
               con GET /api/ps (no supuesta) y con su salida a un clic. El pico
               sostenido que apagaba la PC vivía acá adentro; ahora se ve y se
               expulsa sin abrir la consola. */}
           <div className="p-3 bg-[#050811] border border-[#141d2e] rounded-xl space-y-2 shadow-sm">
             <div className="flex items-center justify-between">
               <span className="text-[10px] font-mono text-zinc-400 uppercase">Residencia Ollama</span>
               <span
                 className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${
                   !ollamaStats?.vivo
                     ? "bg-zinc-800/60 text-zinc-500 border-zinc-700"
                     : ollamaStats.residenteMb > 0
                       ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                       : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                 }`}
                 title={ollamaStats?.error || "Modelos cargados ahora mismo en RAM/VRAM (ollama ps)"}
               >
                 Ollama: {ollamaStats?.vivo ? `${(ollamaStats.residenteMb / 1024).toFixed(1)} GB` : "sin datos"}
               </span>
             </div>
             {ollamaStats?.vivo && ollamaStats.modelos.length > 0 && (
               <div className="space-y-1">
                 {ollamaStats.modelos.map((m) => (
                   <div key={m.model} className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                     <span className="truncate max-w-[150px]" title={m.model}>{m.model}</span>
                     <span className={m.expirado ? "text-zinc-600" : "text-amber-300/90"}>
                       {m.sizeMb !== null ? `${(m.sizeMb / 1024).toFixed(1)} GB` : "—"}
                       {m.expirado ? " · cayendo" : ""}
                     </span>
                   </div>
                 ))}
               </div>
             )}
             {ollamaStats?.vivo && ollamaStats.modelos.length === 0 && (
               <p className="text-[10px] text-zinc-500">Nada residente: la RAM libre. El modelo se carga solo con la primera respuesta y se expulsa al caducar su escalón MR (3m/5m).</p>
             )}
             {!ollamaStats?.vivo && (
               <p className="text-[10px] text-zinc-500">{ollamaStats?.error || "Esperando la primera muestra del monitor…"}</p>
             )}
             <button
               type="button"
               onClick={onExpulsarModelos}
               disabled={!onExpulsarModelos || isExpulsando || !ollamaStats?.vivo || ollamaStats.modelos.length === 0}
               className={`w-full py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                 isExpulsando
                   ? "bg-zinc-800/60 text-zinc-500 border-zinc-700 cursor-wait"
                   : !ollamaStats?.vivo || ollamaStats.modelos.length === 0
                     ? "bg-[#0b101c] text-zinc-600 border-[#182338] cursor-not-allowed"
                     : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30"
               }`}
               title="Descarga los modelos residentes YA (keep_alive 0). No borra nada del disco: la próxima respuesta recarga el modelo solo."
             >
               {isExpulsando ? "Expulsando…" : "⏏ Expulsar modelos (liberar RAM)"}
             </button>
           </div>

           {/* v1.98.0 · el log decía «fallback por palabra» cada turno y la interfaz
               nunca mostraba el embedder: acá se ve el modelo elegido por residencia,
               cuánto recuerdo está vectorizado y se puede calentar a pedido. */}
           <div className="pt-1">
             <PanelEmbedder />
           </div>

           {/* ---- Topología de Subagentes (estado en vivo) ---- */}
           <div className="pt-1">
             <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                 <Network className="w-4 h-4 text-fuchsia-400" />
                 <span>Subagentes</span>
               </h3>
               <span className="text-[10px] text-zinc-500 font-mono">topología en vivo</span>
             </div>

             {/* Toggle Modo Agente PC */}
             <button
               type="button"
               onClick={onTogglePcMode}
               disabled={!onTogglePcMode}
               className={`w-full mb-3 p-2.5 rounded-xl border text-left transition-all ${
                 pcMode
                   ? "bg-emerald-950/50 border-emerald-600/60"
                   : "bg-[#050811] border-[#141d2e] hover:border-emerald-700/40"
               }`}
               title="Habilita que el chat ejecute acciones REALES en tu PC (archivos, comandos) vía el puente :5000."
             >
               <div className="flex items-center justify-between">
                 <span className={`text-xs font-semibold flex items-center gap-1.5 ${pcMode ? "text-emerald-300" : "text-zinc-300"}`}>
                   <Cpu className={`w-3.5 h-3.5 ${pcMode ? "text-emerald-400" : "text-zinc-500"}`} />
                   Modo Agente PC (puente :5000)
                 </span>
                 <span
                   className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                     pcMode
                       ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                       : "bg-zinc-800/60 text-zinc-400 border-zinc-700"
                   }`}
                 >
                   {pcMode ? "ACTIVO" : "INACTIVO"}
                 </span>
               </div>
               <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
                 {pcMode
                   ? "El chat puede crear/editar archivos y ejecutar comandos en tu PC real."
                   : "Actívalo para que el chat delegue acciones reales (Escritorio, comandos, etc.) al agente :5000."}
               </p>
             </button>

             {/* Lista de subagentes */}
             <div className="space-y-1.5">
               {(subagents?.items || []).map((s) => {
                 const online = s.status === "online";
                 return (
                   <div
                     key={s.id}
                     className="p-2.5 bg-[#050811] border border-[#141d2e] rounded-lg flex items-start gap-2"
                   >
                     <span
                       className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                         online ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-zinc-600"
                       }`}
                     />
                     <div className="min-w-0">
                       <div className="text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 truncate">
                         <span className="truncate">{s.name}</span>
                         {s.port ? <span className="text-[10px] font-mono text-zinc-500 shrink-0">:{s.port}</span> : null}
                       </div>
                       <div className="text-[10px] text-zinc-500 leading-snug" title={s.role}>
                         {s.role}
                       </div>
                     </div>
                   </div>
                 );
               })}
             </div>
           </div>
         </div>
       )}

     </aside>
   );
 };
