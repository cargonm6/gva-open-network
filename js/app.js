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
  offsetY: 0,
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

  requestRender();
}

function applyTransform() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

resizeCanvas();

// =====================
// ESTADO GLOBAL
// =====================

let db = {
  filename: "",
  networks: {
    network: { nodes: [], areas: [], links: [] }
  },
  activeNetwork: "network"
};
// let currentTool = "select";

// let selectedNode = null;
// let selectedArea = null;
// let selectedLink = null;

// let draggingNode = null;
// let draggingArea = null;
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

const ui = {
  tool: "select",

  mode: "idle",
  // idle | dragging_node | dragging_area | resizing_area | panning | linking | cloning | editing_text

  pointer: {
    x: 0,
    y: 0,
    downX: 0,
    downY: 0,
    dragging: false,
  },

  selection: {
    node: null,
    area: null,
    link: null,
  },

  interaction: {
    target: null, // node/area/link actual en interacción
    linkStart: null,
    cloneSource: null,
  }
};

function getCurrentNetwork() {
  return db.networks[db.activeNetwork];
}

function getNodes() {
  return getCurrentNetwork().nodes;
}

function getAreas() {
  return getCurrentNetwork().areas;
}

function getLinks() {
  return getCurrentNetwork().links;
}

function updateNetworkSelector() {
  const select = document.getElementById("networkSelector");
  select.innerHTML = "";

  Object.keys(db.networks).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === db.activeNetwork) opt.selected = true;
    select.appendChild(opt);
  });
}

document.getElementById("networkSelector").addEventListener("change", (e) => {
  db.activeNetwork = e.target.value;

  rebuildNodeMap();
  rebuildAreaMap();
  rebuildLinkGroups();

  resetState();
  requestRender();
});

function createNetwork() {
  const name = prompt("Nombre de la red:");
  if (!name) return;

  if (db.networks[name]) {
    alert("Ya existe una red con ese nombre");
    return;
  }

  db.networks[name] = {
    nodes: [],
    areas: [],
    links: []
  };

  db.activeNetwork = name;

  updateNetworkSelector();
  rebuildNodeMap(); rebuildAreaMap(); rebuildLinkGroups();

  resetState();
  requestRender();
}

function deleteNetwork() {
  const keys = Object.keys(db.networks);

  if (keys.length <= 1) {
    alert("Debe existir al menos una red");
    return;
  }

  if (!confirm("¿Eliminar la red actual?")) return;

  delete db.networks[db.activeNetwork];

  db.activeNetwork = Object.keys(db.networks)[0];

  updateNetworkSelector();
  rebuildNodeMap(); rebuildAreaMap(); rebuildLinkGroups();

  resetState();
  requestRender();
}

// =====================
// UTILIDADES GENERALES
// =====================

function uuid() {
  return crypto.randomUUID();
}

function resetAllIds() {
  const ok = confirm(
    "⚠️ Esta acción reasignará TODOS los IDs de nodos y áreas.\n" +
    "No se puede deshacer. ¿Continuar?"
  );
  if (!ok) return;

  const network = getCurrentNetwork();

  const nodes = network.nodes;
  const areas = network.areas;
  const links = network.links;

  // =========================
  // 1. GENERAR MAPA DE IDS
  // =========================
  const idMap = new Map();

  for (const node of nodes) {
    idMap.set(node.id, generateUniqueId(node.type, nodes));
  }

  for (const area of areas) {
    idMap.set(area.id, generateUniqueId("area", areas));
  }

  for (const link of links) {
    idMap.set(link.id, generateUniqueId(link.type, links));
  }

  // =========================
  // 2. APLICAR IDS A NODOS
  // =========================
  for (const node of nodes) {
    node.id = idMap.get(node.id);
  }

  // =========================
  // 3. APLICAR IDS A ÁREAS
  // =========================
  for (const area of areas) {
    area.id = idMap.get(area.id);
  }

  // =========================
  // 4. ACTUALIZAR LINKS (IMPORTANTE)
  // =========================
  for (const link of links) {
    link.id = idMap.get(link.id);

    const fromId = link.from?.nodeId;
    const toId = link.to?.nodeId;

    console.log("aquí");

    if (fromId && idMap.has(fromId)) {
      link.from.nodeId = idMap.get(fromId);

      console.log(fromId, idMap.get(fromId), link.from.nodeId);
    }

    if (toId && idMap.has(toId)) {
      link.to.nodeId = idMap.get(toId);
    }
  }

  // =========================
  // 5. RECONSTRUIR TODO EN ORDEN CORRECTO
  // =========================
  rebuildNodeMap();

  // 🔥 MUY IMPORTANTE: primero nodos, luego links
  rebuildLinkGroups();

  requestRender();

  resetState();
}

function generateUniqueId(type, collection) {
  let id;
  do {
    id = `${type}_${Math.floor(Math.random() * 10000)}`;
  } while (collection.some((item) => item.id === id));
  return id;
}

function worldToScreen(x, y) {
  return {
    x: x * view.scale + view.offsetX,
    y: y * view.scale + view.offsetY,
  };
}

function screenToWorld(x, y) {
  return {
    x: (x - view.offsetX) / view.scale,
    y: (y - view.offsetY) / view.scale,
  };
}

function getMousePos(evt) {
  const r = canvas.getBoundingClientRect();

  const x = evt.clientX - r.left;
  const y = evt.clientY - r.top;

  return screenToWorld(x, y);
}

// =====================
// SELECCIÓN Y DETECCIÓN
// =====================

// Mapa de nodos

let nodeMap = new Map();

function rebuildNodeMap() {
  nodeMap.clear();
  getNodes().forEach(n => nodeMap.set(n.id, n));
}

function getNode(id) {
  return nodeMap.get(id);
}

// Mapa de áreas

let areaMap = new Map();

function rebuildAreaMap() {
  areaMap.clear();
  getAreas().forEach(a => areaMap.set(a.id, a));
}

function getArea(id) {
  return areaMap.get(id);
}

// Mapa de enlaces

let linkGroups = new Map();

function rebuildLinkGroups() {
  linkGroups.clear();

  for (const link of getLinks()) {
    const key = [link.from.nodeId, link.to.nodeId].sort().join("_");

    if (!linkGroups.has(key)) {
      linkGroups.set(key, []);
    }

    linkGroups.get(key).push(link);
  }
}



function getNodeAt(x, y) {
  for (let i = getNodes().length - 1; i >= 0; i--) {
    const n = getNodes()[i];

    if (n.selectable === false || n.isBackground) continue;

    let w, h;

    if (n.type === "image") {
      w = n.size?.width || 150;
      h = n.size?.height || 150;
    } else {
      w = n._width || node_w;
      h = n._height || node_h;
    }

    if (
      x >= n.position.x &&
      x <= n.position.x + w &&
      y >= n.position.y &&
      y <= n.position.y + h
    ) {
      return n;
    }
  }

  return null;
}

function getAreaAt(x, y) {
  return getAreas().find(
    (a) =>
      x >= a.position.x &&
      x <= a.position.x + a.size.width &&
      y >= a.position.y &&
      y <= a.position.y + a.size.height
  );
}

function getLinkAt(x, y) {
  for (const links of linkGroups.values()) {
    const from = nodeMap.get(links[0].from.nodeId);
    const to = nodeMap.get(links[0].to.nodeId);
    if (!from || !to) continue;

    const { ux, uy } = getLinkGeometry(from, to);
    const gap = 10;

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const offset = (i - (links.length - 1) / 2) * gap;
      const ox = ux * offset;
      const oy = uy * offset;

      const { w: fw, h: fh } = getNodeSize(from);
      const { w: tw, h: th } = getNodeSize(to);

      const x1 = from.position.x + fw / 2 + ox;
      const y1 = from.position.y + fh / 2 + oy;
      const x2 = to.position.x + tw / 2 + ox;
      const y2 = to.position.y + th / 2 + oy;

      const denom = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      if (denom === 0) continue;

      const t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / denom;
      if (t < 0 || t > 1) continue;

      const px = x1 + t * (x2 - x1);
      const py = y1 + t * (y2 - y1);

      const dist2 = (x - px) ** 2 + (y - py) ** 2;
      if (dist2 < 36) return link;
    }
  }
  return null;
}

