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

const imageCache = new Map();

function getCachedImage(src) {
    if (!imageCache.has(src)) {
        const img = new Image();
        img.src = src;
        imageCache.set(src, img);
    }
    return imageCache.get(src);
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
        const img = getCachedImage(n.data);

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

            drawLine(l.type,
                ctx,
                f.position.x + node_w / 2 + ox,
                f.position.y + node_h / 2 + oy,
                t.position.x + node_w / 2 + ox,
                t.position.y + node_h / 2 + oy,
                isSelected);
        });
    }
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

function drawLine(type, ctx, x1, y1, x2, y2, isSelected = false) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);

    if (len === 0) return;

    const ux = dx / len;
    const uy = dy / len;

    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isSelected
        ? getColor("--color-alert")
        : (
            type === "wan"
                ? getColor("--color-link-wan")
                : type === "wireless"
                    ? getColor("--color-link-drawing")
                    : "black"
        );

    if (type === "wireless") {
        const nx = -uy;
        const ny = ux;

        const amplitude = 5;
        const wavelength = 20;
        const step = 2;

        for (let i = 0; i <= len; i += step) {
            const x = x1 + ux * i;
            const y = y1 + uy * i;

            const wave =
                Math.sin((i / wavelength) * Math.PI * 2) * amplitude;

            const px = x + nx * wave;
            const py = y + ny * wave;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }

    } else if (type === "wan") {
        const B = 5;
        const A = len * 0.5 + B;

        const px = -uy;
        const py = ux;

        const xA = x1 + ux * A + px * B;
        const yA = y1 + uy * A + py * B;

        const xC = x2 - ux * A - px * B;
        const yC = y2 - uy * A - py * B;

        ctx.moveTo(x1, y1);
        ctx.lineTo(xA, yA);
        ctx.lineTo(xC, yC);
        ctx.lineTo(x2, y2);

    } else {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
    }

    ctx.stroke();
}