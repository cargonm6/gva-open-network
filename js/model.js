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