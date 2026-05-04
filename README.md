# 🧭 ONetMap - Editor Visual de Redes

## 📋 Descripción

**ONetMap** es un editor visual web para diseñar y gestionar diagramas de redes informáticas. Permite construir topologías completas mediante nodos, enlaces, áreas y múltiples hojas de trabajo, todo en un entorno interactivo basado en canvas.

Su objetivo es facilitar la documentación y planificación de infraestructuras de red de forma intuitiva y visual.

---

## 🎯 Objetivo

- Diseñar redes de forma visual e interactiva
- Conectar dispositivos y definir su comportamiento
- Organizar infraestructuras complejas en hojas
- Exportar diagramas en múltiples formatos
- Facilitar documentación técnica de redes

---

## 🧩 Interfaz de la aplicación

### 🟦 Barra superior (Topbar)

Gestión global del proyecto:

- 📁 Archivo: nuevo, cargar y exportar
- 📄 Hojas: crear, eliminar, renombrar e importar
- ✏️ Nombre del archivo editable
- 🔀 Selector de hoja activa
- ❓ Botón de ayuda

---

### 🧰 Barra lateral izquierda (Toolbar)

Zona principal de herramientas:

#### 🖥️ Dispositivos
- Router, Switch, L3 Switch
- Access Point, Hub
- PC, servidor, NAS
- Impresora, pantalla, teléfono VoIP
- Patch panel, nube

#### 🔗 Relaciones
- Ethernet (cableado)
- Wireless (inalámbrico)
- WAN (red externa)

#### 🧭 Herramientas
- Selección
- Texto
- Eliminación
- Reasignación de IDs

#### 👁️ Vista
- Zoom
- Rejilla (grid)
- Mostrar/ocultar puertos
- Iconos simbólicos o realistas

---

### 🎨 Canvas (lienzo central)

Área de trabajo donde se colocan:

- Nodos (dispositivos)
- Enlaces (conexiones)
- Áreas (agrupaciones)
- Texto (notas)

Interacción:
- Click → crear o seleccionar
- Drag → mover elementos
- Scroll → zoom

---

### ⚙️ Inspector (panel derecho)

Editor de propiedades del elemento seleccionado.

#### 🖥️ Nodos
- Nombre
- Texto
- Ángulo
- Opacidad
- Metadata (clave/valor)
- Enlace entre hojas (cloud)

#### 🔗 Enlaces
- Tipo (Ethernet / Wireless / WAN)
- VLAN
- Puertos origen/destino
- Dirección del enlace

#### 📦 Áreas
- Nombre
- Color o transparente
- Tamaño

---

## ✨ Funcionalidades principales

### 🖥️ Dispositivos soportados
- Routers
- Switches L2 / L3
- Access Points
- PCs y servidores
- NAS e impresoras
- Cloud (interconexión entre hojas)

---

### 🔗 Tipos de enlaces

| Tipo | Descripción |
|------|------------|
| Ethernet | Conexión cableada |
| Wireless | Conexión inalámbrica |
| WAN | Red externa |

Opciones adicionales:
- VLAN
- Puertos origen/destino
- Modos ACCESS / TRUNK

---

### 📦 Organización

- Áreas para agrupar dispositivos
- Texto libre para anotaciones
- Múltiples hojas de trabajo
- Enlaces entre hojas mediante nodos cloud

---

### 💾 Importación / Exportación

#### Exportar:
- JSON (editable)
- GZIP (comprimido)
- PNG (imagen del diagrama)
- TXT (estructura en árbol)

#### Importar:
- Proyecto completo
- Como nueva hoja

---

### 🔄 Sistema de hojas

- Múltiples redes dentro de un mismo archivo
- Selector de hoja activa
- Crear / eliminar / renombrar hojas
- Conexión entre hojas

---

## 🚀 Flujo de uso

1. Selecciona un dispositivo en la toolbar
2. Haz click en el canvas
3. Conecta dispositivos con enlaces
4. Organiza con áreas y texto
5. Ajusta propiedades en el inspector
6. Exporta el proyecto

---

## ⌨️ Atajos de teclado

| Tecla | Acción |
|------|--------|
| Ctrl + C | Clonar elemento |
| Delete | Eliminar elemento |
| Enter | Confirmar texto |
| Esc | Cancelar herramienta |

---

## 🛠️ Tecnologías

- HTML5
- CSS3
- JavaScript
- Canvas API

---

## 🔗 Repositorio

Proyecto disponible en GitHub:

👉 https://github.com/cargonm6