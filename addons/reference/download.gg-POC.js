// ==UserScript==
// @name         download.gg Automatic Download
// @namespace    local.poc.downloadgg
// @version      0.1.0
// @description  Automatically activates the download button on download.gg file pages.
// @match        https://download.gg/*
// @match        https://www.download.gg/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const DEBUG = true;
    const MAX_WAIT_MS = 60_000;
    const SCAN_INTERVAL_MS = 300;
    const RETRY_AFTER_CLICK_MS = 3_000;

    /*
     * Set this to true to accept any download.gg page containing
     * the expected download button, even if its URL pattern changes.
     */
    const ALLOW_BUTTON_ONLY_DETECTION = true;

    /*
     * Optional allowlist.
     *
     * Set to null to support every recognized download.gg file page.
     */
    const TARGET_PATHS = null;

    const pageUrl = new URL(window.location.href);

    function log(...args) {
        if (DEBUG) {
            console.log('[download.gg Auto Download]', ...args);
        }
    }

    /*
     * Recognizes examples such as:
     *
     * /en/file-18951734_18e45a29da12f63a
     * /fr/file-18951734_18e45a29da12f63a
     * /file-18951734_18e45a29da12f63a
     *
     * The language section is optional so the script is not tied to /en/.
     */
    const filePagePattern =
        /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?file-[a-z0-9_-]+\/?$/i;

    const matchesFilePath = filePagePattern.test(pageUrl.pathname);

    if (TARGET_PATHS && !TARGET_PATHS.has(pageUrl.pathname)) {
        log('Page is not included in TARGET_PATHS.');
        return;
    }

    /*
     * Prevent an immediate reload from starting the same download again.
     */
    const sessionKey =
        `downloadgg-auto-download:${pageUrl.pathname}`;

    try {
        const lastTrigger = Number(
            sessionStorage.getItem(sessionKey) || 0
        );

        if (Date.now() - lastTrigger < 15_000) {
            log('Download was triggered recently; stopping.');
            return;
        }
    } catch (error) {
        log('Unable to read sessionStorage:', error);
    }

    let completed = false;
    let observer = null;
    let intervalTimer = null;
    let timeoutTimer = null;
    let lastClickTime = 0;

    function cleanup() {
        observer?.disconnect();

        if (intervalTimer !== null) {
            clearInterval(intervalTimer);
        }

        if (timeoutTimer !== null) {
            clearTimeout(timeoutTimer);
        }
    }

    function isElementVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.pointerEvents !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function isButtonEnabled(button) {
        return (
            !button.disabled &&
            button.getAttribute('aria-disabled') !== 'true' &&
            !button.classList.contains('disabled')
        );
    }

    function findDownloadButton() {
        const selectors = [
            'button.downloadAttachment',
            'button.downloadAttachment[type="submit"]',
            'button.btn-file[type="submit"]',
            'form button.btn-pink[type="submit"]',
        ];

        const candidates = document.querySelectorAll(
            selectors.join(',')
        );

        return Array.from(candidates).find((button) => {
            const label = [
                button.textContent,
                button.getAttribute('aria-label'),
                button.getAttribute('title'),
            ]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            const hasExpectedClass =
                button.classList.contains('downloadAttachment');

            const looksLikeDownload =
                hasExpectedClass ||
                /\bdownload\b/i.test(label) ||
                button.querySelector(
                    '.fa-download, .fas.fa-download'
                );

            return (
                looksLikeDownload &&
                isButtonEnabled(button) &&
                isElementVisible(button)
            );
        });
    }

    function markAsTriggered() {
        try {
            sessionStorage.setItem(
                sessionKey,
                String(Date.now())
            );
        } catch (error) {
            log('Unable to write sessionStorage:', error);
        }
    }

    function activateDownloadButton(button) {
        /*
         * A normal click is preferred because the website may attach its
         * download logic to the button's click or form-submit handlers.
         */
        button.scrollIntoView({
            behavior: 'instant',
            block: 'center',
        });

        button.focus({
            preventScroll: true,
        });

        button.click();
    }

    function attemptDownload() {
        if (completed) {
            return true;
        }

        const button = findDownloadButton();

        if (!button) {
            return false;
        }

        /*
         * Require either a recognized URL or explicit permission to use
         * button-based detection when download.gg changes its URL scheme.
         */
        if (!matchesFilePath && !ALLOW_BUTTON_ONLY_DETECTION) {
            log(
                'Download button found, but URL is not a recognized file page.'
            );
            return false;
        }

        const now = Date.now();

        if (now - lastClickTime < RETRY_AFTER_CLICK_MS) {
            return false;
        }

        lastClickTime = now;

        log('Download button found:', button);
        log('Recognized file URL:', matchesFilePath);

        markAsTriggered();
        activateDownloadButton(button);

        /*
         * The button may start an asynchronous request without navigating.
         * Consider the activation complete after issuing the real click.
         */
        completed = true;
        cleanup();

        return true;
    }

    /*
     * Try immediately in case the page is already ready.
     */
    if (attemptDownload()) {
        return;
    }

    /*
     * Observe dynamic rendering, countdown completion, class changes,
     * disabled-state changes, and replacement of the download form.
     */
    observer = new MutationObserver(() => {
        attemptDownload();
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

    /*
     * Fallback for website state changes that do not create a useful
     * mutation event.
     */
    intervalTimer = window.setInterval(
        attemptDownload,
        SCAN_INTERVAL_MS
    );

    timeoutTimer = window.setTimeout(() => {
        cleanup();

        log(
            'No enabled and visible download button was found within the time limit.'
        );
    }, MAX_WAIT_MS);
})();