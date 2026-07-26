// ==UserScript==
// @name         DelaFil Automatic Download
// @namespace    local.poc.delafil
// @version      0.1.0
// @description  Automatically clicks the tokenized download button on DelaFil file pages.
// @match        https://delafil.se/*
// @match        https://*.delafil.se/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const DEBUG = true;
    const MAX_WAIT_MS = 30_000;
    const SCAN_INTERVAL_MS = 250;

    /*
     * Keep this list to restrict automatic downloads to specific files.
     *
     * To enable the script for every valid DelaFil file page, change
     * TARGET_PATHS to null.
     */
    const TARGET_PATHS = new Set([
        '/22f066decb5b9361/MelodyMuse_V0.10a_Windows.zip',
    ]);

    const currentUrl = new URL(window.location.href);

    function log(...args) {
        if (DEBUG) {
            console.log('[DelaFil Auto Download]', ...args);
        }
    }

    /*
     * DelaFil pages appear to use:
     *
     * /<file identifier>/<filename>
     *
     * This replaces detection based on a /f/ path.
     */
    const filePagePattern = /^\/[a-f0-9]{16,}\/[^/]+$/i;

    if (!filePagePattern.test(currentUrl.pathname)) {
        log('Not a recognized DelaFil file page.');
        return;
    }

    if (TARGET_PATHS && !TARGET_PATHS.has(currentUrl.pathname)) {
        log('This file is not in TARGET_PATHS.');
        return;
    }

    /*
     * Do not run again if the browser has navigated to a tokenized URL.
     */
    if (
        currentUrl.searchParams.has('pt') ||
        currentUrl.searchParams.has('download_token')
    ) {
        log('Already on a tokenized download URL.');
        return;
    }

    /*
     * Avoid repeated downloads caused by an immediate page reload.
     */
    const sessionKey = `delafil-auto-download:${currentUrl.pathname}`;

    try {
        const previousRun = Number(sessionStorage.getItem(sessionKey) || 0);

        if (Date.now() - previousRun < 15_000) {
            log('Download was already triggered recently.');
            return;
        }
    } catch (error) {
        log('Could not read sessionStorage:', error);
    }

    let completed = false;
    let observer = null;
    let scanTimer = null;
    let timeoutTimer = null;

    function cleanup() {
        observer?.disconnect();

        if (scanTimer) {
            clearInterval(scanTimer);
        }

        if (timeoutTimer) {
            clearTimeout(timeoutTimer);
        }
    }

    function findDownloadLink() {
        const links = document.querySelectorAll(
            'center a.btn[href], a.btn.btn-default[href], a[href]'
        );

        return Array.from(links).find((link) => {
            let linkUrl;

            try {
                linkUrl = new URL(link.href, window.location.href);
            } catch {
                return false;
            }

            const label = (link.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();

            const isSameFile =
                linkUrl.origin === currentUrl.origin &&
                linkUrl.pathname === currentUrl.pathname;

            const hasDownloadToken = linkUrl.searchParams.has('pt');

            const looksLikeDownloadButton =
                link.matches('.btn, .btn-default') ||
                /ladda\s*ner|download/i.test(label);

            return (
                isSameFile &&
                hasDownloadToken &&
                looksLikeDownloadButton
            );
        });
    }

    function triggerDownload() {
        if (completed) {
            return true;
        }

        const downloadLink = findDownloadLink();

        if (!downloadLink) {
            return false;
        }

        completed = true;
        cleanup();

        try {
            sessionStorage.setItem(sessionKey, String(Date.now()));
        } catch (error) {
            log('Could not write to sessionStorage:', error);
        }

        log('Download link found:', downloadLink.href);

        /*
         * Force the link into the current tab and perform a real DOM click.
         * The generated pt token is used directly and is never hardcoded.
         */
        downloadLink.target = '_self';
        downloadLink.click();

        return true;
    }

    if (triggerDownload()) {
        return;
    }

    /*
     * Handle buttons inserted dynamically after page load.
     */
    observer = new MutationObserver(() => {
        triggerDownload();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
    });

    /*
     * Periodic scanning provides a fallback for unusual DOM updates.
     */
    scanTimer = window.setInterval(
        triggerDownload,
        SCAN_INTERVAL_MS
    );

    timeoutTimer = window.setTimeout(() => {
        cleanup();
        log('No tokenized download button found within the time limit.');
    }, MAX_WAIT_MS);
})();