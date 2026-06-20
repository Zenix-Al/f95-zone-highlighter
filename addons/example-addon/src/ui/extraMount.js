import { escapeHtml } from "../../../shared/htmlUtils.js";

export function renderExtraMount(counter = 0) {
  return `
    <div class="f95ue-example-extra">
      Extra mount active via <code>ui.mount</code> / <code>ui.update</code><br />
      revision: ${escapeHtml(String(counter || 0))}
    </div>
  `;
}