function isOnResizeHandle(area, x, y) {
  const handleSize = 10 / view.scale;

  return (
    x >= area.position.x + area.size.width - handleSize &&
    x <= area.position.x + area.size.width &&
    y >= area.position.y + area.size.height - handleSize &&
    y <= area.position.y + area.size.height
  );
}

// =====================
// CREACIÓN DE ELEMENTOS
// =====================

function createNode(type, x, y) {
  const id = generateUniqueId(type, getNodes());

  let node = null;

  if (type === "north") {
    node = {
      id,
      type,
      name: "",
      position: { x, y },
      angle: 0
    }
  }

  else if (type === "image") {
    node = {
      id,
      name: "",
      type,
      position: { x, y },
      size: { width: 150, height: 150 },
      opacity: 100,
      data: ""
    }
  }

  else if (type === "cloud") {
    node = {
      id,
      type,
      name: id,
      position: { x, y },
      link: "",
      interfaces: []
    }
  }

  else {
    node = {
      id,
      type,
      name: id,
      position: { x, y },
      metadata: {
        productor: "",
        modelo: "",
        notas: "",
      },
      interfaces: []
    }
  }

  getNodes().push(node);
  rebuildNodeMap();
  return node;
}

function loadImageToNode(file, node) {
  const reader = new FileReader();

  reader.onload = (e) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // 🔥 reducción de tamaño (importante)
      const maxSize = 800;
      let w = img.width;
      let h = img.height;

      if (w > h && w > maxSize) {
        h *= maxSize / w;
        w = maxSize;
      } else if (h > maxSize) {
        w *= maxSize / h;
        h = maxSize;
      }

      canvas.width = w;
      canvas.height = h;

      ctx.drawImage(img, 0, 0, w, h);

      // 🔥 compresión moderna
      const webp = canvas.toDataURL("image/webp", 0.7);

      node.data = webp;
      node.size = { width: w, height: h };
      node.opacity = 100;

      requestRender();
    };

    img.src = e.target.result;
  };

  reader.readAsDataURL(file);
}

function createArea(x, y) {
  const id = generateUniqueId("area", getAreas());

  getAreas().push({
    id,
    name: id,
    position: { x, y },
    size: { width: 150, height: 100 },
    color: null,
  });

  rebuildAreaMap();
}

function createTextNode(x, y, content = "Nuevo texto") {
  const id = generateUniqueId("text", getNodes());

  const node = {
    id,
    type: "text",
    name: id,
    position: { x, y },
    text: content,
    metadata: {},
  };

  getNodes().push(node);

  rebuildNodeMap();

  updateTextNodeSize(node);
  return node;
}

function cloneNode(node, x, y) {
  const id = generateUniqueId(node.type, getNodes());

  const newNode = structuredClone(node);

  newNode.id = id;
  newNode.position = { x, y };

  delete newNode._width;
  delete newNode._height;

  getNodes().push(newNode);

  rebuildNodeMap();

  return newNode;
}

// =====================
// EDITOR DE TEXTO
// =====================

const textEditor = document.getElementById("textEditor");

