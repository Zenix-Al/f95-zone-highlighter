// ==UserScript==
// @name         F95 Utility buttons
// @namespace    http://tampermonkey.net/
// @description  Added a search button for Compressed, Update only, Walkthrough .... with Settings!
// @version      3.0
// @author       GGD40727
// @match        https://f95zone.to/threads/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=f95zone.to
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/553706/F95%20Utility%20buttons.user.js
// @updateURL https://update.greasyfork.org/scripts/553706/F95%20Utility%20buttons.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // --- State & Settings ---
    let openInNewTab = GM_getValue('openInNewTab', true);

    const DEFAULT_BUTTONS = [
        { label: 'Update', query: 'Update', useTitle: true },
        { label: 'New+Compressed', query: 'Compressed', useTitle: true },
        { label: 'Compressed', query: 'Compressed', useTitle: false },
        { label: 'Walkthrough', query: 'Walkthrough', useTitle: true },
        { label: 'Mod', query: 'Mod', useTitle: false },
        { label: 'Cheats', query: 'Cheats', useTitle: true }
    ];

    let customButtons = GM_getValue('f95_custom_buttons', DEFAULT_BUTTONS);

    // Register Tampermonkey Menu Command for Settings
    GM_registerMenuCommand('⚙️ Script Settings', openSettingsModal);

    const SELECTORS = {
        title: 'div.p-title h1.p-title-value',
        searchInput: '.uix_searchInput',
        searchButton: 'button.button--primary.button--icon--search'
    };

    // --- Styling ---
    function injectStyles() {
        if (document.getElementById('f95-styles')) return;
        const style = document.createElement('style');
        style.id = 'f95-styles';
        style.innerHTML = `
            #f95-btn-container {
                position: fixed;
                right: 0px;
                top: 35%;
                z-index: 9998;
                display: flex;
                flex-direction: column;
                gap: 2px;
                align-items: flex-end; /* Aligns buttons to the right edge */
            }
            .f95-quick-search-btn {
                line-height: 30px;
                font-size: 14px;
                cursor: pointer;
                padding: 3px 10px;
                border: 1px solid #444;
                border-radius: 4px 0 0 4px;
                background-color: #2d2d2d;
                color: #efefef;
                text-align: center;
                transition: background-color 0.2s;
                width: max-content; /* Ensures button fits its text exactly */
            }
            .f95-quick-search-btn:hover { background-color: #444; }

            /* Modal Styles */
            #f95-settings-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.75); z-index: 99999; display: flex;
                align-items: center; justify-content: center;
            }
            #f95-settings-modal {
                background: #1e1e1e; color: #eee; padding: 20px; border-radius: 8px;
                width: 600px; max-width: 90vw; max-height: 90vh; overflow-y: auto;
                border: 1px solid #444; font-family: sans-serif;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            }
            #f95-settings-modal h2 { margin-top: 0; color: #fff; border-bottom: 1px solid #333; padding-bottom: 10px; }
            .f95-global-settings {
                background: #222; padding: 12px; border-radius: 6px;
                margin-bottom: 15px; border: 1px solid #333;
            }
            .f95-settings-row {
                display: flex; gap: 8px; margin-bottom: 10px; align-items: center;
                background: #2a2a2a; padding: 8px; border-radius: 4px;
            }
            .f95-settings-row input[type="text"] {
                padding: 6px; background: #111; color: #fff;
                border: 1px solid #444; border-radius: 3px;
            }
            .f95-input-label { flex: 1; }
            .f95-input-query { flex: 1.2; }
            .f95-toggle-title {
                display: flex; align-items: center; gap: 4px; font-size: 12px;
                background: #111; padding: 6px 8px; border-radius: 3px; border: 1px solid #444;
                cursor: pointer; user-select: none;
            }
            .f95-toggle-title input { cursor: pointer; }
            .f95-modal-btn {
                background: #333; color: white; border: 1px solid #555;
                padding: 6px 10px; cursor: pointer; border-radius: 3px;
            }
            .f95-modal-btn:hover { background: #555; }
            .f95-btn-danger { background: #632323; }
            .f95-btn-danger:hover { background: #8a3131; }
            .f95-btn-primary { background: #23527c; }
            .f95-btn-primary:hover { background: #337ab7; }
            .f95-modal-actions { margin-top: 15px; display: flex; justify-content: space-between; border-top: 1px solid #333; padding-top: 15px;}
        `;
        document.head.appendChild(style);
    }

    // --- Core Logic ---
    function getGameTitle() {
        const titleElement = document.querySelector(SELECTORS.title);
        if (!titleElement) return null;
        const match = titleElement.textContent.match(/\[(.*?)\]/);
        return match ? match[1] : null;
    }

    function getThreadId() {
        const match = window.location.pathname.match(/threads\/[^\/]+\.(\d+)/);
        return match ? match[1] : null;
    }

    function performSearch(query, useTitle, gameTitle) {
        let searchTerm = query.trim();

        // Prepend game title if toggled on and title exists
        if (useTitle && gameTitle) {
            searchTerm = `${gameTitle} ${searchTerm}`.trim();
        }

        if (!searchTerm) return;

        if (openInNewTab) {
            const threadId = getThreadId();
            let searchUrl = `https://f95zone.to/search/1/?q=${encodeURIComponent(searchTerm)}&t=post&o=relevance`;
            if (threadId) {
                searchUrl += `&c%5Bthread%5D=${threadId}`;
            }
            window.open(searchUrl, '_blank');
        } else {
            const searchInput = document.querySelector(SELECTORS.searchInput);
            const searchButton = document.querySelector(SELECTORS.searchButton);
            if (!searchInput || !searchButton) return;

            searchInput.value = searchTerm;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchButton.click();
        }
    }

    function initButtons() {
        // Remove existing container if re-rendering
        const existing = document.getElementById('f95-btn-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'f95-btn-container';

        const gameTitle = getGameTitle();

        customButtons.forEach(config => {
            const button = document.createElement('input');
            button.type = 'button';
            button.value = config.label;
            button.className = 'f95-quick-search-btn';

            button.addEventListener('click', () => {
                performSearch(config.query, config.useTitle, gameTitle);
            });
            container.appendChild(button);
        });

        document.body.appendChild(container);
    }

    // --- Settings UI ---
    function openSettingsModal() {
        if (document.getElementById('f95-settings-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'f95-settings-overlay';

        const modal = document.createElement('div');
        modal.id = 'f95-settings-modal';

        modal.innerHTML = `
            <h2>Script Settings</h2>

            <!-- Global Settings Block -->
            <div class="f95-global-settings">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px;">
                    <input type="checkbox" id="f95-setting-newtab" ${openInNewTab ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                    <strong>Open searches in a New Tab</strong>
                </label>
                <p style="font-size: 12px; color: #aaa; margin: 5px 0 0 24px;">
                    If unchecked, searches will fill the forum's search bar on the current page instead.
                </p>
            </div>

            <p style="font-size: 13px; color: #bbb; margin-bottom: 15px;">
                Check <b>+Title</b> to automatically include the game's title before your search term.<br>
                <em>Example: Toggling +Title on "Update" searches for "GameName Update".</em>
            </p>

            <!-- Buttons List -->
            <div id="f95-settings-list"></div>

            <div class="f95-modal-actions">
                <button id="f95-add-row" class="f95-modal-btn">+ Add New Button</button>
                <div>
                    <button id="f95-cancel" class="f95-modal-btn">Cancel</button>
                    <button id="f95-save" class="f95-modal-btn f95-btn-primary" style="margin-left: 8px;">Save & Apply</button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const listContainer = document.getElementById('f95-settings-list');

        // Render rows
        customButtons.forEach(btn => addRowToSettings(listContainer, btn.label, btn.query, btn.useTitle));

        // Event Listeners
        document.getElementById('f95-add-row').addEventListener('click', () => addRowToSettings(listContainer, 'New Button', 'Term', true));

        document.getElementById('f95-cancel').addEventListener('click', () => overlay.remove());

        document.getElementById('f95-save').addEventListener('click', () => {
            saveSettings(listContainer);
            overlay.remove();
            initButtons(); // Refresh buttons on page dynamically
        });
    }

    function addRowToSettings(container, labelText = '', queryText = '', useTitle = true) {
        const row = document.createElement('div');
        row.className = 'f95-settings-row';
        row.innerHTML = `
            <input type="text" class="f95-input-label" placeholder="Button Name" value="${labelText}">
            <input type="text" class="f95-input-query" placeholder="Search Term" value="${queryText}">
            <label class="f95-toggle-title" title="Append the game's title to this search?">
                <input type="checkbox" class="f95-input-title" ${useTitle ? 'checked' : ''}> +Title
            </label>
            <button class="f95-modal-btn btn-up" title="Move Up">▲</button>
            <button class="f95-modal-btn btn-down" title="Move Down">▼</button>
            <button class="f95-modal-btn f95-btn-danger btn-del" title="Delete">✖</button>
        `;

        // Movement logic
        row.querySelector('.btn-up').addEventListener('click', () => {
            if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
        });
        row.querySelector('.btn-down').addEventListener('click', () => {
            if (row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
        });
        row.querySelector('.btn-del').addEventListener('click', () => row.remove());

        container.appendChild(row);
    }

    function saveSettings(container) {
        // Save Global Settings
        const newTabCheckbox = document.getElementById('f95-setting-newtab');
        if (newTabCheckbox) {
            openInNewTab = newTabCheckbox.checked;
            GM_setValue('openInNewTab', openInNewTab);
        }

        // Save Button Array
        const rows = container.querySelectorAll('.f95-settings-row');
        const newData = [];

        rows.forEach(row => {
            const label = row.querySelector('.f95-input-label').value.trim();
            const query = row.querySelector('.f95-input-query').value.trim();
            const useTitle = row.querySelector('.f95-input-title').checked;

            if (label && query) {
                newData.push({ label, query, useTitle });
            }
        });

        if (newData.length > 0) {
            customButtons = newData;
            GM_setValue('f95_custom_buttons', customButtons);
        } else {
            alert('Settings not saved: You must have at least one button.');
        }
    }

    // --- Initialization ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectStyles();
            initButtons();
        });
    } else {
        injectStyles();
        initButtons();
    }
})();