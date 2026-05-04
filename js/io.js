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