function openTextEditor(node) {
  editingTextNode = node;

  const rect = canvas.getBoundingClientRect();

  textEditor.style.display = "block";
  textEditor.value = node.text;

  const screen = worldToScreen(node.position.x, node.position.y);

  textEditor.style.left = rect.left + screen.x + "px";
  textEditor.style.top = rect.top + screen.y + "px";

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

  const paddingX = 20;
  const paddingY = 10;
  const strokeComp = 4;

  const lines = n.text.split("\n");

  let maxWidth = 0;

  for (const line of lines) {
    const m = ctx.measureText(line);

    const realWidth =
      (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width);

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
const node_w = 50;
const node_h = 50;

function getColor(variable) {
  return getComputedStyle(root).getPropertyValue(variable).trim();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  applyTransform();

  if (gridEnabled) drawGrid();

  getNodes()
    .filter(n => n.type === "image")
    .forEach(drawNodeBase);

  getAreas().forEach(drawArea);
  drawLinks();

  getNodes()
    .filter(n => n.type !== "image")
    .forEach(drawNodeBase);

  getAreas().forEach(drawAreaLabel);
  getNodes().forEach(drawNodeLabel);

  drawPorts();
  drawPreview();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawArea(a) {
  ctx.save();

  const { x, y } = a.position;
  const { width, height } = a.size;

  ctx.strokeStyle =
    a === ui.selection.area
      ? getColor("--color-alert")
      : getColor("--color-area-border");
  ctx.strokeRect(x, y, width, height);

  if (a.color) {
    ctx.fillStyle = a.color;
    ctx.fillRect(x, y, width, height);
  }

  ctx.fillStyle = getColor("--color-alert");
  ctx.fillRect(x + width - 10, y + height - 10, 10, 10);

  ctx.restore();
}

function drawAreaLabel(a) {
  drawTextWithOutline(a.name, a.position.x + 5, a.position.y + 5);
}

function isOnImageResizeHandle(n, x, y) {
  const size = 10;

  return (
    x >= n.position.x + n.size.width - size &&
    x <= n.position.x + n.size.width &&
    y >= n.position.y + n.size.height - size
  );
}

function drawNodeBase(n) {
  ctx.save();

  if (n.type === "north") {
    const icon = icons[n.type];

    const { w, h } = getNodeSize(n);
    const cx = n.position.x + w / 2;
    const cy = n.position.y + h / 2;

    ctx.translate(cx, cy);
    ctx.rotate((- n.angle || 0) * Math.PI / 180);

    ctx.drawImage(icon, -w / 2, -h / 2, w, h);

    if (n === ui.selection.node) {
      ctx.strokeStyle = getColor("--color-alert");
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    }

    ctx.restore();
    return;
  }

  if (n.type === "image") {
    if (!n._cachedImg) {
      const img = new Image();
      img.src = n.data;
      n._cachedImg = img;
    }

    const img = n._cachedImg;

    const w = n.size?.width || 150;
    const h = n.size?.height || 150;

    ctx.save();
    ctx.globalAlpha = (n.opacity ?? 100) / 100;

    if (img.complete) {
      ctx.drawImage(img, n.position.x, n.position.y, w, h);
    } else {
      ctx.fillStyle = "#ddd";
      ctx.fillRect(n.position.x, n.position.y, w, h);
    }

    ctx.restore();

    if (n === ui.selection.node) {
      ctx.strokeStyle = getColor("--color-alert");
      ctx.strokeRect(n.position.x, n.position.y, w, h);
    }

    return;
  }

  if (n.type === "text") {
    const width = n._width || 100;
    const height = n._height || 40;

    ctx.fillStyle = getColor("--color-textarea-bg");
    ctx.fillRect(n.position.x, n.position.y, width, height);

    ctx.strokeStyle = n === ui.selection.node ? getColor("--color-alert") : "black";
    ctx.strokeRect(n.position.x, n.position.y, width, height);

    ctx.restore();
    return;
  }

  const icon = icons[n.type];

  if (icon && icon.complete) {
    ctx.drawImage(icon, n.position.x, n.position.y, node_w, node_h);
  } else {
    ctx.fillStyle = getColor("--color-link-drawing");
    ctx.fillRect(n.position.x, n.position.y, node_w, node_h);
  }

  if (n === ui.selection.node) {
    ctx.strokeStyle = getColor("--color-alert");
    ctx.strokeRect(n.position.x, n.position.y, node_w, node_h);
  }

  ctx.restore();
}

function drawNodeLabel(n) {
  ctx.save();

  if (n.type === "text") {
    const padding = 10;
    const lines = n.text.split("\n");

    lines.forEach((line, i) => {
      drawTextWithOutline(
        line,
        n.position.x + padding / 2,
        n.position.y + padding / 2 + i * 14,
        "left",
        getColor("--color-textarea-bg")
      );
    });

    ctx.restore();
    return;
  }

  drawTextWithOutline(n.name, n.position.x + 25, n.position.y + 52, "center");

  ctx.restore();
}

function drawLinks() {
  for (const ls of linkGroups.values()) {
    const f = nodeMap.get(ls[0].from.nodeId);
    const t = nodeMap.get(ls[0].to.nodeId);
    if (!f || !t) continue;
    const { ux, uy } = getLinkGeometry(f, t);
    const gap = 10;
    ls.forEach((l, i) => {
      const isSelected = ui.selection.link && ui.selection.link.id === l.id;
      const off = (i - (ls.length - 1) / 2) * gap;
      const ox = ux * off;
      const oy = uy * off;

      if (l.type === "wireless") {
        drawWavyLine(
          ctx,
          f.position.x + node_w / 2 + ox,
          f.position.y + node_h / 2 + oy,
          t.position.x + node_w / 2 + ox,
          t.position.y + node_h / 2 + oy,
          isSelected
        );
      } else if (l.type === "wan") {
        drawZigzagLine(
          ctx,
          f.position.x + node_w / 2 + ox,
          f.position.y + node_h / 2 + oy,
          t.position.x + node_w / 2 + ox,
          t.position.y + node_h / 2 + oy,
          isSelected
        );
      } else {
        drawStraightLine(
          ctx,
          f.position.x + node_w / 2 + ox,
          f.position.y + node_h / 2 + oy,
          t.position.x + node_w / 2 + ox,
          t.position.y + node_h / 2 + oy,
          isSelected
        );
      }
    });
  }
}

function drawStraightLine(ctx, x1, y1, x2, y2, isSelected = false) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = isSelected
    ? getColor("--color-alert")
    : "black";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawWavyLine(ctx, x1, y1, x2, y2, isSelected = false) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) return;

  const ux = dx / len;
  const uy = dy / len;

  const nx = -uy;
  const ny = ux;

  const amplitude = 5;
  const wavelength = 20;
  const step = 2;

  ctx.beginPath();

  for (let i = 0; i <= len; i += step) {
    const x = x1 + ux * i;
    const y = y1 + uy * i;

    const wave = Math.sin((i / wavelength) * Math.PI * 2) * amplitude;

    const px = x + nx * wave;
    const py = y + ny * wave;

    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }

  ctx.strokeStyle = isSelected
    ? getColor("--color-alert")
    : getColor("--color-link-drawing");
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawZigzagLine(ctx, x1, y1, x2, y2, isSelected = false) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) return;

  const B = 5;
  const A = len * 0.5 + B;

  const ux = dx / len;
  const uy = dy / len;

  const px = -uy;
  const py = ux;

  const xA = x1 + ux * A + px * B;
  const yA = y1 + uy * A + py * B;

  const xC = x2 - ux * A + px * -B;
  const yC = y2 - uy * A + py * -B;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(xA, yA);
  ctx.lineTo(xC, yC);
  ctx.lineTo(x2, y2);

  ctx.strokeStyle = isSelected
    ? getColor("--color-alert")
    : getColor("--color-link-wan");
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPreview() {
  const icon = getActiveCursorIcon();

  if (icon && icon.complete) {
    ctx.save();
    ctx.globalAlpha = 0.5;

    ctx.drawImage(
      icon,
      lastMouseX - 12,
      lastMouseY - 12,
      node_w / 2,
      node_h / 2
    );

    ctx.restore();
  }

  if (
    ["link-wired", "link-wireless", "link-wan"].includes(ui.tool) &&
    linkStart
  ) {
    ctx.beginPath();
    ctx.moveTo(
      linkStart.position.x + node_w / 2,
      linkStart.position.y + node_h / 2
    );
    ctx.lineTo(lastMouseX, lastMouseY);
    ctx.strokeStyle = getColor("--color-link-drawing");
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawTextWithOutline(
  text,
  x,
  y,
  align = "left",
  outlineColor = "white"
) {
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

function getNodeSize(n) {
  if (n.type === "image") {
    return {
      w: n.size?.width ?? 150,
      h: n.size?.height ?? 150
    };
  }

  return {
    w: n._width ?? node_w,
    h: n._height ?? node_h
  };
}

const tool_devices = [
  "router",
  "switch",
  "switch3",
  "ap",
  "hub",
  "pc",
  "server",
  "screen",
  "ipphone",
  "printer",
  "nas",
  "patch",
  "cloud",
  "north"
];

function updateCursor() {
  if (isPanning) {
    canvas.style.cursor = "grabbing";
    return;
  }

  if (ui.mode === "dragging_node" || ui.mode === "dragging_area" || resizing) {
    canvas.style.cursor = "move";
    return;
  }

  for (const area of getAreas()) {
    if (isOnResizeHandle(area, lastMouseX, lastMouseY)) {
      canvas.style.cursor = "se-resize";
      return;
    }
  }

  if (cloneMode) {
    canvas.style.cursor = "copy";
    return;
  }

  if (ui.tool === "select") {
    const node = getNodeAt(lastMouseX, lastMouseY);
    const link = getLinkAt(lastMouseX, lastMouseY);
    if (node || link) {
      canvas.style.cursor = "pointer";
      return;
    }
  }

  if (tool_devices.includes(ui.tool) || ui.tool == "area") {
    canvas.style.cursor = "crosshair";
    return;
  }

  if (["link-wired", "link-wireless", "link-wan"].includes(ui.tool)) {
    canvas.style.cursor = "crosshair";
    return;
  }

  if (ui.tool === "text") {
    canvas.style.cursor = "text";
    return;
  }

  if (ui.tool === "delete") {
    canvas.style.cursor = "not-allowed";
    return;
  }

  canvas.style.cursor = "default";
}

function getActiveCursorIcon() {
  if (cloneMode) {
    return icons[cloneMode.type];
  }

  if (tool_devices.includes(ui.tool) || ui.tool == "area") {
    return icons[ui.tool];
  }

  return null;
}

function setActiveToolButton(tool) {
  document
    .querySelectorAll("[data-action='tool']")
    .forEach((b) => b.classList.remove("active"));

  const btn = document.querySelector(`[data-tool='${tool}']`);
  if (btn) btn.classList.add("active");
}

const actions = {
  tool: (btn) => toggleTool(btn.dataset.tool, btn),

  new: () => clearAll(),

  "export-json": () => exportFile(false),
  "export-gzip": () => exportFile(true),
  "export-png": () => exportPNG(),
  "export-txt": () => exportTXT(db),
  "sheet-import": () => triggerImportSheet(),
  "sheet-add": () => createNetwork(),
  "sheet-delete": () => deleteNetwork(),
  "rename-sheet": () => renameCurrentNetwork(),
  "image": () => triggerImportImage(),

  import: () => triggerImportFile(),

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
// REPRESENTAR PUERTOS
// =====================

function getLinkGeometry(from, to) {
  const dx = to.position.x - from.position.x;
  const dy = to.position.y - from.position.y;
  const len = Math.hypot(dx, dy);

  if (len === 0) {
    return { dx: 0, dy: 0, len: 0, ux: 0, uy: 0 };
  }

  return { dx, dy, len, ux: -dy / len, uy: dx / len, };
}

let showLinkPorts = true;

function togglePorts() {
  const togglePortsButton = document.getElementById("togglePorts");
  showLinkPorts = !showLinkPorts;

  if (showLinkPorts) {
    togglePortsButton.querySelector(
      "img"
    ).src = `img/buttons/tools/port-off.svg`;
    togglePortsButton.querySelector("span").textContent = "Quitar puertos";
  } else {
    togglePortsButton.querySelector(
      "img"
    ).src = `img/buttons/tools/port-on.svg`;
    togglePortsButton.querySelector("span").textContent = "Ver puertos";
  }

  requestRender();
}

function drawPorts() {
  if (!showLinkPorts) return;

  for (const links of linkGroups.values()) {
    const from = nodeMap.get(links[0].from.nodeId);
    const to = nodeMap.get(links[0].to.nodeId);
    if (!from || !to) continue;

    const { ux, uy } = getLinkGeometry(from, to);

    const gap = 10;

    for (let i = 0; i < links.length; i++) {
      const link = links[i];

      const offset = (i - (links.length - 1) / 2) * gap;
      const ox = ux * offset;
      const oy = uy * offset;

      const f = getNodePortPosition(from, to);
      const t = getNodePortPosition(to, from);

      if (link.from?.port) {
        drawPortBox(
          link.from.port,
          f.x + ox,
          f.y + oy,
          link.vlan
        );
      }

      if (link.to?.port) {
        drawPortBox(
          link.to.port,
          t.x + ox,
          t.y + oy,
          link.vlan
        );
      }
    }
  }
}

function getNodePortPosition(from, to) {
  const { w, h } = getNodeSize(from);

  const cx = from.position.x + w / 2;
  const cy = from.position.y + h / 2;

  const { w: tw, h: th } = getNodeSize(to);

  const tx = to.position.x + tw / 2;
  const ty = to.position.y + th / 2;

  let dx = tx - cx;
  let dy = ty - cy;

  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: cx, y: cy };

  const ux = dx / len;
  const uy = dy / len;

  const radius = 1.5 * Math.sqrt((w * h) / Math.PI);

  const bx = cx + ux * radius;
  const by = cy + uy * radius;

  const maxInfluenceDistance = radius * 3;

  let t = len / maxInfluenceDistance;

  t = Math.min(Math.max(t, 0), 1);

  return {
    x: cx + (bx - cx) * t,
    y: cy + (by - cy) * t,
  };
}

function drawPortBox(text, x, y, vlan) {
  ctx.save();

  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const paddingX = 8;
  const textWidth = ctx.measureText(text).width;
  const w = textWidth + paddingX * 2;
  const h = 18;

  ctx.fillStyle = getVlanColor(vlan);
  ctx.strokeStyle = "#111";

  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 4)
    : ctx.rect(x - w / 2, y - h / 2, w, h);

  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#000";
  ctx.fillText(text, x, y);

  ctx.restore();
}

// =====================
// FORZADO A REJILLA
// =====================

let gridEnabled = false;

function toggleGrid() {
  const toggleGridButton = document.getElementById("toggleGrid");
  gridEnabled = !gridEnabled;

  if (gridEnabled) {
    toggleGridButton.querySelector(
      "img"
    ).src = `img/buttons/tools/grid-off.svg`;
    toggleGridButton.querySelector("span").textContent = "Quitar rejilla";
  } else {
    toggleGridButton.querySelector("img").src = `img/buttons/tools/grid-on.svg`;
    toggleGridButton.querySelector("span").textContent = "Forzar a rejilla";
  }

  requestRender();
}

function drawGrid() {
  const stepX = node_w;
  const stepY = node_h;

  const width = canvas.width / dpr / view.scale;
  const height = canvas.height / dpr / view.scale;

  const startX = -view.offsetX / view.scale;
  const startY = -view.offsetY / view.scale;

  ctx.save();

  ctx.strokeStyle = getColor("--color-canvas-grid");
  ctx.lineWidth = 2;

  ctx.beginPath();

  for (
    let x = Math.floor(startX / stepX) * stepX;
    x < startX + width;
    x += stepX
  ) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, startY + height);
  }

  for (
    let y = Math.floor(startY / stepY) * stepY;
    y < startY + height;
    y += stepY
  ) {
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + width, y);
  }

  ctx.stroke();

  ctx.restore();
}

