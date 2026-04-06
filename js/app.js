// =====================
// CONFIGURACIÓN INICIAL
// =====================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const font = "12px Arial";

let dpr = window.devicePixelRatio || 1;
let view = {
    scale: 1,
    offsetX: 0,
    offsetY: 0
};

let renderPending = false;

function requestRender() {
    if (renderPending) return;

    renderPending = true;

    requestAnimationFrame(() => {
        renderPending = false;
        render();
    });
}

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    requestRender();
}

function applyTransform() {
    ctx.setTransform(
        dpr * view.scale,
        0,
        0,
        dpr * view.scale,
        dpr * view.offsetX,
        dpr * view.offsetY
    );
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

resizeCanvas();

// =====================
// ESTADO GLOBAL
// =====================

let db = { areas: [], nodes: [], links: [] };
let currentTool = "select";

let selectedNode = null;
let selectedArea = null;

let draggingNode = null;
let draggingArea = null;
let draggingOffset = { x: 0, y: 0 };

let resizingArea = null;
let resizing = false;

let linkStart = null;

let cloneMode = null;

let mouseDownPos = null;
let isDragging = false;

let editingTextNode = null;

let isPanning = false;
let panStart = { x: 0, y: 0 };

let cursorIcon = null;
let lastMouseX = 0;
let lastMouseY = 0;

// =====================
// UTILIDADES GENERALES
// =====================

function uuid() {
    return crypto.randomUUID();
}

function generateUniqueId(type, collection) {
    // type: prefijo del ID ("router", "area", etc.)
    // collection: array de elementos donde validar la unicidad (db.nodes o db.areas)
    let id;
    do {
        id = `${type}_${Math.floor(Math.random() * 10000)}`;
    } while (collection.some(item => item.id === id));
    return id;
}

function worldToScreen(x, y) {
    return {
        x: x * view.scale + view.offsetX,
        y: y * view.scale + view.offsetY
    };
}

function screenToWorld(x, y) {
    return {
        x: (x - view.offsetX) / view.scale,
        y: (y - view.offsetY) / view.scale
    };
}

function getMousePos(evt) {
    const r = canvas.getBoundingClientRect();

    const x = evt.clientX - r.left;
    const y = evt.clientY - r.top;

    return screenToWorld(x, y);
}

function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);

    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =====================
// SELECCIÓN Y DETECCIÓN
// =====================

function getNodeAt(x, y) {
    return db.nodes.find(n => {
        const w = n._width || 50;
        // fallback al tamaño fijo
        const h = n._height || 50;
        return x >= n.position.x && x <= n.position.x + w &&
            y >= n.position.y && y <= n.position.y + h;
    });
}

function getAreaAt(x, y) {
    return db.areas.find(a =>
        x >= a.position.x &&
        x <= a.position.x + a.size.width &&
        y >= a.position.y &&
        y <= a.position.y + a.size.height
    );
}

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

        for (let i = 0;
            i < links.length;
            i++) {
            const link = links[i];
            const offset = (i - (links.length - 1) / 2) * gap;
            const ox = ux * offset;
            const oy = uy * offset;

            const x1 = from.position.x + 25 + ox;
            const y1 = from.position.y + 25 + oy;
            const x2 = to.position.x + 25 + ox;
            const y2 = to.position.y + 25 + oy;

            const denom = ((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (denom === 0) continue;

            const t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / denom;
            if (t < 0 || t > 1) continue;

            const px = x1 + t * (x2 - x1);
            const py = y1 + t * (y2 - y1);
            if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 6) return link;
        }
    }
    return null;
}

function isOnResizeHandle(area, x, y) {
    const handleSize = 10 / view.scale;

    return x >= area.position.x + area.size.width - handleSize &&
        x <= area.position.x + area.size.width &&
        y >= area.position.y + area.size.height - handleSize &&
        y <= area.position.y + area.size.height;
}

// =====================
// CREACIÓN DE ELEMENTOS
// =====================

function createNode(type, x, y) {
    const id = generateUniqueId(type, db.nodes);

    db.nodes.push({
        id,
        type,
        name: id,
        position: { x, y },
        metadata: {
            productor: "",
            modelo: "",
            notas: ""
        },
        interfaces: []
    });
}

function createArea(x, y) {
    const id = generateUniqueId("area", db.areas);

    db.areas.push({
        id,
        name: id,
        position: { x, y },
        size: { width: 150, height: 100 }
    });
}

function createTextNode(x, y, content = "Nuevo texto") {
    const id = generateUniqueId("text", db.nodes);

    const node = {
        id,
        type: "text",
        name: id,
        position: { x, y },
        text: content,
        metadata: {}
    };

    db.nodes.push(node);
    updateTextNodeSize(node);
    return node; // 👈 IMPORTANTE
}

