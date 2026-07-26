// ==UserScript==
// @name         UploadNow Single-File Automatic Download
// @namespace    local.poc.uploadnow
// @version      0.1.0
// @description  Automatically downloads only when an UploadNow share contains exactly one file.
// @match        https://uploadnow.io/*/share*
// @match        https://www.uploadnow.io/*/share*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const MAX_WAIT_MS = 30_000;
    const CHECK_INTERVAL_MS = 500;

    /*
     * Require the button count to remain unchanged for four checks.
     * At 500 ms per check, that means roughly two seconds of stability.
     */
    const REQUIRED_STABLE_CHECKS = 4;
    const DEBUG = true;

    function log(...args) {
        if (DEBUG) {
            console.log('[UploadNow Auto Download]', ...args);
        }
    }

    if (!/^\/[^/]+\/share\/?$/i.test(location.pathname)) {
        log('Not a recognized UploadNow share page.');
        return;
    }

    const sessionKey =
        `uploadnow-auto-download:${location.pathname}${location.search}`;

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

    function findDownloadButtons() {
        /*
         * The CSS-module hash may change, so match the stable portion of
         * the class name and confirm the download icon inside the button.
         */
        const primaryCandidates = document.querySelectorAll(
            'button[class*="file_browser_alt_options__"]'
        );

        let buttons = Array.from(primaryCandidates).filter((button) => {
            return button.querySelector(
                'svg[data-icon="arrow-down-to-line"]'
            );
        });

        /*
         * Fallback in case UploadNow changes the generated class prefix.
         */
        if (buttons.length === 0) {
            buttons = Array.from(
                document.querySelectorAll('button')
            ).filter((button) => {
                return button.querySelector(
                    'svg[data-icon="arrow-down-to-line"]'
                );
            });
        }

        return [...new Set(buttons)].filter((button) => {
            return (
                button instanceof HTMLButtonElement &&
                !button.disabled &&
                button.getAttribute('aria-disabled') !== 'true' &&
                isVisible(button)
            );
        });
    }

    function waitForStableButtonCount() {
        return new Promise((resolve, reject) => {
            const startedAt = Date.now();

            let previousCount = -1;
            let stableChecks = 0;

            const timer = window.setInterval(() => {
                const buttons = findDownloadButtons();
                const currentCount = buttons.length;

                if (currentCount > 0 && currentCount === previousCount) {
                    stableChecks += 1;
                } else {
                    stableChecks = 0;
                }

                if (currentCount !== previousCount) {
                    log(
                        `Detected ${currentCount} download button(s).`
                    );
                }

                previousCount = currentCount;

                if (
                    currentCount > 0 &&
                    stableChecks >= REQUIRED_STABLE_CHECKS
                ) {
                    clearInterval(timer);
                    resolve(buttons);
                    return;
                }

                if (Date.now() - startedAt >= MAX_WAIT_MS) {
                    clearInterval(timer);

                    /*
                     * Use the final count if some buttons were found,
                     * even if the page never became completely quiet.
                     */
                    if (buttons.length > 0) {
                        resolve(buttons);
                    } else {
                        reject(
                            new Error(
                                'No download buttons were found.'
                            )
                        );
                    }
                }
            }, CHECK_INTERVAL_MS);
        });
    }

    function performClick(button) {
        button.scrollIntoView({
            block: 'center',
            behavior: 'instant',
        });

        button.focus({
            preventScroll: true,
        });

        button.click();
    }

    async function run() {
        try {
            const buttons = await waitForStableButtonCount();

            log(
                `Final download-button count: ${buttons.length}`
            );

            if (buttons.length === 1) {
                try {
                    sessionStorage.setItem(
                        sessionKey,
                        String(Date.now())
                    );
                } catch (error) {
                    log(
                        'Unable to write sessionStorage:',
                        error
                    );
                }

                log('Exactly one file found. Clicking download.');

                performClick(buttons[0]);
                return;
            }

            if (buttons.length >= 2) {
                //alert the user by using toast if there's more than 2

                log(
                    `${buttons.length} files found; automatic download skipped.`
                );

                return;
            }
        } catch (error) {
            console.error(
                '[UploadNow Auto Download]',
                error.message
            );
        }
    }

    run();
})();