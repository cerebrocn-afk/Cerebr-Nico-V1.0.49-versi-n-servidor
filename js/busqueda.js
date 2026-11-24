/**
 * Módulo para buscar leyes por tipo, año, tema con filtros avanzados
 */

/**
 * Busca leyes en el array de leyes según filtros
 * @param {Array} leyes - Array de objetos ley
 * @param {Object} filtros - Objeto con filtros
 * @returns {Array} Array de leyes filtradas
 */
export function buscarLeyes(leyes, filtros = {}) {
    return leyes.filter(ley => {
        // Filtro por tipo
        if (filtros.tipo && ley.tipo !== filtros.tipo) return false;
        
        // Filtro por año
        if (filtros.anio && ley.anio !== filtros.anio) return false;
        
        // Filtro por palabra en nombre o contenido
        if (filtros.buscar) {
            const buscarLower = filtros.buscar.toLowerCase();
            const nombre = (ley.nombre || '').toLowerCase();
            const contenido = (ley.contenido || '').toLowerCase();
            if (!nombre.includes(buscarLower) && !contenido.includes(buscarLower)) {
                return false;
            }
        }
        
        // Filtro por tema (palabras clave)
        if (filtros.tema && Array.isArray(filtros.tema)) {
            const contenidoLower = (ley.contenido || '').toLowerCase();
            const temasEncontrados = filtros.tema.some(tema => 
                contenidoLower.includes(tema.toLowerCase())
            );
            if (!temasEncontrados) return false;
        }
        
        return true;
    });
}

/**
 * Obtiene todos los tipos únicos disponibles
 * @param {Array} leyes - Array de leyes
 * @returns {Array} Array de tipos únicos
 */
export function obtenerTipos(leyes) {
    const tipos = new Set();
    leyes.forEach(ley => {
        if (ley.tipo) tipos.add(ley.tipo);
    });
    return Array.from(tipros);
}

/**
 * Obtiene todos los años únicos disponibles
 * @param {Array} leyes - Array de leyes
 * @returns {Array} Array de años ordenados
 */
export function obtenerAnios(leyes) {
    const anios = new Set();
    leyes.forEach(ley => {
        if (ley.anio) anios.add(ley.anio);
    });
    return Array.from(anios).sort((a, b) => b - a);
}

/**
 * Obtiene temas sugeridos basados en contenido
 * @param {Array} leyes - Array de leyes
 * @returns {Array} Array de temas comunes
 */
export function obtenerTemasSugeridos(leyes) {
    const temas = {};
    leyes.forEach(ley => {
        const contenido = (ley.contenido || '').toLowerCase();
        const palabras = contenido.split(/\s+/);
        
        palabras.forEach(palabra => {
            if (palabra.length > 4) {
                temas[palabra] = (temas[palabra] || 0) + 1;
            }
        });
    });
    
    // Devuelve los 10 temas más comunes
    return Object.entries(temas)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([tema]) => tema);
}

export default {
    buscarLeyes,
    obtenerTipos,
    obtenerAnios,
    obtenerTemasSugeridos
};