function cloneNode(node, x, y) {
    const id = generateUniqueId(node.type, db.nodes);

    const newNode = structuredClone(node);

    newNode.id = id;
    newNode.name = id;
    newNode.position = { x, y };

    // importante: evitar referencias compartidas
    delete newNode._width;
    delete newNode._height;

    db.nodes.push(newNode);

    return newNode;
}

// =====================
// EDITOR DE TEXTO
// =====================

const textEditor = document.getElementById("textEditor");

function openTextEditor(node) {
    console.log("editando texto");
    console.log(node);
    editingTextNode = node;

    const rect = canvas.getBoundingClientRect();

    textEditor.style.display = "block";
    textEditor.value = node.text;

    // posición en pantalla (IMPORTANTE: considerar zoom/pan)
    const screen = worldToScreen(node.position.x, node.position.y);

    textEditor.style.left = rect.left + screen.x + "px";
    textEditor.style.top = rect.top + screen.y + "px";

    console.log(rect.left + screen.x + "px", rect.top + screen.y + "px")

    textEditor.style.width = "200px";
    textEditor.style.height = "100px";

    textEditor.focus();
    textEditor.select();
}

textEditor.addEventListener("blur", () => {
    if (!editingTextNode) return;

    editingTextNode.text = textEditor.value;

    updateTextNodeSize(editingTextNode);

    editingTextNode = null;
    textEditor.style.display = "none";

    requestRender();
});

function updateTextNodeSize(n) {
    ctx.save();

    ctx.font = font;

    const paddingX = 20; // horizontal
    const paddingY = 10; // vertical
    const strokeComp = 4; // compensar borde

    const lines = n.text.split("\n");

    let maxWidth = 0;

    for (const line of lines) {
        const m = ctx.measureText(line);

        const realWidth =
            (m.actualBoundingBoxLeft || 0) +
            (m.actualBoundingBoxRight || m.width);

        if (realWidth > maxWidth) {
            maxWidth = realWidth;
        }
    }

    n._width = Math.ceil(maxWidth + paddingX + strokeComp);
    n._height = Math.ceil(lines.length * 14 + paddingY);

    ctx.restore();
}

// =====================
// RENDER Y DIBUJO
// =====================

const root = document.documentElement;

function getColor(variable) {
    return getComputedStyle(root).getPropertyValue(variable).trim();
}

