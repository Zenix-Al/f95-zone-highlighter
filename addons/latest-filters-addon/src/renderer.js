/**
 * Renderer helper for Latest Filters Add-on.
 *
 * Single responsibility: all HTML generation, CSS injection, and DOM mutations
 * for the saved-filters panel. Every function receives its data as explicit
 * arguments — this module holds no state and imports nothing from main.js.
 */

import { escapeHtml } from "../../shared/htmlUtils.js";
import panelCssTemplate from "./ui/panel.css";
import panelHtmlTemplate from "./ui/panel.html";
import dialogHtmlTemplate from "./ui/dialog.html";
import { createEl } from "../../shared/createEl.js";

// Shared CSS namespace prefix — must match the class names in createRootElement.
const NS = "f95ue-lf";

function buildTagRenderConfig(tagPrefs) {
  const source = tagPrefs && typeof tagPrefs === "object" ? tagPrefs : {};
  const byId = new Map();
  (Array.isArray(source.tags) ? source.tags : []).forEach((tag) => {
    const id = Number(tag?.id);
    const name = String(tag?.name || "").trim();
    if (Number.isFinite(id) && name) byId.set(id, name);
  });
  const toIdSet = (value) =>
    new Set((Array.isArray(value) ? value : []).map(Number).filter(Number.isFinite));
  return {
    byId,
    preferred: toIdSet(source.preferredTags),
    excluded: toIdSet(source.excludedTags),
    marked: toIdSet(source.markedTags),
    color: source.color && typeof source.color === "object" ? source.color : {},
  };
}

function renderTagChip(rawId, config) {
  const id = Number(rawId);
  const label = Number.isFinite(id) ? config.byId.get(id) || String(rawId) : String(rawId);
  let state = "";
  if (Number.isFinite(id)) {
    if (config.preferred.has(id)) state = "preferred";
    else if (config.excluded.has(id)) state = "excluded";
    else if (config.marked.has(id)) state = "marked";
  }
  const background = state ? String(config.color[state] || "").trim() : "";
  const foreground = state ? String(config.color[`${state}Text`] || "").trim() : "";
  const style =
    background || foreground
      ? ` style="${background ? `background:${escapeHtml(background)};border-color:${escapeHtml(background)};` : ""}${foreground ? `color:${escapeHtml(foreground)};` : ""}"`
      : "";
  return `<span class="${NS}-tag-chip"${state ? ` data-state="${state}"` : ""}${style}>${escapeHtml(label)}</span>`;
}

