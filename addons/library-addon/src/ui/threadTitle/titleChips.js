import {
  hasUnacknowledgedUpdate,
  hasUnplayedCurrentVersion,
} from "../../library/versionState.js";

const CHIP_CONTAINER_CLASS = "f95ue-library-title-chips";
const CHIP_COLOR_CLASSES = {
  saved: "label--subtle",
  backlog: "label--yellow",
  playing: "label--royalBlue",
  paused: "label--olive",
  completed: "label--green",
  dropped: "label--red",
  "update-pending": "label--orange",
  "unplayed-current-version": "label--royalBlue",
  "updates-off": "label--subtle",
};
const CHIP_STYLES = {
  saved: { backgroundColor: "#4b5563", color: "#f3f4f6" },
  backlog: { backgroundColor: "#9a6700", color: "#fff7d6" },
  playing: { backgroundColor: "#2563a6", color: "#e6f2ff" },
  paused: { backgroundColor: "#6750a4", color: "#f2eaff" },
  completed: { backgroundColor: "#2f855a", color: "#e7fff0" },
  dropped: { backgroundColor: "#a13d3d", color: "#fff0f0" },
  "update-pending": { backgroundColor: "#9a6700", color: "#fff7d6" },
  "unplayed-current-version": { backgroundColor: "#2563a6", color: "#e6f2ff" },
  "updates-off": { backgroundColor: "#4b5563", color: "#f3f4f6" },
};

export function getThreadTitleChips(record) {
  if (!record?.threadId) return [];
  const chips = [];
  const status = String(record.personal?.status || "saved")
    .trim()
    .toLowerCase();
  if (Object.hasOwn(CHIP_STYLES, status)) {
    chips.push({
      kind: status,
      text: status[0].toUpperCase() + status.slice(1),
      description: `Library status: ${status}.`,
    });
  }

  if (hasUnacknowledgedUpdate(record)) {
    chips.push({
      kind: "update-pending",
      text: "Update pending",
      description: "A detected update has not been acknowledged.",
    });
  }

  if (hasUnplayedCurrentVersion(record)) {
    chips.push({
      kind: "unplayed-current-version",
      text: "Version unplayed",
      description: "The current version has not been marked played.",
    });
  }

  if (record.updateCheck?.enabled === false) {
    chips.push({
      kind: "updates-off",
      text: "Updates off",
      description: "Automatic update checks are disabled.",
    });
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
    element.setAttribute("aria-label", chip.description || chip.text);
    element.title = chip.description || chip.text;
    if (CHIP_STYLES[chip.kind]) {
      Object.assign(element.style, {
        display: "inline-block",
        borderRadius: "3px",
        fontWeight: "600",
        padding: "1px 5px",
        ...CHIP_STYLES[chip.kind],
      });
    }
    element.textContent = chip.text;
    container.appendChild(element);
  }
  title.appendChild(container);
  return true;
}
