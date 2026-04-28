let db = {
    filename: "",
    networks: {
        network: { nodes: [], areas: [], links: [] }
    },
    activeNetwork: "network"
};

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

let view = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
};

let nodeMap = new Map();

let areaMap = new Map();

let linkGroups = new Map();