function render() {
    // Reset transform + clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply world transform
    applyTransform();

    // Draw scene
    db.areas.forEach(drawArea);
    drawLinks();
    db.nodes.forEach(drawNodeBase);

    db.areas.forEach(drawAreaLabel);
    db.nodes.forEach(drawNodeLabel);

    drawPreview();

    // Reset for UI overlays future
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawArea(a) {
    ctx.save();

    const { x, y } = a.position;
    const { width, height } = a.size;

    ctx.strokeStyle = (a === selectedArea) ? getColor("--color-alert") : getColor("--color-area-border");
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = getColor("--color-alert");
    ctx.fillRect(x + width - 10, y + height - 10, 10, 10);

    ctx.restore();
}

function drawAreaLabel(a) {
    drawTextWithOutline(a.name, a.position.x + 5, a.position.y + 5);
}

function drawNodeBase(n) {
    ctx.save();

    if (n.type === "text") {
        const width = n._width || 100;
        const height = n._height || 40;

        ctx.fillStyle = getColor("--color-textarea-bg");
        ctx.fillRect(n.position.x, n.position.y, width, height);

        ctx.strokeStyle = (n === selectedNode) ? getColor("--color-alert") : "black";
        ctx.strokeRect(n.position.x, n.position.y, width, height);

        ctx.restore();
        return;
    }

    const icon = icons[n.type];

    if (icon && icon.complete) {
        ctx.drawImage(icon, n.position.x, n.position.y, 50, 50);
    } else {
        ctx.fillStyle = getColor("--color-link-drawing");
        ctx.fillRect(n.position.x, n.position.y, 50, 50);
    }

    if (n === selectedNode) {
        ctx.strokeStyle = getColor("--color-alert");
        ctx.strokeRect(n.position.x, n.position.y, 50, 50);
    }

    ctx.restore();
}

function drawNodeLabel(n) {
    ctx.save();

    if (n.type === "text") {
        const padding = 10;
        const lines = n.text.split("\n");

        lines.forEach((line, i) => {
            drawTextWithOutline(line, n.position.x + padding / 2, n.position.y + padding / 2 + i * 14, "left", getColor("--color-textarea-bg"));
        });

        ctx.restore();
        return;
    }

    drawTextWithOutline(
        n.name,
        n.position.x + 25,
        n.position.y + 52,
        "center"
    );

    ctx.restore();
}

function drawLinks() {
    const groups = {};
    db.links.forEach(l => {
        const k = [l.from.nodeId, l.to.nodeId].sort().join('_');
        if (!groups[k]) groups[k] = [];
        groups[k].push(l);
    });
    for (const k in groups) {
        const ls = groups[k];
        const f = db.nodes.find(n => n.id === ls[0].from.nodeId);
        const t = db.nodes.find(n => n.id === ls[0].to.nodeId);
        if (!f || !t) continue;
        const dx = t.position.x - f.position.x;
        const dy = t.position.y - f.position.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = -dy / len;
        const uy = dx / len;
        const gap = 10;
        ls.forEach((l, i) => {
            const off = (i - (ls.length - 1) / 2) * gap;
            const ox = ux * off;
            const oy = uy * off;

            if (l.type === "wireless") {
                drawWavyLine(ctx,
                    f.position.x + 25 + ox,
                    f.position.y + 25 + oy,
                    t.position.x + 25 + ox,
                    t.position.y + 25 + oy
                );
            } else {
                ctx.beginPath();
                ctx.moveTo(f.position.x + 25 + ox, f.position.y + 25 + oy);
                ctx.lineTo(t.position.x + 25 + ox, t.position.y + 25 + oy);
                ctx.strokeStyle = "black";
                ctx.stroke();
            }
        });
    }
}

function drawWavyLine(ctx, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) return;

    const ux = dx / len;
    const uy = dy / len;

    // perpendicular (normal)
    const nx = -uy;
    const ny = ux;

    const amplitude = 5;
    const wavelength = 20;
    const step = 2;

    ctx.beginPath();

    for (let i = 0; i <= len; i += step) {
        const x = x1 + ux * i;
        const y = y1 + uy * i;

        // senoide pura
        const wave = Math.sin((i / wavelength) * Math.PI * 2) * amplitude;

        const px = x + nx * wave;
        const py = y + ny * wave;

        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }

    ctx.strokeStyle = getColor("--color-link-drawing");
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawPreview() {
    const icon = getActiveCursorIcon();

    if (icon && icon.complete) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.drawImage(icon, lastMouseX - 12, lastMouseY - 12, 25, 25);
        ctx.restore();
    }

    if (["link-wired", "link-wireless"].includes(currentTool) && linkStart) {
        ctx.beginPath();
        ctx.moveTo(linkStart.position.x + 25, linkStart.position.y + 25);
        ctx.lineTo(lastMouseX, lastMouseY);
        ctx.strokeStyle = getColor("--color-link-drawing");
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawTextWithOutline(text, x, y, align = "left", outlineColor = "white") {
    ctx.save();

    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = "top";

    ctx.lineWidth = 2;
    ctx.strokeStyle = outlineColor;
    ctx.strokeText(text, x, y);

    ctx.fillStyle = "black";
    ctx.fillText(text, x, y);

    ctx.restore();
}

// =====================
// CURSOR Y GUI (UX)
// =====================

function updateCursor() {
    if (isPanning) {
        canvas.style.cursor = "grabbing";
        return;
    }

    if (draggingNode || draggingArea || resizing) {
        canvas.style.cursor = "move";
        return;
    }

    for (const area of db.areas) {
        if (isOnResizeHandle(area, lastMouseX, lastMouseY)) {
            canvas.style.cursor = "se-resize";
            return;
        }
    }

    if (cloneMode) {
        canvas.style.cursor = "copy";
        return;
    }

    if (currentTool === "select") {
        const node = getNodeAt(lastMouseX, lastMouseY);
        if (node) {
            canvas.style.cursor = "pointer";
            return;
        }
    }

    if (["router", "switch", "pc", "patch", "screen", "ap", "area"].includes(currentTool)) {
        canvas.style.cursor = "crosshair";
        return;
    }

    if (["link-wired", "link-wireless"].includes(currentTool)) {
        canvas.style.cursor = "crosshair";
        return;
    }

    if (currentTool === "text") {
        canvas.style.cursor = "text";
        return;
    }

    if (currentTool === "delete") {
        canvas.style.cursor = "not-allowed";
        return;
    }

    canvas.style.cursor = "default";
}

function getActiveCursorIcon() {
    if (cloneMode) {
        return icons[cloneMode.type];
    }

    if (["router", "switch", "pc", "patch", "screen", "ap", "area"].includes(currentTool)) {
        return icons[currentTool];
    }

    return null;
}

function setActiveToolButton(tool) {
    document.querySelectorAll("[data-action='tool']")
        .forEach(b => b.classList.remove("active"));

    const btn = document.querySelector(`[data-tool='${tool}']`);
    if (btn) btn.classList.add("active");
}

const actions = {
    tool: (btn) => toggleTool(btn.dataset.tool, btn),

    new: () => clearAll(),

    "export-json": () => exportFile(false),
    "export-gzip": () => exportFile(true),
    "export-png": () => exportPNG(),

    import: () => triggerImport(),

    help: () => openHelp(),
};

document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    if (actions[action]) {
        actions[action](btn);
    }
});

