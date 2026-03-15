export function createEnabledDisabledToast(
  label,
  { enabled = "enabled", disabled = "disabled" } = {},
) {
  return (value) => `${label} ${value ? enabled : disabled}`;
}

export function createToggleSetting({ text, tooltip = "", config, custom = null, toast = null }) {
  const effects = {};
  if (typeof custom === "function") {
    effects.custom = custom;
  }
  if (typeof toast === "function") {
    effects.toast = toast;
  }

  return {
    type: "toggle",
    text,
    tooltip,
    config,
    effects,
  };
}

export function createColorSetting({ text, config, before, custom = null, toast = null }) {
  const effects = {};
  if (typeof custom === "function") {
    effects.custom = custom;
  }
  if (typeof toast === "function") {
    effects.toast = toast;
  }

  const setting = {
    type: "color",
    text,
    config,
    effects,
  };

  if (before) {
    setting.before = before;
  }

  return setting;
}

export function buildSettingsMap(entries) {
  return Object.fromEntries(entries);
}
