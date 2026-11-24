---
name: cerebronico-creador
description: Crear aplicaciones web y páginas con el pack creador-web de CerebróNico — tipos, bloques, paletas, PWA y entregable honesto.
author: Mario Nicolás Quintero Marín
version: 1.0.0
category: Web Development
tags: [web, html, css, javascript, pwa, accessibility, seo]
price: 29.99
---

# CerebróNico Creador de Sitios Web

Herramienta profesional para crear sitios web modernos, accesibles y optimizados con HTML5 + CSS3 + JavaScript vanilla. Determinista, sin frameworks, con soporte PWA y auditoría integrada.

## ¿Qué hace?

Crea sitios web completos con:
- **HTML5 semántico** con accesibilidad WCAG 2.1 AA
- **CSS3 moderno** con Grid, Flexbox y propiedades personalizadas
- **JavaScript vanilla** optimizado y sin dependencias
- **PWA** listo para producción (manifest + service worker)
- **SEO** optimizado con schema JSON-LD y meta tags
- **Modo oscuro** con prefers-color-scheme
- **Responsive design** con breakpoints predefinidos

## Características Principales

### 🎨 Diseño Moderno
- 9 paletas de color predefinidas
- 11 tipos de sitio (landing, negocio, portfolio, etc.)
- 15 bloques reutilizables
- Tipografías profesionales
- Sistema de diseño consistente

### 🔧 Accesibilidad Garantizada
- Skip links para navegación por teclado
- ARIA labels y roles semánticos
- Contraste WCAG 2.1 AA mínimo 4.5:1
- Soporte para lectores de pantalla
- Prefers-reduced-motion

### 📱 PWA Ready
- Manifest webapp
- Service worker con cache-first
- Iconos responsive
- Soporte offline básico
- App-like experience

### 🚀 Rendimiento Optimizado
- Código minificado y optimizado
- Imágenes lazy loading
- Recursos cargados bajo demanda
- Puntuación Lighthouse >90

## Flujo de Trabajo

### 1. Explorar Plantillas
```bash
# Ver plantillas disponibles
plantillas_disponibles

# Resultado:
# Tipos: agencia, evento, landing, negocio, onepage, portfolio, producto, restaurante, revista, sencillo, startup
# Paletas: arena, bosque, calido, cereza, claro, noche, oceano, pizarra, violeta
# Bloques: hero, caracteristicas, precios, testimonios, faq, contacto, cta, galeria, equipo, pasos, barra, pie, imagen, estadisticas, logos
```

### 2. Crear Sitio
```bash
crear_sitio {
  "nombre": "mi-proyecto",
  "tipo": "negocio",
  "titulo": "Mi Proyecto",
  "subtitulo": "Soluciones innovadoras para tu negocio",
  "descripcion": "Empresa especializada en desarrollo web y soluciones tecnológicas",
  "contacto": "contacto@mi-proyecto.com",
  "cta": "Contactar Ahora",
  "caracteristicas": [
    {"titulo": "Diseño Moderno", "texto": "Interfaces atractivas y funcionales"},
    {"titulo": "Rendimiento", "texto": "Sitios rápidos y optimizados"},
    {"titulo": "Accesibilidad", "texto": "Cumplimiento WCAG 2.1 AA"}
  ],
  "testimonios": [
    {"cita": "Excelente trabajo y soporte post-venta", "autor": "Cliente 1", "cargo": "CEO"},
    {"cita": "Profesionales y comprometidos", "autor": "Cliente 2", "cargo": "CTO"}
  ],
  "faq": [
    {"pregunta": "¿Cuánto tiempo toma un sitio?", "respuesta": "Depende de la complejidad, entre 1-3 días"},
    {"pregunta": "¿Incluye mantenimiento?", "respuesta": "Ofrecemos planes de mantenimiento mensual"}
  ]
}
```

### 3. Auditar y Mejorar
```bash
# Auditoría inicial
auditar_pagina "mi-proyecto/index.html"

# Mejora automática
mejorar_pagina "mi-proyecto/index.html" aplicar: true

# Verificar resultado
auditar_pagina "mi-proyecto/index.html"
```

### 4. PWA y SEO
```bash
# Convertir a PWA
crear_pwa "mi-proyecto"

# Crear imagen Open Graph
crear_og_image "mi-proyecto" {
  "titulo": "Mi Proyecto",
  "subtitulo": "Soluciones innovadoras",
  "nombre": "Mi Proyecto"
}

# Generar schema JSON-LD
generar_schema_jsonld "mi-proyecto" {
  "tipo": "LocalBusiness",
  "nombre": "Mi Proyecto",
  "url": "https://mi-proyecto.com",
  "direccion": "Calle Falsa 123",
  "telefono": "+1234567890",
  "email": "contacto@mi-proyecto.com"
}
```