// =====================
// HERRAMIENTAS
// =====================

function toggleTool(tool, button) {

    cloneMode = null;

    // Si haces click en la misma tool
    if (currentTool === tool) {
        if (tool === "select") return;

        currentTool = "select";
        setActiveToolButton("select");

        linkStart = null;
        updateCursor();
        return;
    }

    // Cambiar tool
    currentTool = tool;
    setActiveToolButton(tool);

    linkStart = null;
    updateCursor();
}

function clearTool() {
    const selectBtn = document.getElementById("selectButton");
    toggleTool("select", selectBtn);
}

// =====================
// EVENT HANDLERS
// =====================

canvas.addEventListener("mousedown", (e) => {
    if (cloneMode) {
        const { x, y } = getMousePos(e);

        const newNode = cloneNode(
            cloneMode,
            x - 25,
            y - 25
        );

        selectedNode = newNode;

        requestRender();
        return;
    }

    if (editingTextNode) {
        textEditor.blur();
    }

    if (e.button === 1) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = "grabbing";
        return;
    }

    const { x, y } = getMousePos(e);
    const node = getNodeAt(x, y);
    const area = getAreaAt(x, y);

    mouseDownPos = { x, y };
    isDragging = false;

    if (currentTool === "delete") {
        deleteSelection({ x, y, confirmDelete: true });
        return;
    }

    if (["router", "switch", "pc", "patch", "screen", "ap"].includes(currentTool)) {
        createNode(currentTool, x - 25, y - 25);
        requestRender();
        return;
    }

    if (currentTool === "area") {
        createArea(x - 75, y - 50);
        requestRender();
        return;
    }

    if (["link-wired", "link-wireless"].includes(currentTool)) {
        if (!node) return;

        if (!linkStart) {
            linkStart = node;
        } else if (node !== linkStart) {

            const type = currentTool === "link-wireless"
                ? "wireless"
                : "wired";

            db.links.push({
                id: uuid(),
                type,
                from: { nodeId: linkStart.id },
                to: { nodeId: node.id }
            });

            linkStart = null;
        }

        requestRender();
        return;
    }

    if (currentTool === "text") {
        console.log("creando nodo de texto");
        const node = createTextNode(x, y - 10);
        requestRender();
        setTimeout(() => {
            openTextEditor(node);
        }, 0);
        return;
    }

    if (area && isOnResizeHandle(area, x, y)) {
        // 🔥 limpiar selección para evitar drag
        selectedNode = null;
        selectedArea = null;
        clearInspector();

        resizingArea = area;
        resizing = true;

        requestRender();
        return;
    }

    if (currentTool === "select") {
        if (node) {
            selectedNode = node;
            selectedArea = null;
            updateInspector(node);
        } else if (area) {
            selectedArea = area;
            selectedNode = null;
            updateAreaInspector(area);
        } else {
            selectedNode = null;
            selectedArea = null;
            clearInspector();
        }

        requestRender();
        return;
    }
});

canvas.addEventListener("mousemove", (e) => {
    if (isPanning) {
        view.offsetX += e.movementX;
        view.offsetY += e.movementY;
        updateCursor();
        requestRender();
        return;
    }

    const { x, y } = getMousePos(e);
    lastMouseX = x;
    lastMouseY = y;

    // =========================
    // detectar intención de drag
    // =========================
    if (mouseDownPos && !isDragging && !resizing) {
        const dx = x - mouseDownPos.x;
        const dy = y - mouseDownPos.y;

        if (Math.sqrt(dx * dx + dy * dy) > 3) {
            isDragging = true;

            if (selectedNode) {
                draggingNode = selectedNode;

                draggingOffset = {
                    x: x - selectedNode.position.x,
                    y: y - selectedNode.position.y
                };
            }

            if (selectedArea) {
                draggingArea = selectedArea;

                draggingOffset = {
                    x: x - selectedArea.position.x,
                    y: y - selectedArea.position.y
                };
            }
        }
    }

    // =========================
    // DRAG NODE
    // =========================
    if (draggingNode) {
        draggingNode.position.x = x - draggingOffset.x;
        draggingNode.position.y = y - draggingOffset.y;

        updateInspector(draggingNode);
        requestRender();
        updateCursor();
        return;
    }

    // =========================
    // DRAG AREA
    // =========================
    if (draggingArea) {
        draggingArea.position.x = x - draggingOffset.x;
        draggingArea.position.y = y - draggingOffset.y;

        requestRender();
        updateCursor();
        return;
    }

    // =========================
    // RESIZE AREA
    // =========================
    if (resizing && resizingArea) {
        const newW = x - resizingArea.position.x;
        const newH = y - resizingArea.position.y;

        resizingArea.size.width = Math.max(10, newW);
        resizingArea.size.height = Math.max(10, newH);

        requestRender();
        updateCursor();
        return;
    }

    // =========================
    // hover normal
    // =========================
    requestRender();
    updateCursor();
});