function renderSummary(parts, fallbackSummary, tagPrefs) {
  if (!Array.isArray(parts) || parts.length === 0) return escapeHtml(fallbackSummary);
  const tagConfig = buildTagRenderConfig(tagPrefs);
  return parts
    .map((part) => {
      const key = String(part?.key || "").toLowerCase();
      const label = escapeHtml(part?.label || key);
      const values = Array.isArray(part?.values) ? part.values : [];
      if (key === "tags" && values.length > 0) {
        return `<span class="${NS}-summary-part"><span class="${NS}-summary-label">${label}:</span><span class="${NS}-tag-list">${values.map((value) => renderTagChip(value, tagConfig)).join("")}</span></span>`;
      }
      const text = values.length > 0 ? `${part?.label}: ${values.join(", ")}` : part?.label;
      return `<span class="${NS}-summary-part">${escapeHtml(text)}</span>`;
    })
    .join(`<span class="${NS}-summary-separator">|</span>`);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function buildCss(rootId) {
  return panelCssTemplate.replaceAll("__ROOT__", `#${rootId}`);
}

export function getStyleText(rootId) {
  return buildCss(rootId);
}

/**
 * Injects the add-on stylesheet once. Safe to call on every mount attempt.
 * @param {string} rootId  - the root element's id attribute
 * @param {string} styleId - the <style> element's id attribute
 */
export function ensureStyle(rootId, styleId) {
  if (document.getElementById(styleId)) return;
  const style = createEl("style", null, null, styleId);
  style.textContent = buildCss(rootId);
  document.head.append(style);
}

// ─── DOM template ─────────────────────────────────────────────────────────────

/**
 * Creates and returns the root panel DOM element.
 * Does NOT insert it into the document — that is the caller's responsibility.
 * @param {string} rootId
 * @returns {HTMLElement}
 */
export function createRootElement(rootId) {
  const section = createEl("section", "filter-block", null, rootId);
  section.innerHTML = panelHtmlTemplate;
  return section;
}

export function createRootMarkup(rootId, panelOnly = false) {
  const classes = panelOnly ? "filter-block is-panel-only" : "filter-block";
  return `<div id="${rootId}" class="${classes}">${panelHtmlTemplate}</div>`;
}

export function createDialogMarkup() {
  return dialogHtmlTemplate;
}

// ─── Dynamic markup ───────────────────────────────────────────────────────────

/**
 * Builds the HTML string for the preset results list.
 * Applies the search filter against the precomputed `searchText` field on each preset.
 *
 * @param {Array}        presets         - normalized preset array
 * @param {string}       searchQuery     - current search input value
 * @param {string|null}  currentPresetId - id of the currently-applied preset, or null
 * @returns {string} HTML string
 */
export function buildPresetRowsMarkup(presets, searchQuery, currentPresetId, tagPrefs) {
  const query = String(searchQuery || "")
    .toLowerCase()
    .trim();
  const filtered = query ? presets.filter((p) => p.searchText.includes(query)) : presets;

  if (filtered.length === 0) {
    return `<div class="${NS}-empty">No saved filters match the current search.</div>`;
  }

  return filtered
    .map((preset) => {
      const isCurrent = currentPresetId != null && preset.id === currentPresetId;
      const id = escapeHtml(preset.id);
      return `
        <div class="${NS}-row${isCurrent ? " is-current" : ""}" data-preset-id="${id}">
          <div class="${NS}-row-head">
            <div class="${NS}-row-title">${escapeHtml(preset.name)}</div>
            ${isCurrent ? `<span class="${NS}-pill">Current</span>` : ""}
          </div>
          <div class="${NS}-summary">${renderSummary(preset.summaryParts, preset.summary, tagPrefs)}</div>
          <div class="${NS}-row-actions">
            <button type="button" data-action="apply" data-preset-id="${id}">Apply</button>
            <button type="button" data-action="update" data-preset-id="${id}">Update</button>
            <button type="button" data-action="delete" data-preset-id="${id}">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");
}

/**
 * Updates the live panel DOM nodes with fresh data. Idempotent — safe to call repeatedly.
 *
 * @param {Element} rootEl
 * @param {{
 *   currentPresetName: string|null,
 *   currentSummary:    string,
 *   presets:           Array,
 *   searchQuery:       string,
 *   currentPresetId:   string|null
 * }} opts
 */
export function renderPanelContent(
  rootEl,
  {
    currentPresetName,
    currentSummary,
    currentSummaryParts,
    presets,
    searchQuery,
    currentPresetId,
    tagPrefs,
  },
) {
  const currentLabel = currentPresetName
    ? `Current applied filter: <strong>${escapeHtml(currentPresetName)}</strong>`
    : `Current applied filter: <strong>Unsaved current filter</strong>`;

  const currentEl = rootEl.querySelector("[data-role='current']");
  const resultsEl = rootEl.querySelector("[data-role='results']");

  if (currentEl) {
    currentEl.innerHTML = `${currentLabel}<br><span class="${NS}-summary">${renderSummary(currentSummaryParts, currentSummary, tagPrefs)}</span>`;
  }
  if (resultsEl) {
    resultsEl.innerHTML = buildPresetRowsMarkup(presets, searchQuery, currentPresetId, tagPrefs);
  }
}

/**
 * Syncs the popover's hidden state and the trigger's aria-expanded attribute.
 * @param {Element} rootEl
 * @param {boolean} isOpen
 */
export function syncPanelVisibility(rootEl, isOpen) {
  const trigger = rootEl.querySelector("[data-action='toggle-panel']");
  if (!trigger) return;
  trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
}
