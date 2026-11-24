/**
 * orquestador.ts — EL ORQUESTADOR ÚNICO DE ESPEJOS (Reflejo v3.0 / Paso 1)
 * ========================================================================
 * Sustituye a la lógica dispersa que en v2.x vivía entre consejo.ts,
 * conductor.ts y planExecutors.ts. Aquí hay UN solo planificador, declarativo,
 * que aplica leyes (físicas, matemáticas, lingüísticas, científicas,
 * cuánticas, antropológicas, transformables, creadoras, financieras,
 * integradoras, de planificación, personalizadas y autoaprendibles) y
 * devuelve el espejo + datos que hay que invocar. El catálogo de familias NO
 * está fijado a mano: se deriva de las leyes vivas (ver `estadoOrquestador`),
 * así que añadir una familia = añadir una ley, sin tocar documentación ni
 * mensajes (la confesión de «ninguna ley encaja» cuenta las familias reales).
 *
 * Reglas de hierro (heredadas del Reflejo v2.4):
 *   1. Cero filtro de contenido: la frase viaja tal cual al patrón.
 *   2. Nada se descarta en silencio: si ninguna ley encaja, devuelve null
 *      y el planificador cae al modelo. La decisión es audible.
 *   3. Las leyes se cargan desde LEYES_REFLEJO (array declarativo). Añadir
 *      una ley = añadir una entrada al array, sin tocar el dispatch.
 *
 * Contrato:
 *   planificadorPorLeyes(frase) → { espejo, datos, ley, ms } | null
 *
 * Si devuelve null, el llamador debe usar el modelo. Si devuelve un espejo,
 * el llamador debe invocarlo con `ejecutarEntidad(espejo, datos)`.
 *
 * Las leyes se ordenan por `prioridad` ascendente (1 = más alta). Reflejo v5:
 * se prueban TODAS y se decide por confianza; en igualdad de condiciones gana
 * la de menor prioridad y, en empate final, el id alfabéticamente menor. Con
 * dos espejos distintos casi empatados el orquestador CONFIESA la duda en vez
 * de adivinar (cero alucinación de enrutamiento).
 */

// ─── Tipos ─────────────────────────────────────────────────────────────────

export interface LeyReflejo {
  /** id corto, único. Se devuelve en `ley` para que el llamador sepa cuál aplicó. */
  id: string;
  /** Familia (física, matemática, lingüística, científica, cuántica,
   *  antropológica, extensible, transformable, autoaprendible). */
  familia: string;
  /** 1 = máxima prioridad (se prueba primero). Mayor = se prueba después. */
  prioridad: number;
  /** Regex que, si matchea, activa la ley. */
  patron: RegExp;
  /** Devuelve los `datos` que se le pasan al espejo. Recibe el match del patrón. */
  datos: (m: RegExpMatchArray) => Record<string, unknown> | null;
  /** Opcional: transforma la frase antes de pasarla al patrón. Por defecto
   *  no transforma. Útil para leyes que normalizan sinónimos. */
  transformar?: (frase: string) => string;
  /** Espejo destino (id `espejo.*`). */
  espejo: string;
  /** Descripción humana, una línea. Se devuelve como `ley`. */
  descripcion: string;
  // ─── Reflejo v5 · confianza y plantilla ────────────────────────────────────
  /** Confianza base de la ley (0..1). Si no se declara, se deriva: leyes con
   *  extracción numérica/de unidades valen 0.85; de solo palabra-clave, 0.70;
   *  aprendidas sin plantilla, 0.60. */
  confianza?: number;
  /**
   * Plantilla serializable de `datos` para LEYES APRENDIDAS: cada campo se
   * rellena con `$1..$9` (grupo del regex) o `$input` (frase completa).
   * Sin plantilla, una ley aprendida no puede reconstruir su función `datos`
   * tras el reinicio (las funciones no se serializan) — este campo es la cura
   * del bug v1.0.3: las leyes aprendidas morían en silencio al recargar.
   */
  plantilla?: Record<string, string>;
  // ─── Reflejo v3.0 · extensión A+B ────────────────────────────────────────
  /** Opcional: si se define, esta ley despacha a un Ollama EXTERNO (no al
   *  espejo determinista local). El endpoint recibe `datos` como JSON y se
   *  espera que devuelva el formato de Ollama (`{response, ...}`).
   *
   *  Soporta placeholders: {prompt} se reemplaza por `datos.prompt` (o la
   *  frase cruda si no hay), {model} por `endpointModel`, {system} por
   *  `endpointSystem`.
   *
   *  Ejemplo: "http://ollama-medicina:11434/api/generate" con
   *  endpointModel: "medicina-v1" y endpointSystem: "Eres un espejo clínico…".
   *
   *  Si se define, el orquestador devuelve `modo: "ollama-externo"` en vez
   *  de `modo: "espejo-local"`. El llamador (server.ts) decide cómo despachar.
   */
  endpoint?: string;
  /** Modelo Ollama del endpoint externo. Solo aplica si `endpoint` está definido. */
  endpointModel?: string;
  /** System prompt del endpoint externo. Solo aplica si `endpoint` está definido. */
  endpointSystem?: string;
}

// ─── LAS FAMILIAS DE LEYES (hoy 12: física, matemática, lingüística, ──────────
// científica, cuántica, antropológica, transformable, creadora, financiera,
// integradora, planificación, personalizada; + autoaprendible al cargar leyes
// aprendidas). El número NO se repite a mano en ningún mensaje: se cuenta de
// las leyes vivas para que nunca mienta al evolucionar el catálogo. ──────────