canvas.addEventListener("mouseup", () => {
    isPanning = false;

    draggingNode = null;
    draggingArea = null;
    resizing = false;
    resizingArea = null;

    mouseDownPos = null;
    isDragging = false;

    updateCursor();
});

canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const mouse = getMousePos(e);

    const newScale = view.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1);

    setZoom(newScale, mouse.x, mouse.y);
}, { passive: false });

canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (["link-wired", "link-wireless"].includes(currentTool) && linkStart) {
        linkStart = null;
        requestRender();
    }
});

canvas.addEventListener("dblclick", (e) => {
    const { x, y } = getMousePos(e);

    const node = getNodeAt(x, y);

    if (node && node.type === "text") {
        openTextEditor(node);
    }
});

canvas.addEventListener("mouseleave", () => {
    isPanning = false;
});

// KEYBOARD

document.addEventListener("keydown", (e) => {

    const el = document.activeElement;
    const isTyping =
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable;

    // ✅ Caso especial: cerrar editor con Enter
    if (isTyping) {
        if (e.key === "Enter" && !e.shiftKey) {
            textEditor.blur();
            e.preventDefault();
        }
        return;
    }

    // =========================
    // SHORTCUTS GLOBALES
    // =========================

    if (e.ctrlKey && e.key.toLowerCase() === "c") {
        if (selectedNode) {
            cloneMode = selectedNode;
            cursorIcon = icons[selectedNode.type] || null;
            updateCursor();
            e.preventDefault();
        }
    }

    if (e.key === "Escape") {
        resetState();

        const selectBtn = document.getElementById("selectButton");
        toggleTool("select", selectBtn);

        cloneMode = null;
        cursorIcon = null;

        requestRender();
        return;
    }

    if (e.key === "Delete") {
        const deleteButton = document.getElementById("deleteButton");

        toggleTool('delete', deleteButton);

        setTimeout(() => {
            if (selectedNode || selectedArea) {
                deleteSelection({ confirmDelete: true });
            }
        }, 0);
    }
});

// =====================
// ELIMINACIÓN
// =====================

function deleteSelection({ x = null, y = null, confirmDelete = true } = {}) {
    let node = selectedNode;
    let area = selectedArea;
    let link = null;

    // Si viene por coordenadas (click con tool delete)
    if (x !== null && y !== null) {
        node = getNodeAt(x, y);
        if (!node) link = getLinkAt(x, y);
        if (!node && !link) area = getAreaAt(x, y);
    }

    if (!node && !area && !link) return;

    if (confirmDelete) {
        const ok = confirm("¿Seguro que quieres eliminar el elemento seleccionado?");
        if (!ok) return;
    }

    // BORRAR NODO
    if (node) {
        db.nodes = db.nodes.filter(n => n.id !== node.id);
        db.links = db.links.filter(l =>
            l.from.nodeId !== node.id &&
            l.to.nodeId !== node.id
        );
    }

    // BORRAR LINK
    if (link) {
        db.links = db.links.filter(l => l.id !== link.id);
    }

    // BORRAR AREA
    if (area) {
        db.areas = db.areas.filter(a => a.id !== area.id);
    }

    selectedNode = null;
    selectedArea = null;
    clearInspector();
    requestRender();
}

// =====================
// INSPECTOR (NODOS)
// =====================

