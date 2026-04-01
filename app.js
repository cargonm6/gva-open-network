// =====================
// SETUP
// =====================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const rect = canvas.getBoundingClientRect();
canvas.width = rect.width;
canvas.height = rect.height;

// =====================
// ESTADO
// =====================
let db = { areas: [], nodes: [], links: [] };
let currentTool = null;
let activeButton = null;
let selectedNode = null;
let selectedArea = null;
let draggingNode = null;
let draggingArea = null;
let draggingOffset = { x: 0, y: 0 };
let resizingArea = null;
let resizing = false;
let linkStart = null;

// =====================
// ICONOS
// =====================
const icons = {
    router: loadIcon("img/devices/router.svg"),
    switch: loadIcon("img/devices/switch.svg"),
    pc: loadIcon("img/devices/pc.svg"),
    patch: loadIcon("img/devices/patch.svg"),
    area: loadIcon("img/devices/area.svg")
};
function loadIcon(src) { const img = new Image(); img.src = src; return img; }

// =====================
// UTIL
// =====================
function uuid() { return crypto.randomUUID(); }
function getMousePos(evt) { const r = canvas.getBoundingClientRect(); return { x: evt.clientX - r.left, y: evt.clientY - r.top }; }
function getNodeAt(x, y) {
    return db.nodes.find(n => {
        const w = n._width || 50;   // fallback al tamaño fijo
        const h = n._height || 50;
        return x >= n.position.x && x <= n.position.x + w &&
               y >= n.position.y && y <= n.position.y + h;
    });
}
function getAreaAt(x, y) { return db.areas.find(a => x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height); }
function isOnResizeHandle(area, x, y) {
    const handleSize = 10; // tamaño del cuadrado rojo
    return x >= area.x + area.width - handleSize && x <= area.x + area.width &&
        y >= area.y + area.height - handleSize && y <= area.y + area.height;
}

// =====================
// ENLACES
// =====================
function getLinkAt(x, y) {
    const groups = {};
    db.links.forEach(link => {
        const key = [link.from.nodeId, link.to.nodeId].sort().join('_');
        if (!groups[key]) groups[key] = [];
        groups[key].push(link);
    });

    for (const key in groups) {
        const links = groups[key];
        const from = db.nodes.find(n => n.id === links[0].from.nodeId);
        const to = db.nodes.find(n => n.id === links[0].to.nodeId);
        if (!from || !to) continue;

        const dx = to.position.x - from.position.x;
        const dy = to.position.y - from.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) continue;

        const ux = -dy / len;
        const uy = dx / len;
        const gap = 10;

        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const offset = (i - (links.length - 1) / 2) * gap;
            const ox = ux * offset;
            const oy = uy * offset;

            const x1 = from.position.x + 25 + ox;
            const y1 = from.position.y + 25 + oy;
            const x2 = to.position.x + 25 + ox;
            const y2 = to.position.y + 25 + oy;

            const t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (t < 0 || t > 1) continue;

            const px = x1 + t * (x2 - x1);
            const py = y1 + t * (y2 - y1);
            if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 6) return link;
        }
    }
    return null;
}

// =====================
// DELETE
// =====================
function deleteAt(x, y) {
    const node = getNodeAt(x, y);
    if (node) {
        db.nodes = db.nodes.filter(n => n.id !== node.id);
        db.links = db.links.filter(l => l.from.nodeId !== node.id && l.to.nodeId !== node.id);
        return;
    }
    const link = getLinkAt(x, y);
    if (link) {
        db.links = db.links.filter(l => l.id !== link.id);
        return;
    }
    const area = getAreaAt(x, y);
    if (area) db.areas = db.areas.filter(a => a.id !== area.id);
}

// =====================
// CREATE
// =====================
function generateUniqueId(type, collection) {
    // type: prefijo del ID ("router", "area", etc.)
    // collection: array de elementos donde validar la unicidad (db.nodes o db.areas)
    let id;
    do {
        id = `${type}_${Math.floor(Math.random() * 10000)}`;
    } while (collection.some(item => item.id === id));
    return id;
}

function createNode(type, x, y) {
    const id = generateUniqueId(type, db.nodes);
    db.nodes.push({ id, type, name: id, position: { x, y }, metadata: {}, interfaces: [] });
}

function createArea(x, y) {
    const id = generateUniqueId("area", db.areas);
    db.areas.push({ id, name: id, x, y, width: 150, height: 100 });
}

