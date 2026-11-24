import { responderExtractivo, responderConModeloLocal, modeloLocalDisponible, NOMBRE_MOTOR } from './motorLocal.js';

const SISTEMA = 'Eres un asistente jurídico especializado en derecho uruguayo. Responde con precisión, citando normativa cuando corresponda, y aclara cuando no estés seguro. Si no conoces una norma vigente, dilo en vez de inventarla.';

// Lista de respaldo: solo se usa si la consulta en vivo a la API falla.
export const MODELOS = {
    local: ['automático (motor local)'],
    gemini: ['gemini-3.8-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    ollama: ['qwen2.5', 'llama3.1', 'mistral', 'gemma2'],
    custom: []
};

export function modeloActual(proveedor) {
    if (proveedor === 'local') return 'automático (motor local)';
    const guardado = localStorage.getItem('AI_MODEL_' + proveedor);
    if (guardado) return guardado;
    const lista = MODELOS[proveedor] || [];
    return lista[0] || '';
}

// Consulta la lista REAL de modelos del proveedor.
// Gemini: GET /v1beta/models -> filtra los que soportan generateContent.
// Ollama: GET /api/tags -> modelos instalados en la máquina.
export async function listarModelos(proveedor, clave) {
    if (proveedor === 'gemini') {
        const k = (clave || localStorage.getItem('API_KEY') || '').trim();
        if (!k) throw new Error('Falta la API Key de Gemini para listar los modelos.');
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(k) + '&pageSize=200');
        const data = await res.json().catch(() => ({}));
        if (data.error) throw new Error(data.error.message || 'Error al listar modelos de Gemini');
        const lista = (data.models || [])
            .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => String(m.name || '').replace(/^models\//, ''))
            .filter(Boolean);
        if (!lista.length) throw new Error('La API no devolvió modelos con generateContent.');
        return lista.sort();
    }

    if (proveedor === 'ollama') {
        const base = ((clave || localStorage.getItem('API_KEY') || '').trim() || 'http://localhost:11434')
            .replace(/\/api\/generate\/?$/, '')
            .replace(/\/+$/, '');
        const res = await fetch(base + '/api/tags');
        const data = await res.json().catch(() => ({}));
        const lista = (data.models || []).map(m => m.name).filter(Boolean);
        if (!lista.length) throw new Error('Ollama no tiene modelos instalados.');
        return lista.sort();
    }

    return [];
}

/**
 * Motor por defecto: no se configura nada. Si no hay proveedor elegido, nunca
 * se pide una clave: se usa el motor local (modelo pequeño si existe; si no,
 * respuesta extractiva del índice IMPO).
 */
export async function chatPorDefecto(pregunta, contexto) {
    let info = null;
    try {
        info = await modeloLocalDisponible();
    } catch (e) {
        info = null;
    }

    if (info) {
        try {
            const r = await responderConModeloLocal(pregunta, contexto, info);
            if (r) {
                const leido = await responderExtractivo(pregunta, contexto);
                r.fuentes = leido.fuentes || [];
                return r;
            }
        } catch (e) {
            // cae al extractivo
        }
    }
    return responderExtractivo(pregunta, contexto);
}

export async function chat(pregunta, contexto) {
    const proveedor = localStorage.getItem('AI_PROVIDER');
    if (!proveedor || proveedor === 'local') return chatPorDefecto(pregunta, contexto);
    return chatProveedor(proveedor, pregunta, contexto);
}

async function chatProveedor(proveedor, pregunta, contexto) {
    const clave = (localStorage.getItem('API_KEY') || '').trim();
    const modelo = modeloActual(proveedor);
    const texto = contexto
        ? SISTEMA + '\n\nTexto legal aportado por el usuario:\n' + contexto + '\n\nConsulta: ' + pregunta
        : SISTEMA + '\n\nConsulta: ' + pregunta;

    if (proveedor === 'gemini') {
        if (!clave) throw new Error('Falta la API Key de Gemini. Abre «Proveedor de IA» y pégala.');
        const m = modelo || 'gemini-3.8-flash';
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent?key=' + encodeURIComponent(clave);
        let res;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: texto }] }] })
            });
        } catch (e) {
            throw new Error('No se pudo conectar con Gemini (red/CORS): ' + e.message);
        }
        const data = await res.json().catch(() => ({}));
        if (data.error) {
            const msg = data.error.message || 'Error de Gemini';
            if (/no longer available|not found|is not supported/i.test(msg)) {
                throw new Error(msg + ' — Abre «Proveedor de IA» y pulsa «Actualizar modelos» para elegir uno vigente.');
            }
            throw new Error(msg);
        }
        const t = data.candidates && data.candidates[0] && data.candidates[0].content
            && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
            && data.candidates[0].content.parts[0].text;
        return t || 'Sin respuesta del modelo.';
    }

    if (proveedor === 'ollama') {
        const endpoint = clave || 'http://localhost:11434/api/generate';
        const m = modelo || 'qwen2.5';
        let res;
        try {
            res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: m, prompt: texto, stream: false })
            });
        } catch (e) {
            throw new Error('No se pudo conectar con Ollama en ' + endpoint + ': ' + e.message);
        }
        const data = await res.json().catch(() => ({}));
        if (data.error) throw new Error(typeof data.error === 'string' ? data.error : 'Error de Ollama');
        return data.response || 'Sin respuesta de Ollama.';
    }

    if (proveedor === 'custom') {
        // El campo «API Key o URL» del panel custom guarda DOS cosas separadas por «|»:
        //   https://api.openai.com/v1/chat/completions|sk-xxxx
        // Si no hay «|», se asume que es sólo la URL (endpoint propio sin clave).
        const bruto = (localStorage.getItem('API_KEY') || '').trim();
        if (!bruto) throw new Error('Falta la URL del endpoint custom. Formato: URL|CLAVE');
        const partes = bruto.split('|');
        const url = (partes[0] || '').trim();
        const token = (partes[1] || '').trim();
        if (!/^https?:\/\//i.test(url)) throw new Error('La URL del endpoint debe empezar por http:// o https://');

        const esOpenAI = /\/chat\/completions\/?$/i.test(url) || /openrouter\.ai|z\.ai|api\.openai\.com|api\.deepseek\.com|api\.groq\.com|api\.mistral\.ai/i.test(url);
        const cabeceras = { 'Content-Type': 'application/json' };
        if (token) cabeceras['Authorization'] = 'Bearer ' + token;
        if (/openrouter\.ai/i.test(url)) {
            cabeceras['HTTP-Referer'] = location.origin;
            cabeceras['X-Title'] = 'Tribunal Virtual Uruguay';
        }

        const cuerpo = esOpenAI
            ? {
                model: modelo || 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: SISTEMA },
                    { role: 'user', content: contexto ? 'Texto legal aportado:\n' + contexto + '\n\nConsulta: ' + pregunta : pregunta }
                ]
            }
            : { prompt: pregunta, system: SISTEMA, context: contexto || '', model: modelo || undefined };

        let res;
        try {
            res = await fetch(url, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) });
        } catch (e) {
            throw new Error('No se pudo conectar con el endpoint (' + url + '): ' + e.message + '. Si es un proveedor externo, revisá que la URL sea la del endpoint de chat y que el servidor permita CORS desde ' + location.origin);
        }

        const data = await res.json().catch(() => ({}));
        if (data.error) throw new Error(data.error.message || (typeof data.error === 'string' ? data.error : 'Error del endpoint'));
        if (!res.ok) throw new Error('HTTP ' + res.status + ' del endpoint: ' + JSON.stringify(data).slice(0, 300));

        if (esOpenAI) {
            const t = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (t) return t;
        }
        return data.result || data.response || data.text || data.content || JSON.stringify(data).slice(0, 2000);
    }

    throw new Error('Proveedor no válido: ' + proveedor);
}

export { NOMBRE_MOTOR };
