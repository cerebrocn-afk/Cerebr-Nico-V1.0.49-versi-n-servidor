/**
 * Módulo para guardar, buscar y mostrar casos resueltos en formato JSON
 */

// Clave para almacenar casos en localStorage
const CASOS_STORAGE_KEY = 'juez-ley-uy-casos';

/**
 * Obtiene todos los casos almacenados
 * @returns {Array} Array de casos
 */
export function obtenerTodosLosCasos() {
    try {
        const stored = localStorage.getItem(CASOS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error('Error al obtener casos:', error);
        return [];
    }
}

/**
 * Guarda un nuevo caso
 * @param {Object} caso - Objeto caso a guardar
 * @returns {boolean} true si se guardó correctamente
 */
export function guardarCaso(caso) {
    try {
        // Validar estructura del caso
        if (!caso.fecha || !caso.materia || !caso.hechos || !caso.veredicto) {
            throw new Error('Caso incompleto: falta fecha, materia, hechos o veredicto');
        }

        // Añadir ID y fecha si no existen
        const casoCompleto = {
            id: caso.id || Date.now().toString(),
            fecha: caso.fecha || new Date().toISOString().split('T')[0],
            materia: caso.materia,
            hechos: caso.hechos,
            normativa: caso.normativa || [],
            veredicto: caso.veredicto,
            fuente: caso.fuente || 'sistema',
            createdAt: caso.createdAt || new Date().toISOString()
        };

        // Obtener casos existentes y añadir el nuevo
        const casos = obtenerTodosLosCasos();
        casos.push(casoCompleto);
        
        // Guardar en localStorage
        localStorage.setItem(CASOS_STORAGE_KEY, JSON.stringify(casos));
        return true;
    } catch (error) {
        console.error('Error al guardar caso:', error);
        return false;
    }
}

/**
 * Busca casos por criterios
 * @param {Object} criterios - Criterios de búsqueda
 * @returns {Array} Array de casos filtrados
 */
export function buscarCasos(criterios = {}) {
    const casos = obtenerTodosLosCasos();
    
    return casos.filter(caso => {
        // Búsqueda por materia
        if (criterios.materia && !caso.materia.toLowerCase().includes(criterios.materia.toLowerCase())) {
            return false;
        }
        
        // Búsqueda por fecha (exacta o rango)
        if (criterios.fecha) {
            if (caso.fecha !== criterios.fecha) return false;
        }
        
        // Búsqueda por palabra en hechos o veredicto
        if (criterios.buscar) {
            const buscarLower = criterios.buscar.toLowerCase();
            const hechos = (caso.hechos || '').toLowerCase();
            const veredicto = (caso.veredicto || '').toLowerCase();
            if (!hechos.includes(buscarLower) && !veredicto.includes(buscarLower)) {
                return false;
            }
        }
        
        // Búsqueda por año
        if (criterios.anio) {
            const anioCaso = new Date(caso.fecha).getFullYear();
            if (anioCaso !== criterios.anio) return false;
        }
        
        return true;
    });
}

/**
 * Obtiene un caso por su ID
 * @param {string} id - ID del caso
 * @returns {Object|null} El caso o null si no existe
 */
export function obtenerCasoPorId(id) {
    const casos = obtenerTodosLosCasos();
    return casos.find(caso => caso.id === id) || null;
}

/**
 * Elimina un caso por su ID
 * @param {string} id - ID del caso
 * @returns {boolean} true si se eliminó correctamente
 */
export function eliminarCaso(id) {
    try {
        const casos = obtenerTodosLosCasos();
        const filtrados = casos.filter(caso => caso.id !== id);
        
        if (filtrados.length === casos.length) {
            return false; // No se encontró el caso
        }
        
        localStorage.setItem(CASOS_STORAGE_KEY, JSON.stringify(filtrados));
        return true;
    } catch (error) {
        console.error('Error al eliminar caso:', error);
        return false;
    }
}

/**
 * Obmite estadísticas de casos
 * @returns {Object} Estadísticas
 */
export function obtenerEstadisticas() {
    const casos = obtenerTodosLosCasos();
    const estadisticas = {
        total: casos.length,
        porMateria: {},
        porAnio: {}
    };
    
    casos.forEach(caso => {
        // Contar por materia
        const materia = caso.materia || 'desconocida';
        estadisticas.porMateria[materia] = (estadisticas.porMateria[materia] || 0) + 1;
        
        // Contar por año
        const anio = new Date(caso.fecha).getFullYear();
        estadisticas.porAnio[anio] = (estadisticas.porAnio[anio] || 0) + 1;
    });
    
    return estadisticas;
}

export default {
    obtenerTodosLosCasos,
    guardarCaso,
    buscarCasos,
    obtenerCasoPorId,
    eliminarCaso,
    obtenerEstadisticas
};