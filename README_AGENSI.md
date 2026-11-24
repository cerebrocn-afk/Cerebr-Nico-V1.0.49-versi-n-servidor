# CerebróNico en Agensi - Guía de Implementación

## Sobre Este Proyecto

Este repositorio contiene la implementación de las habilidades de CerebróNico para el marketplace Agensi. CerebróNico es un IDE de desarrollo autónomo con inferencia local y aceleración en la nube, y ahora sus habilidades están disponibles para desarrolladores que usan Claude Code, Cursor, Copilot y otros agentes de IA.

## Habilidades Disponibles

### Skills Principales

| Skill | Precio | Categoría | Descripción |
|-------|--------|-----------|-------------|
| [cerebronico-creador](SKILL_CEREBRONICO-CREADOR.md) | $29.99 | Web Development | Crear sitios web accesibles y optimizados |
| [cerebronico-web-qa](SKILL_CEREBRONICO-WEB-QA.md) | $24.99 | Web Development | Auditoría web completa con WCAG, rendimiento, SEO |
| [cerebronico-refactor](SKILL_CEREBRONICO-REFORMADOR.md) | $19.99 | Software Development | Refactor seguro multi-archivo con verificación |
| cerebronico-memoria | $14.99 | System | Protocolo de capa de memoria híbrida |
| cerebronico-depurador | $19.99 | Debug | Depuración sistemática con causa raíz |
| cerebronico-git | $17.99 | DevOps | Git seguro con validación |
| cerebronico-datos | $21.99 | Data | Análisis/ETL de datos sin inventar cifras |
| cerebronico-api | $24.99 | Backend | Diseño/consumo de APIs REST |
| cerebronico-rendimiento | $19.99 | Optimization | Optimización de rendimiento real |
| cerebronico-accesibilidad | $24.99 | QA | Auditoría WCAG completa |

### Paquetes Temáticos

| Paquete | Precio | Incluye |
|---------|--------|---------|
| [CerebróNico Core](SKILL_AGENSI_CEREBRONICO.md) | $79.00 | 10 skills principales |
| CerebróNico Full Stack | $149.00 | 20 skills completos |
| CerebróNico Enterprise | $299.00 | Todas las skills + soporte |

## Características Destacadas

### 🎨 Creación de Sitios Web
- HTML5 + CSS3 + JavaScript vanilla
- 9 paletas de color predefinidas
- 11 tipos de sitio (landing, negocio, portfolio, etc.)
- 15 bloques reutilizables
- Soporte PWA y modo oscuro
- Schema JSON-LD para SEO

### 🔧 Desarrollo Seguro
- Refactor multi-archivo con verificación
- Depuración sistemática con causa raíz
- Git seguro con commits atómicos
- Validación de APIs REST

### 📊 Calidad y Rendimiento
- Auditoría WCAG 2.1 AA
- Optimización de rendimiento real
- Métricas de observabilidad
- Pruebas de regresión

### 🚀 Entrega Profesional
- Exportación ZIP determinista
- Verificación de despliegue
- Soporte multiidioma
- Documentación técnica

## Instalación y Configuración

### Requisitos
- Node.js 18+
- Opcional: Python 3.8+ para memoria híbrida
- Opcional: Ollama para inferencia local

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/cerebrocn-afk/Cerebr-Nico-V1.0.49.git
cd Cerebr-Nico-V1.0.49
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

4. **Iniciar servicios**
```bash
npm run dev
```

## Uso Básico

### Crear un Sitio Web
```bash
# 1. Elegir plantilla disponible
plantillas_disponibles

# 2. Crear sitio con el brief
crear_sitio {
  "nombre": "mi-proyecto",
  "tipo": "negocio",
  "titulo": "Mi Proyecto",
  "subtitulo": "Descripción del proyecto",
  "caracteristicas": [
    {"titulo": "Característica 1", "texto": "Descripción"},
    {"titulo": "Característica 2", "texto": "Descripción"}
  ]
}

# 3. Auditar y mejorar
auditar_pagina "mi-proyecto/index.html"
mejorar_pagina "mi-proyecto/index.html" aplicar: true

# 4. Convertir a PWA
crear_pwa "mi-proyecto"
```

### Refactorizar Código
```bash
# Analizar código para refactorizar
cerebronico-refactor {
  "accion": "analizar",
  "ruta": "src/components/",
  "objetivo": "optimizar-estructura"
}

# Ejecutar refactor seguro
cerebronico-refactor {
  "accion": "ejecutar",
  "ruta": "src/components/",
  "objetivo": "optimizar-estructura",
  "estrategia": "conservadora",
  "verificar": true
}
```

### Auditar Sitio Web
```bash
# Auditoría completa
auditar_sitio "mi-proyecto"

# Mejora automática
mejorar_pagina "mi-proyecto/index.html" aplicar: true
```

## Documentación Detallada

### Skills Individuales
- [cerebronico-creador](SKILL_CEREBRONICO-CREADOR.md) - Creación de sitios web
- [cerebronico-web-qa](SKILL_CEREBRONICO-WEB-QA.md) - Auditoría web
- [cerebronico-refactor](SKILL_CEREBRONICO-REFORMADOR.md) - Refactor seguro

### Análisis y Planes
- [AGENSI_ANALISIS.md](AGENSI_ANALISIS.md) - Análisis de monetización
- [PLAN_ACCION_AGENSI.md](PLAN_ACCION_AGENSI.md) - Plan de acción detallado

## Beneficios de Usar CerebróNico

### ✅ Productividad
- Desarrollo 3x más rápido
- Código limpio y mantenible
- Automatización de tareas repetitivas

### 🔒 Calidad
- Auditorías automáticas
- Buenas prácticas integradas
- Accesibilidad garantizada

### 📈 Rendimiento
- Optimización de carga
- Mejores prácticas SEO
- PWA listo para producción

### 🎯 Precisión
- Determinista (mismo input = mismo output)
- Sin invención de contenido
- Verificación de cada paso

## Soporte y Comunidad

### Documentación
- Documentación completa en cada skill
- Ejemplos de uso prácticos
- Tutoriales paso a paso

### Comunidad
- [GitHub Issues](https://github.com/cerebrocn-afk/Cerebr-Nico-V1.0.49/issues)
- [Discussions](https://github.com/cerebrocn-afk/Cerebr-Nico-V1.0.49/discussions)
- [Wiki](https://github.com/cerebrocn-afk/Cerebr-Nico-V1.0.49/wiki)

### Contribuciones
Las contribuciones son bienvenidas. Por favor:
1. Abra un Issue para discutir cambios
2. Haga un Fork del repositorio
3. Cree una rama para su contribución
4. Haga un Pull Request

## Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

## Autor

**Mario Nicolás Quintero Marín**
- Website: [https://cerebronico.com](https://cerebronico.com)
- GitHub: [@cerebrocn-afk](https://github.com/cerebrocn-afk)
- Email: mario.nicolas.quintero@gmail.com

## Reconocimientos

- **Z.ai** - Acceso al modelo GLM-4.5-Flash para prototipado
- **Accio Work** - Entorno de trabajo para ensamblaje y pruebas
- **Google AI Studio** - Modelado y afinado de flujos

---

*Última actualización: 23 de noviembre de 2026*