function createTextNode(x, y, content = "Nuevo texto") {
    const id = generateUniqueId("text", db.nodes);
    db.nodes.push({
        id,
        type: "text",
        name: id,
        position: { x, y },
        text: content,       // contenido del texto
        metadata: {}
    });
}

// =====================
// DRAW
// =====================
function drawArea(a) {
    ctx.save();

    ctx.strokeStyle = (a === selectedArea) ? "red" : "gray";
    ctx.strokeRect(a.x, a.y, a.width, a.height);

    ctx.fillStyle = "black";
    ctx.textAlign = "left"; // 👈 explícito
    ctx.textBaseline = "top";

    ctx.fillText(a.name, a.x + 5, a.y + 5);

    ctx.fillStyle = "red";
    ctx.fillRect(a.x + a.width - 10, a.y + a.height - 10, 10, 10);

    ctx.restore();
}
function drawNode(n) {
    ctx.save(); // 👈 guardar estado

    if (n.type === "text") {
        ctx.font = "12px Arial"; // definir font antes de medir texto
        const padding = 10;
    
        // Dividimos líneas
        const lines = n.text.split("\\n");
    
        // Altura → 14px por línea (aproximado) + padding
        const height = lines.length * 14 + padding;
    
        // Anchura → máximo de texto + padding
        let maxWidth = 0;
        lines.forEach(line => {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        });
        const width = maxWidth + padding;
    
        // Guardamos tamaño en el nodo para hit testing y dragging
        n._width = width;
        n._height = height;
    
        // Fondo
        ctx.fillStyle = "#ffffaa";
        ctx.fillRect(n.position.x, n.position.y, width, height);
    
        // Borde
        ctx.strokeStyle = (n === selectedNode) ? "red" : "black";
        ctx.strokeRect(n.position.x, n.position.y, width, height);
    
        // Texto
        ctx.fillStyle = "black";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
    
        lines.forEach((line, i) => {
            ctx.fillText(line, n.position.x + padding / 2, n.position.y + padding / 2 + i * 14);
        });
    
        return;
    }

    const icon = icons[n.type];

    // Icono
    if (icon && icon.complete) {
        ctx.drawImage(icon, n.position.x, n.position.y, 50, 50);
    } else {
        ctx.fillStyle = "#3498db";
        ctx.fillRect(n.position.x, n.position.y, 50, 50);
    }

    // Selección
    if (n === selectedNode) {
        ctx.strokeStyle = "red";
        ctx.strokeRect(n.position.x, n.position.y, 50, 50);
    }

    // Nombre
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "12px Arial";

    ctx.fillText(n.name, n.position.x + 25, n.position.y + 52);

    ctx.restore(); // 👈 restaurar estado
}
function drawLinks() {
    const groups = {};
    db.links.forEach(l => { const k = [l.from.nodeId, l.to.nodeId].sort().join('_'); if (!groups[k]) groups[k] = []; groups[k].push(l); });
    for (const k in groups) {
        const ls = groups[k]; const f = db.nodes.find(n => n.id === ls[0].from.nodeId); const t = db.nodes.find(n => n.id === ls[0].to.nodeId);
        if (!f || !t) continue;
        const dx = t.position.x - f.position.x; const dy = t.position.y - f.position.y; const len = Math.sqrt(dx * dx + dy * dy);
        const ux = -dy / len; const uy = dx / len; const gap = 10;
        ls.forEach((l, i) => {
            const off = (i - (ls.length - 1) / 2) * gap; const ox = ux * off; const oy = uy * off;
            ctx.beginPath();
            ctx.moveTo(f.position.x + 25 + ox, f.position.y + 25 + oy);
            ctx.lineTo(t.position.x + 25 + ox, t.position.y + 25 + oy);
            ctx.strokeStyle = "black"; ctx.stroke();
        });
    }
}
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    db.areas.forEach(drawArea);
    drawLinks();
    db.nodes.forEach(drawNode);
}

// =====================
// TOOLS
// =====================
function toggleTool(tool, button) {
    if (currentTool === tool) { currentTool = null; if (button) button.classList.remove("active"); activeButton = null; linkStart = null; updateCursor(); return; }
    if (activeButton) activeButton.classList.remove("active");
    currentTool = tool; activeButton = button; if (button) button.classList.add("active"); linkStart = null; updateCursor();
}
function clearTool() { currentTool = null; linkStart = null; if (activeButton) activeButton.classList.remove("active"); activeButton = null; updateCursor(); }

