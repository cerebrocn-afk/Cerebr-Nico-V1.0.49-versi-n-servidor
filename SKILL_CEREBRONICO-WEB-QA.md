---
name: cerebronico-web-qa
description: Auditoría web completa con CerebróNico - WCAG, rendimiento, SEO, seguridad y calidad del código.
author: Mario Nicolás Quintero Marín
version: 1.0.0
category: Web Development
tags: [qa, accessibility, performance, seo, security, testing]
price: 24.99
---

# CerebróNico Web QA

Herramienta profesional para auditoría y mejora de sitios web. Verifica accesibilidad WCAG 2.1, rendimiento, SEO, seguridad y calidad del código con reportes detallados y recomendaciones específicas.

## ¿Qué audita?

Realiza auditorías completas en 5 áreas críticas:

### 🎯 Accesibilidad (WCAG 2.1 AA)
- Contraste de colores mínimo 4.5:1
- Navegación por teclado completa
- Etiquetas ARIA semánticas
- Text alternativo para imágenes
- Evitar contenido parpadeante
- Idioma y dirección del documento

### ⚡ Rendimiento
- Tiempo de carga (<2s ideal)
- Optimización de imágenes
- Código JavaScript optimizado
- Recursos externos críticos
- Cache y compresión
- Puntuación Lighthouse >90

### 🔍 SEO
- Meta tags optimizadas
- Estructura de encabezados
- Enlaces rotos
- Schema JSON-LD
- Open Graph y Twitter Cards
- Sitemap y robots.txt

### 🔒 Seguridad
- HTTPS configurado
- Headers de seguridad
- Validación de formularios
- Protección contra XSS
- Política de contenido
- Cookies seguras

### 🧪 Calidad del Código
- HTML5 semántico
- CSS3 válido y optimizado
- JavaScript moderno y eficiente
- Estructura de archivos
- Convenciones de código
- Pruebas unitarias

## Flujo de Auditoría

### 1. Auditoría Inicial
```bash
# Auditar página completa
auditar_pagina "mi-sitio/index.html"

# Resultado detallado:
# {
#   "accesibilidad": {
#     "errores": 2,
#     "advertencias": 5,
#     "cumple_aa": true
#   },
#   "rendimiento": {
#     "tiempo_carga": 1.8,
#     "puntuacion_lighthouse": 92,
#     "optimizacion_imagenes": true
#   },
#   "seo": {
#     "meta_tags": "completo",
#     "estructura_encabezados": "valida",
#     "enlaces_rotos": 0
#   },
#   "seguridad": {
#     "https": true,
#     "headers_seguridad": true,
#     "validacion_formularios": true
#   },
#   "codigo": {
#     "html_semantico": true,
#     "css_valido": true,
#     "javascript_optimizado": true
#   },
#   "veredicto": "publicable_con_reservas"
# }
```

### 2. Mejora Automática
```bash
# Mejora automática de problemas corregibles
mejorar_pagina "mi-sitio/index.html" aplicar: true

# Resultado:
# {
#   "corregidos": ["contraste_colores", "etiquetas_aria", "meta_description"],
#   "pendientes": ["estructura_encabezados"],
#   "no_corregibles": ["tiempo_carga"]
# }
```

### 3. Verificación Final
```bash
# Segunda auditoría después de mejoras
auditar_pagina "mi-sitio/index.html"

# Veredicto final:
# {
#   "veredicto": "publicable",
#   "errores": 0,
#   "advertencias": 1,
#   "cumple_aa": true,
#   "puntuacion_lighthouse": 95
# }
```

### 4. Auditoría Completa del Sitio
```bash
# Auditar todo el sitio
auditar_sitio "mi-sitio"

# Resultado por página:
# {
#   "index.html": "publicable",
#   "acerca.html": "publicable_con_reservas",
#   "contacto.html": "no_publicable"
# }
```

## Detalles de Auditoría

### Accesibilidad WCAG 2.1 AA

#### Contraste de Colores
- Verifica ratio mínimo 4.5:1 para texto normal
- Ratio mínimo 3:1 para texto grande
- Incluye estados hover y focus
- Detecta colores dinámicos

#### Navegación por Teclado
- Tab order lógico
- Focus visible en todos los elementos
- Teclas de acceso rápido
- Evitar trampas de teclado

#### Etiquetas ARIA
- Roles semánticos correctos
- Propiedades aria necesarias
- Labels para formularios
- Live regions para actualizaciones

#### Text Alternativo
- Alt text para imágenes
- Descripciones para enlaces
- Etiquetas para botones
- Contexto adecuado

### Rendimiento

#### Tiempo de Carga
- First Contentful Paint <1.5s
- Largest Contentful Paint <2.5s
- First Input Delay <100ms
- Cumulative Layout Shift <0.1

#### Optimización de Recursos
- Imágenes comprimidas
- WebP cuando es posible
- Lazy loading para imágenes
- Código minificado

