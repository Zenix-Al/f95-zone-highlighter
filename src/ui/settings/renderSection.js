import { renderSetting } from "./renderSetting";

export function renderSection(containerId, metaMap) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  Object.entries(metaMap).forEach(([key, meta]) => {
    container.appendChild(renderSetting(key, meta));
  });
}
