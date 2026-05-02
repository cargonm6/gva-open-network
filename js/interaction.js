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

    if (["link-ethernet", "link-wireless", "link-wan", "link-console"].includes(ui.tool)) {
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