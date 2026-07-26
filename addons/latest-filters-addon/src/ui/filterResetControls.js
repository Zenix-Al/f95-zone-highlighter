const CONTROL_ATTR = "data-f95ue-lf-reset";
const CONTROL_SELECTOR = `[${CONTROL_ATTR}]`;

function makeResetButton(kind) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button--primary f95ue-lf-reset-control";
  button.setAttribute(CONTROL_ATTR, kind);
  button.textContent = "Reset";
  return button;
}

function appendControl(container, kind) {
  if (!container || container.querySelector(`${CONTROL_SELECTOR}[${CONTROL_ATTR}="${kind}"]`)) {
    return false;
  }
  container.appendChild(makeResetButton(kind));
  return true;
}

export function getPrefixGroupIds(group) {
  return [
    ...new Set(
      [...(group?.querySelectorAll?.("input[data-prefix]") || [])]
        .map((input) => String(input.dataset?.prefix || "").trim())
        .filter((value) => /^\d+$/.test(value)),
    ),
  ];
}

export function createFilterResetControls({ onReset } = {}) {
  let bound = false;

  function onClick(event) {
    const control = event.target?.closest?.(CONTROL_SELECTOR);
    if (!control) return;
    event.preventDefault();
    const kind = String(control.getAttribute(CONTROL_ATTR) || "").trim();
    if (kind === "prefix-group") {
      const group = control.closest(".filter-block_prefix-group");
      onReset?.({ kind, prefixIds: getPrefixGroupIds(group) });
      return;
    }
    onReset?.({ kind, prefixIds: [] });
  }

  function bind() {
    if (bound) return;
    document.addEventListener("click", onClick);
    bound = true;
  }

  function reconcile(root = document) {
    bind();
    let added = 0;
    if (appendControl(root.querySelector("#filter-block_tags"), "tags")) {
      added += 1;
    }
    if (
      appendControl(
        root.querySelector("#filter-block_tags_exclude"),
        "notags",
      )
    ) {
      added += 1;
    }
    root
      .querySelectorAll(
        "#filter-block_prefixes .filter-block_prefix-group",
      )
      .forEach((group) => {
        const content = group.querySelector(".filter-block_content");
        if (appendControl(content, "prefix-group")) added += 1;
      });
    return { added, total: root.querySelectorAll(CONTROL_SELECTOR).length };
  }

  function remove(root = document) {
    root.querySelectorAll?.(CONTROL_SELECTOR).forEach((control) => control.remove());
  }

  function destroy() {
    remove();
    if (bound) document.removeEventListener("click", onClick);
    bound = false;
  }

  return { bind, destroy, reconcile, remove };
}
