// ==UserScript==
// @name         KrakenFiles Automatic Download
// @namespace    local.poc.krakenfiles
// @version      0.1.0
// @description  Automatically clicks Download now on KrakenFiles.
// @match        https://krakenfiles.com/view/*/file.html*
// @match        https://www.krakenfiles.com/view/*/file.html*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const POST_CLICK_WAIT_MS = 3_000;
    const MAX_BUTTON_WAIT_MS = 30_000;
    const SCAN_INTERVAL_MS = 250;
    const DEBUG = true;

    function log(...args) {
        if (DEBUG) {
            console.log('[KrakenFiles Auto Download]', ...args);
        }
    }

    if (!/^\/view\/[^/]+\/file\.html\/?$/i.test(location.pathname)) {
        log('Not a recognized KrakenFiles file page.');
        return;
    }

    const sessionKey =
        `krakenfiles-auto-download:${location.pathname}`;

    try {
        const previousRun = Number(
            sessionStorage.getItem(sessionKey) || 0
        );

        if (Date.now() - previousRun < 15_000) {
            log('Download was triggered recently.');
            return;
        }
    } catch (error) {
        log('Unable to read sessionStorage:', error);
    }

    let completed = false;
    let observer = null;
    let scanTimer = null;
    let timeoutTimer = null;

    function cleanup() {
        observer?.disconnect();

        if (scanTimer !== null) {
            clearInterval(scanTimer);
        }

        if (timeoutTimer !== null) {
            clearTimeout(timeoutTimer);
        }
    }

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.pointerEvents !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function findDownloadButton() {
        const candidates = document.querySelectorAll(
            'button[type="submit"].btn.btn-primary'
        );

        return Array.from(candidates).find((button) => {
            if (!(button instanceof HTMLButtonElement)) {
                return false;
            }

            const text = [
                button.textContent,
                button.querySelector('.btn-text')?.textContent,
            ]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            return (
                /\bdownload\s+now\b/i.test(text) &&
                !button.disabled &&
                button.getAttribute('aria-disabled') !== 'true' &&
                isVisible(button)
            );
        });
    }

    function triggerDownload() {
        if (completed) {
            return true;
        }

        const button = findDownloadButton();

        if (!button) {
            return false;
        }

        completed = true;
        cleanup();

        try {
            sessionStorage.setItem(
                sessionKey,
                String(Date.now())
            );
        } catch (error) {
            log('Unable to write sessionStorage:', error);
        }

        log('Clicking Download now.');

        button.scrollIntoView({
            block: 'center',
            behavior: 'instant',
        });

        button.focus({
            preventScroll: true,
        });

        button.click();

        /*
         * KrakenFiles shows a short loading state before initiating
         * the browser download. Do not navigate or click again.
         */
        window.setTimeout(() => {
            log('Three-second post-click wait completed.');
        }, POST_CLICK_WAIT_MS);

        return true;
    }

    if (triggerDownload()) {
        return;
    }

    observer = new MutationObserver(() => {
        triggerDownload();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
            'class',
            'disabled',
            'aria-disabled',
            'style',
            'hidden',
        ],
    });

    scanTimer = window.setInterval(
        triggerDownload,
        SCAN_INTERVAL_MS
    );

    timeoutTimer = window.setTimeout(() => {
        cleanup();

        log(
            'Download now button was not found within the time limit.'
        );
    }, MAX_BUTTON_WAIT_MS);
})();