function updateInspector(node) {
    if (node.type === "text") {
        const div = document.getElementById("props");
        div.innerHTML = `
            <label>ID:</label><br>
            <input id="nodeIdInput" 
                value="${node.id}" 
                data-oldid="${node.id}"
                onkeydown="handleNodeIdKeyDown(event)"/><br><br>

            <label>Texto:</label><br>
            <textarea id="nodeTextInput" rows="4" cols="20">${node.text}</textarea>
            <button onclick="saveNodeText('${node.id}')">Guardar</button><br><br>

            <b>X:</b> ${Math.round(node.position.x)}<br>
            <b>Y:</b> ${Math.round(node.position.y)}<br>
        `;
        return;
    }

    let areaName = "Ninguna";
    for (const a of db.areas) {
        if (
            node.position.x >= a.position.x &&
            node.position.x <= a.position.x + a.size.width &&
            node.position.y >= a.position.y &&
            node.position.y <= a.position.y + a.size.height
        ) {
            areaName = a.name;
            break;
        }
    }

    const div = document.getElementById("props");

    div.innerHTML = `
    <label>ID:</label><br>
    <input id="nodeIdInput" 
       value="${node.id}" 
       data-oldid="${node.id}"
       onkeydown="handleNodeIdKeyDown(event)"/><br><br>

    <label>Nombre:</label><br>
    <input id="nodeNameInput" value="${node.name}" 
       onkeydown="handleNodeNameKeyDown(event, '${node.id}')"/><br><br>

    <b>Tipo:</b> ${node.type}<br>
    <b>(x, y):</b>&nbsp;(${Math.round(node.position.x)}, ${Math.round(node.position.y)})<br>
    <b>Área:</b> ${areaName}<br><br>

    <span id="errorMsg" style="color:red;"></span>

    ${node.type !== "area" && node.type !== "text"
            ? renderMetadataEditor(node)
            : ""}
`;
}

function renderMetadataEditor(node) {
    if (!node.metadata) node.metadata = {};

    let html = `<hr><b>Metadata</b><br><br>`;

    Object.entries(node.metadata).forEach(([key, value]) => {
        const inputId = `meta_${key}`;

        // botón de eliminar
        const deleteButton = `<button style="color:red;" onclick="deleteMetadataKey('${node.id}', '${key}')">X</button>`;

        if (typeof value === "string" && value.length > 40) {
            // textarea para textos largos
            html += `
                <label>${key}:</label> ${deleteButton}<br>
                <textarea id="${inputId}" rows="3"
                    onkeydown="handleMetaKeyDown(event, '${node.id}', '${key}')"
                >${value}</textarea><br><br>
            `;
        } else {
            html += `
                <label>${key}:</label> ${deleteButton}<br>
                <input id="${inputId}" value="${value ?? ''}" 
                    onkeydown="handleMetaKeyDown(event, '${node.id}', '${key}')"
                /><br><br>
            `;
        }
    });

    // añadir nuevo campo
    html += `
        <hr>
        <input id="newMetaKey" placeholder="Agregar clave (Enter)" 
            onkeydown="handleNewMetaKey(event, '${node.id}')"
        />
    `;

    return html;
}

function handleNodeIdKeyDown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const oldId = e.target.dataset.oldid; // <-- tomar siempre el último ID válido
        saveNodeId(oldId);
        e.target.blur(); // perder foco como confirmación
    }
}

function handleNodeNameKeyDown(e, nodeId) {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveNodeName(nodeId);
        e.target.blur(); // perder foco como confirmación
    }
}

function handleMetaKeyDown(e, nodeId, key) {
    if (e.key === 'Enter') {
        if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey) {
            // Para textarea, Enter solo inserta línea
            return;
        }
        e.preventDefault(); // evitar salto de línea o submit
        saveNodeMetadataField(nodeId, key);

        e.target.blur();
    }
}

function saveNodeMetadataField(nodeId, key) {
    const node = db.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const el = document.getElementById(`meta_${key}`);
    if (!el) return;

    node.metadata[key] = el.value;
    requestRender();
}

function deleteMetadataKey(nodeId, key) {
    const node = db.nodes.find(n => n.id === nodeId);
    if (!node || !node.metadata) return;

    const confirmDelete = confirm(`¿Eliminar la clave "${key}"?`);
    if (!confirmDelete) return;

    delete node.metadata[key];
    updateInspector(node); // refresca el panel
    requestRender();       // opcional, refresca canvas
}

function handleNewMetaKey(e, nodeId) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const input = document.getElementById("newMetaKey");
        const key = input.value.trim();
        if (!key) return;

        const node = db.nodes.find(n => n.id === nodeId);
        if (!node) return;

        if (!node.metadata) node.metadata = {};

        if (node.metadata[key] !== undefined) {
            alert("Ya existe esa clave");
            return;
        }

        node.metadata[key] = "";
        input.value = "";
        updateInspector(node);
    }
}

