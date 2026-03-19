let activePointerDrag = null;
let pointerCleanupHooksInstalled = false;
let getShadowRootRef = () => null;

const CONTAINERS = [
  { id: "preferred-tags-list", key: "preferredTags" },
  { id: "excluded-tags-list", key: "excludedTags" },
  { id: "marked-tags-list", key: "markedTags" },
];

function getContainerListKeyById(containerId) {
  const match = CONTAINERS.find((c) => c.id === containerId);
  return match ? match.key : null;
}

function parseDragData(raw) {
  const parts = String(raw || "").split(":");
  return {
    fromList: parts[0] || null,
    fromIndex: Number(parts[1]),
  };
}

function markPotentialDropTargets(fromListKey) {
  const sr = getShadowRootRef();
  if (!sr) return;
  const containers = Array.from(sr.querySelectorAll(".tag-list-container"));
  containers.forEach((container) => {
    const key = getContainerListKeyById(container.id);
    if (!key || key === fromListKey) return;
    container.classList.add("drag-target");
  });
}

function clearPotentialDropTargets() {
  const sr = getShadowRootRef();
  if (!sr) return;
  const containers = Array.from(sr.querySelectorAll(".tag-list-container"));
  containers.forEach((container) => {
    container.classList.remove("drag-target");
    container.classList.remove("drag-over");
  });
}

function clearHoveredItem() {
  if (activePointerDrag?.hoveredItem) {
    activePointerDrag.hoveredItem.classList.remove("drag-over");
    activePointerDrag.hoveredItem = null;
  }
}

function cleanupActivePointerDrag() {
  if (!activePointerDrag) return;

  clearHoveredItem();
  clearPotentialDropTargets();

  try {
    activePointerDrag.ghost?.remove();
  } catch {
    // ignore
  }

  if (activePointerDrag.onMove) window.removeEventListener("pointermove", activePointerDrag.onMove);
  if (activePointerDrag.onUp) window.removeEventListener("pointerup", activePointerDrag.onUp);

  try {
    activePointerDrag.item?.classList?.remove("dragging");
  } catch {
    // ignore
  }

  activePointerDrag = null;
}

function copyChipStyleToGhost(item, ghost) {
  try {
    const cs = window.getComputedStyle(item);
    ghost.style.background = cs.backgroundColor;
    ghost.style.color = cs.color;
    ghost.style.borderRadius = cs.borderRadius;
    ghost.style.fontSize = cs.fontSize;
    ghost.style.fontWeight = cs.fontWeight;
    ghost.style.height = cs.height;
    ghost.style.lineHeight = cs.lineHeight;
    ghost.style.padding = cs.padding;
    ghost.style.display = cs.display;
    ghost.style.alignItems = cs.alignItems;
    ghost.style.minWidth = cs.minWidth;
  } catch {
    // ignore
  }
}

function updatePointerDragHighlights(x, y) {
  if (!activePointerDrag) return;

  const over = activePointerDrag.sr.elementFromPoint(x, y);
  if (!over) return;

  const containers = Array.from(activePointerDrag.sr.querySelectorAll(".tag-list-container"));
  containers.forEach((c) => c.classList.remove("drag-over"));

  const container = over.closest ? over.closest(".tag-list-container") : null;
  if (container) {
    const toListKey = getContainerListKeyById(container.id);
    if (toListKey !== activePointerDrag.fromListKey) container.classList.add("drag-over");
  }

  const hoveredItem = over.closest ? over.closest(".tag-list-item") : null;
  if (activePointerDrag.hoveredItem && activePointerDrag.hoveredItem !== hoveredItem) {
    activePointerDrag.hoveredItem.classList.remove("drag-over");
    activePointerDrag.hoveredItem = null;
  }
  if (hoveredItem && hoveredItem !== activePointerDrag.item) {
    hoveredItem.classList.add("drag-over");
    activePointerDrag.hoveredItem = hoveredItem;
  }
}

function handlePointerDrop({ x, y, onDropOnItem, onDropOnContainer }) {
  if (!activePointerDrag) return;

  const over = activePointerDrag.sr.elementFromPoint(x, y);
  if (!over) return;

  const itemEl = over.closest ? over.closest(".tag-list-item") : null;
  const container = over.closest ? over.closest(".tag-list-container") : null;

  if (itemEl?.dataset?.index != null) {
    const toIndex = Number(itemEl.dataset.index);
    const toListKey =
      getContainerListKeyById(container?.id) ??
      CONTAINERS.find((c) => itemEl.closest(`#${c.id}`))?.key ??
      null;

    if (!toListKey) return;
    onDropOnItem({
      fromList: activePointerDrag.fromListKey,
      fromIndex: activePointerDrag.fromIndex,
      toListKey,
      toIndex,
    });
    return;
  }

  if (container) {
    onDropOnContainer({
      fromList: activePointerDrag.fromListKey,
      fromIndex: activePointerDrag.fromIndex,
      toListKey: getContainerListKeyById(container.id),
    });
  }
}

