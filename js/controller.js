const actions = {
    "file-new": () => clearAll(),

    "file-import": () => triggerImportFile(),

    "export": (el) => exportFile(el.dataset.format === "gzip"),

    "export-png": () => exportPNG(),
    "export-txt": () => exportTXT(db),

    "sheet-add": () => createNetwork(),
    "sheet-delete": () => deleteNetwork(),
    "sheet-import": () => triggerImportSheet(),
    "sheet-rename": () => renameCurrentNetwork(),

    "help": () => openHelp(),

    "tool": (el) => toggleTool(el.dataset.tool, el),

    "image": () => triggerImportImage(),

    "reset-ids": () => resetAllIds(),

    "change-icons": (el) => changeIconSet(el.dataset.value),

    "toggle-grid": () => toggleGrid(),
    "toggle-ports": () => togglePorts(),
    "toggle-tooltip": () => toggleTooltip(),

    "jumpToNode": (el) => {
        const node = nodeMap.get(el.dataset.nodeid);
        if (!node) return;

        ui.selection.node = node;
        ui.selection.area = null;
        ui.selection.link = null;

        updateNodeInspector(node);
        requestRender();
    }
};

function openHelp() {
    window.open("help.html", "_blank");
}


// Selector de red (hoja)

document.getElementById("networkSelector").addEventListener("change", (e) => {
    db.activeNetwork = e.target.value;

    rebuildNodeMap();
    rebuildAreaMap();
    rebuildLinkGroups();

    resetState();
    requestRender();
});

// MOUSE CLICK

document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.dataset.action;

    actions[action]?.(el);
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

// Triggers

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

function triggerImportFile() {
    const input = document.getElementById("importFile");
    input.value = "";
    input.click();

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) importFile(file);
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

// Importar archivos

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

// Importar hojas

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