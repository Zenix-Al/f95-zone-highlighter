// ==UserScript==
// @name         Google Drive Automatic Download
// @namespace    local.poc.googledrive
// @version      0.1.0
// @description  Automatically downloads accessible Google Drive files.
// @match        https://drive.google.com/file/d/*
// @match        https://drive.google.com/open*
// @match        https://drive.google.com/uc*
// @match        https://drive.usercontent.google.com/download*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const DEBUG = true;
    const MAX_WAIT_MS = 60_000;
    const SCAN_INTERVAL_MS = 300;

    function log(...args) {
        if (DEBUG) {
            console.log('[Google Drive Auto Download]', ...args);
        }
    }

    function getFileId() {
        /*
         * Standard file link:
         * https://drive.google.com/file/d/FILE_ID/view
         */
        const pathMatch = location.pathname.match(
            /^\/file\/d\/([^/]+)/
        );

        if (pathMatch) {
            return pathMatch[1];
        }

        /*
         * Older/open and direct-download links:
         * https://drive.google.com/open?id=FILE_ID
         * https://drive.google.com/uc?id=FILE_ID
         */
        return new URL(location.href).searchParams.get('id');
    }

    const fileId = getFileId();

    /*
     * Convert a preview/open page into a download request.
     */
    if (
        fileId &&
        (
            location.pathname.startsWith('/file/d/') ||
            location.pathname === '/open'
        )
    ) {
        const directDownloadUrl =
            `https://drive.google.com/uc?export=download&id=${
                encodeURIComponent(fileId)
            }`;

        log('Opening download route:', directDownloadUrl);
        location.replace(directDownloadUrl);
        return;
    }

    let completed = false;
    let observer = null;
    let intervalTimer = null;
    let timeoutTimer = null;

    function cleanup() {
        observer?.disconnect();

        if (intervalTimer !== null) {
            clearInterval(intervalTimer);
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
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function findConfirmationForm() {
        const selectors = [
            'form#download-form',
            'form[action*="drive.usercontent.google.com/download"]',
            'form[action*="/download"]',
            'form[action*="/uc"]',
        ];

        return document.querySelector(selectors.join(','));
    }

    function findConfirmationButton() {
        const selectors = [
            '#download-form button[type="submit"]',
            '#download-form input[type="submit"]',
            'form[action*="download"] button[type="submit"]',
            'form[action*="download"] input[type="submit"]',
            'button[type="submit"]',
            'input[type="submit"]',
        ];

        const candidates = document.querySelectorAll(
            selectors.join(',')
        );

        return Array.from(candidates).find((element) => {
            if (
                element instanceof HTMLButtonElement &&
                element.disabled
            ) {
                return false;
            }

            return isVisible(element);
        });
    }

    function findDownloadLink() {
        const links = document.querySelectorAll('a[href]');

        return Array.from(links).find((link) => {
            let url;

            try {
                url = new URL(link.href, location.href);
            } catch {
                return false;
            }

            const label = [
                link.textContent,
                link.getAttribute('aria-label'),
                link.getAttribute('title'),
            ]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            return (
                (
                    url.hostname ===
                        'drive.usercontent.google.com' ||
                    url.pathname.includes('/download') ||
                    url.pathname === '/uc'
                ) &&
                (
                    /\bdownload\b/i.test(label) ||
                    url.searchParams.has('confirm')
                )
            );
        });
    }

    function attemptConfirmation() {
        if (completed) {
            return true;
        }

        const form = findConfirmationForm();

        if (form instanceof HTMLFormElement) {
            const button = findConfirmationButton();

            completed = true;
            cleanup();

            log('Submitting Drive confirmation form.');

            if (
                button instanceof HTMLButtonElement ||
                button instanceof HTMLInputElement
            ) {
                form.requestSubmit(button);
            } else {
                form.requestSubmit();
            }

            return true;
        }

        const downloadLink = findDownloadLink();

        if (downloadLink) {
            completed = true;
            cleanup();

            log('Activating Drive confirmation link.');
            downloadLink.click();

            return true;
        }

        return false;
    }

    function startDetection() {
        if (attemptConfirmation()) {
            return;
        }

        observer = new MutationObserver(attemptConfirmation);

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'href',
                'action',
                'disabled',
                'style',
                'hidden',
            ],
        });

        intervalTimer = window.setInterval(
            attemptConfirmation,
            SCAN_INTERVAL_MS
        );

        timeoutTimer = window.setTimeout(() => {
            cleanup();
            log(
                'No downloadable file or confirmation form was found.'
            );
        }, MAX_WAIT_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            startDetection,
            { once: true }
        );
    } else {
        startDetection();
    }
})();