export function ensurePointerCleanupHooks(getShadowRoot) {
  getShadowRootRef = getShadowRoot;
  if (pointerCleanupHooksInstalled) return;

  window.addEventListener("pointercancel", cleanupActivePointerDrag);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cleanupActivePointerDrag();
  });

  pointerCleanupHooksInstalled = true;
}

export function ensureContainerDropHandlers({ container, listKey, onDropOnContainer }) {
  if (!container || container.dataset.dropInit) return;
  container.dataset.dropInit = "1";

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const { fromList } = parseDragData(e.dataTransfer?.getData("text/plain"));
    if (fromList && fromList !== listKey) container.classList.add("drag-over");
  });

  container.addEventListener("dragenter", (e) => {
    e.preventDefault();
    const { fromList } = parseDragData(e.dataTransfer?.getData("text/plain"));
    if (fromList && fromList !== listKey) container.classList.add("drag-over");
  });

  container.addEventListener("dragleave", () => {
    container.classList.remove("drag-over");
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.classList.remove("drag-over");
    const { fromList, fromIndex } = parseDragData(e.dataTransfer?.getData("text/plain"));
    if (!fromList) return;

    onDropOnContainer({ fromList, fromIndex, toListKey: listKey });
  });
}

export function createTagChipItem({
  tag,
  index,
  itemClass,
  removeBtnClass,
  listKey,
  onRemove,
  onDropOnItem,
  onDropOnContainer,
  getShadowRoot,
}) {
  const item = document.createElement("div");
  item.className = `tag-list-item ${itemClass} tag-chip`;
  item.dataset.index = String(index);
  item.draggable = true;

  const text = document.createElement("span");
  text.textContent = tag.name;

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "X";
  removeBtn.className = `tag-remove-btn ${removeBtnClass}`;
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove(index, tag);
  });

  item.addEventListener("dragstart", (e) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${String(listKey)}:${String(index)}`);
    item.classList.add("dragging");
    markPotentialDropTargets(listKey);
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    clearPotentialDropTargets();
  });

  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    item.classList.add("drag-over");
  });

  item.addEventListener("dragleave", () => {
    item.classList.remove("drag-over");
  });

  item.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation(); // prevent container drop handler from double-firing
    item.classList.remove("drag-over");

    const { fromList, fromIndex } = parseDragData(e.dataTransfer?.getData("text/plain"));
    if (!fromList) return;

    onDropOnItem({
      fromList,
      fromIndex,
      toListKey: listKey,
      toIndex: index,
    });
  });

  item.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

    e.preventDefault();
    item.setPointerCapture?.(e.pointerId);

    const sr = getShadowRoot();
    if (!sr) return;

    const rect = item.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const ghost = item.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.style.position = "fixed";
    ghost.style.left = `${e.clientX - offsetX}px`;
    ghost.style.top = `${e.clientY - offsetY}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = 12000;
    copyChipStyleToGhost(item, ghost);
    document.body.appendChild(ghost);

    activePointerDrag = {
      ghost,
      fromListKey: listKey,
      fromIndex: index,
      offsetX,
      offsetY,
      sr,
      item,
      pointerId: e.pointerId,
      hoveredItem: null,
      onMove: null,
      onUp: null,
    };

    item.classList.add("dragging");
    markPotentialDropTargets(listKey);

    const onMove = (ev) => {
      if (!activePointerDrag) return;
      activePointerDrag.ghost.style.left = `${ev.clientX - activePointerDrag.offsetX}px`;
      activePointerDrag.ghost.style.top = `${ev.clientY - activePointerDrag.offsetY}px`;
      updatePointerDragHighlights(ev.clientX, ev.clientY);
    };

    const onUp = (ev) => {
      if (!activePointerDrag) return;

      handlePointerDrop({
        x: ev.clientX,
        y: ev.clientY,
        onDropOnItem,
        onDropOnContainer,
      });

      try {
        item.releasePointerCapture?.(ev.pointerId);
      } catch {
        // ignore
      }

      cleanupActivePointerDrag();
    };

    activePointerDrag.onMove = onMove;
    activePointerDrag.onUp = onUp;

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  item.appendChild(text);
  item.appendChild(removeBtn);
  return item;
}
