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

async function compressJSON(data) {
    const json = JSON.stringify(data);

    const stream = new Blob([json]).stream();

    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));

    return await new Response(compressedStream).blob();
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

async function exportTXT(data) {
    const result = [];

    const networks = data.networks || {};

    const networkNames = Object.keys(networks).sort((a,b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    for (const networkName of networkNames) {
        const net = networks[networkName];
        result.push(`\n====================`);
        result.push(`RED: ${networkName}`);
        result.push(`====================\n`);

        const nodes = net.nodes || [];
        const links = net.links || [];

        if (!nodes.length) {
            result.push("(vacía)\n");
            continue;
        }

        // Map nodes
        const nodeMap = {};
        nodes.forEach(n => nodeMap[n.id] = n);

        // Build adjacency map with counts (to detect double/parallel links)
        const adjacency = {};
        nodes.forEach(n => adjacency[n.id] = {});

        links.forEach(l => {
            const a = l.from?.nodeId;
            const b = l.to?.nodeId;
            if (!a || !b || !adjacency[a] || !adjacency[b]) return;

            adjacency[a][b] = (adjacency[a][b] || 0) + 1;
            adjacency[b][a] = (adjacency[b][a] || 0) + 1;
        });

        // Detect areas and assign nodes to areas (anidamiento)
        const areas = net.areas || [];
        const areasMap = {};
        areas.forEach(a => areasMap[a.id] = a);

        const areaNodes = {};
        areas.forEach(a => areaNodes[a.id] = []);

        const nodeToArea = {};
        nodes.forEach(n => {
            nodeToArea[n.id] = null;
            if (n.position && areas.length) {
                for (const a of areas) {
                    const ax = a.position?.x || 0;
                    const ay = a.position?.y || 0;
                    const w = a.size?.width || 0;
                    const h = a.size?.height || 0;
                    if (n.position.x >= ax && n.position.x <= ax + w && n.position.y >= ay && n.position.y <= ay + h) {
                        areaNodes[a.id].push(n.id);
                        nodeToArea[n.id] = a.id;
                        break;
                    }
                }
            }
        });

        // Nodes not in any area
        const unassigned = nodes.map(n => n.id).filter(id => !nodeToArea[id]);

        // Helper to print neighbors (first-level) with counts and area labels
        function printNeighbors(id, indent) {
            const neigh = adjacency[id] || {};
            const keys = Object.keys(neigh).sort();
            if (!keys.length) {
                result.push(`${' '.repeat(indent)}(sin enlaces)`);
                return;
            }
            for (const nbr of keys) {
                const cnt = neigh[nbr] || 0;
                const areaLabel = nodeToArea[nbr] ? `area: ${areasMap[nodeToArea[nbr]].name}` : "sin área";
                result.push(`${' '.repeat(indent)}-> ${nodeMap[nbr].name} (${nodeMap[nbr].type})${cnt > 1 ? ` x${cnt}` : ""} [${areaLabel}]`);
            }
        }

        // Print by areas (nesting)
        if (areas.length) {
            for (const a of areas) {
                result.push(`Area: ${a.name}`);
                const list = areaNodes[a.id] || [];
                if (!list.length) {
                    result.push(`  (vacía)`);
                } else {
                    for (const id of list) {
                        const n = nodeMap[id];
                        result.push(`  - ${n.name} (${n.type})`);
                        printNeighbors(id, 6);
                    }
                }
                result.push("");
            }
        }

        // Print unassigned nodes (outside areas)
        if (unassigned.length) {
            result.push(`Sin área:`);
            for (const id of unassigned) {
                const n = nodeMap[id];
                result.push(`  - ${n.name} (${n.type})`);
                printNeighbors(id, 6);
            }
            result.push("");
        }
    }

    const blob = new Blob([result.join("\n")], { type: "text/plain" });
    const baseName = db.filename?.trim() || "Sin nombre";
    await saveBlob(blob, `${baseName}.txt`);
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