function saveNodeId(oldId) {
    const input = document.getElementById("nodeIdInput");
    const error = document.getElementById("errorMsg");
    const newId = input.value.trim();

    // Vacío
    if (!newId) {
        error.textContent = "El ID no puede estar vacío";
        error.style.color = getColor("--color-alert");
        input.value = input.dataset.oldid; // restaurar valor anterior
        return;
    }

    // Ya existe
    if (db.nodes.some(n => n.id === newId && n.id !== oldId)) {
        error.textContent = "Ya existe un dispositivo con ese ID";
        error.style.color = getColor("--color-alert");
        input.value = input.dataset.oldid; // restaurar valor anterior
        return;
    }

    // Guardar nuevo ID
    const node = db.nodes.find(n => n.id === oldId);
    node.id = newId;
    node.name = newId;
    db.links.forEach(l => {
        if (l.from.nodeId === oldId) l.from.nodeId = newId;
        if (l.to.nodeId === oldId) l.to.nodeId = newId;
    });

    // Actualizar data-oldid para la próxima validación
    input.dataset.oldid = newId;

    error.textContent = "✔ Guardado correctamente";
    error.style.color = getColor("--color-success");

    requestRender();
}

function saveNodeName(nodeId) {
    const input = document.getElementById("nodeNameInput");
    const node = db.nodes.find(n => n.id === nodeId);
    if (!node || !input.value.trim()) return;

    node.name = input.value.trim();
    requestRender();
}

function saveNodeText(nodeId) {
    const input = document.getElementById("nodeTextInput");
    const node = db.nodes.find(n => n.id === nodeId);
    if (!node) return;

    node.text = input.value;

    updateTextNodeSize(node);

    requestRender();
}

function clearInspector() {
    document.getElementById("props").innerHTML = "<i>Selecciona un elemento</i>";
}

