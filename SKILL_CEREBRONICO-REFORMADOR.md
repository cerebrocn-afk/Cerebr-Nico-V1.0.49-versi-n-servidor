---
name: cerebronico-refactor
description: Refactor seguro multi-archivo con CerebróNico - renombrar, extraer, mover con verificación y pruebas.
author: Mario Nicolás Quintero Marín
version: 1.0.0
category: Software Development
tags: [refactor, code-quality, maintenance, safety, testing]
price: 19.99
---

# CerebróNico Reformador

Herramienta profesional para refactorización segura de código con verificación automática y pruebas de regresión. Transforma código legacy moderno y mantiene la calidad del proyecto durante evoluciones.

## ¿ hace?

Realiza refactorizaciones seguras con verificación en tiempo real:

### 🔧 Operaciones de Refactor
- **Renombrar** variables, funciones, componentes
- **Extraer** funciones y componentes
- **Mover** archivos y módulos
- **Optimizar** estructuras de datos
- **Simplificar** lógica compleja
- **Actualizar** dependencias

### 🛡️ Seguridad Garantizada
- Verificación de sintaxis antes de cambios
- Pruebas de regresión automáticas
- Backup automático de cambios
- Rollback en caso de fallos
- Validación de imports/exports
- Compatibilidad con versiones

### 📊 Análisis de Impacto
- Mapa de dependencias afectadas
- Lista de archivos modificados
- Estimación de riesgo
- Métricas de calidad mejoradas
- Detección de código duplicado
- Optimización de rendimiento

## Flujo de Refactorización

### 1. Análisis Inicial
```bash
# Analizar código para refactorizar
cerebronico-refactor {
  "accion": "analizar",
  "ruta": "src/components/",
  "objetivo": "optimizar-estructura"
}

# Resultado:
# {
#   "dependencias": {
#     "total": 15,
#     "circulares": 0,
#     "problematicas": 2
#   },
#   "duplicados": {
#     "lineas": 120,
#     "funciones": 3,
#     "archivos": 2
#   },
#   "calidad": {
#     "complejidad_ciclomatica": 8.5,
#     "maintenibilidad": 65,
#     "test_coverage": 80
#   },
#   "recomendaciones": [
#     "Extraer funciones comunes",
#     "Optimizar imports",
#     "Reducir complejidad"
#   ]
# }
```

### 2. Plan de Refactor
```bash
# Generar plan de refactor
cerebronico-refactor {
  "accion": "planificar",
  "ruta": "src/components/",
  "objetivo": "optimizar-estructura",
  "estrategia": "conservadora"
}

# Resultado:
# {
#   "pasos": [
#     {
#       "id": "1",
#       "accion": "extraer-funcion",
#       "archivo": "src/components/Usuario.jsx",
#       "funcion": "renderPerfil",
#       "destino": "src/utils/perfilUtils.js",
#       "riesgo": "bajo",
#       "dependencias": ["src/components/Perfil.jsx"]
#     },
#     {
#       "id": "2",
#       "accion": "renombrar-variable",
#       "archivo": "src/services/api.js",
#       "variable": "userData",
#       "nuevo_nombre": "userProfile",
#       "riesgo": "medio",
#       "dependencias": ["src/components/Dashboard.jsx", "src/hooks/useAuth.js"]
#     }
#   ],
#   "riesgo_total": "medio",
#   "beneficio_esperado": "mejora_mantenibilidad"
# }
```

### 3. Ejecución Segura
```bash
# Ejecutar refactor con verificación
cerebronico-refactor {
  "accion": "ejecutar",
  "ruta": "src/components/",
  "objetivo": "optimizar-estructura",
  "estrategia": "conservadora",
  "verificar": true,
  "backup": true
}

# Resultado:
# {
#   "ejecutados": [
#     {
#       "id": "1",
#       "accion": "extraer-funcion",
#       "estado": "exitoso",
#       "archivo_origen": "src/components/Usuario.jsx",
#       "archivo_destino": "src/utils/perfilUtils.js",
#       "cambios": 15,
#       "pruebas": "pasadas"
#     }
#   ],
#   "fallidos": [],
#   "verificacion": {
#     "sintaxis": "correcta",
#     "pruebas": "100% pasadas",
#     "dependencias": "resueltas"
#   },
#   "backup": "creado en .refactor-backup/"
# }
```

### 4. Pruebas de Regresión
```bash
# Ejecutar pruebas de regresión
cerebronico-refactor {
  "accion": "probar-regresion",
  "ruta": "src/",
  "pruebas": ["unitarias", "integracion", "e2e"]
}

# Resultado:
# {
#   "pruebas_unitarias": {
#     "total": 45,
#     "pasadas": 45,
#     "fallidas": 0,
#     "duracion": 2.3
#   },
#   "pruebas_integracion": {
#     "total": 12,
#     "pasadas": 12,
#     "fallidas": 0,
#     "duracion": 5.1
#   },
#   "pruebas_e2e": {
#     "total": 8,
#     "pasadas": 8,
#     "fallidas": 0,
#     "duracion": 12.4
#   },
#   "veredicto": "sin_regresiones"
# }
```