function snapToGrid(x, y) {
  if (!gridEnabled) return { x, y };

  const threshold = 10;

  const snapX = Math.round(x / node_w) * node_w;
  const snapY = Math.round(y / node_h) * node_h;

  return {
    x: Math.abs(snapX - x) < threshold ? snapX : x,
    y: Math.abs(snapY - y) < threshold ? snapY : y,
  };
}

// =====================
// HERRAMIENTAS
// =====================

function toggleTool(tool) {
  cloneMode = null;

  if (ui.tool === tool) {
    if (tool === "select") return;

    ui.tool = "select";
    setActiveToolButton("select");

    linkStart = null;
    updateCursor();
    return;
  }

  ui.tool = tool;
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
    const snapped = snapToGrid(x - node_w / 2, y - node_h / 2);
    const newNode = cloneNode(cloneMode, snapped.x, snapped.y);

    ui.selection.node = newNode;

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
  const link = getLinkAt(x, y);

  mouseDownPos = { x, y };
  isDragging = false;

  if (ui.tool === "delete") {
    deleteSelection({ x, y, confirmDelete: true });
    return;
  }

  if (tool_devices.includes(ui.tool)) {
    let nx = x - node_w / 2;
    let ny = y - node_h / 2;

    if (gridEnabled) {
      nx = Math.round(nx / node_w) * node_w;
      ny = Math.round(ny / node_h) * node_h;
    }

    createNode(ui.tool, nx, ny);

    requestRender();
    return;
  }

  if (ui.tool === "area") {
    createArea(x - 75, y - 50);
    requestRender();
    return;
  }

  if (["link-wired", "link-wireless", "link-wan"].includes(ui.tool)) {
    if (!node) return;

    if (!linkStart) {
      linkStart = node;
    } else if (node !== linkStart) {
      let type = "wired";

      if (ui.tool === "link-wireless") {
        type = "wireless";
      } else if (ui.tool === "link-wan") {
        type = "wan";
      }

      getLinks().push({
        id: generateUniqueId(type, getLinks()),
        type,
        from: { nodeId: linkStart.id },
        to: { nodeId: node.id },
      });

      rebuildLinkGroups();

      linkStart = null;
    }

    requestRender();
    return;
  }

  if (ui.tool === "text") {
    const node = createTextNode(x, y - 10);

    node._isNewText = true;

    ui.selection.node = null;
    ui.selection.area = null;
    ui.selection.link = null;

    ui.mode = "idle";
    // draggingArea = null;
    isDragging = false;
    mouseDownPos = null;
    clearInspector();

    requestRender();

    setTimeout(() => {
      openTextEditor(node);
    }, 0);
    return;
  }

  if (area && isOnResizeHandle(area, x, y)) {
    ui.selection.node = null;
    ui.selection.area = null;
    ui.selection.link = null;
    isDragging = false;
    ui.mode = "idle";
    // draggingArea = null;
    clearInspector();

    resizingArea = area;
    resizing = true;

    requestRender();
    return;
  }

  if (ui.tool === "select") {
    if (node) {
      ui.selection.node = node;
      ui.selection.area = null;
      ui.selection.link = null;
      updateNodeInspector(node);
    } else if (link) {
      ui.selection.link = link;
      ui.selection.node = null;
      ui.selection.area = null;
      updateLinkInspector(link);
    } else if (area) {
      ui.selection.area = area;
      ui.selection.node = null;
      ui.selection.link = null;
      updateAreaInspector(area);
    } else {
      ui.selection.node = null;
      ui.selection.area = null;
      ui.selection.link = null;
      clearInspector();
    }

    requestRender();
    return;
  }
});

canvas.addEventListener("mousemove", (e) => {

  const { x, y } = getMousePos(e);
  lastMouseX = x;
  lastMouseY = y;

  if (isPanning) {
    view.offsetX += e.movementX;
    view.offsetY += e.movementY;
    updateCursor();
    requestRender();
    return;
  }

  if (ui.selection.node?.type === "image" && resizing) {
    const newW = x - ui.selection.node.position.x;
    const newH = y - ui.selection.node.position.y;

    ui.selection.node.size.width = Math.max(20, newW);
    ui.selection.node.size.height = Math.max(20, newH);

    requestRender();
  }

  // =========================
  // detectar intención de drag
  // =========================
  if (mouseDownPos && !isDragging && !resizing) {
    const dx = x - mouseDownPos.x;
    const dy = y - mouseDownPos.y;

    if (Math.sqrt(dx * dx + dy * dy) > 3) {
      isDragging = true;

      if (ui.selection.node) {
        ui.mode = "dragging_node";

        draggingOffset = {
          x: x - ui.selection.node.position.x,
          y: y - ui.selection.node.position.y,
        };
      }

      if (ui.selection.area) {
        ui.mode = "dragging_area"
        // draggingArea = ui.selection.area;

        draggingOffset = {
          x: x - ui.selection.area.position.x,
          y: y - ui.selection.area.position.y,
        };
      }
    }
  }

  if (ui.mode === "dragging_node") {
    let nx = x - draggingOffset.x;
    let ny = y - draggingOffset.y;

    const snapped = snapToGrid(nx, ny);

    ui.selection.node.position.x = snapped.x;
    ui.selection.node.position.y = snapped.y;

    updateNodeInspector(ui.selection.node);
    requestRender();
    return;
  }

  // =========================
  // DRAG AREA
  // =========================
  if (ui.mode === "dragging_area") {
    ui.selection.area.position.x = x - draggingOffset.x;
    ui.selection.area.position.y = y - draggingOffset.y;

    updateCursor();
    requestRender();
    return;
  }

  // =========================
  // RESIZE AREA
  // =========================
  if (resizing && resizingArea) {
    const newW = x - resizingArea.position.x;
    const newH = y - resizingArea.position.y;

    const snapped = snapToGrid(newW, newH);

    resizingArea.size.width = Math.max(10, snapped.x);
    resizingArea.size.height = Math.max(10, snapped.y);

    updateCursor();
    requestRender();
    return;
  }

  requestRender();
  updateCursor();
});

