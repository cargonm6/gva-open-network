# ONetMap - Editor Visual de Diagramas de Red

## 📋 Descripción

**ONetMap** es una aplicación web interactiva para diseñar y visualizar diagramas de redes informáticas. Permite crear representaciones gráficas de topologías de red arrastrando y conectando dispositivos virtuales en un lienzo interactivo.

## 🎯 Objetivo Principal

Proporcionar una herramienta intuitiva y accesible para:
- Diseñar redes de dispositivos de forma visual
- Conectar elementos (routers, switches, PCs, servidores, etc.)
- Organizar y documentar infraestructuras de red
- Exportar y compartir diagramas en múltiples formatos

## ✨ Características Principales

### 🖥️ Dispositivos Disponibles
- **Intermedios**: Router, Switch, L3 Switch, Access Point, Hub
- **Terminales**: PC, Servidor, NAS, Impresora, Pantalla
- **Estructura**: Patch Panel, Nube

### 🔗 Conexiones
- Enlace Ethernet (cableado)
- Enlace Inalámbrico (wireless)
- Enlace WAN

### 📦 Herramientas de Organización
- Áreas para agrupar dispositivos
- Notas de texto
- Múltiples hojas de trabajo

### 💾 Formatos de Exportación
- JSON (editable)
- GZIP (comprimido)
- PNG (imagen del diagrama)
- TXT (árbol de texto)

## 🚀 Uso Rápido

1. **Añadir dispositivos**: Selecciona una herramienta del menú izquierdo y haz clic en el lienzo
2. **Conectar elementos**: Usa la herramienta "Enlace" para crear conexiones
3. **Editar propiedades**: Selecciona un elemento y modifica sus propiedades en el panel derecho
4. **Guardar**: Exporta tu diagrama en el formato que necesites

## 📁 Estructura del Proyecto

```
gva-open-network/
├── index.html          # Interfaz principal
├── help.html           # Guía de uso
├── css/                # Estilos
├── js/                 # Lógica de aplicación
├── img/                # Iconos y recursos gráficos
└── data/               # Datos y configuración
```

## 🛠️ Tecnologías

- **HTML5**: Estructura
- **CSS3**: Estilos y diseño responsive
- **JavaScript**: Lógica interactiva y manipulación del canvas
- **Canvas API**: Rendering gráfico

## 📖 Documentación

Para aprender más sobre cómo usar ONetMap, consulta el archivo `help.html` que incluye:
- Guía paso a paso
- Tips y consejos
- Atajos de teclado
- Casos de uso recomendados

## 📝 Licencia

Este proyecto es de código abierto. Consulta el archivo LICENSE para más detalles.

## 👤 Autor

Proyecto desarrollado por [@cargonm6](https://github.com/cargonm6)

---

**ONetMap** - Diseña redes, visualiza topologías, comparte diagramas.