// ==UserScript==
// @name         UploadHaven Automatic Download
// @namespace    local.poc.uploadhaven
// @version      0.1.0
// @description  Waits for the UploadHaven free-download button and clicks it automatically.
// @match        https://uploadhaven.com/download/*
// @match        https://www.uploadhaven.com/download/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const INITIAL_WAIT_MS = 20_000;
    const MAX_READY_WAIT_MS = 60_000;
    const SCAN_INTERVAL_MS = 250;
    const DEBUG = true;

    function log(...args) {
        if (DEBUG) {
            console.log('[UploadHaven Auto Download]', ...args);
        }
    }

    if (!/^\/download\/[^/]+\/?$/i.test(location.pathname)) {
        log('Not a recognized UploadHaven download page.');
        return;
    }

    const sessionKey =
        `uploadhaven-auto-download:${location.pathname}`;

    try {
        const previousRun = Number(
            sessionStorage.getItem(sessionKey) || 0
        );

        if (Date.now() - previousRun < 30_000) {
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

    function findReadyButton() {
        const button = document.querySelector(
            'button#submitFree.uh-dl-btn-free.ready'
        );

        if (!(button instanceof HTMLButtonElement)) {
            return null;
        }

        if (
            button.disabled ||
            button.getAttribute('aria-disabled') === 'true' ||
            !isVisible(button)
        ) {
            return null;
        }

        return button;
    }

    function triggerDownload() {
        if (completed) {
            return true;
        }

        const button = findReadyButton();

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

        log('Free Download button is ready. Clicking.');

        button.scrollIntoView({
            block: 'center',
            behavior: 'instant',
        });

        button.focus({
            preventScroll: true,
        });

        button.click();

        return true;
    }

    function beginReadyDetection() {
        log('Initial 20-second wait completed.');

        if (triggerDownload()) {
            return;
        }

        /*
         * Detect the moment UploadHaven adds the "ready" class or
         * enables/replaces the button.
         */
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
                'The Free Download button did not become ready within the time limit.'
            );
        }, MAX_READY_WAIT_MS);
    }

    log('Waiting 20 seconds before checking the button.');

    window.setTimeout(
        beginReadyDetection,
        INITIAL_WAIT_MS
    );
})();