// =====================
// CURSOR Y MOVIMIENTO INTEGRADO
// =====================
let cursorIcon = null;
let lastMouseX = 0;
let lastMouseY = 0;

function updateCursor() {
    let cursorSet = false;

    // REDIMENSIONANDO
    if (resizing && resizingArea) {
        canvas.style.cursor = "se-resize";
        cursorSet = true;
    }
    // ARRASTRANDO
    else if (draggingNode || draggingArea) {
        canvas.style.cursor = "move";
        cursorSet = true;
    }
    // CURSOR SOBRE HANDLE DE CUALQUIER AREA
    else {
        // Verificar todos los handles de resize
        for (const area of db.areas) {
            if (isOnResizeHandle(area, lastMouseX, lastMouseY)) {
                canvas.style.cursor = "se-resize";
                cursorSet = true;
                break;
            }
        }
    }

    // CURSOR SOBRE NODOS
    if (!cursorSet && !draggingNode && !draggingArea && !resizing) {
        // Solo poner pointer si no estamos en herramientas de creación o link
        if (!["router", "switch", "pc", "patch", "link", "delete", "area"].includes(currentTool)) {
            const node = getNodeAt(lastMouseX, lastMouseY);
            if (node) {
                canvas.style.cursor = "pointer";
                cursorSet = true;
            }
        }
    }

    // CREACION DE NODOS
    if (!cursorSet) {
        if (["router", "switch", "pc", "patch", "area"].includes(currentTool)) {
            canvas.style.cursor = "crosshair";
            cursorIcon = icons[currentTool];
            cursorSet = true;
        } else if (currentTool === "link") {
            canvas.style.cursor = "crosshair";
            cursorIcon = null;
            cursorSet = true;
        } else if (currentTool === "text") {
            canvas.style.cursor = "text";
            cursorIcon = null;
            cursorSet = true;
        } else if (currentTool === "delete") {
            canvas.style.cursor = "not-allowed";
            cursorIcon = null;
            cursorSet = true;
        }
    }

    // DEFAULT
    if (!cursorSet) {
        canvas.style.cursor = "default";
        cursorIcon = null;
    }
}

// =====================
// EVENTS
// =====================
canvas.addEventListener("mousedown", (e) => {
    const { x, y } = getMousePos(e);
    const node = getNodeAt(x, y);
    const area = getAreaAt(x, y);

    if (currentTool === "delete") { deleteAt(x, y); selectedNode = null; selectedArea = null; clearInspector(); render(); return; }

    if (["router", "switch", "patch", "pc"].includes(currentTool)) { createNode(currentTool, x - 25, y - 25); render(); return; }
    if (currentTool === "area") { createArea(x - 75, y - 50); render(); return; }

    if (currentTool === "link") {
        if (!node) return;
        if (!linkStart) linkStart = node;
        else if (node !== linkStart) { db.links.push({ id: uuid(), type: "ethernet", from: { nodeId: linkStart.id }, to: { nodeId: node.id } }); linkStart = null; }
        render(); return;
    }

    if (currentTool === "text") {
        createTextNode(x - 50, y - 25); // centramos el rectángulo
        render();
    }

    if (area && isOnResizeHandle(area, x, y)) { resizingArea = area; resizing = true; return; }

    if (!currentTool) {
        if (node) {
            selectedNode = node;
            selectedArea = null;
            updateInspector(node);
            draggingNode = node;
            draggingOffset = { x: x - node.position.x, y: y - node.position.y };
        }
        else if (area) {
            selectedArea = area;
            selectedNode = null;
            updateAreaInspector(area); // <-- aquí mostramos propiedades del área
            draggingArea = area;
            draggingOffset = { x: x - area.x, y: y - area.y };
        }
        else {
            selectedNode = null;
            selectedArea = null;
            clearInspector();
        }
        render();
    }
});