canvas.addEventListener("mouseup", () => {
  isPanning = false;

  ui.mode = "idle";
  // draggingArea = null;
  resizing = false;
  resizingArea = null;

  mouseDownPos = null;
  isDragging = false;

  updateCursor();
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();

    const mouse = getMousePos(e);

    const newScale = view.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1);

    setZoom(newScale, mouse.x, mouse.y);
  },
  { passive: false }
);

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (
    ["link-wired", "link-wireless", "link-wan"].includes(ui.tool) &&
    linkStart
  ) {
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

  if (node && node.type === "cloud" && node.link && db.networks[node.link]) {
    db.activeNetwork = node.link;
    updateNetworkSelector();
    rebuildNodeMap(); rebuildAreaMap(); rebuildLinkGroups();

    resetState();
    requestRender();
    return;
  }
});

canvas.addEventListener("mouseleave", () => {
  isPanning = false;
});

// KEYBOARD

document.addEventListener("keydown", (e) => {
  const el = document.activeElement;
  const isTyping =
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;

  if (isTyping) {
    if (e.key === "Enter" && !e.shiftKey) {
      textEditor.blur();
      e.preventDefault();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();

      if (editingTextNode) {
        if (editingTextNode._isNewText) {
          const net = getCurrentNetwork();
          net.nodes = net.nodes.filter(n => n.id !== editingTextNode.id);
          rebuildNodeMap();
        } else {
          editingTextNode.text = textEditor.dataset.originalText || editingTextNode.text;
          updateTextNodeSize(editingTextNode);
        }

        editingTextNode = null;
      }

      textEditor.style.display = "none";
      textEditor.blur();

      requestRender();
      return;
    }

    return;
  }

  // =========================
  // SHORTCUTS GLOBALES
  // =========================

  if (e.ctrlKey && e.key.toLowerCase() === "c") {
    if (ui.selection.node) {
      cloneMode = ui.selection.node;
      cursorIcon = icons[ui.selection.node.type] || null;
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

    toggleTool("delete", deleteButton);

    setTimeout(() => {
      if (ui.selection.node || ui.selection.area) {
        deleteSelection({ confirmDelete: true });
      }
    }, 0);
  }
});

// =====================
// ELIMINACIÓN
// =====================

function deleteSelection({ x = null, y = null, confirmDelete = true } = {}) {
  let node = ui.selection.node;
  let area = ui.selection.area;
  let link = ui.selection.link;

  if (x !== null && y !== null) {
    node = getNodeAt(x, y);
    if (!node) link = getLinkAt(x, y);
    if (!node && !link) area = getAreaAt(x, y);
  }

  if (!node && !area && !link) return;

  if (confirmDelete) {
    const ok = confirm(
      "¿Seguro que quieres eliminar el elemento seleccionado?"
    );
    if (!ok) return;
  }

  if (node) {
    const net = getCurrentNetwork();
    net.nodes = net.nodes.filter((n) => n.id !== node.id);
    net.links = net.links.filter(
      (l) => l.from.nodeId !== node.id && l.to.nodeId !== node.id
    );
    rebuildNodeMap();
  }

  if (link) {
    const net = getCurrentNetwork();
    net.links = net.links.filter((l) => l.id !== link.id);
    rebuildLinkGroups();
  }

  if (area) {
    const net = getCurrentNetwork();
    net.areas = net.areas.filter((a) => a.id !== area.id);
    rebuildAreaMap();
  }

  ui.selection.node = null;
  ui.selection.area = null;
  ui.selection.link = null;
  clearInspector();
  requestRender();
}

// =====================
// INSPECTOR (RESIZE)
// =====================

const resizer = document.getElementById("resizer");
const inspector = document.getElementById("inspector");

resizer.addEventListener(
  "touchstart",
  (e) => {
    isDragging = true;
  },
  { passive: true }
);

window.addEventListener(
  "touchmove",
  (e) => {
    if (!isDragging) return;

    e.preventDefault();

    const touch = e.touches[0];
    const screenHeight = window.innerHeight;

    const newHeight = screenHeight - touch.clientY;

    const min = 120;
    const max = screenHeight * 0.7;

    const clamped = Math.max(min, Math.min(max, newHeight));

    inspector.style.flex = `0 0 ${clamped}px`;
    resizeCanvas();
  },
  { passive: false }
);

window.addEventListener("touchend", () => {
  isDragging = false;
});

function updateNodeInspector(node) {
  const container = document.getElementById("props");

  // SNAPSHOT
  container._nodeSnapshot = {
    id: node.id,
    name: node.name,
    angle: node.angle ?? 0,
    text: node.text ?? "",
    opacity: node.opacity ?? 100,
    link: node.link ?? null,
    metadata: JSON.stringify(node.metadata || {})
  };

  // 🔥 Draft (solo cambia si nodo cambia)
  if (container._nodeId !== node.id) {
    container._metaDraft = structuredClone(node.metadata || {});
    // container._nodeId = node.id;
  }

  const tpl = templates[node.type] || templates.default;
  if (!tpl) return console.error("Template no encontrado");

  const clone = tpl.content.cloneNode(true);

  // BIND BÁSICO
  bind(clone, "id", node.id);
  bind(clone, "name", node.name);
  bind(clone, "type", node.type);
  bind(clone, "x", Math.round(node.position.x));
  bind(clone, "y", Math.round(node.position.y));

  if (node.type === "text") bind(clone, "text", node.text);
  if (node.type === "north") bind(clone, "angle", node.angle || 0);
  if (node.type === "image") bind(clone, "opacity", node.opacity ?? 100);

  // CLOUD
  if (node.type === "cloud") {
    const select = clone.querySelector('[data-bind="networkSelect"]');

    if (select) {
      select.innerHTML = `
      <option value="">-- Ninguno --</option>
      ${Object.keys(db.networks).map(n => `
        <option value="${n}" ${node.link === n ? "selected" : ""}>
          ${n}
        </option>
      `).join("")}
    `;
    }
  }

  // AREA
  let areaName = "Ninguna";
  for (const a of getAreas()) {
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

  bind(clone, "area", areaName);

  // REFS
  const refs = {
    // idInput: clone.querySelector('[data-bind="id"]'),
    nameInput: clone.querySelector('[data-bind="name"]'),
    angleInput: clone.querySelector('[data-bind="angle"]'),
    textInput: clone.querySelector('[data-bind="text"]'),
    opacitySlider: clone.querySelector('[data-bind="opacitySlider"]'),
    opacityValue: clone.querySelector('[data-bind="opacityValue"]'),
    networkSelect: clone.querySelector('[data-bind="networkSelect"]'),
    error: clone.querySelector('[data-bind="error"]')
  };

  if (refs.opacitySlider && refs.opacityValue) {
    const updateOpacityLabel = () => {
      const value = refs.opacitySlider.value;
      refs.opacityValue.textContent = `${value}%`;
    };

    // inicial
    refs.opacitySlider.value = node.opacity ?? 100;
    updateOpacityLabel();

    // live update
    refs.opacitySlider.addEventListener("input", updateOpacityLabel);
  }

  // METADATA
  const meta = clone.querySelector('[data-bind="metadata"]');

  if (meta) {
    meta.innerHTML = renderMetadataEditor(container._metaDraft);
    bindMetadata(meta, container);
  }

  // SAVE
  const btnSave = clone.querySelector('[data-action="saveAll"]');
  if (btnSave) {
    btnSave.onclick = () => saveNode(node, refs);
  }

  container.innerHTML = "";
  container.appendChild(clone);
}

function bindMetadata(metaEl, container) {
  const draft = container._metaDraft;

  // ADD + DELETE
  metaEl.onclick = (e) => {
    const target = e.target;

    // ADD
    if (target.matches('[data-action="addMeta"]')) {
      const input = metaEl.querySelector('#newMetaKey');
      const key = input.value.trim();
      if (!key) return;

      if (draft[key] !== undefined) {
        container.querySelector('[data-bind="error"]').textContent = "Clave ya existe";
        return;
      }

      draft[key] = "";
      input.value = "";

      metaEl.innerHTML = renderMetadataEditor(draft);
      bindMetadata(metaEl, container);
      return;
    }

    // DELETE
    if (target.matches('[data-action="deleteMeta"]')) {
      const key = target.dataset.key;
      if (!confirm(`¿Eliminar "${key}"?`)) return;

      delete draft[key];

      metaEl.innerHTML = renderMetadataEditor(draft);
      bindMetadata(metaEl, container);
    }
  };

  // 🔥 ESTE ES EL FIX IMPORTANTE
  metaEl.oninput = (e) => {
    const id = e.target.id;
    if (!id || !id.startsWith("meta_")) return;

    const key = id.replace("meta_", "");
    draft[key] = e.target.value;
  };
}

function saveNode(node, refs) {
  const container = document.getElementById("props");
  const original = container._nodeSnapshot;

  let changed = false;

  // const newId = refs.idInput?.value.trim();
  const newName = refs.nameInput?.value.trim();

  // NAME
  if (newName !== undefined && newName !== original.name) {
    node.name = newName;
    changed = true;
  }

  // TEXT NODE
  if (refs.textInput) {
    const newText = refs.textInput.value;

    if (newText !== original.text) {
      node.text = newText;
      updateTextNodeSize(node);
      changed = true;
    }
  }

  // ANGLE
  if (refs.angleInput) {
    let angle = parseFloat(refs.angleInput.value);
    if (isNaN(angle)) angle = 0;

    if (angle !== original.angle) {
      node.angle = angle;
      changed = true;
    }
  }

  // OPACITY
  if (refs.opacitySlider) {
    const opacity = parseInt(refs.opacitySlider.value) || 100;

    if (opacity !== original.opacity) {
      node.opacity = opacity;
      changed = true;
    }
  }

  // NETWORK SELECT (cloud link)
  if (refs.networkSelect) {
    const newLink = refs.networkSelect.value || null;

    if (newLink !== original.link) {
      node.link = newLink || undefined;
      changed = true;
    }
  }

  // METADATA
  const draft = container._metaDraft || {};
  node.metadata = structuredClone(draft);

  if (JSON.stringify(node.metadata) !== original.metadata) {
    changed = true;
  }

  // APPLY
  if (changed) {
    rebuildNodeMap();
    rebuildLinkGroups();
    requestRender();

    refs.error.textContent = "✔ Guardado";
    refs.error.style.color = "green";

    container._nodeSnapshot = {
      id: node.id,
      name: node.name,
      angle: node.angle ?? 0,
      text: node.text ?? "",
      opacity: node.opacity ?? 100,
      link: node.link ?? null,
      metadata: JSON.stringify(node.metadata || {})
    };

  } else {
    refs.error.textContent = "Sin cambios";
    refs.error.style.color = getColor("--color-area-border");
  }
}

function renderMetadataEditor(metadata) {
  metadata = metadata || {};

  let html = "";

  Object.entries(metadata).forEach(([key, value]) => {
    const inputId = `meta_${key}`;

    const inputField =
      typeof value === "string" && value.length > 40
        ? `<textarea id="${inputId}" rows="2">${value}</textarea>`
        : `<input id="${inputId}" value="${value ?? ""}" />`;

    html += `
      <div class="meta-block">
        <label class="meta-key">${key}</label>

        <div class="meta-row">
          ${inputField}
          <button type="button"
                  data-action="deleteMeta"
                  data-key="${key}"
                  class="meta-delete">
            X
          </button>
        </div>
      </div>
    `;
  });

  html += `
    <div class="meta-add">
      <button type="button" data-action="addMeta">
        Añadir
      </button>
      <input id="newMetaKey" placeholder="Nueva clave" />
    </div>
  `;

  return html;
}

function clearInspector() {
  document.getElementById("props").innerHTML = "<i>Selecciona un elemento</i>";
}

// =====================
// INSPECTOR (PLANTILLA)
// =====================

const templates = {};

async function loadTemplate() {
  const names = ["text", "north", "image", "cloud", "default", "area", "link"];

  for (const name of names) {
    const res = await fetch(`/templates/${"inspector_" + name}.html`);
    const html = await res.text();

    const div = document.createElement("div");
    div.innerHTML = html;

    templates[name] = div.querySelector("template");
  }
}

function bind(root, key, value) {
  const el = root.querySelector(`[data-bind="${key}"]`);
  if (!el) return;

  if (el.type === "checkbox") {
    el.checked = Boolean(value);
  } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    el.value = value ?? "";
  } else {
    el.textContent = value ?? "";
  }
}

// =====================
// INSPECTOR (ÁREAS)
// =====================

function updateAreaInspector(area) {
  const container = document.getElementById("props");

  const tpl = templates.area;
  if (!tpl) {
    console.error("Template areaInspector no cargado");
    return;
  }

  const clone = tpl.content.cloneNode(true);

  // Rellenar valores
  bind(clone, "id", area.id);
  bind(clone, "name", area.name);
  bind(clone, "x", Math.round(area.position.x));
  bind(clone, "y", Math.round(area.position.y));
  bind(clone, "width", Math.round(area.size.width));
  bind(clone, "height", Math.round(area.size.height));
  bind(clone, "color", area.color || "#000000");
  bind(clone, "noColor", !area.color);

  // Referencias del formulario
  const refs = {
    // idInput: clone.querySelector('[data-bind="id"]'),
    nameInput: clone.querySelector('[data-bind="name"]'),
    colorInput: clone.querySelector('[data-bind="color"]'),
    noColorInput: clone.querySelector('[data-bind="noColor"]'),
    error: clone.querySelector('#areaErrorMsg')
  };

  const btnSave = clone.querySelector('[data-action="saveAll"]');

  // Snapshot del estado original
  const snapshot = {
    // id: area.id,
    name: area.name,
    color: area.color
  };

  container._areaSnapshot = snapshot;
  // container._areaId = area.id;

  // Guardado único
  if (btnSave) {
    btnSave.onclick = () => saveArea(area, refs);
  }

  // Render
  container.innerHTML = "";
  container.appendChild(clone);
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;

  const action = el.dataset.action;

  if (action === "jumpToNode") {
    const id = el.dataset.nodeid;
    const node = nodeMap.get(id);
    if (!node) return;

    // 🔥 limpiar selección actual
    ui.selection.node = null;
    ui.selection.area = null;
    ui.selection.link = null;

    // 🔥 seleccionar nuevo nodo
    ui.selection.node = node;

    // 🔥 actualizar inspector
    updateNodeInspector(node);

    requestRender();
  }
});

