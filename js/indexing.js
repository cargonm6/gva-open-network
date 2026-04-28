function rebuildNodeMap() {
  nodeMap.clear();
  getNodes().forEach(n => nodeMap.set(n.id, n));
}

function rebuildAreaMap() {
  areaMap.clear();
  getAreas().forEach(a => areaMap.set(a.id, a));
}

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

function getNode(id) {
  return nodeMap.get(id);
}

function getArea(id) {
  return areaMap.get(id);
}