## Operaciones Disponibles

### 1. Extraer Funciones
```bash
cerebronico-refactor {
  "accion": "extraer-funcion",
  "archivo": "src/components/Usuario.jsx",
  "funcion": "renderPerfil",
  "destino": "src/utils/perfilUtils.js",
  "nombre_funcion": "renderUserProfile",
  "verificar": true
}
```

**Casos de uso:**
- Funciones grandes (>20 líneas)
- Lógica reutilizable
- Funciones con múltiples responsabilidades

### 2. Renombrar Variables
```bash
cerebronico-refactor {
  "accion": "renombrar-variable",
  "archivo": "src/services/api.js",
  "variable": "userData",
  "nuevo_nombre": "userProfile",
  "scope": "global"
}
```

**Casos de uso:**
- Nombres poco descriptivos
- Cambio de convenciones
- Mejor claridad del código

### 3. Mover Archivos
```bash
cerebronico-refactor {
  "accion": "mover-archivo",
  "origen": "src/components/old/",
  "destino": "src/components/new/",
  "actualizar_imports": true
}
```

**Casos de uso:**
- Reorganización de carpetas
- Mejor estructura de proyecto
- Separación de responsabilidades

### 4. Optimizar Imports
```bash
cerebronico-refactor {
  "accion": "optimizar-imports",
  "ruta": "src/",
  "estrategia": "agrupar-por-funcionalidad"
}
```

**Casos de uso:**
- Imports desorganizados
- Dependencias no utilizadas
- Módulos circularmente dependientes

### 5. Simplificar Lógica
```bash
cerebronico-refactor {
  "accion": "simplificar-logica",
  "archivo": "src/utils/helpers.js",
  "funcion": "validateUser",
  "enfoque": "reducir-complejidad"
}
```

**Casos de uso:**
- Condicionales anidadas
- Bucles complejos
- Lógica redundante

## Estrategias de Refactor

### Conservadora
- Cambios mínimos
- Máxima seguridad
- Ideal para proyectos críticos
- Verificación exhaustiva

### Moderada
- Balance entre cambios y seguridad
- Optimización moderada
- Ideal para proyectos en evolución
- Verificación estándar

### Agresiva
- Cambios significativos
- Máxima optimización
- Ideal para proyectos nuevos
- Verificación básica

## Ejemplos Prácticos

### Refactor de Componente React
```bash
# Componente original con problemas
cerebronico-refactor {
  "accion": "analizar",
  "ruta": "src/components/Dashboard.jsx",
  "objetivo": "mejorar-estructura"
}

# Plan de refactor
cerebronico-refactor {
  "accion": "planificar",
  "ruta": "src/components/Dashboard.jsx",
  "objetivo": "mejorar-estructura",
  "estrategia": "conservadora"
}

# Ejecutar refactor
cerebronico-refactor {
  "accion": "ejecutar",
  "ruta": "src/components/Dashboard.jsx",
  "objetivo": "mejorar-estructura",
  "estrategia": "conservadora"
}
```

### Refactor de Servidor Node.js
```bash
# Refactor de API endpoints
cerebronico-refactor {
  "accion": "extraer-funcion",
  "archivo": "src/api/users.js",
  "funcion": "validateUserData",
  "destino": "src/utils/validators.js",
  "nombre_funcion": "validateUserInput"
}

# Optimizar imports
cerebronico-refactor {
  "accion": "optimizar-imports",
  "ruta": "src/api/",
  "estrategia": "eliminar-no-utilizados"
}
```

## Beneficios

### ✅ Seguridad Garantizada
- Verificación antes de cambios
- Pruebas de regresión
- Backup automático
- Rollback en fallos

### 🚀 Productividad
- Refactor rápido y seguro
- Análisis automático
- Planificación asistida
- Ejecución controlada

### 📈 Calidad del Código
- Mejor mantenibilidad
- Complejidad reducida
- Código más limpio
- Mejores prácticas

### 🔧 Mantenimiento
- Evolución controlada
- Actualizaciones seguras
- Depuración facilitada
- Documentación automática

## Casos de Uso

### Para Startups
- Código MVP a producción
- Escalabilidad controlada
- Mejor arquitectura
- Riesgo mínimo

### Para Empresas
- Modernización de legacy
- Mejora de rendimiento
- Reducción de deuda técnica
- Cumplimiento de estándares

### Para Freelancers
- Proyectos mantenibles
- Código profesional
- Entrega segura
- Soporte a largo plazo

## Requisitos

- Node.js 18+
- Opcional: Python 3.8+ para memoria híbrida
- Opcional: Ollama para inferencia local

## Soporte

- Documentación completa en `skills/cerebronico-refactor/`
- Ejemplos de refactorizaciones reales
- Comunidad activa en GitHub

---

**Precio**: $19.99  
**Autor**: Mario Nicolás Quintero Marín  
**Versión**: 1.0.0  
**Categoría**: Software Development