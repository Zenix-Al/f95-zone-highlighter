const SHADOW_HOST_ID = "latest-highlighter-host";
const ADDON_SLOT_ID = "f95ue-page-dock-addon-slot";
const GROUP_ID = "f95ue-library-dock-group";
const PRIMARY_BUTTON_ID = "f95ue-library-quick-btn";
const MANAGER_BUTTON_ID = "f95ue-library-manager-btn";

function getDockSlot() {
  const host = document.getElementById(SHADOW_HOST_ID);
  return host?.shadowRoot?.getElementById(ADDON_SLOT_ID) || null;
}

function ensureDockGroup() {
  const slot = getDockSlot();
  if (!slot) return null;

  let group = slot.querySelector(`#${GROUP_ID}`);
  if (group) return group;

  group = document.createElement("div");
  group.id = GROUP_ID;
  group.className = "f95ue-page-dock-group";

  const primaryButton = document.createElement("button");
  primaryButton.id = PRIMARY_BUTTON_ID;
  primaryButton.type = "button";
  primaryButton.className = "f95ue-page-dock-btn";

  const managerButton = document.createElement("button");
  managerButton.id = MANAGER_BUTTON_ID;
  managerButton.type = "button";
  managerButton.textContent = "Library";
  managerButton.className = "f95ue-page-dock-btn secondary";

  group.appendChild(primaryButton);
  group.appendChild(managerButton);
  slot.appendChild(group);
  return group;
}

function updateButtonState(button, isSaved) {
  button.textContent = isSaved ? "Remove from Library" : "Save to Library";
  button.classList.toggle("saved", Boolean(isSaved));
}

export function mountQuickAddButton({ isSaved, onToggle, onOpenManager }) {
  const group = ensureDockGroup();
  const button = group?.querySelector(`#${PRIMARY_BUTTON_ID}`);
  const managerButton = group?.querySelector(`#${MANAGER_BUTTON_ID}`);
  if (!group || !button || !managerButton) {
    return () => {};
  }

  let currentSaved = Boolean(isSaved);
  updateButtonState(button, currentSaved);

  const onClick = async () => {
    button.disabled = true;
    try {
      const nextSaved = await onToggle(currentSaved);
      currentSaved = Boolean(nextSaved);
      updateButtonState(button, currentSaved);
    } finally {
      button.disabled = false;
    }
  };

  const onManagerClick = () => {
    if (typeof onOpenManager === "function") {
      onOpenManager();
    }
  };

  button.addEventListener("click", onClick);
  managerButton.addEventListener("click", onManagerClick);

  return () => {
    button.removeEventListener("click", onClick);
    managerButton.removeEventListener("click", onManagerClick);
    if (group.parentNode) {
      group.parentNode.removeChild(group);
    }
  };
}