// =====================
// INSPECTOR (ÁREAS)
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

        <b>X:</b> ${Math.round(area.position.x)}<br>
        <b>Y:</b> ${Math.round(area.position.y)}<br>
        <b>Ancho:</b> ${Math.round(area.size.width)}<br>
        <b>Alto:</b> ${Math.round(area.size.height)}<br>

        <span id="areaErrorMsg" style="color:red;"></span>
    `;
}

function saveAreaId(oldId) {
    const input = document.getElementById("areaIdInput");
    const error = document.getElementById("areaErrorMsg");
    const newId = input.value.trim();
    if (!newId) {
        error.textContent = "El ID no puede estar vacío";
        return;
    }
    if (db.areas.some(a => a.id === newId && a.id !== oldId)) {
        error.textContent = "Ya existe un área con ese ID";
        return;
    }
    const area = db.areas.find(a => a.id === oldId);
    area.id = newId;
    error.textContent = "✔ Guardado correctamente";
    error.style.color = "green";
    requestRender();
}

function saveAreaName(areaId) {
    const input = document.getElementById("areaNameInput");
    const area = db.areas.find(a => a.id === areaId);
    area.name = input.value.trim();
    requestRender();
}

// =====================
// ZOOM Y VIEWPORT
// =====================

function setZoom(newScale, centerX, centerY) {
    const oldScale = view.scale;

    newScale = Math.max(0.5, Math.min(2, newScale));

    const scaleFactor = newScale / oldScale;

    view.offsetX = centerX - (centerX - view.offsetX) * scaleFactor;
    view.offsetY = centerY - (centerY - view.offsetY) * scaleFactor;

    view.scale = newScale;

    zoomSlider.value = zoomToSlider(newScale);
    updateZoomLabel();

    requestRender();
}

function resetZoom() {
    view.scale = 1;
    view.offsetX = 0;
    view.offsetY = 0;
    zoomSlider.value = zoomToSlider(view.scale);
    requestRender();
    updateZoomLabel();
}

function sliderToZoom(v) {
    return Math.pow(2, (v - 0.5) * 2);
    // 0 → 0.5x | 0.5 → 1x | 1 → 2x
}

function zoomToSlider(z) {
    return (Math.log2(z) / 2) + 0.5;
}

function updateZoomLabel() {
    const percent = Math.round(view.scale * 100);
    document.getElementById("zoomLabel").textContent = percent + "%";
}

const zoomSlider = document.getElementById("zoomSlider");

zoomSlider.addEventListener("input", (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const zoom = sliderToZoom(parseFloat(e.target.value));
    setZoom(zoom, cx, cy);
});

// =====================
// IMPORTAR Y EXPORTAR
// =====================

async function exportFile(compressed = false) {
    let blob;

    if (compressed) {
        blob = await compressJSON(db);
    } else {
        blob = new Blob(
            [JSON.stringify(db, null, 2)],
            { type: "application/json" }
        );
    }

    const ext = compressed ? "json.gz" : "json";

    downloadBlob(blob, `network.${ext}`);
}

function exportPNG() {
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    // Fondo blanco
    tempCtx.fillStyle = "white";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Copiar el canvas original encima
    tempCtx.drawImage(canvas, 0, 0);

    tempCanvas.toBlob(blob => {
        downloadBlob(blob, "network.png");
    });
}

function triggerImport() {
    const input = document.getElementById("importFile");
    input.value = "";
    input.click();
}

document.getElementById("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importFile(file);
});

async function importFile(file) {
    try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);

        const isGzip =
            file.name.endsWith(".gz") ||
            file.name.endsWith(".gzip") ||
            (bytes[0] === 0x1f && bytes[1] === 0x8b);

        if (isGzip) {
            db = await decompressJSON(new Blob([buffer]));
        } else {
            const text = new TextDecoder().decode(buffer);
            db = JSON.parse(text);
        }

        resetState();
        requestRender();

    } catch (err) {
        alert("Error importando archivo: " + err.message);
    }
}

async function compressJSON(data) {
    const json = JSON.stringify(data);

    const stream = new Blob([json]).stream();

    const compressedStream = stream.pipeThrough(
        new CompressionStream("gzip")
    );

    return await new Response(compressedStream).blob();
}

async function decompressJSON(blob) {
    try {
        const stream = blob.stream().pipeThrough(
            new DecompressionStream("gzip")
        );

        const text = await new Response(stream).text();
        return JSON.parse(text);

    } catch (err) {
        throw new Error("Archivo comprimido inválido o corrupto");
    }
}

// =====================
// DRAG & DROP
// =====================

canvas.addEventListener("dragover", (e) => {
    e.preventDefault();
    canvas.style.border = "2px dashed blue";
    // efecto visual opcional
});

canvas.addEventListener("dragleave", (e) => {
    e.preventDefault();
    canvas.style.border = "none";
});

canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    canvas.style.border = "none";

    const file = e.dataTransfer.files[0];
    if (file) importFile(file);
});

// =====================
// RESET Y LIMPIEZA
// =====================

function clearAll() {
    if (!confirm("¿Estás seguro de que quieres borrar todos los elementos?")) return;
    db.nodes = [];
    db.areas = [];
    db.links = [];
    resetState();
    requestRender();
}

function resetState() {
    selectedNode = null;
    selectedArea = null;
    linkStart = null;

    draggingNode = null;
    draggingArea = null;
    resizing = false;
    resizingArea = null;

    clearInspector();
}

// =====================
// ICONOS Y ASSETS
// =====================

let icons = {};

function loadIconSet(setName) {
    iconSet = setName;

    icons = {
        router: loadIcon(`img/devices/${setName}/router.svg`),
        switch: loadIcon(`img/devices/${setName}/switch.svg`),
        pc: loadIcon(`img/devices/${setName}/pc.svg`),
        ap: loadIcon(`img/devices/${setName}/ap.svg`),
        patch: loadIcon(`img/devices/${setName}/patch.svg`),
        screen: loadIcon(`img/devices/${setName}/screen.svg`),
        area: loadIcon(`img/devices/symbol/area.svg`)
    };

    console.log(icons.router);

    requestRender();
}

function changeIconSet(setName, label) {
    loadIconSet(setName);

    document.getElementById("iconSetLabel").textContent = label;
    document.getElementById("iconSetPreview").src = `img/devices/${setName}/router.svg`;

    localStorage.setItem("iconSet", setName);
}

function loadIcon(src) {
    const img = new Image();
    img.src = src;
    return img;
}

// =====================
// INICIALIZACIÓN
// =====================

fetch("data/example.json")
    .then(response => {
        if (!response.ok) throw new Error("No se encontró example.json");
        return response.json();
    })
    .then(data => {
        db = data;
        resetState();
        resetZoom();
        requestRender();
    })
    .catch(err => {
        console.warn("No se pudo cargar example.json:", err.message);
    });

function init() {
    currentTool = "select";

    setActiveToolButton("select");

    const savedIconSet = localStorage.getItem("iconSet") || "symbol";
    loadIconSet(savedIconSet);
    const label = savedIconSet === "real" ? "Realista" : "Simbólica";
    document.getElementById("iconSetLabel").textContent = label;
    document.getElementById("iconSetPreview").src = `img/devices/${savedIconSet}/router.svg`;

    resetZoom();

    clearInspector();
    updateCursor();
    requestRender();
}

init();

// =====================
// AYUDA Y MISCELÁNEA
// =====================

function openHelp() {
    window.open("help.html", "_blank");
}