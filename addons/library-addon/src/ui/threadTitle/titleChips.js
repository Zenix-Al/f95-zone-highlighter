import { normalizeVersionIdentity } from "../../library/updateEventModel.js";

const CHIP_CONTAINER_CLASS = "f95ue-library-title-chips";
const CHIP_COLOR_CLASSES = {
  playing: "label--royalBlue",
  completed: "label--green",
  dropped: "label--red",
  "new-version": "label--orange",
  "updates-off": "label--subtle",
};

export function getThreadTitleChips(record) {
  if (!record?.threadId) return [];
  const chips = [];
  const status = String(record.personal?.status || "saved")
    .trim()
    .toLowerCase();
  if (["playing", "completed", "dropped"].includes(status)) {
    chips.push({
      kind: status,
      text: status[0].toUpperCase() + status.slice(1),
    });
  }

  const currentVersion = normalizeVersionIdentity(
    record.thread?.currentVersion,
  );
  const lastPlayedVersion = normalizeVersionIdentity(
    record.personal?.lastPlayedVersion,
  );
  if (
    currentVersion &&
    lastPlayedVersion &&
    currentVersion !== lastPlayedVersion
  ) {
    chips.push({ kind: "new-version", text: "New version" });
  }

  if (record.updateCheck?.enabled === false) {
    chips.push({ kind: "updates-off", text: "Updates off" });
  }
  return chips;
}

export function clearThreadTitleChips(root = document) {
  root
    .querySelectorAll?.(`.${CHIP_CONTAINER_CLASS}`)
    .forEach((element) => element.remove());
}

export function renderThreadTitleChips(record, root = document) {
  clearThreadTitleChips(root);
  const chips = getThreadTitleChips(record);
  if (chips.length === 0) return false;
  const title = root.querySelector?.("h1.p-title-value");
  if (!title) return false;

  const container = document.createElement("span");
  container.className = CHIP_CONTAINER_CLASS;
  container.dataset.libraryThreadId = String(record.threadId);
  for (const chip of chips) {
    const spacer = document.createElement("span");
    spacer.className = "label-append";
    spacer.textContent = "\u00a0";
    container.appendChild(spacer);
    const element = document.createElement("span");
    const colorClass = CHIP_COLOR_CLASSES[chip.kind] || "label--subtle";
    element.className = `label ${colorClass} f95ue-library-title-chip`;
    element.dataset.kind = chip.kind;
    element.dir = "auto";
    element.textContent = chip.text;
    container.appendChild(element);
  }
  title.appendChild(container);
  return true;
}