### 5. Exportar
```bash
# Exportar como ZIP determinista
exportar_sitio_zip "mi-proyecto"

# Verificar despliegue
verificar_despliegue "mi-proyecto" "/ruta/de/despliegue"
```

## Tipos de Sitio Soportados

### Negocio
- Ideal para empresas y servicios
- Secciones: hero, características, testimonios, contacto
- Enfoque: profesional y confiable

### Portfolio
- Para profesionales y creativos
- Secciones: hero, proyectos, equipo, contacto
- Enfoque: visual e inspirador

### Producto
- Tiendas y productos específicos
- Secciones: hero, características, precios, FAQ
- Enfoque: conversiones y ventas

### Landing
- Campañas promocionales
- Secciones: hero, beneficios, CTA, testimonios
- Enfoque: conversión directa

### Restaurante
- Establecimientos gastronómicos
- Secciones: hero, menú, galería, contacto, reservas
- Enfoque: experiencia gastronómica

## Paletas de Color

### Claras
- **claro**: Minimalista y profesional
- **calido**: Acogedor y amigable
- **cereza**: Energético y vibrante

### Oscuras
- **noche**: Sofisticada y elegante
- **bosque**: Natural y equilibrada
- **pizarra**: Tecnológica y moderna

### Especiales
- **arena**: Cálida y natural
- **oceano**: Fresca y abierta
- **violeta**: Creativa e innovadora

## Bloques Disponibles

### Contenido
- **hero**: Sección principal con título y CTA
- **caracteristicas**: Beneficios y ventajas
- **testimonios**: Opiniones de clientes
- **faq**: Preguntas frecuentes
- **contacto**: Formulario y información
- **galeria**: Imágenes y proyectos

### Estructura
- **barra**: Navegación superior
- **pie**: Footer con información
- **pasos**: Proceso o flujo
- **equipo**: Presentación del equipo
- **precios**: Planes y tarifas
- **estadisticas**: Datos y métricas

### Media
- **imagen**: Imagen destacada
- **logos**: Logos de clientes o partners

## Ejemplos Práctos

### Crear un Sitio de Negocio
```bash
crear_sitio {
  "nombre": "agencia-digital",
  "tipo": "negocio",
  "titulo": "Agencia Digital",
  "subtitulo": "Transformamos tu presencia digital",
  "descripcion": "Agencia especializada en desarrollo web, marketing digital y estrategias digitales",
  "contacto": "hola@agencia-digital.com",
  "cta": "Solicitar Propuesta",
  "caracteristicas": [
    {"titulo": "Diseño Web", "texto": "Sitios modernos y responsivos"},
    {"titulo": "Marketing Digital", "texto": "Estrategias para aumentar tu visibilidad"},
    {"titulo": "Desarrollo App", "texto": "Aplicaciones móviles nativas y web"}
  ],
  "testimonios": [
    {"cita": "Nos ayudaron a triplicar nuestras ventas online", "autor": "Juan Pérez", "cargo": "CEO Startup"},
    {"cita": "Profesionales y resultados garantizados", "autor": "María García", "cargo": "Marketing Director"}
  ],
  "faq": [
    {"pregunta": "¿Cuánto cuesta un sitio web?", "respuesta": "Depende de las necesidades, desde $500 hasta $5000"},
    {"pregunta": "¿Incluye mantenimiento?", "respuesta": "Ofrecemos planes de mantenimiento mensual desde $50"}
  ]
}
```

### Agregar un Bloque Personalizado
```bash
crear_bloque "agencia-digital" {
  "bloque": "galeria",
  "galeria": [
    {"imagen": "proyecto1.jpg", "titulo": "Proyecto 1", "texto_alternativo": "Diseño web para empresa"},
    {"imagen": "proyecto2.jpg", "titulo": "Proyecto 2", "texto_alternativo": "App móvil para e-commerce"}
  ]
}
```

## Beneficios

### ✅ Productividad
- Creación en minutos, no en semanas
- Código limpio y mantenible
- Sin dependencias externas

### 🔒 Calidad
- Auditoría de accesibilidad integrada
- Buenas prácticas de SEO
- Código semántico y válido

### 📱 Experiencia
- PWA listo para app stores
- Diseño responsive en todos los dispositivos
- Modo oscuro integrado

### 🚀 Rendimiento
- Puntuación Lighthouse >90
- Tiempo de carga <2s
- Optimizado para SEO

## Requisitos

- Node.js 18+
- Opcional: Python 3.8+ para memoria híbrida
- Opcional: Ollama para inferencia local

## Soporte

- Documentación completa en `skills/cerebronico-creador/`
- Ejemplos de uso en cada herramienta
- Comunidad activa en GitHub

---

**Precio**: $29.99  
**Autor**: Mario Nicolás Quintero Marín  
**Versión**: 1.0.0  
**Categoría**: Web Development