// =====================
// MOUSEMOVE
// =====================
canvas.addEventListener("mousemove", (e) => {
    const { x, y } = getMousePos(e);
    lastMouseX = x;
    lastMouseY = y;

    // DRAGGING
    if (draggingNode) {
        draggingNode.position.x = x - draggingOffset.x;
        draggingNode.position.y = y - draggingOffset.y;
        updateInspector(draggingNode);
        render();
        updateCursor();
        return;
    }
    if (draggingArea) {
        draggingArea.x = x - draggingOffset.x;
        draggingArea.y = y - draggingOffset.y;
        render();
        updateCursor();
        return;
    }

    // RESIZING AREA
    if (resizing && resizingArea) {
        resizingArea.width = x - resizingArea.x;
        resizingArea.height = y - resizingArea.y;
        render();
        updateCursor();
        return;
    }

    // RENDER NORMAL
    render();

    // PREVIEW DE ICONO SEMITRANSPARENTE
    if (cursorIcon && cursorIcon.complete) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        const size = 25; // 50% del tamaño normal 50px
        ctx.drawImage(cursorIcon, x - size / 2, y - size / 2, size, size);
        ctx.restore();
    }

    // LINK TEMPORAL
    if (currentTool === "link" && linkStart) {
        ctx.beginPath();
        ctx.moveTo(linkStart.position.x + 25, linkStart.position.y + 25);
        ctx.lineTo(x, y);
        ctx.strokeStyle = "blue";
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ACTUALIZAR CURSOR FINAL
    updateCursor();
});

canvas.addEventListener("mouseup", () => { draggingNode = null; draggingArea = null; resizing = false; resizingArea = null; updateCursor(); });
canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); if (currentTool === "link" && linkStart) { linkStart = null; render(); } });
document.addEventListener("keydown", (e) => {

    // ESC → cancelar selección / herramienta
    if (e.key === "Escape") {
        selectedNode = null;
        selectedArea = null;
        linkStart = null;
        clearInspector();
        clearTool();
        render();
        return;
    }

    // SUPR → borrar seleccionado
    if (e.key === "Delete" && document.activeElement.tagName !== "INPUT") {

        // BORRAR NODO
        if (selectedNode) {
            db.nodes = db.nodes.filter(n => n.id !== selectedNode.id);
            db.links = db.links.filter(l =>
                l.from.nodeId !== selectedNode.id &&
                l.to.nodeId !== selectedNode.id
            );
        }

        // BORRAR ÁREA
        if (selectedArea) {
            db.areas = db.areas.filter(a => a.id !== selectedArea.id);
        }

        // Limpiar selección
        selectedNode = null;
        selectedArea = null;
        clearInspector();
        render();
    }
});

// =====================
// INSPECTOR
// =====================
function updateInspector(node) {
    if (node.type === "text") {
        const div = document.getElementById("props");
        div.innerHTML = `
            <label>ID:</label><br>
            <input id="nodeIdInput" value="${node.id}"/>
            <button onclick="saveNodeId('${node.id}')">Guardar</button><br><br>

            <label>Texto:</label><br>
            <textarea id="nodeTextInput" rows="4" cols="20">${node.text.replace(/\\n/g, "\n")}</textarea>
            <button onclick="saveNodeText('${node.id}')">Guardar</button><br><br>

            <b>X:</b> ${Math.round(node.position.x)}<br>
            <b>Y:</b> ${Math.round(node.position.y)}<br>
        `;
        return;
    }

    let areaName = "Ninguna";
    for (const a of db.areas) {
        if (
            node.position.x >= a.x &&
            node.position.x <= a.x + a.width &&
            node.position.y >= a.y &&
            node.position.y <= a.y + a.height
        ) {
            areaName = a.name;
            break;
        }
    }

    node.metadata.area = areaName;

    const div = document.getElementById("props");
    div.innerHTML = `
        <label>ID:</label><br>
        <input id="nodeIdInput" value="${node.id}"/>
        <button onclick="saveNodeId('${node.id}')">Guardar</button><br><br>

        <label>Nombre:</label><br>
        <input id="nodeNameInput" value="${node.name}"/>
        <button onclick="saveNodeName('${node.id}')">Guardar</button><br><br>

        <b>Tipo:</b> ${node.type}<br>
        <b>X:</b> ${Math.round(node.position.x)}<br>
        <b>Y:</b> ${Math.round(node.position.y)}<br>
        <b>Área:</b> ${areaName}<br><br>

        <span id="errorMsg" style="color:red;"></span>
    `;
}

function saveNodeId(oldId) {
    const input = document.getElementById("nodeIdInput"); const error = document.getElementById("errorMsg"); const newId = input.value.trim();
    if (!newId) { error.textContent = "El ID no puede estar vacío"; return; }
    if (db.nodes.some(n => n.id === newId && n.id !== oldId)) { error.textContent = "Ya existe un dispositivo con ese ID"; return; }
    const node = db.nodes.find(n => n.id === oldId); node.id = newId; node.name = newId;
    db.links.forEach(l => { if (l.from.nodeId === oldId) l.from.nodeId = newId; if (l.to.nodeId === oldId) l.to.nodeId = newId; });
    error.textContent = "✔ Guardado correctamente"; error.style.color = "green"; render();
}