#### JavaScript Optimizado
- Sin código bloqueante
- Event delegation
- Debouncing para eventos
- Código modular

### SEO

#### Meta Tags
- Título único y descriptivo
- Meta description persuasiva
- Keywords naturales
- Open Graph completo

#### Estructura
- Encabezados jerárquicos
- URL amigables
- Breadcrumb navigation
- Internal linking

#### Schema Markup
- Organization schema
- LocalBusiness schema
- FAQPage schema
- BreadcrumbList schema

### Seguridad

#### HTTPS
- Certificado válido
- Redirección HTTP a HTTPS
- HSTS headers
- Mixed content evitado

#### Headers de Seguridad
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Content-Security-Policy

#### Validación
- Formularios con validation
- CSRF protection
- SQL injection prevention
- XSS protection

### Calidad del Código

#### HTML5 Semántico
- Tags semanticos correctos
- Proper document structure
- Accessible forms
- Video/audio with captions

#### CSS3 Válido
- Sin propiedades vendor prefixes
- Mobile-first approach
- Efficient selectors
- Proper organization

#### JavaScript Moderno
- ES6+ features
- Async/await
- Promises
- Error handling

## Ejemplos Prácticos

### Auditoría de E-commerce
```bash
# Auditar sitio de comercio electrónico
auditar_sitio "tienda-online"

# Resultado:
# {
#   "index.html": "publicable",
#   "producto.html": "publicable_con_reservas",
#   "carrito.html": "no_publicable",
#   "checkout.html": "no_publicable"
# }

# Mejorar carrito
mejorar_pagina "tienda-online/carrito.html" aplicar: true

# Verificar checkout
auditar_pagina "tienda-online/checkout.html"
```

### Auditoría de Blog
```bash
# Auditar blog personal
auditar_sitio "mi-blog"

# Enfocado en SEO:
# {
#   "seo": {
#     "meta_tags": "incompleto",
#     "estructura_encabezados": "valida",
#     "enlaces_rotos": 3,
#     "schema_jsonld": "falta"
#   }
# }

# Mejorar SEO
mejorar_pagina "mi-blog/index.html" aplicar: true
```

## Reporte de Auditoría

### Formato del Reporte
```json
{
  "pagina": "index.html",
  "timestamp": "2026-11-23T15:57:00Z",
  "accesibilidad": {
    "cumple_aa": true,
    "errores": 0,
    "advertencias": 2,
    "detalles": [
      {
        "tipo": "contraste",
        "severidad": "advertencia",
        "descripcion": "El contraste del texto es 4.2:1, recomendado 4.5:1",
        "ubicacion": ".hero h1",
        "solucion": "Aumentar el contraste del texto del título"
      }
    ]
  },
  "rendimiento": {
    "puntuacion_lighthouse": 94,
    "tiempo_carga": 1.9,
    "optimizaciones": [
      "Comprimir imágenes",
      "Minificar CSS",
      "Implementar lazy loading"
    ]
  },
  "seo": {
    "meta_tags": "completo",
    "estructura_encabezados": "valida",
    "enlaces_rotos": 0,
    "recomendaciones": [
      "Agregar schema JSON-LD para Organization",
      "Optimizar meta description"
    ]
  },
  "seguridad": {
    "https": true,
    "headers_seguridad": true,
    "vulnerabilidades": []
  },
  "codigo": {
    "html_semantico": true,
    "css_valido": true,
    "javascript_optimizado": true
  },
  "veredicto": "publicable_con_reservas"
}
```

## Beneficios

### ✅ Calidad Garantizada
- Auditoría profesional en 5 áreas críticas
- Recomendaciones específicas y accionables
- Verificación continua de mejoras

### 🔧 Mejora Continua
- Corrección automática de problemas
- Reportes detallados de progreso
- Seguimiento de métricas clave

### 📊 Métricas Claras
- Puntuaciones objetivas
- Comparativas con mejores prácticas
- Evolución del rendimiento

### 🎯 Enfoque en Resultados
- Sitios listos para producción
- Experiencia de usuario optimizada
- Posicionamiento SEO mejorado

## Casos de Uso

### Para Freelancers
- Auditoría de proyectos antes de entregar
- Mejora de sitios existentes
- Reportes para clientes

### Para Agencias
- Control de calidad en proyectos
- Auditorías periódicas
- Certificación de calidad

### Para Empresas
- Auditoría de sitios propios
- Cumplimiento de estándares
- Mejora continua

## Requisitos

- Node.js 18+
- Opcional: Python 3.8+ para memoria híbrida
- Opcional: Ollama para inferencia local

## Soporte

- Documentación completa en `skills/cerebronico-web-qa/`
- Ejemplos de auditorías reales
- Comunidad activa en GitHub

---

**Precio**: $24.99  
**Autor**: Mario Nicolás Quintero Marín  
**Versión**: 1.0.0  
**Categoría**: Web Development