function saveArea(area, refs) {
  const container = document.getElementById("props");
  const original = container._areaSnapshot;

  // const newId = refs.idInput.value.trim();
  const newName = refs.nameInput.value.trim();
  const newColor = refs.colorInput.value;
  const newNoColor = refs.noColorInput.checked;

  let changed = false;

  // // ID
  // if (newId !== original.id) {
  //   if (!newId) {
  //     refs.error.textContent = "El ID no puede estar vacío";
  //     return;
  //   }

  //   if (getAreas().some(a => a.id === newId && a !== area)) {
  //     refs.error.textContent = "Ya existe un área con ese ID";
  //     return;
  //   }

  //   area.id = newId;
  //   changed = true;
  // }

  // NAME
  if (newName !== original.name) {
    area.name = newName;
    changed = true;
  }

  // COLOR
  const finalColor = newNoColor ? null : newColor;
  if (finalColor !== (original.color ?? null)) {
    area.color = finalColor;
    changed = true;
  }

  // -------------------
  // RESULTADO
  // -------------------
  if (changed) {
    rebuildAreaMap();
    requestRender();

    refs.error.textContent = "✔ Cambios guardados";
    refs.error.style.color = "green";

    // 🔥 actualizar snapshot
    container._areaSnapshot = {
      // id: area.id,
      name: area.name,
      color: area.color
    };

  } else {
    refs.error.textContent = "No hay cambios";
    refs.error.style.color = "#999";
  }
}

// =====================
// INSPECTOR (ENLACES)
// =====================

