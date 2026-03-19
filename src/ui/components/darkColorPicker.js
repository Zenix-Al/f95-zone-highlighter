function normalizeHex(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return (
      "#" +
      raw
        .split("")
        .map((ch) => ch + ch)
        .join("")
        .toLowerCase()
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  return null;
}

function hexToRgb(hex) {
  const clean = normalizeHex(hex);
  if (!clean) return null;
  const parsed = clean.slice(1);
  const int = Number.parseInt(parsed, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  const l = (max + min) / 2;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = 60 * (((gn - bn) / delta) % 6);
        break;
      case gn:
        h = 60 * ((bn - rn) / delta + 2);
        break;
      default:
        h = 60 * ((rn - gn) / delta + 4);
        break;
    }
  }

  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
  const hn = ((Number(h) % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, Number(s))) / 100;
  const ln = Math.max(0, Math.min(100, Number(l))) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hn < 60) {
    r1 = c;
    g1 = x;
  } else if (hn < 120) {
    r1 = x;
    g1 = c;
  } else if (hn < 180) {
    g1 = c;
    b1 = x;
  } else if (hn < 240) {
    g1 = x;
    b1 = c;
  } else if (hn < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, l: 50 };
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function hslToHex(h, s, l) {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function updateSwatch(input) {
  const valid = normalizeHex(input.value) || "#000000";
  input.value = valid;
  input.style.backgroundColor = valid;
  input.title = valid;
}

let activeState = null;

function closePicker(commit = false) {
  if (!activeState) return;
  const { panel, input, initialValue, onDocPointerDown } = activeState;

  panel.classList.remove("open");
  if (panel.parentNode) {
    panel.parentNode.removeChild(panel);
  }

  document.removeEventListener("pointerdown", onDocPointerDown, true);

  if (commit) {
    const next = normalizeHex(input.value);
    if (next && next !== initialValue) {
      input.value = next;
      updateSwatch(input);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else {
    input.value = initialValue;
    updateSwatch(input);
  }

  activeState = null;
}

function createPickerPanel(input) {
  const panel = document.createElement("div");
  panel.className = "dark-color-popover";

  const preview = document.createElement("div");
  preview.className = "dark-color-preview";

  const hexInput = document.createElement("input");
  hexInput.className = "dark-color-hex";
  hexInput.type = "text";
  hexInput.maxLength = 7;

  const hue = document.createElement("input");
  hue.type = "range";
  hue.min = "0";
  hue.max = "360";
  hue.className = "dark-color-slider hue";

  const sat = document.createElement("input");
  sat.type = "range";
  sat.min = "0";
  sat.max = "100";
  sat.className = "dark-color-slider";

  const light = document.createElement("input");
  light.type = "range";
  light.min = "0";
  light.max = "100";
  light.className = "dark-color-slider";

  const labels = document.createElement("div");
  labels.className = "dark-color-labels";
  labels.innerHTML = "<span>H</span><span>S</span><span>L</span>";

  const sliders = document.createElement("div");
  sliders.className = "dark-color-sliders";
  sliders.append(hue, sat, light);

  const footer = document.createElement("div");
  footer.className = "dark-color-footer";

  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "dark-color-btn apply";
  applyBtn.textContent = "Apply";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "dark-color-btn";
  cancelBtn.textContent = "Cancel";

  footer.append(applyBtn, cancelBtn);
  panel.append(preview, hexInput, labels, sliders, footer);

  const setFromHex = (hex) => {
    const valid = normalizeHex(hex);
    if (!valid) return;
    const hsl = hexToHsl(valid);
    hue.value = String(hsl.h);
    sat.value = String(hsl.s);
    light.value = String(hsl.l);
    hexInput.value = valid;
    input.value = valid;
    preview.style.backgroundColor = valid;
    updateSwatch(input);
  };

  const setFromHsl = () => {
    const next = hslToHex(hue.value, sat.value, light.value);
    hexInput.value = next;
    input.value = next;
    preview.style.backgroundColor = next;
    updateSwatch(input);
  };

  hue.addEventListener("input", setFromHsl);
  sat.addEventListener("input", setFromHsl);
  light.addEventListener("input", setFromHsl);

  hexInput.addEventListener("input", () => {
    const normalized = normalizeHex(hexInput.value);
    if (normalized) {
      setFromHex(normalized);
    }
  });

  applyBtn.addEventListener("click", () => closePicker(true));
  cancelBtn.addEventListener("click", () => closePicker(false));

  return { panel, setFromHex };
}

function openPicker(input) {
  if (activeState?.input === input) return;
  closePicker(false);

  const initialValue = normalizeHex(input.value) || "#000000";
  input.value = initialValue;
  updateSwatch(input);

  const { panel, setFromHex } = createPickerPanel(input);
  setFromHex(initialValue);

  const root = input.getRootNode();
  const modalContent = input.closest(".modal-content");
  const mountTarget =
    modalContent || (root && typeof root.appendChild === "function" ? root : document.body);
  mountTarget.appendChild(panel);

  const rect = input.getBoundingClientRect();
  const panelWidth = 220;
  const left = Math.max(8, Math.min(window.innerWidth - panelWidth - 8, rect.left));
  const top = rect.bottom + 8;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.classList.add("open");

  const onDocPointerDown = (ev) => {
    const path = ev.composedPath ? ev.composedPath() : [];
    if (path.includes(panel) || path.includes(input)) return;
    closePicker(true);
  };

  document.addEventListener("pointerdown", onDocPointerDown, true);

  activeState = {
    panel,
    input,
    initialValue,
    onDocPointerDown,
  };
}

export function attachDarkColorPicker(input) {
  input.classList.add("config-color-input");
  input.type = "text";
  input.readOnly = true;
  input.inputMode = "none";
  input.autocomplete = "off";

  updateSwatch(input);
  input.addEventListener("input", () => updateSwatch(input));
  input.addEventListener("click", (ev) => {
    ev.preventDefault();
    openPicker(input);
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      openPicker(input);
    }
  });
}
