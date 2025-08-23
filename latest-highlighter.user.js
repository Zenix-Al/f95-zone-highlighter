// ==UserScript==
// @name         F95Zone Latest Highlighter
// @icon         https://external-content.duckduckgo.com/iu/?u=https://f95zone.to/data/avatars/l/1963/1963870.jpg?1744969685
// @namespace    https://f95zone.to/threads/f95zone-latest.250836/
// @homepage     https://f95zone.to/threads/f95zone-latest.250836/
// @homepageURL  https://f95zone.to/threads/f95zone-latest.250836/
// @author       X Death on F95zone
// @author       Edexal
// @match        https://f95zone.to/sam/latest_alpha/*
// @match        https://f95zone.to/threads/*
// @grant        GM.setValue
// @grant        GM.getValues
// @run-at       document-idle
// @version      2.4.2
// @description  Highlight thread cards on the Latest Updates Page and adds colorful thread tags!
// ==/UserScript==

(async () => {
  "use strict";
  // =======================
  // 🌐 GLOBAL & CONSTANTS
  // =======================
  let CONFIGS = {
    preferredTags: [],
    excludedTags: [],
    minVersion: 0.5,
    tags: [],
    statusColors: {},
    overlaySettings: {},
    tagSettings: {},
    shadows: {},
    configVisibility: true,
  };
  const TAG_TYPE = {
    preferred: "preferredTags",
    excluded: "excludedTags",
    neutral: "neutralTags",
  };
  const validVersions = ["full", "final"];
  let tagsUpdated = false;
  let modalInjected = false;
  const defaultColors = {
    completed: "#388e3c",
    onhold: "#1976d2",
    abandoned: "#c9a300",
    highVersion: "#2e7d32",
    invalidVersion: "#a38400",
    tileInfo: "#9398a0",
    tileHeader: "#d9d9d9",
    preferred: "#7b1fa2",
    preferredText: "#ffffff",
    excluded: "#b71c1c",
    excludedText: "#ffffff",
    neutral: "#37383a",
    neutralText: "#9398a0",
  };
  const defaultOverlaySettings = {
    completed: true,
    onhold: true,
    abandoned: true,
    highVersion: true,
    invalidVersion: true,
    preferred: true,
    excluded: true,
    overlayText: true,
    tileText: true,
  };
  const defaultTagSettings = {
    neutral: true,
    preferred: true,
    excluded: true,
  };
  const defaultShadows = {
    preferred: true,
    excluded: true,
  };
  /** ----------------------------
   *  INIT UI
   * ---------------------------- */

  function waitForBody(callback) {
    if (document.body) {
      callback();
    } else {
      requestAnimationFrame(() => waitForBody(callback));
    }
  }

  /** ----------------------------
   *  UI INJECTION
   * ---------------------------- */
  function injectButton() {
    const button = document.createElement("button");
    button.textContent = "⚙️";
    button.id = "tag-config-button";
    button.addEventListener("click", () => openModal());
    document.body.appendChild(button);
  }

  function setEventById(idSelector, callback, eventType = "click") {
    document.getElementById(idSelector).addEventListener(eventType, callback);
  }

  function setDefaultChangeEvents(defaultKeys, idSelectorName, callback) {
    Object.keys(defaultKeys).forEach((key) => {
      document
        .getElementById(`${idSelectorName}-${key}`)
        .addEventListener("change", callback);
    });
  }

  function injectModal() {
	modalInjected=true;
    const modal = document.createElement("div");
    modal.id = "tag-config-modal";
    Object.assign(modal.style, {
      display: "none",
      position: "fixed",
      zIndex: 9999,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.5)",
    });
    modal.innerHTML = `
      <div class="modal-content" style="background:#191b1e; max-width:400px; margin:100px auto; border-radius:10px;">
        <h2 style="text-align: center;">CONFIG</h2>
  
        <!-- General -->
        <div class="modal-settings-spacing">
		<details class="config-list-details">
            <summary>General</summary>
			<div style="flex-direction: column; gap:5px; padding:5px;">
			<div style="margin-top: 10px;" class="config-row">
			  <label for="min-version">Min Version:</label>
			  <input id="min-version" type="number" step="0.1" min="0" placeholder="e.g., 0.5" style="width: 10px;">
		   </div>
          ${Object.keys(defaultShadows)
            .map(
              (key) =>
                `<div style="margin-top: 10px;" class="config-row">
            <label style="width: 160px;"  for="shadow-${key}">${key.charAt(0).toUpperCase() + key.slice(1)} Tag Shadow:</label>
            <input id="shadow-${key}" type="checkbox">
          </div>`,
            )
            .join("")}
			  <div style="margin-top: 10px;" class="config-row">
				<label for="config-visibility" style="width: 160px;">Config Visibility</label>
				<input type="checkbox" id="config-visibility" ${CONFIGS.configVisibility ? "checked" : ""}>
			  </div>
          
			  
            <div class="modal-btn-section">
              <button class="modal-btn modal-btn-reset" id="refresh-tag-list" title="Refreshes the tag list gathered from Latest Updates page">Refresh Tag List</button>
            </div>
			</div>
          </details>
        </div>
        <hr class="thick-line"/>
  
        <!-- Preferred Tags -->
        <div class="modal-settings-spacing">
          <details class="config-list-details">
            <summary>Tag List</summary>
            <ul id="tag-list" class="modal-list-padding"></ul>
            
            <div class="modal-btn-section">
              <button class="modal-btn modal-btn-reset" id="reset-tags">Reset Tags</button>
            </div>
          </details>
        </div>
        <hr class="thick-line"/>

        
        <!-- Overlay Settings -->
        <div class="modal-settings-spacing">
			<details class="config-list-details">
            <summary>Overlay Settings</summary>
			  <div style="flex-direction: column; gap:5px; padding:10px;">
            ${Object.keys(defaultOverlaySettings)
              .map(
                (key) => `
				  <div class="config-row">
              <label for="overlay-${key}">${key.charAt(0).toUpperCase() + key.slice(1)}</label>
              <input type="checkbox" id="overlay-${key}">
              </div>
            `,
              )
              .join("")}
          </div>
          </details>
			  
        </div>
        <hr class="thick-line"/>
        
        <!-- Tag Settings -->
        <div class="modal-settings-spacing">
		<details class="config-list-details">
            <summary>Tag Settings</summary>
			  <div style="flex-direction: column; gap:5px; padding:10px;">
            ${Object.keys(defaultTagSettings)
              .map(
                (key) => `
				  <div class="config-row">
              <label for="overlay-${key}">${key.charAt(0).toUpperCase() + key.slice(1)}</label>
              <input type="checkbox" id="tag-settings-${key}">
              </div>
            `,
              )
              .join("")}
          </div>
          </details>
			  
        </div>
        <hr class="thick-line"/>
  
        <!-- Status Colors -->
        <div class="modal-settings-spacing">
		<details class="config-list-details">
            <summary>Status Colors</summary>
          <div class="modal-list-padding">
            ${Object.keys(defaultColors)
              .map(
                (key) => `
                ${key === "preferred" ? "<hr class='thick-line'/>" : ""}
                <div class="config-row">
                  <label for="color-${key}">${
                    key.charAt(0).toUpperCase() + key.slice(1)
                  }:</label>
                  <input type="color" id="color-${key}" class="config-color-input">
                </div>
              `,
              )
              .join("")}
          </div>

          <div class="modal-btn-section">
            <button class="modal-btn modal-btn-reset" id="reset-colors">Reset Colors</button>
          </div>
        </div>
        <hr class="thick-line"/>
		  </details>
        <!-- Save & Close -->
        <div style="padding:10px;display:flex;justify-content:center;">
          <button id="save-config" class="modal-btn" style="margin-right:5px;">⭳ Save</button>
          <button id="close-modal" class="modal-btn">🗙 Close</button>
        </div>
      </div>
     <div id="modal-save-section">
      <div id="modal-background-save"></div>
      <p id="modal-save-text">Save</p>
    </div>
    <div id="modal-close-section">
      <div id="modal-background-close"></div>
      <p id="modal-close-text">Close</p>
    </div>
    `;
    document.body.appendChild(modal);

    // Event Listeners
    setEventById("close-modal", closeModal);
    setEventById("modal-close-section", closeModal);
    setEventById("save-config", saveAndClose);
    setEventById("modal-save-section", saveAndClose);
    setEventById("tag-list", updateTagBtnEvent);
    setEventById("config-visibility", updateConfigVisibility);
    setDefaultChangeEvents(
      defaultOverlaySettings,
      "overlay",
      updateOverlaySettings,
    );
    setDefaultChangeEvents(
      defaultTagSettings,
      "tag-settings",
      updateTagSettings,
    );
    setDefaultChangeEvents(defaultColors, "color", updateStatusColor);
    setDefaultChangeEvents(defaultShadows, "shadow", updateShadows);
    setEventById("reset-colors", () => {
      CONFIGS.statusColors = { ...defaultColors };
      renderStatusColor();
    });
    setEventById("reset-tags", () => {
      renderTagsList();
    });
    setEventById("refresh-tag-list", () => {
      CONFIGS.tags = [];
      tagsUpdated = false;
      loadAvailableTags();
    });
  }

  /** ----------------------------
   *  MODAL LOGIC
   * ---------------------------- */
  function openModal() {
    if (!modalInjected) injectModal();
    document.getElementById("tag-config-modal").style.display = "block";
    document.getElementById("min-version").value = CONFIGS.minVersion;
    renderList();
    renderOverlaySettings();
    renderTagSettings();
    renderStatusColor();
    renderShadows();
    loadAvailableTags(); // repopulate dropdown every time
  }

  function closeModal() {
    document.getElementById("tag-config-modal").style.display = "none";
  }

  function saveAndClose() {
    CONFIGS.minVersion =
      parseFloat(document.getElementById("min-version").value) || 0;
    saveConfig({
      minVersion: CONFIGS.minVersion,
      preferredTags: CONFIGS.preferredTags,
      excludedTags: CONFIGS.excludedTags,
      tags: CONFIGS.tags,
      statusColors: CONFIGS.statusColors,
      overlaySettings: CONFIGS.overlaySettings,
      tagSettings: CONFIGS.tagSettings,
      shadows: CONFIGS.shadows,
      configVisibility: CONFIGS.configVisibility,
    });
    callOnLatestPage(processAllTiles);
    updateButtonVisibility();
    closeModal();
  }

  /** ----------------------------
   *  CONFIG STORAGE
   * ---------------------------- */
  function saveConfig(data) {
    for (const [key, value] of Object.entries(data)) {
      GM.setValue(key, value);
    }
    // Apply CSS after config is fully loaded
    applyCustomCSS();
    processThreadTags();
  }

  function getParsedStatusColors(statusColors) {
    const obj = {};
    for (const [colorName, color] of Object.entries(defaultColors)) {
      if (statusColors[colorName]) {
        obj[colorName] = statusColors[colorName];
      } else {
        obj[colorName] = color;
      }
    }
    return obj;
  }

  async function loadConfig() {
    let parsed = (await GM.getValues(Object.keys(CONFIGS))) ?? {};

    // Only use defaults if values don't exist in storage
    return {
      minVersion: parsed.minVersion ?? 0.5,
      preferredTags: Array.isArray(parsed.preferredTags)
        ? parsed.preferredTags
        : [],
      excludedTags: Array.isArray(parsed.excludedTags)
        ? parsed.excludedTags
        : [],
      statusColors:
        typeof parsed.statusColors === "object" && parsed.statusColors !== null
          ? getParsedStatusColors(parsed.statusColors)
          : defaultColors,
      overlaySettings:
        typeof parsed.overlaySettings === "object" &&
        parsed.overlaySettings !== null
          ? parsed.overlaySettings
          : defaultOverlaySettings,
      tagSettings:
        typeof parsed.tagSettings === "object" && parsed.tagSettings !== null
          ? parsed.tagSettings
          : defaultTagSettings,
      tags: parsed.tags?.length > 0 ? parsed.tags : [],
      shadows:
        typeof parsed.shadows === "object" && parsed.shadows !== null
          ? parsed.shadows
          : defaultShadows,
      configVisibility: parsed.configVisibility ?? true,
    };
  }

  async function restoreConfig() {
    CONFIGS = await loadConfig();
    CONFIGS.tags?.sort();
  }

  /** ----------------------------
   *  TAG MANAGEMENT
   * ---------------------------- */
  function updateTags() {
    if (tagsUpdated) return;

    const dropdown = document.querySelector(
      ".selectize-dropdown.single.filter-tags-select",
    );
    if (!dropdown) return;

    const options = [...dropdown.querySelectorAll(".option")];
    if (options.length > 0) {
      const newTags = options.map((opt) => ({
        id: parseInt(opt.getAttribute("data-value")),
        name: opt.querySelector(".tag-name")?.textContent.trim() || "",
      }));

      const arraysAreDifferent = !(
        CONFIGS.tags.length === newTags.length &&
        CONFIGS.tags.every(
          (tag, index) =>
            tag.id === newTags[index].id && tag.name === newTags[index].name,
        )
      );

      if (arraysAreDifferent) {
        CONFIGS.tags = newTags;
        saveConfig({
          minVersion: CONFIGS.minVersion,
          preferredTags: CONFIGS.preferredTags,
          excludedTags: CONFIGS.excludedTags,
          tags: CONFIGS.tags,
        });
      }

      tagsUpdated = true;

      // Only render once after update
      cleanWarning();
      renderList();
      loadAvailableTags();

      return;
    }

    // If options aren't ready yet, try one more time after delay
    const selector = document.querySelector(".selectize-input.items.not-full");
    if (selector) {
      selector.click();
      setTimeout(updateTags, 300); // Try again once
    }
  }

  function cleanWarning() {
    let warning = document.getElementById("tag-warning");
    if (warning) {
      warning.remove();
    }
  }

  function loadAvailableTags() {
    cleanWarning();
    updateTags();
    const availableTags = CONFIGS.tags;
    if (availableTags.length === 0) {
      showEmptyTagMessage();
    }
  }

  function showEmptyTagMessage() {
    let warning = document.getElementById("tag-warning");
    if (!warning) {
      warning = document.createElement("div");
      warning.id = "tag-warning";
      warning.style.color = "orange";
      warning.style.marginTop = "5px";
      warning.textContent = "⚠️Go to Latest Updates Page to load tags.";
      document.querySelector("#tag-list").parentElement.appendChild(warning);
    }
  }

  function renderList() {
    const tagList = document.getElementById("tag-list");
    if (!tagList) return;
    const curTagNames = new Set(
      Array.from(tagList.children).map((li) => {
        return li.dataset.tagName;
      }),
    );
    if (
      curTagNames.size !== CONFIGS.tags.length ||
      !CONFIGS.tags.every((tag) => curTagNames.has(tag.name))
    ) {
      const tagNotInList = CONFIGS.tags.filter(
        (tag) => !curTagNames.has(tag.name),
      );
      setUpList(tagList, tagNotInList);
    }
  }

  function setUpList(tagList, tagsNotInList) {
    tagsNotInList.forEach((tag) => {
      const li = document.createElement("li");
      const tagType = getTagType(tag.name);
      const btn = document.createElement("button");
      btn.dataset.tagName = li.dataset.tagName = tag.name;
      btn.dataset.tagType = li.dataset.tagType = tagType;
      btn.textContent = `${tag.name}`;
      applyConfigTagBtnColor(btn);
      li.appendChild(btn);
      tagList.appendChild(li);
    });
  }

  function renderTagsList() {
    const tagList = document.querySelectorAll("#tag-list li button");
    tagList.forEach((btn) => {
      btn.dataset.tagType = TAG_TYPE.neutral;
      applyConfigTagBtnColor(btn);
    });
    CONFIGS.excludedTags.length = 0;
    CONFIGS.preferredTags.length = 0;
  }

  function applyConfigTagBtnColor(btnEl) {
    const tagType = btnEl.dataset.tagType;
    btnEl.classList.add("config-tag-item");
    Object.assign(btnEl.style, {
      backgroundColor:
        CONFIGS.statusColors[tagType.slice(0, tagType.length - 4)],
      color:
        CONFIGS.statusColors[tagType.slice(0, tagType.length - 4) + "Text"],
    });
  }

  function getTagType(tagName) {
    if (CONFIGS.preferredTags.some((tag) => tag.name === tagName)) {
      return TAG_TYPE.preferred;
    } else if (CONFIGS.excludedTags.some((tag) => tag.name === tagName)) {
      return TAG_TYPE.excluded;
    } else {
      return TAG_TYPE.neutral;
    }
  }

  function getTagTypeFromKey(key) {
    if (key.includes("preferred")) {
      return TAG_TYPE.preferred;
    } else if (key.includes("excluded")) {
      return TAG_TYPE.excluded;
    }
    return TAG_TYPE.neutral;
  }

  function updateModalTagColor(statusColorKey) {
    if (
      !statusColorKey.includes("preferred") &&
      !statusColorKey.includes("excluded") &&
      !statusColorKey.includes("neutral")
    ) {
      return;
    }
    let tagType = getTagTypeFromKey(statusColorKey);
    document
      .querySelectorAll(`li[data-tag-type=${tagType}]`)
      .values()
      .map((li) => li.firstChild)
      .forEach((btn) => {
        if (!statusColorKey.includes("Text")) {
          btn.style.backgroundColor = CONFIGS.statusColors[statusColorKey];
        } else {
          btn.style.color = CONFIGS.statusColors[statusColorKey];
        }
      });
  }

  function updateBtn(elem) {
    switch (elem.dataset.tagType) {
      case TAG_TYPE.preferred:
        elem.dataset.tagType = TAG_TYPE.excluded;
        CONFIGS[elem.dataset.tagType].push(
          CONFIGS.tags.find((element) => element.name === elem.dataset.tagName),
        );
        CONFIGS.preferredTags = CONFIGS.preferredTags.filter(
          (tag) => tag.name !== elem.dataset.tagName,
        );
        break;
      case TAG_TYPE.excluded:
        elem.dataset.tagType = TAG_TYPE.neutral;
        CONFIGS.excludedTags = CONFIGS.excludedTags.filter(
          (tag) => tag.name !== elem.dataset.tagName,
        );
        break;
      default:
        elem.dataset.tagType = TAG_TYPE.preferred;
        CONFIGS[elem.dataset.tagType].push(
          CONFIGS.tags.find((element) => element.name === elem.dataset.tagName),
        );
        break;
    }
    const tagType = elem.dataset.tagType;
    elem.style.backgroundColor =
      CONFIGS.statusColors[tagType.slice(0, tagType.length - 4)];
    elem.style.color =
      CONFIGS.statusColors[tagType.slice(0, tagType.length - 4) + "Text"];
  }

  function updateTagBtnEvent(e) {
    if (e.target.tagName !== "BUTTON") return;
    updateBtn(e.target);
  }

  /** ----------------------------
   *  COLOR MANAGEMENT
   * ---------------------------- */
  function renderOverlaySettings() {
    Object.keys(CONFIGS.overlaySettings).forEach((key) => {
      const el = document.getElementById("overlay-" + key);
      if (el) el.checked = CONFIGS.overlaySettings[key];
    });
  }

  function renderTagSettings() {
    Object.keys(CONFIGS.tagSettings).forEach((key) => {
      const el = document.getElementById("tag-settings-" + key);
      if (el) el.checked = CONFIGS.tagSettings[key];
    });
  }

  function renderStatusColor() {
    Object.keys(CONFIGS.statusColors).forEach((key) => {
      const el = document.getElementById("color-" + key);
      if (el) el.value = CONFIGS.statusColors[key];
    });
  }

  function renderShadows() {
    Object.keys(CONFIGS.shadows).forEach((key) => {
      const el = document.getElementById("shadow-" + key);
      if (el) el.checked = CONFIGS.shadows[key];
    });
  }

  function updateOverlaySettings(event) {
    const key = event.target.id.replace("overlay-", "");
    CONFIGS.overlaySettings[key] = event.target.checked;
  }

  function updateConfigVisibility(event) {
    CONFIGS.configVisibility = event.target.checked;
  }

  function updateTagSettings(event) {
    const key = event.target.id.replace("tag-settings-", "");
    CONFIGS.tagSettings[key] = event.target.checked;
  }

  function updateStatusColor(event) {
    const key = event.target.id.replace("color-", "");
    CONFIGS.statusColors[key] = event.target.value;
    updateModalTagColor(key);
  }

  function updateShadows(event) {
    const key = event.target.id.replace("shadow-", "");
    CONFIGS.shadows[key] = event.target.checked;
  }

  // =======================
  // 🎨 STYLING
  // =======================

  function applyCustomCSS() {
    const hasStyle =
      document.head.lastElementChild.textContent.includes("#tag-config-button");
    const customCSS = hasStyle
      ? document.head.lastElementChild
      : document.createElement("style");
    customCSS.textContent = `
	/* All text inputs, textareas, selects */
	#tag-config-modal input,
	#tag-config-modal textarea,
	#tag-config-modal select {
		background-color: #222; 
		color: #fff;       
		border: 1px solid #555;      
		border-radius: 4px;   
	}
	#tag-config-modal input:focus,
	#tag-config-modal textarea:focus,
	#tag-config-modal select:focus {
		outline: none;             
		border: 1px solid #c15858;            
	}

	/* Checkboxes and radios */
	#tag-config-modal input[type="checkbox"],
	#tag-config-modal input[type="radio"] {
		accent-color: #c15858;   
		background-color: #222; 
		border: 1px solid #555;
	}
#tag-config-modal .config-color-input {
    border: 2px solid #3f4043; 
    border-radius: 5px;
    padding: 2px;
    width: 40px;
    height: 28px;
    cursor: pointer;
    background-color: #181a1d; 
}

#tag-config-modal .config-color-input::-webkit-color-swatch-wrapper {
    padding: 0;
}

#tag-config-modal .config-color-input::-webkit-color-swatch {
    border-radius: 4px;
    border: none;
}

  .modal-btn {
    background-color: #893839 ;
    color: white ;
    border: 2px solid #893839 ;
    border-radius: 6px;
    padding: 8px 16px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.3s ease, border-color 0.3s ease;
    box-shadow: 0 4px 8px rgba(137, 56, 56, 0.5);
  }

  .modal-btn:hover {
    background-color: #b94f4f ;
    border-color: #b94f4f ;
  }

  .modal-btn:active {
    background-color: #6e2b2b ;
    border-color: #6e2b2b ;
    box-shadow: none;
  }
	.config-row {
	  display: flex;
	  gap: 10px;
	  margin-bottom: 8px;
	}

	.config-row label {
	  flex-shrink: 0;
	  width: 140px; /* fixed width for all labels */
	  text-align: left;
	  user-select: none;
	}

	.config-row input[type="checkbox"],
	.config-row input[type="color"],
	.config-row input[type="number"] {
	  flex-grow: 1;
	}

    #tag-config-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      left: 20px; 
      padding: 8px 12px;
      font-size: 20px;
      z-index: 7;
      cursor: pointer;
      border: 2px inset #461616;
      background: #cc3131;
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
	  max-width: 70px;
	  width: auto;
      opacity: 0.75;
	  transition: opacity 0.2s ease, transform 0.2s ease;
	  @media (width < 480px) {
	    bottom: 60px;
	  }
	}

	/* Hover effect */
	#tag-config-button:hover {
        opacity: 1;
  }
  #tag-config-button:active {
      transform: scale(0.9);
  }
	#tag-config-button.hidden {
	  opacity: 0;         
	  pointer-events: auto;  
	  transition: opacity 0.3s ease;
	}

	#tag-config-button.hidden:hover {
	  opacity: 0.75;
  }

#tag-config-modal .modal-content {
    background: black;
    border-radius: 10px;
    min-width: 300px;
    max-height: 80vh;
    overflow-y: scroll; /* always show vertical scrollbar */
}

    #tag-config-modal.show {
        display: flex;
    }
    
	.config-list-details {

	  overflow: hidden;             
	  transition: border-width 1s, max-height 1s ease; 
	  max-height: 40px;            
	}

	.config-list-details[open] {
	  border-width: 2px;
	  max-height: 1300px;          
	}
	.thick-line {
		border: none;
		height: 1px; 
		background-color: #3f4043;
	}
    .config-list-details summary {
      text-align: center;
      background: #353535;
      border-radius: 8px;
      padding-top: 5px;
      padding-bottom: 5px;
      cursor: pointer;
    }
    
    .custom-overlay-reason {
        position: absolute;
        top: 4px;
        left: 4px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 2px 6px;
        font-size: 12px;
        border-radius: 4px;
        z-index: 2;
        pointer-events: none;
    }
  
    .resource-tile_thumb-wrap {
        position: relative;
    }
    
   .tagItem,
   .config-tag-item {
     border-radius: 8px;
   }
   
   .config-tag-item {
      margin-left: 5px;
      cursor: pointer;      
   }
	  .preferred {
      background-color: ${CONFIGS.statusColors.preferred || "#2e7d32"};
      font-weight: bold;
      color: ${CONFIGS.statusColors.preferredText || "white"};
      ${CONFIGS.shadows.preferred ? "box-shadow: 0 0 3px 1px white" : ""};
	  }
	  
	  .excluded {
      background-color: ${CONFIGS.statusColors.excluded || "#b71c1c"};
      font-weight: bold;
      color: ${CONFIGS.statusColors.excludedText || "white"};
      ${CONFIGS.shadows.excluded ? "box-shadow: 0 0 2px 1px white" : ""};
	  }
	  
	  .neutral {
      background-color: ${CONFIGS.statusColors.neutral}; 
      font-weight: bold;
      color: ${CONFIGS.statusColors.neutralText};
	  }
	  
	  #modal-background-save,
	  #modal-background-close{
	    background: black;
	    position:absolute;
	    width: 50vw;
	    height: 100vh;
	    z-index: -1;
	    top: 0;
	    cursor: pointer;
	    opacity: 0.2;
	    transition: 0.2s opacity;
	    &:hover {
	      opacity: 0.5;
	    }
	  }
	  #modal-save-text,
	  #modal-close-text {
	    position:absolute;
	    z-index: -1;
	    font-size: 4em;
	    color: white;
	    font-weight: bolder;
      margin: 0;
	    top: 0;
	    transition: 0.2s opacity;
	    opacity: 1;
	    &:hover {
	      cursor: pointer;
	      opacity: 0.8;
	    }
	  }
	  #modal-save-text {
	    left: 5vw;
	  }
	  #modal-close-text {
	    right: 5vw;
	  }
	  #modal-background-save {
      border-right: 1px solid white;
	    left: 0;
	  }
	  #modal-background-close {
      border-left: 1px solid white;
	    right: 0;
	  }
	  
	  div#latest-page_items-wrap_inner div.resource-tile a.resource-tile_link div.resource-tile_info div.resource-tile_info-meta {
      color: ${CONFIGS.overlaySettings.tileText ? CONFIGS.statusColors.tileInfo : "#9398a0"};
      font-weight: 600;
    }
    
    div#latest-page_items-wrap_inner div.resource-tile a.resource-tile_link {
      color: ${CONFIGS.overlaySettings.tileText ? CONFIGS.statusColors.tileHeader : "#d9d9d9"};
    }
    
    .modal-btn-section {
      text-align: center;
      margin: 15px auto;
      border-top: 1px dotted #3f4043;
    }
    
    .modal-btn-reset {
      margin-top: 10px; 
    }
    #tag-list {
      list-style:none;
      text-align: center;
      margin: 0;
      display:flex;
      justify-content: start;
      flex-wrap: wrap;
      gap:5px;
    }
    .modal-list-padding {
      padding: 15px 10px 0 10px;
    }
    .modal-settings-spacing {
      padding: 10px;
    } 
`;
    document.head.appendChild(customCSS);
  }

  // =======================
  // 🔧 UTILITY FUNCTIONS
  // =======================
  function updateButtonVisibility() {
    const button = document.getElementById("tag-config-button");
    if (!button) return;

    if (CONFIGS.configVisibility === false) {
      button.classList.add("hidden");

      // Blink 3 times
      let blinkCount = 0;
      const maxBlinks = 3;
      const blinkInterval = 400; // ms

      // Clear any existing blink interval (to avoid stacking)
      if (button.blinkIntervalId) {
        clearInterval(button.blinkIntervalId);
        // button.style.opacity = '0';  // ensure hidden after clear
        button.classList.add("hidden");
      }

      button.blinkIntervalId = setInterval(() => {
        // Toggle opacity between 0 and 1
        // button.style.opacity = button.style.opacity === '0' ? '1' : '0';
        button.classList.toggle("hidden");

        blinkCount++;
        if (blinkCount >= maxBlinks * 2) {
          // *2 because toggling twice per blink
          clearInterval(button.blinkIntervalId);
          // button.style.opacity = '0';  // keep hidden at end
          // button.style.removeProperty('opacity');
          // delete button.blinkIntervalId;
          button.classList.add("hidden");
          button.blinkIntervalId = undefined;
        }
      }, blinkInterval);
    } else {
      // Show button normally
      if (button.blinkIntervalId) {
        clearInterval(button.blinkIntervalId);
        // delete button.blinkIntervalId;
        button.blinkIntervalId = undefined;
      }
      // button.style.removeProperty('opacity');
      button.classList.remove("hidden");
      // button.style.opacity = '0.75';  // restore normal visible opacity
    }
  }

  // Get the main label text of a tile
  function getLabelText(tile) {
    const labelWrap = tile.querySelector(".resource-tile_label-wrap_right");
    const labelEl = labelWrap?.querySelector('[class^="label--"]');
    return labelEl?.innerHTML?.toLowerCase().trim() || "";
  }

  // Extract version text like "1.3" from tile
  function getVersionText(tile) {
    const versionEl = tile.querySelector(".resource-tile_label-version");
    return versionEl?.innerHTML?.toLowerCase().trim() || "";
  }

  // Check if tile has a tag from preferredTags/excludedTags
  function processTag(tile, tags) {
    const dataTagsStr = tile.getAttribute("data-tags") || "";
    const tagIds = dataTagsStr.split(",").map((id) => parseInt(id.trim()));
    const matched = tags.find((tag) => tagIds.includes(tag.id));
    return matched ? matched.name : false;
  }

  // Inject an overlay label with reason text (one per tile)
  function addOverlayLabel(tile, reasonText, isApplied) {
    if (isApplied || !CONFIGS.overlaySettings.overlayText) {
      if (!CONFIGS.overlaySettings.overlayText) {
        removeOverlayLabel();
      }
      return true;
    }

    const thumbWrap = tile.querySelector(".resource-tile_thumb-wrap");
    if (!thumbWrap) return false;

    let existingOverlay = thumbWrap.querySelector(".custom-overlay-reason");
    if (!existingOverlay) {
      existingOverlay = document.createElement("div");
      existingOverlay.className = "custom-overlay-reason";
      thumbWrap.prepend(existingOverlay);
    }

    existingOverlay.innerText = reasonText;
    return true;
  }

  function removeOverlayLabel() {
    let existingOverlay = document.querySelector(".custom-overlay-reason");
    if (existingOverlay) {
      existingOverlay.remove();
    }
  }

  // Create segmented gradient background from color array
  function createSegmentedGradient(colors, direction = "to right") {
    if (!Array.isArray(colors) || colors.length === 0) return "";
    if (colors.length === 1) return colors[0];

    const segment = 100 / colors.length;
    return (
      `linear-gradient(${direction}, ` +
      colors
        .map((color, i) => {
          const start = (i * segment).toFixed(2);
          const end = ((i + 1) * segment).toFixed(2);
          return `${color} ${start}% ${end}%`;
        })
        .join(", ") +
      `)`
    );
  }

  // =======================
  //  MAIN LATEST PAGE HIGHLIGHTER
  // =======================

  // === processing a single tile ===
  function processTile(tile) {
    let isOverlayApplied = false; // Prevent multiple overlays on the same tile
    let colors = []; // Collect color codes for background gradient
    const body = tile.querySelector(".resource-tile_body");

    // === Version extraction and validation ===
    const versionText = getVersionText(tile); // Extract version label (e.g., "1.0", "final")
    const match = versionText.match(/(\d+\.\d+)/); // Extract number like "1.0" using regex
    const versionNumber = match ? parseFloat(match[1]) : null; // Convert version string to number
    const isValidKeyword = validVersions.some((valid) =>
      versionText.includes(valid),
    ); // Check for 'full' or 'final'

    // === Label and tag extraction ===
    const labelText = getLabelText(tile); // Extract status label (e.g., completed/onhold/abandoned)
    const matchedTag = processTag(tile, CONFIGS.preferredTags); // Check if tile has one of the preferred tags
    const excludedTag = processTag(tile, CONFIGS.excludedTags); // Check if tile has one of the excluded tags

    if (excludedTag && CONFIGS.overlaySettings.excluded) {
      isOverlayApplied = addOverlayLabel(tile, excludedTag, isOverlayApplied);
      colors.push(CONFIGS.statusColors.excluded);
    }

    // === Apply tag overlay and color ===
    if (matchedTag && CONFIGS.overlaySettings.preferred) {
      isOverlayApplied = addOverlayLabel(tile, matchedTag, isOverlayApplied);
      colors.push(CONFIGS.statusColors.preferred);
    }

    // === Apply one of the status overlays and color ===
    if (labelText === "completed" && CONFIGS.overlaySettings.completed) {
      isOverlayApplied = addOverlayLabel(tile, "Completed", isOverlayApplied);
      colors.push(CONFIGS.statusColors.completed);
    } else if (labelText === "onhold" && CONFIGS.overlaySettings.onhold) {
      isOverlayApplied = addOverlayLabel(tile, "onhold", isOverlayApplied);
      colors.push(CONFIGS.statusColors.onhold);
    } else if (labelText === "abandoned" && CONFIGS.overlaySettings.abandoned) {
      isOverlayApplied = addOverlayLabel(tile, "abandoned", isOverlayApplied);
      colors.push(CONFIGS.statusColors.abandoned);
    }

    // === Apply version-based overlays and color ===
    if (
      (CONFIGS.overlaySettings.highVersion &&
        versionNumber !== null &&
        versionNumber >= CONFIGS.minVersion) ||
      isValidKeyword
    ) {
      // High version or has keywords like "final"
      addOverlayLabel(tile, "highVersion", isOverlayApplied);
      colors.push(CONFIGS.statusColors.highVersion);
    } else if (
      !(versionNumber !== null && versionNumber < CONFIGS.minVersion) &&
      CONFIGS.overlaySettings.invalidVersion
    ) {
      // Low version (fallback case if version isn't too low)
      addOverlayLabel(tile, "invalidVersion", isOverlayApplied);
      colors.push(CONFIGS.statusColors.invalidVersion);
    }

    // === Set background gradient based on applied overlays ===
    body.style.background = createSegmentedGradient(colors, "45deg");
  }

  // === Loop through all tiles and process them ===
  function processAllTiles() {
    const tiles = document.getElementsByClassName("resource-tile");

    if (!tiles.length) {
      return;
    }

    for (let i = 0; i < tiles.length; i++) {
      processTile(tiles[i]); // Apply overlays and styles
    }
  }

  // =======================
  // MAIN THREAD TAG HIGHLIGHTER
  // =======================
  function removeDuplicateThreadTag(tagElement, currentType) {
    if (tagElement.classList.contains(currentType)) return;
    Object.keys(TAG_TYPE).forEach((tagType) => {
      if (tagElement.classList.contains(tagType)) {
        tagElement.classList.remove(tagType);
      }
    });
  }

  function toggleThreadTag(tagElement, tagType) {
    const className = tagType.slice(0, tagType.length - 4);
    removeDuplicateThreadTag(tagElement, className);
    CONFIGS.tagSettings[className]
      ? tagElement.classList.add(className)
      : tagElement.classList.remove(className);
  }

  function processThreadTag(tagElement) {
    const tagName = tagElement.innerHTML.trim();
    let isPreferred = CONFIGS.preferredTags.find((tag) =>
      tagName.includes(tag.name),
    );
    let isExcluded = CONFIGS.excludedTags.find((tag) =>
      tagName.includes(tag.name),
    );
    if (isPreferred) {
      toggleThreadTag(tagElement, TAG_TYPE.preferred);
    } else if (isExcluded) {
      toggleThreadTag(tagElement, TAG_TYPE.excluded);
    } else if (!isPreferred && !isExcluded) {
      toggleThreadTag(tagElement, TAG_TYPE.neutral);
    }
  }

  function processThreadTags() {
    const tagList = document.querySelector(".js-tagList");
    if (!tagList) {
      return;
    }
    let tags = tagList.getElementsByClassName("tagItem");
    tags = Array.from(tags);
    tags.forEach((tag) => {
      processThreadTag(tag);
    });
  }

  function callOnLatestPage(callback) {
    const filterDrawer = document.querySelector("#latest-page_filter-wrap");
    if (filterDrawer) {
      callback();
    }
  }

  function watchAndUpdateTiles() {
    const mutationObserver = new MutationObserver(() => {
      processAllTiles();
    });

    const latestUpdateWrapper = document.getElementById(
      "latest-page_items-wrap",
    );
    const options = { attributeFilter: ["class"] };
    mutationObserver.observe(latestUpdateWrapper, options);
  }

  waitForBody(async () => {
    await restoreConfig(); // load saved config

    // Apply CSS after config is fully loaded
    applyCustomCSS();
    injectButton();
    updateButtonVisibility();
    // Only run on Latest Updates Page
    callOnLatestPage(watchAndUpdateTiles);
    // Process tags found on a thread
    processThreadTags();
  });
})();