function updateLinkInspector(link) {
  const container = document.getElementById("props");

  const tpl = templates.link;
  if (!tpl) {
    console.error("Template linkInspector no cargado");
    return;
  }

  const clone = tpl.content.cloneNode(true);

  const fromNode = nodeMap.get(link.from.nodeId);
  const toNode = nodeMap.get(link.to.nodeId);
  const mode = link.vlan ? "ACCESS" : "TRUNK";

  // Bind
  bind(clone, "id", link.id);
  bind(clone, "type", link.type);
  bind(clone, "mode", mode);
  bind(clone, "vlan", link.vlan || "");
  bind(clone, "fromNode", link.from.nodeId);
  bind(clone, "toNode", link.to.nodeId);
  bind(clone, "fromPort", link.from?.port || "");
  bind(clone, "toPort", link.to?.port || "");

  const fromNodeNameEl = clone.querySelector('[data-bind="fromNodeName"]');
  const toNodeNameEl = clone.querySelector('[data-bind="toNodeName"]');

  if (fromNodeNameEl) {
    fromNodeNameEl.textContent = fromNode?.name ?? "";
    fromNodeNameEl.dataset.action = "jumpToNode";
    fromNodeNameEl.dataset.nodeid = link.from.nodeId;
    fromNodeNameEl.style.cursor = "pointer";
  }

  if (toNodeNameEl) {
    toNodeNameEl.textContent = toNode?.name ?? "";
    toNodeNameEl.dataset.action = "jumpToNode";
    toNodeNameEl.dataset.nodeid = link.to.nodeId;
    toNodeNameEl.style.cursor = "pointer";
  }

  // Refs
  const refs = {
    vlanInput: clone.querySelector('[data-bind="vlan"]'),
    fromPortInput: clone.querySelector('[data-bind="fromPort"]'),
    toPortInput: clone.querySelector('[data-bind="toPort"]'),
    swapBtn: clone.querySelector('[data-action="swap"]'),
    saveBtn: clone.querySelector('[data-action="saveAll"]'),
    error: clone.querySelector('[data-bind="error"]')
  };

  // Snapshot
  container._linkSnapshot = {
    vlan: link.vlan ?? null,
    fromPort: link.from?.port ?? null,
    toPort: link.to?.port ?? null
  };

  // container._linkId = link.id;

  if (refs.swapBtn) {
    refs.swapBtn.onclick = () => swapLinkDirection(link.id);
  }

  if (refs.saveBtn) {
    refs.saveBtn.onclick = () => saveLink(link, refs);
  }

  // Render
  container.innerHTML = "";
  container.appendChild(clone);
}

function saveLink(link, refs) {
  const container = document.getElementById("props");
  const original = container._linkSnapshot;

  const vlanRaw = refs.vlanInput.value.trim();
  const fromPortRaw = refs.fromPortInput.value.trim();
  const toPortRaw = refs.toPortInput.value.trim();

  let changed = false;

  // VLAN
  let newVlan = null;

  if (vlanRaw !== "") {
    const num = parseInt(vlanRaw);

    if (isNaN(num) || num < 1 || num > 4094) {
      refs.error.textContent = "VLAN inválida (1-4094)";
      return;
    }

    newVlan = num;
  }

  if (newVlan !== (original.vlan ?? null)) {
    if (newVlan === null) {
      delete link.vlan;
    } else {
      link.vlan = newVlan;
    }
    changed = true;
  }

  // FROM PORT
  const newFromPort = fromPortRaw || null;
  if (newFromPort !== (original.fromPort ?? null)) {
    if (!link.from) link.from = {};
    if (newFromPort === null) {
      delete link.from.port;
    } else {
      link.from.port = newFromPort;
    }
    changed = true;
  }

  // TO PORT
  const newToPort = toPortRaw || null;
  if (newToPort !== (original.toPort ?? null)) {
    if (!link.to) link.to = {};
    if (newToPort === null) {
      delete link.to.port;
    } else {
      link.to.port = newToPort;
    }
    changed = true;
  }

  // RESULTADO
  if (changed) {
    rebuildLinkGroups();
    requestRender();

    refs.error.textContent = "✔ Cambios guardados";
    refs.error.style.color = "green";

    // actualizar snapshot
    container._linkSnapshot = {
      vlan: link.vlan ?? null,
      fromPort: link.from?.port ?? null,
      toPort: link.to?.port ?? null
    };

  } else {
    refs.error.textContent = "No hay cambios";
    refs.error.style.color = "#999";
  }
}

function getVlanColor(vlan) {
  if (!vlan) return "#fff"; // trunk

  const hue = (vlan * 47) % 360;
  return `hsl(${hue}, 70%, 70%)`;
}

function swapLinkDirection(linkId) {
  const link = getLinks().find(l => l.id === linkId);
  if (!link) return;

  // intercambiar nodos
  const tempNode = link.from.nodeId;
  link.from.nodeId = link.to.nodeId;
  link.to.nodeId = tempNode;

  // intercambiar puertos (si existen)
  const tempPort = link.from?.port;
  if (!link.from) link.from = {};
  if (!link.to) link.to = {};

  link.from.port = link.to.port;
  link.to.port = tempPort;

  rebuildLinkGroups();

  // mantener seleccionado
  ui.selection.link = link;

  updateLinkInspector(link);
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
}

function zoomToSlider(z) {
  return Math.log2(z) / 2 + 0.5;
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

const filenameInput = document.getElementById("filenameInput");

function updateFilenameUI() {
  filenameInput.value = db.filename || "";
}

filenameInput.addEventListener("input", () => {
  db.filename = filenameInput.value.trim();
});

async function exportFile(compressed = false) {
  let blob;

  if (compressed) {
    blob = await compressJSON(db);
  } else {
    blob = new Blob([JSON.stringify(db, null, 2)], {
      type: "application/json",
    });
  }

  const baseName = db.filename?.trim() || "Sin nombre";
  const ext = compressed ? "json.gz" : "json";
  await saveBlob(blob, `${baseName}.${ext}`);
}

async function saveBlob(blob, defaultName) {
  if ("showSaveFilePicker" in window) {
    // Método no disponible para algunos navegadores (Firefox, Safari)
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [
          {
            description: "Archivos",
            accept: {
              "application/octet-stream": [`.${defaultName.split(".").pop()}`],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("El guardado fue cancelado por el usuario.");
      } else {
        console.error("Error guardando archivo:", err);
        alert("Ocurrió un error al guardar el archivo.");
      }
    }
  } else {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = defaultName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function triggerImportFile() {
  const input = document.getElementById("importFile");
  input.value = "";
  input.click();

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) importFile(file);
  };
}

function triggerImportImage() {
  const input = document.getElementById("importImage");
  input.value = "";
  input.click();

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // posición donde quieras crearla
      const x = 100;
      const y = 100;
      const node = createNode("image", x, y);
      loadImageToNode(file, node);
    }
  };
}

function triggerImportSheet() {
  const input = document.getElementById("importFile");
  input.value = "";

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) importAsNewSheet(file);
  };

  input.click();
}

function renameCurrentNetwork() {
  const oldName = db.activeNetwork;
  const net = db.networks[oldName];
  if (!net) return;

  const newName = prompt("Nuevo nombre de la hoja:", oldName);
  if (!newName || newName.trim() === "") return;

  const name = newName.trim();

  if (db.networks[name]) {
    alert("Ya existe una hoja con ese nombre");
    return;
  }

  db.networks[name] = net;
  delete db.networks[oldName];

  db.activeNetwork = name;

  for (const n of getNodes()) {
    if (n.type === "cloud" && n.link === oldName) {
      n.link = name;
    }
  }

  // 4. UI + consistencia
  updateNetworkSelector();
  rebuildNodeMap();
  rebuildAreaMap();
  rebuildLinkGroups();
  resetState();
  requestRender();
}

function normalizeDB(data) {
  // 🔥 Caso formato antiguo
  if (!data.networks) {
    return {
      filename: data.filename || "",
      networks: {
        network: {
          nodes: structuredClone(data.nodes || []),
          areas: structuredClone(data.areas || []),
          links: structuredClone(data.links || [])
        }
      },
      activeNetwork: "network"
    };
  }

  // 🔥 Caso formato nuevo (AQUÍ ESTABA EL BUG)
  const networks = {};

  for (const [name, net] of Object.entries(data.networks)) {
    networks[name] = {
      nodes: net.nodes || [],
      areas: net.areas || [],
      links: net.links || []
    };
  }

  // 🔥 asegurar activeNetwork válido
  let active = data.activeNetwork;

  if (!active || !networks[active]) {
    active = Object.keys(networks)[0];
  }

  return {
    filename: data.filename || "",
    networks,
    activeNetwork: active
  };
}

