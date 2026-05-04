function generateUniqueId(type, collection) {
  let id;
  do {
    id = `${type}_${Math.floor(Math.random() * 10000)}`;
  } while (collection.some((item) => item.id === id));
  return id;
}

function worldToScreen(x, y) {
  return {
    x: x * view.scale + view.offsetX,
    y: y * view.scale + view.offsetY,
  };
}

function screenToWorld(x, y) {
  return {
    x: (x - view.offsetX) / view.scale,
    y: (y - view.offsetY) / view.scale,
  };
}

function getMousePos(evt) {
  const r = canvas.getBoundingClientRect();

  const x = evt.clientX - r.left;
  const y = evt.clientY - r.top;

  return screenToWorld(x, y);
}

function getNodeSize(n) {
  if (n.type === "image") {
    return {
      w: n.size?.width ?? 150,
      h: n.size?.height ?? 150
    };
  }

  return {
    w: n._width ?? node_w,
    h: n._height ?? node_h
  };
}