function saveNodeName(nodeId) {
    const input = document.getElementById("nodeNameInput");
    const node = db.nodes.find(n => n.id === nodeId);

    if (!input.value.trim()) return;

    node.name = input.value.trim();

    render();
}

function saveNodeText(nodeId) {
    const input = document.getElementById("nodeTextInput");
    const node = db.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Convertimos saltos de línea a \\n para JSON
    node.text = input.value.replace(/\n/g, "\\n");

    render();
}

function clearInspector() { document.getElementById("props").innerHTML = "<i>Selecciona un elemento</i>"; }

// =====================
// INSPECTOR ÁREA
// =====================
function updateAreaInspector(area) {
    const div = document.getElementById("props");
    div.innerHTML = `
        <label>ID:</label><br>
        <input id="areaIdInput" value="${area.id}"/>
        <button onclick="saveAreaId('${area.id}')">Guardar</button><br><br>

        <label>Nombre:</label><br>
        <input id="areaNameInput" value="${area.name}"/>
        <button onclick="saveAreaName('${area.id}')">Guardar</button><br><br>

        <b>X:</b> ${Math.round(area.x)}<br>
        <b>Y:</b> ${Math.round(area.y)}<br>
        <b>Ancho:</b> ${Math.round(area.width)}<br>
        <b>Alto:</b> ${Math.round(area.height)}<br><br>

        <span id="areaErrorMsg" style="color:red;"></span>
    `;
}

function saveAreaId(oldId) {
    const input = document.getElementById("areaIdInput");
    const error = document.getElementById("areaErrorMsg");
    const newId = input.value.trim();
    if (!newId) { error.textContent = "El ID no puede estar vacío"; return; }
    if (db.areas.some(a => a.id === newId && a.id !== oldId)) {
        error.textContent = "Ya existe un área con ese ID";
        return;
    }
    const area = db.areas.find(a => a.id === oldId);
    area.id = newId;
    error.textContent = "✔ Guardado correctamente";
    error.style.color = "green";
    render();
}

function saveAreaName(areaId) {
    const input = document.getElementById("areaNameInput");
    const area = db.areas.find(a => a.id === areaId);
    area.name = input.value.trim();
    render();
}

// =====================
// SAVE / LOAD
// =====================
function exportJSON() { const blob = new Blob([JSON.stringify(db, null, 0)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "network.json"; a.click(); }
function handleImport(event) { const file = event.target.files[0]; const reader = new FileReader(); reader.onload = () => { db = JSON.parse(reader.result); clearInspector(); render(); }; reader.readAsText(file); }

document.getElementById("loadJSONBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
});

document.getElementById("exportPNG").addEventListener("click", () => {
    const dataURL = canvas.toDataURL("image/png"); // Obtiene la imagen del canvas
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = "network.png"; // Nombre del archivo
    a.click();
});

function clearAll() {
    if (!confirm("¿Estás seguro de que quieres borrar todos los elementos?")) return;
    db.nodes = [];
    db.areas = [];
    db.links = [];
    selectedNode = null;
    selectedArea = null;
    linkStart = null;
    clearInspector();
    render();
}

// =====================
// CARGAR JSON POR DEFECTO
// =====================
fetch("example.json")
    .then(response => {
        if (!response.ok) throw new Error("No se encontró example_min.json");
        return response.json();
    })
    .then(data => {
        db = data;
        selectedNode = null;
        selectedArea = null;
        linkStart = null;
        clearInspector();
        render();
    })
    .catch(err => {
        console.warn("No se pudo cargar example_min.json:", err.message);
    });

// =====================
// DRAG & DROP JSON
// =====================
canvas.addEventListener("dragover", (e) => {
    e.preventDefault();
    canvas.style.border = "2px dashed blue"; // efecto visual opcional
});

canvas.addEventListener("dragleave", (e) => {
    e.preventDefault();
    canvas.style.border = "none";
});

canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    canvas.style.border = "none";

    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
        alert("Solo se permiten archivos JSON");
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        try {
            db = JSON.parse(reader.result);
            selectedNode = null;
            selectedArea = null;
            linkStart = null;
            clearInspector();
            render();
        } catch (err) {
            alert("Error al leer el JSON: " + err.message);
        }
    };
    reader.readAsText(file);
});

// =====================
// INIT
// =====================
clearInspector(); updateCursor(); render();