async function importFile(file) {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const isGzip =
      file.name?.endsWith(".gz") ||
      file.name?.endsWith(".gzip") ||
      (bytes[0] === 0x1f && bytes[1] === 0x8b);

    let data;

    if (isGzip) {
      data = await decompressJSON(new Blob([buffer]));
    } else {
      const text = new TextDecoder().decode(buffer);
      data = JSON.parse(text);
    }

    // Normalizar SIEMPRE
    const importedDB = normalizeDB(data);

    // 🔥 REEMPLAZO COMPLETO (sin merges raros)
    db = {
      filename: importedDB.filename || "",
      networks: structuredClone(importedDB.networks),
      activeNetwork:
        importedDB.activeNetwork &&
          importedDB.networks[importedDB.activeNetwork]
          ? importedDB.activeNetwork
          : Object.keys(importedDB.networks)[0]
    };

    updateFilenameUI();
    updateNetworkSelector();

    resetState();
    setTimeout(() => {
      rebuildNodeMap();
      rebuildAreaMap();
      rebuildLinkGroups();
      requestRender();
    }, 0);

  } catch (err) {
    alert("Error importando archivo: " + err.message);
  }
}

async function importAsNewSheet(file) {
  try {

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const isGzip =
      file.name?.endsWith(".gz") ||
      file.name?.endsWith(".gzip") ||
      (bytes[0] === 0x1f && bytes[1] === 0x8b);

    let data;

    if (isGzip) {

      data = await decompressJSON(new Blob([buffer]));

    } else {

      const text = new TextDecoder().decode(buffer);
      data = JSON.parse(text);

    }

    const importedDB = normalizeDB(data);
    const names = Object.keys(importedDB.networks);

    if (names.length === 0) return;

    let selected = names[0];

    if (names.length > 1) {
      const choice = prompt(
        "Selecciona la hoja a importar:\n\n" +
        names.join("\n")
      );

      if (!choice || !importedDB.networks[choice]) return;
      selected = choice;
    }

    const source = importedDB.networks[selected];

    let newName = selected;
    let i = 1;

    while (db.networks[newName]) {
      newName = `${selected}_${i++}`;
    }

    // ✔ SOLO UNA ASIGNACIÓN
    db.networks[newName] = structuredClone({
      nodes: source.nodes || [],
      areas: source.areas || [],
      links: source.links || []
    });

    db.activeNetwork = newName;

    updateNetworkSelector();

    // 🔥 CRÍTICO: asegurar consistencia antes de rebuild
    resetState();

    // 🔥 reconstruir DESPUÉS de estado limpio
    rebuildNodeMap();
    rebuildAreaMap();
    rebuildLinkGroups();

    requestRender();

  } catch (err) {
    alert("Error importando hoja: " + err.message);
  }
}

async function compressJSON(data) {
  const json = JSON.stringify(data);

  const stream = new Blob([json]).stream();

  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));

  return await new Response(compressedStream).blob();
}

async function decompressJSON(blob) {
  try {
    const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));

    const text = await new Response(stream).text();
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Archivo comprimido inválido o corrupto");
  }
}

async function exportTXT(data) {
  const result = [];

  const networks = data.networks || {};

  for (const [networkName, net] of Object.entries(networks)) {
    result.push(`\n====================`);
    result.push(`RED: ${networkName}`);
    result.push(`====================\n`);

    const nodes = net.nodes || [];
    const links = net.links || [];

    if (!nodes.length) {
      result.push("(vacía)\n");
      continue;
    }

    const adjacency = {};
    const nodeMap = {};

    nodes.forEach(n => {
      nodeMap[n.id] = n;
      adjacency[n.id] = new Set();
    });

    links.forEach(l => {
      const a = l.from.nodeId;
      const b = l.to.nodeId;
      if (adjacency[a] && adjacency[b]) {
        adjacency[a].add(b);
        adjacency[b].add(a);
      }
    });

    const visited = new Set();
    let groupIndex = 1;

    function bfs(startId) {
      const queue = [startId];
      const group = [];

      visited.add(startId);

      while (queue.length) {
        const id = queue.shift();
        group.push(id);

        for (const n of adjacency[id] || []) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      result.push(`-- Subred ${groupIndex++} --`);

      for (const id of group) {
        const n = nodeMap[id];
        result.push(`${n.name} (${n.type})`);
      }

      result.push("");
    }

    for (const id of Object.keys(nodeMap)) {
      if (!visited.has(id)) {
        bfs(id);
      }
    }
  }

  const blob = new Blob([result.join("\n")], { type: "text/plain" });
  const baseName = db.filename?.trim() || "Sin nombre";
  await saveBlob(blob, `${baseName}.txt`);
}

function exportPNG() {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;

  tempCtx.fillStyle = "white";
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  tempCtx.drawImage(canvas, 0, 0);

  const baseName = db.filename?.trim() || "Sin nombre";
  tempCanvas.toBlob((blob) => {
    saveBlob(blob, `${baseName}.png`);
  });
}

// =====================
// DRAG & DROP
// =====================

canvas.addEventListener("dragover", (e) => {
  e.preventDefault();
  canvas.style.border = "2px dashed blue";
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
  if (!confirm("¿Estás seguro de que quieres borrar todos los elementos?"))
    return;

  db = {
    filename: "",
    networks: {
      network: { nodes: [], areas: [], links: [] }
    },
    activeNetwork: "network"
  };

  rebuildNodeMap();
  rebuildAreaMap();
  rebuildLinkGroups();

  updateNetworkSelector();
  rebuildNodeMap(); rebuildAreaMap(); rebuildLinkGroups();

  updateFilenameUI();

  resetState();
  requestRender();
}

function resetState() {
  ui.selection.node = null;
  ui.selection.area = null;
  ui.selection.link = null;
  linkStart = null;

  ui.mode = "idle";
  // draggingArea = null;
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
    switch3: loadIcon(`img/devices/${setName}/switch3.svg`),
    ap: loadIcon(`img/devices/${setName}/ap.svg`),
    hub: loadIcon(`img/devices/${setName}/hub.svg`),
    pc: loadIcon(`img/devices/${setName}/pc.svg`),
    server: loadIcon(`img/devices/${setName}/server.svg`),
    nas: loadIcon(`img/devices/${setName}/nas.svg`),
    printer: loadIcon(`img/devices/${setName}/printer.svg`),
    screen: loadIcon(`img/devices/${setName}/screen.svg`),
    ipphone: loadIcon(`img/devices/${setName}/ipphone.svg`),
    patch: loadIcon(`img/devices/${setName}/patch.svg`),
    cloud: loadIcon(`img/devices/${setName}/cloud.svg`),
    area: loadIcon(`img/devices/symbol/area.svg`),
    north: loadIcon(`img/buttons/link/north.svg`)
  };

  requestRender();
}

function changeIconSet(setName, label) {
  loadIconSet(setName);

  document.getElementById("iconSetLabel").textContent = label;
  document.getElementById(
    "iconSetPreview"
  ).src = `img/devices/${setName}/router.svg`;

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

fetch("data/example.json.gz")
  .then((response) => {
    if (!response.ok) throw new Error("No se encontró example.json.gz");
    return response.blob();
  })
  .then((blob) => importFile(blob))
  .then(() => {
    updateNetworkSelector();
  })
  .catch((err) => {
    console.warn("No se pudo cargar example.json.gz:", err.message);
  });

async function init() {
  ui.tool = "select";

  setActiveToolButton("select");

  const savedIconSet = localStorage.getItem("iconSet") || "symbol";
  loadIconSet(savedIconSet);
  const label = savedIconSet === "real" ? "Realista" : "Simbólica";
  document.getElementById("iconSetLabel").textContent = label;
  document.getElementById(
    "iconSetPreview"
  ).src = `img/devices/${savedIconSet}/router.svg`;

  resetZoom();

  updateFilenameUI();

  updateNetworkSelector()

  clearInspector();
  updateCursor();
  requestRender();

  await loadTemplate();
}

init();

// =====================
// AYUDA Y MISCELÁNEA
// =====================

function openHelp() {
  window.open("help.html", "_blank");
}

