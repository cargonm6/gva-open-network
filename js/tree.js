async function generarArbol(data, filename = "arbol_red.txt") {
    const { nodes, links } = data;

    // 1️⃣ Crear un mapa de nodos por id
    const nodeMap = {};
    nodes.forEach(node => {
        nodeMap[node.id] = { ...node, children: new Set() };
    });

    // 2️⃣ Registrar relaciones bidireccionales
    links.forEach(link => {
        const from = link.from.nodeId;
        const to = link.to.nodeId;
        if (nodeMap[from] && nodeMap[to]) {
            nodeMap[from].children.add(to);
            nodeMap[to].children.add(from);
        }
    });

    const visited = new Set();
    const result = [];

    // 3️⃣ DFS para generar árbol con líneas
    function dfs(nodeId, prefix = "", isLast = true, isRoot = false) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const pointer = isRoot ? "" : (prefix + (isLast ? "└─ " : "├─ "));
        result.push(pointer + nodeMap[nodeId].name + " (" + nodeMap[nodeId].type + ")");

        const children = Array.from(nodeMap[nodeId].children).filter(id => !visited.has(id));
        children.forEach((childId, index) => {
            const lastChild = index === children.length - 1;
            dfs(childId, prefix + (isLast ? "   " : "│  "), lastChild);
        });
    }

    // 4️⃣ Recorrer todos los nodos conectados
    Object.keys(nodeMap).forEach(nodeId => {
        if (!visited.has(nodeId) && nodeMap[nodeId].children.size > 0) {
            dfs(nodeId, "", true, true); // raíz sin línea
        }
    });

    // 5️⃣ Agregar nodos sueltos al final
    Object.keys(nodeMap).forEach(nodeId => {
        if (!visited.has(nodeId)) {
            result.push(nodeMap[nodeId].name + " (" + nodeMap[nodeId].type + ")");
        }
    });

    // 6️⃣ Descargar el resultado como archivo .txt
    const blob = new Blob([result.join("\n")], { type: "text/plain" });
    const baseName = db.filename?.trim() || "untitled";
    await saveBlob(blob, `${baseName}.txt`);
}