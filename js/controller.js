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

    "toggle-inspector": () => {
        const inspector = document.getElementById("inspector");
        inspector.classList.toggle("collapsed");
        resizeCanvas();

        const handleTransitionEnd = (event) => {
            if (event.target === inspector && event.propertyName === "max-height") {
                resizeCanvas();
            }
        };

        inspector.addEventListener("transitionend", handleTransitionEnd, { once: true });
    },

    "tool": (el) => toggleTool(el.dataset.tool, el),

    "image": () => triggerImportImage(),

    "reset-ids": () => resetAllIds(),

    "search-equipment": (el) => toggleSearchMode(el),

    "change-icons": (el) => changeIconSet(el.dataset.value),

    "toggle-grid": () => toggleGrid(),
    "toggle-ports": () => togglePorts(),
    "toggle-tooltip": () => toggleTooltip(),
    "toggle-simulation": () => toggleSimulation(),

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

// SEARCH / BUSCAR EQUIPOS
function toggleSearchMode(buttonEl) {
    const container = document.getElementById("container");
    const overlay = document.getElementById("searchOverlay");
    const btn = document.getElementById("searchDevicesButton");

    const active = container.classList.toggle("search-active");

    if (active) {
        btn.classList.add("active");
        overlay.classList.remove("hidden");
        overlay.setAttribute("aria-hidden", "false");
        if (!overlay._initialized) createSearchOverlay(overlay);
        performSearch();
    } else {
        btn.classList.remove("active");
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
    }

    resizeCanvas();
}

function createSearchOverlay(overlay) {
    overlay._initialized = true;

    const id = overlay.querySelector('#searchId');
    const name = overlay.querySelector('#searchName');
    const chkNodes = overlay.querySelector('#searchChkNodes');
    const chkAreas = overlay.querySelector('#searchChkAreas');
    const chkLinks = overlay.querySelector('#searchChkLinks');
    const chkGraphics = overlay.querySelector('#searchChkGraphics');
    const keyword = overlay.querySelector('#searchKeyword');

    [id, name, keyword].forEach((el) => {
        el.addEventListener('input', () => performSearch());
    });
    [chkNodes, chkAreas, chkLinks, chkGraphics].forEach((el) => {
        el.addEventListener('change', () => performSearch());
    });
    // print button
    const printBtn = overlay.querySelector('#printResultsButton');
    if (printBtn) printBtn.addEventListener('click', () => printResults());

    // sortable headers
    const headers = overlay.querySelectorAll('#searchResultsTable thead th');
    overlay._sort = { col: null, asc: true };
    headers.forEach((th, idx) => {
        th.addEventListener('click', () => {
            const key = th.dataset.key || idx;
            if (overlay._sort.col === key) overlay._sort.asc = !overlay._sort.asc;
            else { overlay._sort.col = key; overlay._sort.asc = true; }
            // update classes
            headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
            th.classList.add(overlay._sort.asc ? 'sort-asc' : 'sort-desc');
            performSearch();
        });
    });

    // double-click row to jump
    overlay.querySelector('#searchResultsTable tbody').addEventListener('dblclick', (e) => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        const kind = tr.dataset.kind;
        const id = tr.dataset.itemId;
        if (kind === 'node') {
            // switch to the sheet first so nodeMap is rebuilt
            db.activeNetwork = tr.dataset.sheet;
            updateNetworkSelector();
            rebuildNodeMap(); rebuildAreaMap(); rebuildLinkGroups();
            const node = nodeMap.get(id);
            if (node) {
                ui.selection.node = node;
                ui.selection.area = null;
                ui.selection.link = null;
                updateNodeInspector(node);
                requestRender();
            }
        }
    });

    // click handler for id/sheet links
    overlay.querySelector('#searchResultsTable').addEventListener('click', (e) => {
        const a = e.target.closest('a.result-link');
        if (!a) return;
        e.preventDefault();
        const action = a.dataset.action;
        const sheet = a.dataset.sheet;
        const itemId = a.dataset.itemid;

        const btn = document.getElementById('searchDevicesButton');
        const container = document.getElementById('container');
        const overlayEl = document.getElementById('searchOverlay');

        // close search overlay (ensure closed state)
        if (container.classList.contains('search-active')) {
            // use toggleSearchMode to keep consistent behavior
            try { toggleSearchMode(btn); } catch (err) {
                container.classList.remove('search-active');
                btn.classList.remove('active');
                overlayEl.classList.add('hidden');
                overlayEl.setAttribute('aria-hidden', 'true');
                resizeCanvas();
            }
        }

        // switch to sheet then select item
        if (action === 'goto-sheet') {
            if (sheet) {
                db.activeNetwork = sheet;
                updateNetworkSelector();
                rebuildNodeMap(); rebuildAreaMap(); rebuildLinkGroups();
                resetState();
                requestRender();
            }
            return;
        }

        if (action === 'goto-id' && itemId) {
            if (!sheet) return;
            db.activeNetwork = sheet;
            updateNetworkSelector();
            rebuildNodeMap(); rebuildAreaMap(); rebuildLinkGroups();

            // try node
            const node = nodeMap.get(itemId);
            if (node) {
                ui.selection.node = node;
                ui.selection.area = null;
                ui.selection.link = null;
                updateNodeInspector(node);
                requestRender();
                return;
            }

            // try area
            const net = db.networks[sheet] || { nodes:[], areas:[], links:[] };
            const area = (net.areas || []).find(a => a.id === itemId);
            if (area) {
                ui.selection.area = area;
                ui.selection.node = null;
                ui.selection.link = null;
                updateAreaInspector(area);
                requestRender();
                return;
            }

            // try link
            const link = (net.links || []).find(l => l.id === itemId);
            if (link) {
                ui.selection.link = link;
                ui.selection.node = null;
                ui.selection.area = null;
                updateLinkInspector(link);
                requestRender();
                return;
            }
        }
    });
}