export const LEYES_REFLEJO: LeyReflejo[] = [
  // ═══════════════ FÍSICA ═══════════════
  {
    id: "fis-conv",
    familia: "física",
    prioridad: 10,
    patron: /\b(\d+(?:[.,]\d+)?)\s*(km|cm|mm|m|kg|g|mg|N|J|W|Pa|Hz|V|A|Ω|F|C|K|mol|cd)\s+(?:a|en|to)\s+(km|cm|mm|m|kg|g|mg|N|J|W|Pa|Hz|V|A|Ω|F|C|K|mol|cd)\b/i,
    datos: (m) => {
      const cantidad = parseFloat((m[1] || "0").replace(",", "."));
      return { de: m[2].toLowerCase(), a: m[3].toLowerCase(), cantidad };
    },
    espejo: "espejo.fisicos",
    descripcion: "física: conversión de unidades SI",
  },
  {
    id: "fis-expr",
    familia: "física",
    prioridad: 11,
    patron: /\b(?:calcula|evalua|resuelve|cuanto vale|cuanto es)\s+(?:la\s+)?(energ[ií]a|fuerza|potencia|presi[oó]n|frecuencia|tensio?n|corriente|resistencia|capacidad|carga|temperatura)\b/i,
    datos: (m) => {
      // Mapa hispano → símbolo SI
      const map: Record<string, string> = {
        energia: "E", fuerza: "F", potencia: "P", presion: "p", frecuencia: "f",
        tension: "V", voltaje: "V", corriente: "I", resistencia: "R",
        capacidad: "C", carga: "Q", temperatura: "T",
      };
      const simbolo = map[(m[1] || "").toLowerCase()] || "X";
      return { expresion: simbolo };
    },
    espejo: "espejo.fisicos",
    descripcion: "física: magnitud física con su símbolo SI",
  },

  // ═══════════════ MATEMÁTICAS ═══════════════
  {
    id: "mat-sqrt",
    familia: "matemática",
    prioridad: 20,
    patron: /\b(?:ra[ií]z\s+cuadrada\s+de|sqrt)\s+(-?\d+(?:[.,]\d+)?)\b/i,
    datos: (m) => ({ expresion: `sqrt(${(m[1] || "0").replace(",", ".")})` }),
    espejo: "espejo.matematicos",
    descripcion: "matemática: raíz cuadrada explícita",
  },
  {
    id: "mat-mcd",
    familia: "matemática",
    prioridad: 21,
    patron: /\b(?:mcd|m[aá]ximo\s+com[uú]n\s+divisor)\s+(?:de\s+)?(\d+(?:\s*,\s*|\s+y\s+|,?\s+)\d+(?:[.,]\d+)?(?:\s*,\s*|\s+y\s+|,?\s+)?\d*)\b/i,
    datos: (m) => {
      const partes = (m[1] || "").split(/,\s*|\s+y\s+|\s+/).map((s) => parseInt(s.replace(/[.,].*/, ""), 10)).filter((n) => Number.isInteger(n));
      return { enteros: partes };
    },
    espejo: "espejo.matematicos",
    descripcion: "matemática: mcd de una lista de enteros",
  },
  {
    id: "mat-estad",
    familia: "matemática",
    prioridad: 22,
    patron: /\b(?:estad[ií]stica|estadisticas|media|mediana|moda|desviaci[oó]n)\s+(?:de\s+)?([\d\s,.-]+)/i,
    datos: (m) => {
      const datos = (m[1] || "").split(/[\s,]+/).map((s) => parseFloat(s.replace(",", "."))).filter((n) => Number.isFinite(n));
      return { datos, accion: "estadistica" };
    },
    espejo: "espejo.matematicos",
    descripcion: "matemática: estadística descriptiva",
  },
  {
    id: "mat-expr",
    familia: "matemática",
    prioridad: 25,
    // v1.54.1 · GUARDA CLÍNICA: el patrón admite letras ([a-z]) y por eso
    // «calcula el IMC de un paciente de 70 kg y 1.75 m» entraba aquí y
    // empataba con med-calculo (0.95 vs 0.97, margen 0.02 < 0.08).
    // Si la frase es clínica, la aritmética genérica NO aplica: se cede
    // el turno a la ley específica en vez de inflar confianzas.
    patron: /\b(?:calcula|evalua|resuelve|cuanto vale|cuanto es)\s+([\d\s+\-*/%^().,a-z×÷]+?)(?:\s*(?:\.|$))/i,
    datos: (m) => {
      const frase = String(m.input || "").toLowerCase();
      const clinico = /\b(?:imc|i\.m\.c\.|superficie\s+corporal|aclaramiento|cockcroft|mg\/kg|dosis|paciente|creatinina)\b/.test(frase);
      if (clinico) return null;
      return { expresion: (m[1] || "").trim().replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/") };
    },
    espejo: "espejo.matematicos",
    descripcion: "matemática: expresión aritmética libre",
  },

  // ═══════════════ LINGÜÍSTICA ═══════════════
  {
    id: "ling-idioma",
    familia: "lingüística",
    prioridad: 30,
    patron: /\b(?:detecta|identifica|qu[eé]\s+idioma|en\s+qu[eé]\s+idioma)\s+(?:est[aá]\s+|es\s+|va\s+|se\s+encuentra\s+)?(?:este\s+|esta\s+)?(?:texto|frase|p[aá]rrafo|mensaje)\s*:?\s*["“]?([^"”]+)["”]?/i,
    datos: (m) => ({ texto: (m[1] || "").trim() }),
    espejo: "espejo.lenguajes",
    descripcion: "lingüística: detección de idioma",
  },
  {
    id: "ling-legibilidad",
    familia: "lingüística",
    prioridad: 31,
    patron: /\b(?:legibilidad|qu[eé]\s+tan\s+legible|qu[eé]\s+tan\s+dif[ií]cil|lectura|f[aá]cil\s+de\s+leer)\b/i,
    datos: (m) => ({ texto: "" }),  // El espejo pedirá el texto aparte; aquí solo marcamos intención
    espejo: "espejo.lenguajes",
    descripcion: "lingüística: perfil de legibilidad",
  },

  // ═══════════════ CIENTÍFICAS ═══════════════
  {
    id: "cie-exp",
    familia: "científica",
    prioridad: 40,
    patron: /\b(?:dise[ñn]a?\s+un\s+experimento|experimento|hip[oó]tesis|prueba\s+estad[ií]stica|test\s+de\s+hip[oó]tesis|t-test|chi\s+cuadrado|anova)\b/i,
    datos: (m) => {
      const txt = (m[0] || "").toLowerCase();
      const prueba = /anova/.test(txt) ? "ANOVA" : /chi/.test(txt) ? "chi-cuadrado" : /t-test|t de student|t-?test/.test(txt) ? "T-test" : "auto";
      return { prueba, datos: [] };
    },
    espejo: "espejo.cientificos",
    descripcion: "científica: diseño experimental",
  },
  {
    // v1.53.6 · PASO 2 (hoja de ruta v1.54): sube la cobertura CIENTÍFICA (era 1 sola
    // ley). Esta despacha al PODER real `tam_amostral` de espejo.cientificos — el
    // cálculo del tamaño de muestra sale EXACTO del espejo, no de la cabeza del modelo.
    id: "cie-muestra",
    familia: "científica",
    prioridad: 38,
    confianza: 0.88,
    patron: /\b(?:tama[ñn]o\s+de\s+(?:la\s+)?muestra|muestra\s+(?:m[ií]nima|para|de)|cu[aá]nt[oa]s?\s+(?:personas|encuestad\w*|sujetos|casos|individuos)\s+(?:encuestar|necesito|hacen\s+falta|debo|tengo\s+que)|sample\s+size)\b/i,
    datos: (m) => {
      const frase = (m.input || "").toLowerCase();
      // población / universo (admite separadores de miles: 5.000 / 5,000)
      const mPob = frase.match(/(?:poblaci[oó]n|universo)\s*(?:de|=|:)?\s*([\d][\d.,]*)/);
      const poblacion = mPob ? parseInt(mPob[1].replace(/[.,]/g, ""), 10) : 0;
      // nivel de confianza → z
      const mConf = frase.match(/(\d{2})\s*%\s*(?:de\s+)?(?:confian|nivel)/) || frase.match(/confian\w*\s*(?:del?\s*)?(\d{2})\s*%/);
      const nivel = mConf ? parseInt(mConf[1], 10) : 95;
      const z = nivel >= 99 ? 2.576 : nivel >= 97 ? 2.17 : nivel >= 95 ? 1.96 : nivel >= 90 ? 1.645 : 1.96;
      // margen de error (± %)
      const mMar = frase.match(/(?:margen|error)\s*(?:de\s+)?(?:±|\+\/-)?\s*(\d+(?:[.,]\d+)?)\s*%/);
      const margen = mMar ? parseFloat(mMar[1].replace(",", ".")) / 100 : 0.05;
      return { accion: "tam_amostral", poblacion, z, margen, p: 0.5 };
    },
    espejo: "espejo.cientificos",
    descripcion: "científica: tamaño de muestra (n para encuesta)",
  },
  {
    // v1.53.6 · PASO 2: despacha al PODER real `ic` (intervalo de confianza de la media).
    // Confianza 0.93 (no 0.88): «intervalo de confianza» es una intención ESPECÍFICA que
    // DEBE ganarle a la estadística genérica `mat-estad` (0.85) — con 0.88 el margen (0.08)
    // no se superaba y el orquestador declaraba «empate dudoso» en frases IC reales que
    // mencionan media/desviación. 0.93 − 0.85 = 0.08 ⇒ cie-ic gana sin lanzar monedas.
    id: "cie-ic",
    familia: "científica",
    prioridad: 39,
    confianza: 0.93,
    patron: /\b(?:intervalo\s+de\s+confianza|\bIC\b\s*(?:del?\s*)?\d|confidence\s+interval|margen\s+de\s+error\s+de\s+la\s+media)\b/i,
    datos: (m) => {
      const frase = (m.input || "").toLowerCase();
      const num = (re: RegExp) => { const mm = frase.match(re); return mm ? parseFloat(mm[1].replace(",", ".")) : NaN; };
      const media = num(/(?:media|promedio|mean)\s*(?:de|=|:)?\s*(-?\d+(?:[.,]\d+)?)/);
      const desv = num(/(?:desviaci[oó]n(?:\s+est[aá]ndar)?|desv\.?|sigma|σ|\bsd\b)\s*(?:de|=|:)?\s*(\d+(?:[.,]\d+)?)/);
      let n = num(/\bn\s*(?:=|:)?\s*(\d+)/);
      if (!isFinite(n)) n = num(/(\d+)\s*(?:muestras|datos|observaciones|sujetos|casos)/);
      const mConf = frase.match(/(\d{2})\s*%/);
      const nivel = mConf ? parseInt(mConf[1], 10) : 95;
      const z = nivel >= 99 ? 2.576 : nivel >= 95 ? 1.96 : nivel >= 90 ? 1.645 : 1.96;
      return { accion: "ic", media, desv, n, z };
    },
    espejo: "espejo.cientificos",
    descripcion: "científica: intervalo de confianza de la media",
  },

  // ═══════════════ CUÁNTICA ═══════════════
  {
    // v1.53.6 · PASO 2: sube la cobertura CUÁNTICA (eran 2 leyes, ambas por la vía
    // clásica qubits+puertas). Esta despacha al PODER real `entrelazamiento` de
    // espejo.cuantico: calcula la CONCURRENCIA desde amplitudes [a00,a01,a10,a11].
    id: "cnt-amplitudes",
    familia: "cuántica",
    prioridad: 49,
    confianza: 0.9,
    patron: /\b(?:amplitud(?:es)?|concurrencia|grado\s+de\s+entrelazamiento|est[aá]\s+entrelazad)/i,
    datos: (m) => {
      const frase = m.input || "";
      // extrae números decimales (admite negativos y coma decimal); toma los 4 primeros
      const crudos = (frase.match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", ".")));
      let amp = crudos.slice(0, 4);
      if (amp.length !== 4) {
        // sin 4 amplitudes explícitas → estado de Bell |Φ+⟩ = 1/√2(|00⟩+|11⟩)
        const r = Math.SQRT1_2;
        amp = [r, 0, 0, r];
      }
      return { accion: "entrelazamiento", amplitudes: amp };
    },
    espejo: "espejo.cuantico",
    descripcion: "cuántica: concurrencia/entrelazamiento desde amplitudes",
  },
  {
    id: "cnt-qubits",
    familia: "cuántica",
    prioridad: 50,
    patron: /\b(\d+)\s*qubits?\b/i,
    datos: (m) => {
      const n = parseInt(m[1] || "1", 10);
      // Detecta puertas que aparecen en la frase: "h, x, y, z, s, t, cnot{0,1}"
      const puertas: Array<{ p: string; q?: number; t?: number }> = [];
      // 🐞 FIX v1.53.4 (cazado por el harness de enrutado): el escaneo de puertas
      // de UNA letra (h/x/y/z/s/t) atrapaba la «t» de «cnoT 0» y colaba una puerta
      // t@0 FANTASMA junto al CNOT real. Doble blindaje VERIFICADO:
      //   1) se extrae el/los CNOT primero y se BORRAN del texto antes de escanear
      //      puertas simples (así su «t» ya no existe para el escáner);
      //   2) lookbehind (?<![a-zñ]) para no capturar una letra-puerta que vive
      //      DENTRO de una palabra (p.ej. la «x» de «max», la «t» de «set»).
      const crudo = m.input || "";
      const sinCnot = crudo.replace(/cnot\s*(?:\{?\d+\s*,\s*\d+\}?|\s+\d+\s+\d+)/gi, " ");
      const ops = sinCnot.match(/(?<![a-zñ])(?:h|x|y|z|s|t)\s*(?:@|en|sobre)?\s*(\d+)/gi) || [];
      for (const op of ops) {
        const partes = op.match(/(?<![a-zñ])([hxyzt])\s*(?:@|en|sobre)?\s*(\d+)/i);
        if (partes) puertas.push({ p: partes[1].toLowerCase(), q: parseInt(partes[2], 10) });
      }
      const cnot = crudo.match(/cnot\s*(?:\{?(\d+)\s*,\s*(\d+)\}?|\s+(\d+)\s+(\d+))/i);
      if (cnot) {
        const q = parseInt(cnot[1] || cnot[3], 10);
        const t = parseInt(cnot[2] || cnot[4], 10);
        puertas.push({ p: "cnot", q, t });
      }
      return { qubits: Math.max(1, Math.min(8, n)), puertas };
    },
    espejo: "espejo.cuantico",
    descripcion: "cuántica: registro de qubits con puertas",
  },
  {
    id: "cnt-superposicion",
    familia: "cuántica",
    prioridad: 51,
    patron: /\b(?:superposici[oó]n|entrelazamiento|puerta\s+H|hadamard|estado\s+de\s+Bell|par\s+de\s+Bell)\b/i,
    datos: () => ({ qubits: 2, puertas: [{ p: "h", q: 0 }, { p: "cnot", q: 0, t: 1 }] }),
    espejo: "espejo.cuantico",
    descripcion: "cuántica: superposición/entrelazamiento estándar",
  },

  // ═══════════════ ANTROPOLÓGICAS (código, arte) ═══════════════
  {
    id: "ant-codigo",
    familia: "antropológica",
    prioridad: 60,
    patron: /\b(?:analiza|revisa|inventario\s+estructural|s[ií]mbolos|imports?|ciclom[aá]tica)\b/i,
    datos: (m) => {
      // 🐞 DEFECTO v1.0.3 (cazado por el escáner de resiliencia): el ternario
      // original tenía las DOS RAMAS IGUALES (`? "" : ""`) — no era una
      // decisión, era una constante disfrazada: esta ley SIEMPRE entregaba
      // `codigo: ""` y el espejo rechazaba el dato vacío. Un ternario con
      // ramas idénticas es un bug que se disfraza de lógica.
      // Ahora extrae de verdad: si la frase nombra un archivo de código, ese
      // archivo; si no, la frase completa (el espejo decide qué hacer con ella).
      const frase = m.input || "";
      const archivo = /([\w.\-/ ]+\.(?:ts|tsx|js|jsx|mjs|py|rs|go|java|php|rb|c|cpp|h|hpp|css|html|sql|json|yaml|yml))\b/i.exec(frase);
      return { codigo: archivo ? archivo[1].trim() : frase };
    },
    espejo: "espejo.codigos",
    descripcion: "antropológica: inventario estructural de código",
  },
  {
    id: "ant-arte",
    familia: "antropológica",
    prioridad: 61,
    patron: /\b(?:paleta|armon[ií]a\s+crom[aá]tica|colores?\s+compatibles|combinaci[oó]n\s+de\s+colores)\b/i,
    datos: (m) => {
      // Busca un hex en la frase; si no hay, devuelve sin base para que el espejo use su default.
      const hex = (m.input || "").match(/#?([0-9a-fA-F]{6})\b/);
      return hex ? { base: "#" + hex[1] } : {};
    },
    espejo: "espejo.artes",
    descripcion: "antropológica: armonía cromática",
  },
  {
    id: "ant-disenio",
    familia: "antropológica",
    prioridad: 62,
    patron: /\b(?:grilla|grid|escala\s+8pt|ret[ií]cula|8\s*pt|sistema\s+de\s+dise[ñn]o)\b/i,
    // 🐞 FIX v1.53.4 (defecto preexistente, hermano del `?"":""` de ant-codigo):
    // esta ley mandaba `{}` SIEMPRE — una constante disfrazada. Como
    // espejo.disenios EXIGE un `ancho` numérico positivo, la frase se enrutaba
    // pero el espejo la RECHAZABA («no llegó ancho»): el reflejo moría al final.
    // Ahora entrega un lienzo de escritorio ESTÁNDAR DECLARADO (1200px) — un
    // defecto honesto, no un ancho inventado disfrazado de extracción. Cuando
    // el usuario SI da un ancho explícito, `dis-ancho` (confianza 0.85 > 0.70)
    // gana y usa ese ancho; esta ley solo cubre el caso «sin ancho».
    datos: () => ({ ancho: 1200 }),
    espejo: "espejo.disenios",
    descripcion: "antropológica: grilla y escala de diseño",
  },

  // ═══════════════ EXTENSIBLES (vacío — se llena con leyes aprendidas) ═══════════════
  // Las leyes aprendidas desde el runtime se cargan en `LEYES_APRENDIDAS`
  // más abajo. Tienen prioridad 100+ para no tapar a las curadas.

  // ═══════════════ TRANSFORMABLES ═══════════════
  {
    id: "trf-area-triangulo",
    familia: "transformable",
    prioridad: 70,
    // Sin `\b` al inicio: `\b` no funciona con `á` (no-ASCII). Usamos un
    // lookbehind suave: (?:^|\s) o cualquiera de las dos variantes.
    patron: /(?:^|\s)[aá]rea\s+de\s+(?:un|una)?\s*tri[aá]ngulo(?:\s+de\s+base\s+(\d+(?:[.,]\d+)?)\s+y\s+altura\s+(\d+(?:[.,]\d+)?))?/i,
    datos: (m) => {
      const b = parseFloat((m[1] || "0").replace(",", "."));
      const h = parseFloat((m[2] || "0").replace(",", "."));
      // Si la frase NO trae base/altura explícita, devolvemos expresión simbólica
      // para que el espejo matematicos sepa qué se pide y el modelo la llene.
      if (m[1] && m[2]) return { expresion: `${b} * ${h} / 2` };
      return { expresion: "b * h / 2" };
    },
    espejo: "espejo.matematicos",
    descripcion: "transformable: área de triángulo → expresión b*h/2",
  },
  {
    id: "trf-ohm",
    familia: "transformable",
    prioridad: 71,
    // Los `/` dentro del regex se escaparon porque cierran el literal.
    patron: new RegExp("\\bley\\s+de\\s+ohm\\b.*\\b(?:V\\s*=\\s*I\\s*\\*?\\s*R|I\\s*=\\s*V\\s*\\/\\s*R|R\\s*=\\s*V\\s*\\/\\s*I)\\b", "i"),
    datos: (m) => {
      const txt = (m[0] || "").replace(/\s/g, "");
      if (/V=I\*?R/i.test(txt)) return { expresion: "V=I*R" };
      if (/I=V\/R/i.test(txt))  return { expresion: "I=V/R" };
      if (/R=V\/I/i.test(txt)) return { expresion: "R=V/I" };
      return { expresion: "V=I*R" };
    },
    espejo: "espejo.fisicos",
    descripcion: "transformable: ley de Ohm → expresión simbólica",
  },

  // ═══════════════ EXTENSIBLES — plantillas para Ollama externo (extensión B) ═══════════════
  // Estas leyes están DESACTIVADAS por defecto (comentadas). Son la plantilla
  // que Mario o cualquier usuario puede descomentar y rellenar para enrutar
  // preguntas de una disciplina a un Ollama externo (otro contenedor Docker,
  // un nodo de la cuadrícula, etc.).
  //
  // Ejemplo (medicina): si tienes un Ollama corriendo en otro servidor con
  // un modelo "medicina-v1" entrenado para rigor clínico, descomenta esto y
  // rellena el endpoint. El orquestador, cuando vea una pregunta con
  // palabras como "paciente", "dosis", "diagnóstico", enrutará a ese Ollama
  // automáticamente en vez de al espejo local determinista.
  //
  // v1.54.0 — LEY VIVA. Antes era una plantilla comentada que apuntaba a un
  // Ollama externo que NO EXISTE en esta máquina (promesa vacía). Ahora despacha
  // al espejo LOCAL determinista `espejo.medicina`, que calcula con fórmula
  // declarada y devuelve su aviso clínico. Si algún día hay un Ollama médico
  // real, se le añade `endpoint` a esta misma ley y el orquestador cambiará
  // solo a modo "ollama-externo" sin tocar nada más.
  {
    id: "med-calculo",
    familia: "personalizada",
    prioridad: 80,
    // 0.92 > 0.90 de `mat-expr`: «calcula el IMC de 70 kg y 1.75 m» es una
    // intención CLÍNICA específica y debe ganarle a la aritmética genérica.
    // Con 0.86 el margen (0.04) no superaba MARGEN_DESEMPATE (0.08) y el
    // orquestador confesaba «empate dudoso» en vez de calcular el IMC.
    // v1.54.1: mat-expr recibe bonus por cobertura y llega a 0.95 en frases
    // largas (calcula el IMC de un paciente de 70 kg y 1.75 m). 0.97 deja
    // margen 0.02 > 0 y, con prioridad 80 < 90, gana sin ambiguedad.
    confianza: 0.97,
    patron: /\b(?:imc|i\.m\.c\.|superficie\s+corporal|aclaramiento\s+de\s+creatinina|cockcroft|dosis\s+por\s+(?:peso|kg)|mg\/kg|convierte\s+\d+\s*(?:mcg|mg|g)\s+a)\b/i,
    datos: (m) => {
      const frase = String(m.input || "").toLowerCase();
      // 🐞 FIX v1.54.0 (cazado por la verificación, no por la cabeza):
      //  1) `\b` NO funciona con «ñ» (no es ASCII): «años» nunca matcheaba y
      //     la edad salía NaN. Se usa (?:^|[^a-zñ]) como frontera suave.
      //  2) «peso» capturaba el PRIMER número de la frase, que en «15 mg/kg
      //     para 12 kg» era 15 (la dosis, no el peso). Ahora el peso exige
      //     unidad kg detrás: «70 kg», «12 kg», «peso: 70».
      //  3) NaN se serializaba como null en JSON: se devuelve undefined y el
      //     espejo responde con su motivo («falta peso»), nunca con un null.
      const limpio = (v: number) => (isFinite(v) ? v : undefined);
      const n = (re: RegExp) => { const mm = frase.match(re); return mm ? parseFloat(mm[1].replace(",", ".")) : NaN; };
      // peso: número seguido de kg, o «peso/pesa de N»
      const peso = limpio(n(/(\d+(?:[.,]\d+)?)\s*kg\b/) ?? n(/(?:peso|pesa)\s*(?:de|=|:)?\s*(\d+(?:[.,]\d+)?)/));
      // talla: número seguido de m/cm, o «talla/altura/mide de N»
      // talla: exige m/cm como unidad y descarta kg; si viene en cm se normaliza a m
      const tallaRaw = limpio(n(/(\d+(?:[.,]\d+)?)\s*(cm|m)\b(?!\s*g)/) ?? n(/(?:talla|altura|mide)\s*(?:de|=|:)?\s*(\d+(?:[.,]\d+)?)/));
      const talla = tallaRaw === undefined ? undefined : (tallaRaw > 3 ? tallaRaw / 100 : tallaRaw);
      // edad: «60 años» — frontera suave por la «ñ»
      const edad = limpio(n(/(?:^|[^a-zñ])(\d{1,3})\s*(?:a[nñ]os|anos)(?:[^a-z]|$)/));
      const creatinina = limpio(n(/creatinina\s*(?:de|=|:)?\s*(\d+(?:[.,]\d+)?)/));
      const mgPorKg = limpio(n(/(\d+(?:[.,]\d+)?)\s*mg\s*(?:\/|por)\s*kg/));
      const sexo = /\b(?:mujer|femenin[oa])\b/.test(frase) ? "femenino" : /\b(?:hombre|masculin[oa])\b/.test(frase) ? "masculino" : "";
      if (/superficie\s+corporal/.test(frase)) return { accion: "superficie_corporal", peso, alturaCm: talla };
      if (/aclaramiento|cockcroft/.test(frase)) return { accion: "aclaramiento", edad, peso, creatinina, sexo };
      if (/dosis\s+por|mg\/kg/.test(frase)) return { accion: "dosis_por_peso", mgPorKg, peso };
      if (/convierte/.test(frase)) {
        const mc = frase.match(/(\d+(?:[.,]\d+)?)\s*(mcg|ug|mg|g|kg)\s+a\s+(mcg|ug|mg|g|kg)/);
        return mc ? { accion: "convertir_dosis", cantidad: parseFloat(mc[1].replace(",", ".")), de: mc[2], a: mc[3] } : { accion: "convertir_dosis" };
      }
      return { accion: "imc", peso, talla };
    },
    espejo: "espejo.medicina",
    descripcion: "medicina: cálculo clínico determinista (IMC, superficie corporal, aclaramiento, dosis)",
  },
  // v1.54.0 — LEY VIVA. Igual que la de medicina: era una plantilla comentada
  // hacia un Ollama que no existe. Ahora despacha al espejo LOCAL
  // `espejo.codigo`, que DICTAMINA (secretos, eval, catch vacío, complejidad,
  // imports sin uso) con severidad y veredicto. Confianza 0.9 y prioridad 81:
  // gana a `ant-codigo` (0.85, inventario) cuando la frase pide JUZGAR el
  // código, no solo contarlo.
  {
    id: "cod-audita",
    familia: "personalizada",
    prioridad: 81,
    confianza: 0.9,
    patron: /\b(?:audita|revisa|analiza|verifica|dictamina|busca\s+(?:secretos?|credenciales?)|hay\s+(?:secretos?|credenciales?)|deuda\s+t[eé]cnica|code\s+review)\b[\s\S]*\b(?:c[oó]digo|fragmento|funci[oó]n|archivo|m[oó]dulo|script|clase)\b/i,
    datos: (m) => {
      const frase = String(m.input || "");
      // El fragmento es lo que venga entre las tres comillas invertidas si existe;
      // si no, la frase entera (el espejo decidirá si tiene algo que analizar y
      // lo dirá con motivo: nunca silencio).
      const bloque = frase.match(/```[\s\S]*?```/);
      const limpio = bloque ? bloque[0].replace(/^```[a-z]*\n?/i, "").replace(/```$/, "") : frase;
      return { accion: "analizar", codigo: limpio };
    },
    espejo: "espejo.codigo",
    descripcion: "código: auditoría con veredicto (secretos, eval, complejidad, imports sin uso)",
  },

  // ═══════════════ CAPACIDADES AMPLIADAS (v1.53.2) ═══════════════
  // Leyes nuevas, todas enrutadas a espejos YA existentes con el formato de
  // `datos` que cada espejo exige (ningún espejo nuevo, cero riesgo de dato
  // vacío). Amplían qué resuelve el orquestador SIN modelo ni red.

  // ── Matemáticas: porcentaje «X% de Y» → Y*X/100 ──
  {
    id: "mat-porcentaje",
    familia: "matemática",
    prioridad: 23,
    patron: /\b(\d+(?:[.,]\d+)?)\s*(?:%|por\s*ciento)\s+de\s+(\d+(?:[.,]\d+)?)\b/i,
    datos: (m) => {
      const x = (m[1] || "0").replace(",", ".");
      const y = (m[2] || "0").replace(",", ".");
      return { expresion: `${y} * ${x} / 100` };
    },
    confianza: 0.88,
    espejo: "espejo.matematicos",
    descripcion: "matemática: porcentaje (X% de Y)",
  },

  // ── Matemáticas: potencia «X elevado a Y» / «X^Y» → X^Y ──
  {
    id: "mat-potencia",
    familia: "matemática",
    prioridad: 24,
    patron: /\b(\d+(?:[.,]\d+)?)\s*(?:elevad[oa]\s+a(?:\s+la\s+(?:potencia(?:\s+de)?)?)?|\^|\*\*)\s*(\d+(?:[.,]\d+)?)\b/i,
    datos: (m) => {
      const x = (m[1] || "0").replace(",", ".");
      const y = (m[2] || "0").replace(",", ".");
      return { expresion: `${x}^${y}` };
    },
    confianza: 0.86,
    espejo: "espejo.matematicos",
    descripcion: "matemática: potencia (X elevado a Y)",
  },

  // ── Matemáticas: regla de tres directa «si A da B, cuánto da C» → B*C/A ──
  {
    id: "mat-regla3",
    familia: "matemática",
    prioridad: 26,
    patron: /\bregla\s+de\s+tres\b[^0-9]*(\d+(?:[.,]\d+)?)[^0-9]+(\d+(?:[.,]\d+)?)[^0-9]+(\d+(?:[.,]\d+)?)/i,
    datos: (m) => {
      const a = (m[1] || "0").replace(",", ".");
      const b = (m[2] || "0").replace(",", ".");
      const c = (m[3] || "0").replace(",", ".");
      return { expresion: `${b} * ${c} / ${a}` };
    },
    confianza: 0.84,
    espejo: "espejo.matematicos",
    descripcion: "matemática: regla de tres directa",
  },

  // ── Financiera: interés simple «capital, tasa %, tiempo» → C*R*T/100 ──
  {
    id: "fin-interes-simple",
    familia: "financiera",
    prioridad: 27,
    patron: /\binter[eé]s\s+simple\b[^0-9]*(\d+(?:[.,]\d+)?)[^0-9]+(\d+(?:[.,]\d+)?)[^0-9]+(\d+(?:[.,]\d+)?)/i,
    datos: (m) => {
      const cap = (m[1] || "0").replace(",", ".");
      const tasa = (m[2] || "0").replace(",", ".");
      const tiempo = (m[3] || "0").replace(",", ".");
      return { expresion: `${cap} * ${tasa} * ${tiempo} / 100` };
    },
    confianza: 0.82,
    espejo: "espejo.matematicos",
    descripcion: "financiera: interés simple (capital·tasa·tiempo/100)",
  },

  // ── Lingüística: contar palabras «cuántas palabras tiene: ...» ──
  {
    id: "ling-contar",
    familia: "lingüística",
    prioridad: 32,
    patron: /\b(?:cu[aá]ntas?\s+palabras|cuenta\s+(?:las\s+)?palabras|n[uú]mero\s+de\s+palabras)\b[^:：]*[:：]\s*["“]?([^"”]{3,})["”]?/i,
    datos: (m) => ({ texto: (m[1] || "").trim() }),
    confianza: 0.8,
    espejo: "espejo.lenguajes",
    descripcion: "lingüística: conteo de palabras de un texto",
  },

  // ── Diseño: grilla/retícula de ancho explícito en px → espejo.disenios ──
  {
    id: "dis-ancho",
    familia: "antropológica",
    prioridad: 63,
    patron: /\b(?:grilla|grid|ret[ií]cula|lienzo|canvas)\b[^0-9]*(\d{2,5})\s*(?:px|pt|p[ií]xeles)?/i,
    datos: (m) => ({ ancho: parseFloat((m[1] || "0").replace(",", ".")) }),
    confianza: 0.85,
    espejo: "espejo.disenios",
    descripcion: "antropológica: grilla/retícula de ancho N px",
  },

  // ── Creadora: generar N variantes combinando ejes → espejo.creadores ──
  // Activa el espejo generativo determinista (estaba sin ley de entrada).
  // Formato libre que el usuario escribe en el chat, p.ej.:
  //   «genera 20 variantes combinando color: rojo, azul, verde; talla: S, M, L»
  //   «crea 50 combinaciones con semilla demo de tono: cálido, frío | forma: redonda, cuadrada»
  {
    id: "crear-variantes",
    familia: "creadora",
    prioridad: 55,
    patron: /\b(?:genera|crea|produce|combina|dame|arma)\b[^.]*\b(?:variantes|combinaciones|permutaciones|variaciones|combos?)\b/i,
    datos: (m) => {
      const input = String(m.input || "");
      // n (cantidad): primer número junto a la palabra clave, o cualquier número suelto
      const mn = input.match(/\b(\d{1,4})\s*(?:variantes|combinaciones|permutaciones|variaciones|combos?)/i) || input.match(/\b(\d{1,4})\b/);
      const n = mn ? parseInt(mn[1], 10) : 10;
      // semilla opcional: «semilla XXX»
      const ms = input.match(/\bsemilla\s+([\w.-]+)/i);
      const semilla = ms ? ms[1] : "cerebronico";
      // modo: por defecto sistemático; «al azar»/«aleatori» → pseudorrandom
      const sistematico = !/\b(?:al\s+azar|aleatori|random)\b/i.test(input);
      // ejes separados por «;», «|» o salto; cada eje «nombre: a, b, c».
      // El nombre del eje es la última palabra antes de «:» (así se descarta el
      // preludio del tipo «genera 20 variantes combinando…» sin frase frágil).
      const ejes: Record<string, (string | number)[]> = {};
      for (const seg of input.split(/[;\n|]/)) {
        const mm = seg.match(/([^:=]+?)\s*[:=]\s*(.+)$/);
        if (!mm) continue;
        const palabras = mm[1].trim().split(/\s+/);
        const clave = palabras[palabras.length - 1];
        if (!clave || /^\d+$/.test(clave)) continue;
        const ops = mm[2]
          .split(/[,\/]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((v) => (/^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v));
        if (ops.length) ejes[clave] = ops;
      }
      return { ejes, n, semilla, sistematico };
    },
    confianza: 0.8,
    espejo: "espejo.creadores",
    descripcion: "creadora: N variantes deterministas combinando ejes (espejo.creadores)",
  },

  // ── Planificación: «planifica/ordena tareas: a, luego b, después c» ──
  // Activa a espejo.planificadores (hasta hoy HUÉRFANO: ninguna ley lo llamaba).
  // Construye un grafo de tareas con dependencia secuencial determinista:
  // ids «1-slug» «2-slug»… (únicos por prefijo), cada paso depende del anterior.
  {
    id: "plan-tareas",
    familia: "planificación",
    prioridad: 65,
    patron: /\b(?:planifica(?:r|me)?|plan\s+de\s+(?:tareas|trabajo|pasos)|ordena(?:r)?\s+(?:las\s+)?tareas|secuencia\s+de\s+(?:pasos|tareas)|organiza(?:r)?\s+(?:el\s+)?trabajo)\b[^:：]*[:：]\s*(.+)/i,
    datos: (m) => {
      const bruto = (m[1] || "").trim();
      const items = bruto
        .split(/\s*(?:,|;|->|→|\bluego\b|\bdespu[eé]s(?:\s+de)?\b|\bentonces\b|\by\s+(?:luego|despu[eé]s)\b)\s*/i)
        .map((s) => s.replace(/[.;]+$/, "").trim())
        .filter(Boolean)
        .slice(0, 20);
      const slug = (s: string, i: number) => {
        const base = s
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 24);
        return `${i + 1}-${base || "paso"}`;
      };
      const tareas = items.map((it, i) =>
        i === 0 ? { id: slug(it, i) } : { id: slug(it, i), dependeDe: [slug(items[i - 1], i - 1)] }
      );
      return { tareas: tareas.length ? tareas : [{ id: "1-plan" }] };
    },
    confianza: 0.84,
    espejo: "espejo.planificadores",
    descripcion: "planificación: secuencia de tareas → grafo determinista (espejo.planificadores)",
  },

  // ── Integradora: pedido multidominio «arma/construye/créame un proyecto…» ──
  // Red de seguridad del orquestador: activa a espejo.generalista (hasta hoy
  // HUÉRFANO). Prioridad alta (96) y confianza moderada: NUNCA tapa a una ley
  // específica (que gana por confianza mayor); solo entra cuando ninguna otra
  // ley capturó el pedido integrador. El propio generalista, si no halla
  // señales de dominio, lo declara y deriva al conductor (no adivina).
  {
    id: "gen-pedido",
    familia: "integradora",
    prioridad: 96,
    patron: /\b(?:ay[uú]dame\s+con|arma(?:r|me)?|constr[uú](?:ye|ir|ime|yeme)|cr[eé]a(?:r|me)?|hazme|prepara(?:r|me)?|dise[nñ]a(?:r|me)?|orquesta(?:r)?|integra(?:r)?)\b[\s\S]*?\b(?:proyecto|aplicaci[oó]n|app|sistema|todo\s+junto|varias?\s+cosas|m[uú]ltiples|integr\w*|combin\w*|completo|desde\s+cero|end[\s-]?to[\s-]?end|de\s+principio\s+a\s+fin)\b/i,
    datos: (m) => ({ pedido: (m.input || m[0] || "").trim() }),
    confianza: 0.66,
    espejo: "espejo.generalista",
    descripcion: "integradora: pedido multidominio → generalista (detecta, extrae y sintetiza)",
  },
];

// ─── LEYES APRENDIDAS (autoaprendibles, persistente) ──────────────────────
//
// Se cargan desde .cerebro-db/leyes-aprendidas.json. Cada ley aprendida tiene
// la misma forma que LEYES_REFLEJO pero con `prioridad >= 100` para no tapar
// a las leyes curadas. El usuario las crea o las desactiva con el endpoint
// /api/espejos/leyes.

let LEYES_APRENDIDAS: LeyReflejo[] = [];

/**
 * Diagnóstico de la última carga de leyes aprendidas. Regla de hierro: si una
 * ley aprendida NO se pudo restaurar, esto lo dice — en v1.0.3 morían en
 * silencio (ver el bug de `datos` como función serializada más abajo).
 */
let DIAGNOSTICO_LEYES: string[] = [];
export function diagnosticoLeyes(): string[] {
  return [...DIAGNOSTICO_LEYES];
}

/**
 * Primitivas de lectura/escritura INYECTADAS. En v1.0.3 el módulo llamaba a
 * `require("node:fs")` dentro de un paquete ESM (`"type": "module"`): require
 * no existe, la excepción se tragaba en el catch y las leyes aprendidas
 * NUNCA se cargaban. La lección es la misma de consejo.ts con `node:os`:
 * el que viaja al bundle no toca disco — el servidor inyecta las primitivas.
 */
export interface PrimitivasFs {
  existsSync(ruta: string): boolean;
  readFileSync(ruta: string, cod: "utf8"): string;
  mkdirSync?(ruta: string, op?: { recursive?: boolean }): void;
  writeFileSync?(ruta: string, contenido: string, cod: "utf8"): void;
}
let FS: PrimitivasFs | undefined;
export function configurarFsOrquestador(fs: PrimitivasFs): void {
  FS = fs;
}

/**
 * Reconstruye la función `datos` de una ley persistida.
 * Orden de respeto: función viva (recarga en caliente) → plantilla serializada
 * → fallback DECLARADO `{ prompt: $input }`. El fallback no es un parche
 * sucio: una ley aprendida sin plantilla solo puede significar "pasa la frase
 * tal cual", y se anota en el diagnóstico para que el usuario la mejore.
 */
function reconstruirDatos(l: any, idLey: string): (m: RegExpMatchArray) => Record<string, unknown> {
  if (typeof l.datos === "function") return l.datos;
  if (l.plantilla && typeof l.plantilla === "object" && !Array.isArray(l.plantilla)) {
    const plantilla = l.plantilla as Record<string, string>;
    return (m: RegExpMatchArray) => {
      const salida: Record<string, unknown> = {};
      for (const [clave, bruto] of Object.entries(plantilla)) {
        const texto = String(bruto ?? "").replace(/\$(\d+)/g, (_, g) => m[Number(g)] ?? "").replace(/\$input/g, m.input ?? "");
        // Si la plantilla era un número, devolvemos número (los espejos aceptan
        // ambos, pero `{ expresion: "5+5" }` como texto y `{ cantidad: 5 }` como
        // número deben conservarse como el autor de la ley quiso).
        const comoNumero = Number(texto);
        salida[clave] = texto !== "" && Number.isFinite(comoNumero) && /^-?\d+(?:\.\d+)?$/.test(texto) ? comoNumero : texto;
      }
      return salida;
    };
  }
  if ((typeof l.datos === "string" && l.datos.trim().startsWith("function")) || (typeof l.datos === "string" && l.datos.trim().startsWith("("))) {
    DIAGNOSTICO_LEYES.push(`ley «${idLey}»: su «datos» era una función serializada (incompatible con reinicio); se reconstruyó como prompt-crudo. Recrea la ley con «plantilla» para datos exactos.`);
  }
  return (m: RegExpMatchArray) => ({ prompt: m.input ?? "" });
}

/** Carga las leyes aprendidas desde un JSON persistido. No lanza: si falla,
 *  arranca con 0 leyes aprendidas PERO deja el motivo en diagnosticoLeyes(). */
export function cargarLeyesAprendidas(ruta: string, fsImpl?: PrimitivasFs): void {
  DIAGNOSTICO_LEYES = [];
  // 🐞 DEFECTO v1.0.3: el cargador devolvía temprano si el archivo no existe
  // SIN limpiar la lista — borrar leyes-aprendidas.json no borraba las leyes
  // de la memoria y la "purga" prometida era decorativa. Se limpia SIEMPRE
  // primero; lo que haya en disco es lo que manda.
  LEYES_APRENDIDAS = [];
  const fsUso = fsImpl || FS;
  if (!fsUso) {
    DIAGNOSTICO_LEYES.push("no hay primitivas fs inyectadas (configurarFsOrquestador): las leyes aprendidas no se cargaron.");
    return;
  }
  try {
    if (!fsUso.existsSync(ruta)) return;
    const raw = JSON.parse(fsUso.readFileSync(ruta, "utf8"));
    if (!Array.isArray(raw?.leyes)) return;
    // Filtra las que tienen los campos mínimos y no están desactivadas
    LEYES_APRENDIDAS = raw.leyes
      .filter((l: any) => l && l.id && l.patron && l.espejo && !l.desactivada)
      .map((l: any) => ({
        id: String(l.id),
        familia: String(l.familia || "autoaprendible"),
        prioridad: 100 + Math.max(0, Number(l.prioridadOffset || 0)),
        // Reconstruye el RegExp desde string (vino serializado)
        patron: typeof l.patron === "string" ? new RegExp(l.patron, l.flags || "i") : l.patron,
        datos: reconstruirDatos(l, String(l.id)),
        plantilla: l.plantilla && typeof l.plantilla === "object" ? l.plantilla : undefined,
        espejo: String(l.espejo),
        descripcion: String(l.descripcion || "(ley aprendida sin descripción)"),
        confianza: Number.isFinite(Number(l.confianza)) ? Math.max(0, Math.min(1, Number(l.confianza))) : 0.6,
        endpoint: l.endpoint ? String(l.endpoint) : undefined,
        endpointModel: l.endpointModel ? String(l.endpointModel) : undefined,
        endpointSystem: l.endpointSystem ? String(l.endpointSystem) : undefined,
      }));
  } catch (e) {
    // Silencioso en runtime — el orquestador NO puede fallar el arranque —
    // pero NUNCA en silencio para quien pregunte: queda el motivo.
    DIAGNOSTICO_LEYES.push(`leyes-aprendidas.json ilegible: ${String((e as any)?.message || e)}`);
    LEYES_APRENDIDAS = [];
  }
}

/** Serializa una ley para disco: sin funciones (no viajan por JSON). */
function serializarLey(l: LeyReflejo): Record<string, unknown> {
  const patronFuente = typeof l.patron === "string" ? l.patron : (l.patron as RegExp).source;
  const flags = typeof l.patron === "string" ? "i" : (l.patron as RegExp).flags;
  return {
    id: l.id,
    familia: l.familia,
    prioridadOffset: Math.max(0, l.prioridad - 100),
    patron: patronFuente,
    flags,
    espejo: l.espejo,
    descripcion: l.descripcion,
    ...(l.confianza !== undefined ? { confianza: l.confianza } : {}),
    ...(l.plantilla ? { plantilla: l.plantilla } : {}),
    ...(l.endpoint ? { endpoint: l.endpoint, endpointModel: l.endpointModel, endpointSystem: l.endpointSystem } : {}),
  };
}

/** Persiste las leyes aprendidas. Llamada desde el endpoint de revisión. */
export function guardarLeyesAprendidas(ruta: string, leyes: LeyReflejo[], fsImpl?: PrimitivasFs): boolean {
  try {
    const fsUso = fsImpl || FS;
    if (!fsUso || !fsUso.writeFileSync || !fsUso.mkdirSync) {
      DIAGNOSTICO_LEYES.push("guardarLeyesAprendidas sin fs inyectado: nada escrito.");
      return false;
    }
    const dir = ruta.replace(/[/\\][^/\\]*$/, "");
    fsUso.mkdirSync(dir, { recursive: true });
    fsUso.writeFileSync(ruta, JSON.stringify({ leyes: leyes.map(serializarLey), en: new Date().toISOString() }, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function leyAprendida(): number {
  return LEYES_APRENDIDAS.length;
}

// ─── EL ORQUESTADOR ────────────────────────────────────────────────────────

export interface ResultadoOrquestador {
  ok: boolean;
  /** Espejo a invocar (id `espejo.*`) — siempre presente cuando ok:true. */
  espejo?: string;
  /** Datos a pasar al espejo. */
  datos?: Record<string, unknown>;
  /** id de la ley que aplicó. */
  ley?: string;
  /** Descripción humana de la ley. */
  descripcion?: string;
  /** Modo de despacho:
   *  · "espejo-local" → ejecutar con `ejecutarEntidad(espejo, datos)` (determinista, ~1 ms)
   *  · "ollama-externo" → hacer fetch a `endpoint` con `endpointModel` y `endpointSystem` (Ollama remoto)
   *  · undefined si ok:false
   */
  modo?: "espejo-local" | "ollama-externo";
  /** Solo cuando modo==="ollama-externo": endpoint HTTP a llamar. */
  endpoint?: string;
  /** Solo cuando modo==="ollama-externo": modelo Ollama. */
  endpointModel?: string;
  /** Solo cuando modo==="ollama-externo": system prompt Ollama. */
  endpointSystem?: string;
  /** Tiempo total en ms. */
  ms: number;
  /** Si ok === false, SIEMPRE presente (regla de hierro: nada de silencios). */
  motivo?: string;
  // ─── Reflejo v5 · confianza ────────────────────────────────────────────────
  /** Puntaje 0..1 del enrutado. Con dudas el orquestador NO adivina: dice
   *  cuáles son las alternativas y manda al endpoint explícito de familia. */
  confianza?: number;
  /** Candidatos descartados por el desempate (auditoría del "por qué no"). */
  alternativas?: Array<{ ley: string; espejo: string; confianza: number }>;
}

// ─── Reflejo v5 · salud de espejos integrada al enrutado ────────────────────
//
// El orquestador NO escribe disco: server.ts le pasa la tabla de salud que
// ya persiste en .cerebro-db/espejos-salud.json. Un espejo DORMIDO (score
// acumulado bajo) se salta en el auto-enrutado, pero sigue alcanzable por
// id o por familia explícita — dormir no es matar (manual §6.3).

import { type TablaSalud, estadoDe } from "./salud";
let SALUD: TablaSalud | undefined;
export function fijarTablaSalud(tabla: TablaSalud | undefined): void {
  SALUD = tabla;
}
function espejoDormido(id: string): boolean {
  return !!SALUD && estadoDe(SALUD[id]) === "dormido";
}

/** UMBRAL de confianza: por debajo, el orquestador confiesa dudas en vez de adivinar. */
export const UMBRAL_CONFIANZA = 0.55;
/** Distancia mínima entre el primero y el segundo candidato de espejo DISTINTO.
 *  Menos que esto es un empate: dos leyes tirando cada una a su espejo no es
 *  una decisión, es una moneda — y el orquestador no lanza monedas. */
export const MARGEN_DESEMPATE = 0.08;

/** Confianza de una ley para un match concreto: base declarada o derivada de
 *  la especificidad (extraer números/unidades es más señal que leer una
 *  palabra suelta), con un bonus pequeño si el match cubre la mayor parte de
 *  la frase. Determinista: misma frase, mismo número. */
function confianzaDe(ley: LeyReflejo, m: RegExpMatchArray, frase: string): number {
  let base = ley.confianza;
  if (base === undefined) {
    const extrajoAlgo = (m.slice(1) || []).some((g) => g !== undefined && String(g).trim() !== "");
    base = extrajoAlgo ? 0.85 : 0.7;
    if (ley.prioridad >= 100) base = Math.min(base, 0.75); // aprendida: un poco más prudente
  }
  const cobertura = m[0] ? m[0].length / Math.max(1, frase.length) : 0;
  if (cobertura >= 0.5) base += 0.05;
  return Math.max(0, Math.min(1, Math.round(base * 100) / 100));
}

interface CandidatoLey {
  ley: LeyReflejo;
  m: RegExpMatchArray;
  confianza: number;
  /** Datos ya calculados en la fase de candidatos (null = la ley se abstuvo). */
  datosPrevios?: Record<string, unknown> | null;
}

/** Recoge TODAS las leyes que matchean (no la primera): la decisión se toma
 *  después, con confianza, y las descartadas quedan como auditoría. */
function candidatos(limpia: string, leyes: LeyReflejo[]): { candidatos: CandidatoLey[]; saltadasDormidas: string[] } {
  const out: CandidatoLey[] = [];
  const saltadasDormidas: string[] = [];
  for (const ley of leyes) {
    const f = ley.transformar ? ley.transformar(limpia) : limpia;
    try {
      const m = f.match(ley.patron);
      if (!m) continue;
      if (espejoDormido(ley.espejo)) {
        saltadasDormidas.push(`${ley.espejo} (ley ${ley.id})`);
        continue;
      }
      // v1.54.2 · GUARDA DECLARADA: una ley puede matchear el patrón y aun así
      // declarar que NO aplica devolviendo null desde datos() (p.ej. mat-expr
      // cede el turno en frases clínicas). Se descarta ANTES de puntuar: si
      // entrara al ranking, empataría con la ley específica y el orquestador
      // confesaría una duda que no existe.
      let datosPrevios: Record<string, unknown> | null;
      try {
        datosPrevios = ley.datos(m) as Record<string, unknown> | null;
      } catch {
        DIAGNOSTICO_LEYES.push(`ley «${ley.id}» reventó al calcular sus datos: descartada en esta frase.`);
        continue;
      }
      if (datosPrevios === null) continue;
      out.push({ ley, m, confianza: confianzaDe(ley, m, limpia), datosPrevios });
    } catch {
      // Ley rota (patrón o datos defectuosos): se salta SIN tumbar el
      // orquestador, pero deja rastro auditable en el diagnóstico.
      DIAGNOSTICO_LEYES.push(`ley «${ley.id}» reventó al aplicar su patrón/datos: descartada en esta frase.`);
      continue;
    }
  }
  // Estrella primero si empató en confianza (manual §6.3: score ≥ 0.95 sube),
  // luego confianza desc, prioridad asc, id asc (documentado: gana el id menor).
  out.sort((a, b) => {
    const estA = SALUD && estadoDe(SALUD[a.ley.espejo]) === "estrella" ? 1 : 0;
    const estB = SALUD && estadoDe(SALUD[b.ley.espejo]) === "estrella" ? 1 : 0;
    return estB - estA || b.confianza - a.confianza || a.ley.prioridad - b.ley.prioridad || a.ley.id.localeCompare(b.ley.id);
  });
  return { candidatos: out, saltadasDormidas };
}

function resultadoDe(c: CandidatoLey, t0: number, alternativos: CandidatoLey[]): ResultadoOrquestador {
  const { ley, m, confianza } = c;
  const datos = (c.datosPrevios !== undefined ? c.datosPrevios : ley.datos(m)) ?? undefined;
  const modo: "espejo-local" | "ollama-externo" = ley.endpoint ? "ollama-externo" : "espejo-local";
  return {
    ok: true,
    espejo: ley.espejo,
    datos,
    ley: ley.id,
    descripcion: ley.descripcion,
    modo,
    confianza,
    alternativas: alternativos
      .filter((x) => x.ley.id !== ley.id)
      .slice(0, 3)
      .map((x) => ({ ley: x.ley.id, espejo: x.ley.espejo, confianza: x.confianza })),
    ...(modo === "ollama-externo" ? {
      endpoint: ley.endpoint,
      endpointModel: ley.endpointModel,
      endpointSystem: ley.endpointSystem,
    } : {}),
    ms: Date.now() - t0,
  };
}

/**
 * Toma una frase del usuario, prueba TODAS las leyes y decide con confianza:
 * espejo + datos, o `ok:false` con el motivo y las alternativas en juego.
 * Si ninguna ley encaja, el llamador debe caer al modelo.
 *
 * Determinista: misma frase → misma salida. Sin red, sin RAM de modelo,
 * sin azar. Es el "orquestador bien aceitado" del que habla el manual.
 *
 * Reflejo v3.0 · extensión B: si la ley que matchea tiene `endpoint`, el
 * resultado lleva `modo: "ollama-externo"` y `endpoint`/`endpointModel`/
 * `endpointSystem` para que server.ts despache a un Ollama remoto.
 *
 * Reflejo v5 · cero alucinación de enrutamiento (lección del recap, adaptada
 * a una máquina de 8 GB sin clúster): cuando el mejor candidato vale menos
 * que UMBRAL_CONFIANZA, o cuando dos espejos DISTINTOS quedan separados por
 * menos de MARGEN_DESEMPATE, el orquestador NO elige: confiesa la duda,
 * lista las alternativas y manda al endpoint explícito de familia. Un
 * enrutado dudoso corrupto la respuesta especializada; una confesión no.
 */
export function planificadorPorLeyes(frase: string): ResultadoOrquestador {
  const t0 = Date.now();
  const limpia = (frase || "").trim();
  if (!limpia) return { ok: false, ms: 0, motivo: "frase vacía" };

  // Combina leyes curadas + aprendidas, ordena por prioridad asc, id asc.
  const todas = [...LEYES_REFLEJO, ...LEYES_APRENDIDAS].sort(
    (a, b) => a.prioridad - b.prioridad || a.id.localeCompare(b.id)
  );

  const { candidatos: cs, saltadasDormidas } = candidatos(limpia, todas);

  if (cs.length === 0) {
    const porDormidas = saltadasDormidas.length
      ? ` Además, ${saltadasDormidas.length} ley(s) se saltaron por espejo dormido: ${saltadasDormidas.join(", ")} — reavívalo con /api/espejos/salud si fue un malentendido.`
      : "";
    // v1.56.5 — contexto honesto: el número de familias se CUENTA de las leyes
    // vivas, no se escribe a mano (antes decía «12» fijo y mentía al crecer).
    const nFamilias = new Set(todas.map((l) => l.familia)).size;
    return {
      ok: false,
      ms: Date.now() - t0,
      motivo: `ninguna ley del orquestador encaja con la frase. Las ${nFamilias} familias se probaron en orden de prioridad. Recurre al modelo o añade una ley nueva (ver ESPEJOS_PERSONALIZADOS.md).${porDormidas}`,
    };
  }

  const mejor = cs[0];
  const segundo = cs.find((c) => c.ley.espejo !== mejor.ley.espejo);

  if (mejor.confianza < UMBRAL_CONFIANZA) {
    return {
      ok: false,
      ms: Date.now() - t0,
      confianza: mejor.confianza,
      alternativas: cs.slice(0, 3).map((c) => ({ ley: c.ley.id, espejo: c.ley.espejo, confianza: c.confianza })),
      motivo:
        `el enrutador tiene dudas: la mejor ley («${mejor.ley.id}» → ${mejor.ley.espejo}) solo alcanza confianza ${mejor.confianza} (umbral ${UMBRAL_CONFIANZA}). ` +
        `No adivina. Fuerza la familia con POST /api/espejos/orquestar/<familia> o pasa la frase al modelo.`,
    };
  }

  if (segundo && mejor.confianza - segundo.confianza < MARGEN_DESEMPATE) {
    return {
      ok: false,
      ms: Date.now() - t0,
      confianza: mejor.confianza,
      alternativas: [mejor, segundo, ...(cs.slice(2, 3))].map((c) => ({ ley: c.ley.id, espejo: c.ley.espejo, confianza: c.confianza })),
      motivo:
        `empate dudoso: «${mejor.ley.id}» (${mejor.ley.espejo}, ${mejor.confianza}) y «${segundo.ley.id}» (${segundo.ley.espejo}, ${segundo.confianza}) tiran de espejos distintos por menos de ${MARGEN_DESEMPATE}. ` +
        `El orquestador no lanza monedas: usa POST /api/espejos/orquestar/<familia> para decidir tú, o reformula la frase.`,
    };
  }

  try {
    return resultadoDe(mejor, t0, cs);
  } catch (e: any) {
    return {
      ok: false,
      ms: Date.now() - t0,
      confianza: mejor.confianza,
      motivo: `la ley «${mejor.ley.id}» matcheó pero sus datos fallaron: ${String(e?.message || e)}`,
    };
  }
}

/** Catálogo de leyes activas, para exponer en /api/espejos/leyes. */
export function estadoOrquestador() {
  const todas = [...LEYES_REFLEJO, ...LEYES_APRENDIDAS];
  return {
    ok: true,
    motor: "orquestador v1.3",
    leyesCuradas: LEYES_REFLEJO.length,
    leyesAprendidas: LEYES_APRENDIDAS.length,
    familias: Array.from(new Set(todas.map((l) => l.familia))),
    // Reflejo v3.0 · extensión A — exponer las familias para que la UI pueda
    // mostrar los endpoints por familia: /api/espejos/orquestar/<familia>
    endpointsPorFamilia: Array.from(new Set(todas.map((l) => l.familia))).map((f) => ({
      familia: f,
      url: `/api/espejos/orquestar/${encodeURIComponent(f)}`,
    })),
    leyes: todas.map((l) => ({
      id: l.id,
      familia: l.familia,
      prioridad: l.prioridad,
      espejo: l.espejo,
      descripcion: l.descripcion,
      // Reflejo v3.0 · extensión B — indicar si esta ley despacha a un Ollama externo
      modo: l.endpoint ? "ollama-externo" : "espejo-local",
      ...(l.endpoint ? { endpoint: l.endpoint, endpointModel: l.endpointModel } : {}),
    })),
    // Reflejo v5: diagnóstico de la última carga de leyes aprendidas (nunca
    // en silencio: si una ley murió al recargar, aquí se lee por qué).
    diagnostico: DIAGNOSTICO_LEYES,
    umbralConfianza: UMBRAL_CONFIANZA,
    nota: "Determinista: misma frase → misma salida. Se prueban todas las leyes y se decide por confianza; en igualdad gana la prioridad menor y luego el id alfabéticamente menor. Con dos espejos distintos casi empatados, el orquestador confiesa la duda en vez de adivinar. Las leyes con `endpoint` despachan a un Ollama externo (extensión B); el resto a espejos locales deterministas.",
  };
}

/**
 * Filtra las leyes por familia. Lo usa el endpoint
 * /api/espejos/orquestar/<familia> para forzar el enrutado a una familia
 * específica (extensión A) — sin que el orquestador tenga que adivinar.
 *
 * Si la familia no existe, devuelve null. Si existe pero la frase no
 * matchea ninguna ley de esa familia, devuelve { ok:false, motivo }.
 */
export function orquestarPorFamilia(
  familia: string,
  frase: string,
): ResultadoOrquestador {
  const t0 = Date.now();
  const limpia = (frase || "").trim();
  if (!limpia) return { ok: false, ms: 0, motivo: "frase vacía" };

  const todas = [...LEYES_REFLEJO, ...LEYES_APRENDIDAS].sort(
    (a, b) => a.prioridad - b.prioridad || a.id.localeCompare(b.id)
  );
  const deLaFamilia = todas.filter((l) => l.familia === familia);
  if (deLaFamilia.length === 0) {
    return {
      ok: false,
      ms: Date.now() - t0,
      motivo: `familia «${familia}» no existe. Familias conocidas: ${Array.from(new Set(todas.map((l) => l.familia))).join(", ")}.`,
    };
  }
  for (const ley of deLaFamilia) {
    const f = ley.transformar ? ley.transformar(limpia) : limpia;
    try {
      const m = f.match(ley.patron);
      if (!m) continue;
      // `datos()` puede devolver null para declarar «esta ley no aplica» (p.ej.
      // mat-expr en frases clínicas). En la ruta EXPLÍCITA por familia no hay
      // desempate: null se traduce a undefined para respetar el contrato de
      // ResultadoOrquestador.datos (Record | undefined) y no romper el tipo.
      const datos = ley.datos(m) ?? undefined;
      const modo: "espejo-local" | "ollama-externo" = ley.endpoint ? "ollama-externo" : "espejo-local";
      return {
        ok: true,
        espejo: ley.espejo,
        datos,
        ley: ley.id,
        descripcion: ley.descripcion,
        modo,
        // En el enrutado EXPLÍCITO por familia la confianza se declara pero no
        // bloquea: el usuario ya decidió. Un espejo dormido tampoco se salta:
        // la ruta explícita siempre alcanza (dormir no es matar).
        confianza: confianzaDe(ley, m, limpia),
        ...(modo === "ollama-externo" ? {
          endpoint: ley.endpoint,
          endpointModel: ley.endpointModel,
          endpointSystem: ley.endpointSystem,
        } : {}),
        ms: Date.now() - t0,
      };
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    ms: Date.now() - t0,
    motivo: `frase no encaja con ninguna ley de la familia «${familia}» (se probaron ${deLaFamilia.length} leyes). Usa /api/espejos/orquestar sin familia para que el orquestador decida solo, o pasa la frase al modelo.`,
  };
}
