// ==UserScript==
// @name         MixDrop Two-Stage Automatic Download
// @namespace    local.poc.mixdrop
// @version      0.2.0
// @description  Clicks the initial MixDrop button, waits five seconds, then activates the generated download URL.
// @match        https://miiiixdrop.net/f/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const SECOND_STAGE_DELAY_MS = 5_000;
    const MAX_INITIAL_WAIT_MS = 30_000;
    const MAX_FINAL_WAIT_MS = 60_000;
    const SCAN_INTERVAL_MS = 250;
    const DEBUG = true;

    function log(...args) {
        if (DEBUG) {
            console.log('[MixDrop Auto Download]', ...args);
        }
    }

    if (!/^\/f\/[^/]+\/?$/i.test(location.pathname)) {
        log('Not a recognized /f/ file page.');
        return;
    }

    const sessionKey = `mixdrop-auto-download:${location.pathname}`;

    try {
        const previousRun = Number(
            sessionStorage.getItem(sessionKey) || 0
        );

        if (Date.now() - previousRun < 20_000) {
            log('Automation already ran recently.');
            return;
        }
    } catch (error) {
        log('Unable to read sessionStorage:', error);
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
            'a.download-btn, a.btn.btn3.download-btn'
        );

        return Array.from(candidates).find((element) => {
            const label = (element.textContent || '')
                .replace(/\s+/g, ' ')
                .trim();

            return (
                element instanceof HTMLAnchorElement &&
                /\bdownload\b/i.test(label) &&
                isVisible(element)
            );
        });
    }

    function hasUsableHref(link) {
        const rawHref = link.getAttribute('href');

        if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) {
            return false;
        }

        try {
            const url = new URL(rawHref, location.href);

            return (
                url.protocol === 'https:' ||
                url.protocol === 'http:'
            );
        } catch {
            return false;
        }
    }

    /*
     * Dispatch a realistic mouse sequence because the initial button may
     * use a JavaScript click handler instead of an href.
     */
    function performClick(element) {
        element.scrollIntoView({
            block: 'center',
            behavior: 'instant',
        });

        element.focus({
            preventScroll: true,
        });

        for (const eventName of [
            'pointerdown',
            'mousedown',
            'pointerup',
            'mouseup',
            'click',
        ]) {
            element.dispatchEvent(
                new MouseEvent(eventName, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                    button: 0,
                    buttons:
                        eventName === 'pointerdown' ||
                        eventName === 'mousedown'
                            ? 1
                            : 0,
                })
            );
        }
    }

    function waitForInitialButton() {
        return new Promise((resolve, reject) => {
            const immediateButton = findDownloadButton();

            if (immediateButton) {
                resolve(immediateButton);
                return;
            }

            const observer = new MutationObserver(() => {
                const button = findDownloadButton();

                if (button) {
                    cleanup();
                    resolve(button);
                }
            });

            const interval = setInterval(() => {
                const button = findDownloadButton();

                if (button) {
                    cleanup();
                    resolve(button);
                }
            }, SCAN_INTERVAL_MS);

            const timeout = setTimeout(() => {
                cleanup();
                reject(
                    new Error('Initial download button was not found.')
                );
            }, MAX_INITIAL_WAIT_MS);

            function cleanup() {
                observer.disconnect();
                clearInterval(interval);
                clearTimeout(timeout);
            }

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'class',
                    'style',
                    'hidden',
                ],
            });
        });
    }

    function waitForFinalLink() {
        return new Promise((resolve, reject) => {
            const immediateLink = findDownloadButton();

            if (immediateLink && hasUsableHref(immediateLink)) {
                resolve(immediateLink);
                return;
            }

            const observer = new MutationObserver(() => {
                const link = findDownloadButton();

                if (link && hasUsableHref(link)) {
                    cleanup();
                    resolve(link);
                }
            });

            const interval = setInterval(() => {
                const link = findDownloadButton();

                if (link && hasUsableHref(link)) {
                    cleanup();
                    resolve(link);
                }
            }, SCAN_INTERVAL_MS);

            const timeout = setTimeout(() => {
                cleanup();
                reject(
                    new Error(
                        'The final download href did not appear.'
                    )
                );
            }, MAX_FINAL_WAIT_MS);

            function cleanup() {
                observer.disconnect();
                clearInterval(interval);
                clearTimeout(timeout);
            }

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: [
                    'href',
                    'class',
                    'style',
                    'hidden',
                ],
            });
        });
    }

    async function run() {
        try {
            const initialButton = await waitForInitialButton();

            /*
             * In case the final href already exists, do not trigger the
             * initial-stage handler unnecessarily.
             */
            if (!hasUsableHref(initialButton)) {
                log('Clicking initial href-less download button.');
                performClick(initialButton);
            } else {
                log('Download href was already present.');
            }

            log('Waiting five seconds before final-stage detection.');

            await new Promise((resolve) => {
                setTimeout(resolve, SECOND_STAGE_DELAY_MS);
            });

            const finalLink = await waitForFinalLink();

            try {
                sessionStorage.setItem(
                    sessionKey,
                    String(Date.now())
                );
            } catch (error) {
                log('Unable to write sessionStorage:', error);
            }

            log('Final download URL:', finalLink.href);

            finalLink.target = '_self';
            finalLink.removeAttribute('rel');

            performClick(finalLink);
        } catch (error) {
            console.error(
                '[MixDrop Auto Download]',
                error.message
            );
        }
    }

    run();
})();