function performSearch() {
    const overlay = document.getElementById('searchOverlay');
    if (!overlay) return;
    const idFilter = overlay.querySelector('#searchId').value.trim().toLowerCase();
    const nameFilter = overlay.querySelector('#searchName').value.trim().toLowerCase();
    const nodesChecked = overlay.querySelector('#searchChkNodes').checked;
    const areasChecked = overlay.querySelector('#searchChkAreas').checked;
    const linksChecked = overlay.querySelector('#searchChkLinks').checked;
    const graphicsChecked = overlay.querySelector('#searchChkGraphics').checked;
    const typeFilter = overlay.querySelector('#searchKeyword').value.trim().toLowerCase();
    const tbody = overlay.querySelector('#searchResultsTable tbody');
    tbody.innerHTML = '';

    const results = [];

    for (const [sheetName, net] of Object.entries(db.networks)) {
        // nodes (non-graphic)
        if (nodesChecked) {
            for (const n of net.nodes || []) {
                const isGraphic = (n.type === 'image' || n.type === 'north');
                if (isGraphic) continue;
                if (idFilter && !(n.id || '').toLowerCase().includes(idFilter)) continue;
                if (nameFilter && !((n.name||'').toLowerCase().includes(nameFilter))) continue;
                if (typeFilter && !JSON.stringify(n).toLowerCase().includes(typeFilter)) continue;
                const pos = n.position ? `${n.position.x}, ${n.position.y}` : '';
                results.push({ id: n.id, name: n.name||'', type: n.type||'', sheet: sheetName, pos, props: n, kind: 'node', itemId: n.id });
            }
        }

        // graphics (image / north)
        if (graphicsChecked) {
            for (const n of net.nodes || []) {
                const isGraphic = (n.type === 'image' || n.type === 'north');
                if (!isGraphic) continue;
                if (idFilter && !(n.id || '').toLowerCase().includes(idFilter)) continue;
                if (nameFilter && !((n.name||'').toLowerCase().includes(nameFilter))) continue;
                if (typeFilter && !JSON.stringify(n).toLowerCase().includes(typeFilter)) continue;
                const pos = n.position ? `${n.position.x}, ${n.position.y}` : '';
                results.push({ id: n.id, name: n.name||'', type: n.type||'', sheet: sheetName, pos, props: n, kind: 'node', itemId: n.id });
            }
        }

        // areas
        if (areasChecked) {
            for (const a of net.areas || []) {
                if (idFilter && !(a.id||'').toLowerCase().includes(idFilter)) continue;
                if (nameFilter && !((a.name||'').toLowerCase().includes(nameFilter))) continue;
                if (typeFilter && !JSON.stringify(a).toLowerCase().includes(typeFilter)) continue;
                const pos = a.position && a.size ? `${a.position.x}, ${a.position.y} (${a.size.width}x${a.size.height})` : '';
                results.push({ id: a.id, name: a.name||'', type: 'area', sheet: sheetName, pos, props: a, kind: 'area', itemId: a.id });
            }
        }

        // links
        if (linksChecked) {
            for (const l of net.links || []) {
                if (idFilter && !(l.id||'').toLowerCase().includes(idFilter)) continue;
                if (nameFilter && !((l.name||'').toLowerCase().includes(nameFilter))) continue;
                if (typeFilter && !JSON.stringify(l).toLowerCase().includes(typeFilter)) continue;
                const pos = `from:${l.from?.nodeId||''} to:${l.to?.nodeId||''}`;
                results.push({ id: l.id, name: l.name||'', type: l.type||'link', sheet: sheetName, pos, props: l, kind: 'link', itemId: l.id });
            }
        }
    }

    // sort if requested
    const sort = overlay._sort || { col: null, asc: true };
    if (sort.col) {
        const key = sort.col;
        results.sort((a,b)=>{
            let va = a[key] ?? '';
            let vb = b[key] ?? '';
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return sort.asc ? -1 : 1;
            if (va > vb) return sort.asc ? 1 : -1;
            return 0;
        });
    }

    // render
    for (const r of results) {
        const tr = document.createElement('tr');
        tr.dataset.kind = r.kind;
        tr.dataset.itemId = r.itemId;
        tr.dataset.sheet = r.sheet;

        // ID and sheet are links
        const idLink = `<a href="#" class="result-link" data-action="goto-id" data-itemid="${escapeHtml(r.itemId)}" data-sheet="${escapeHtml(r.sheet)}">${escapeHtml(r.id)}</a>`;
        const sheetLink = `<a href="#" class="result-link" data-action="goto-sheet" data-sheet="${escapeHtml(r.sheet)}">${escapeHtml(r.sheet)}</a>`;

        tr.innerHTML = `<td>${idLink}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.type)}</td><td>${sheetLink}</td><td>${escapeHtml(r.pos)}</td><td>${escapeHtml(JSON.stringify(r.props, null, 0))}</td>`;
        tbody.appendChild(tr);
    }
    // update count
    const countEl = overlay.querySelector('#searchCount');
    if (countEl) countEl.textContent = `${results.length} registros`;
}

function printResults() {
    document.body.classList.add('print-mode');
    setTimeout(()=>{
        window.print();
        setTimeout(()=>document.body.classList.remove('print-mode'), 500);
    }, 50);
}

function escapeHtml(s) {
    return (''+s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".dropdown > .dropbtn");
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (toggle) {
        const dropdown = toggle.closest(".dropdown");
        if (isMobile) {
            document.querySelectorAll(".dropdown.open").forEach((opened) => {
                if (opened !== dropdown) opened.classList.remove("open");
            });
            dropdown?.classList.toggle("open");
        } else {
            document.querySelectorAll(".dropdown.open").forEach((opened) => {
                opened.classList.remove("open");
            });
        }
        return;
    }

    document.querySelectorAll(".dropdown.open").forEach((dropdown) => {
        dropdown.classList.remove("open");
    });
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
            if (ui.selection.node || ui.selection.area || ui.selection.link) {
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