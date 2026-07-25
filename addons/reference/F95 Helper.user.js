// ==UserScript==
// @name         F95 Helper
// @namespace    https://greasyfork.org/en/users/1609612-aaa-aa
// @version      0.6.5
// @description  Adds filters, rating filter, watchlist, clean SVG icons, tag/rating highlights, safer auto-fill cards, layout options, and thread cleanup for F95Zone.
// @author       a small dumb ass
// @license      GPL-3.0-or-later
// @match        https://f95zone.to/sam/latest_alpha/*
// @match        https://f95zone.to/threads/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      f95zone.to
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/582424/F95%20Helper.user.js
// @updateURL https://update.greasyfork.org/scripts/582424/F95%20Helper.meta.js
// ==/UserScript==

/* eslint-disable no-multi-spaces */

(function () {
    'use strict';

    // =====================================================
    // 1. GLOBAL DATA / STORAGE
    // =====================================================
    // Filters = games/tags you do not want to see.
    // Watchlist = games you want to follow.
    // Keep storage keys here so future features are easy to find.

    const ALL_TAGS = [

        [2214,'2d game'],              [1507,'2dcg'],                 [1434,'3d game'],              [107,'3dcg'],
        [162,'adventure'],             [916,'ahegao'],                [2265,'ai cg'],                [2241,'anal sex'],
        [783,'animated'],              [264,'bdsm'],                  [105,'bestiality'],            [817,'big ass'],
        [130,'big tits'],              [339,'blackmail'],             [216,'bukkake'],               [2247,'censored'],
        [2246,'character creation'],   [924,'cheating'],              [550,'combat'],                [103,'corruption'],
        [606,'cosplay'],               [278,'creampie'],              [348,'dating sim'],            [1407,'dilf'],
        [2217,'drugs'],                [2249,'dystopian setting'],    [384,'exhibitionism'],         [179,'fantasy'],
        [2252,'female domination'],    [392,'female protagonist'],    [553,'footjob'],               [382,'furry'],
        [191,'futa/trans'],            [2255,'futa/trans protagonist'], [360,'gay'],                  [728,'graphic violence'],
        [535,'groping'],               [498,'group sex'],             [259,'handjob'],               [254,'harem'],
        [708,'horror'],                [871,'humiliation'],           [361,'humor'],                 [30,'incest'],
        [1483,'internal view'],        [894,'interracial'],           [736,'japanese game'],         [1111,'kinetic novel'],
        [290,'lactation'],             [181,'lesbian'],               [639,'loli'],                  [174,'male domination'],
        [173,'male protagonist'],      [449,'management'],            [176,'masturbation'],          [75,'milf'],
        [111,'mind control'],          [2229,'mobile game'],          [182,'monster'],               [394,'monster girl'],
        [322,'multiple endings'],      [1556,'multiple penetration'], [2242,'multiple protagonist'], [1828,'necrophilia'],
        [258,'netorare'],              [324,'no sexual content'],     [237,'oral sex'],              [408,'paranormal'],
        [505,'parody'],                [1508,'platformer'],           [1525,'point & click'],        [1476,'possession'],
        [1766,'pov'],                  [225,'pregnancy'],             [374,'prostitution'],          [1471,'puzzle'],
        [417,'rape'],                  [1707,'real porn'],            [2218,'religion'],             [330,'romance'],
        [45,'rpg'],                    [2257,'sandbox'],              [689,'scat'],                  [547,'school setting'],
        [141,'sci-fi'],                [2216,'sex toys'],             [670,'sexual harassment'],     [1079,'shooter'],
        [749,'shota'],                 [776,'side-scroller'],         [448,'simulator'],             [2215,'sissification'],
        [44,'slave'],                  [1305,'sleep sex'],            [769,'spanking'],              [628,'strategy'],
        [480,'stripping'],             [354,'superpowers'],           [2234,'swinging'],             [351,'teasing'],
        [215,'tentacles'],             [522,'text based'],            [411,'titfuck'],               [199,'trainer'],
        [875,'transformation'],        [362,'trap'],                  [452,'turn based combat'],     [327,'twins'],
        [1254,'urination'],            [2209,'vaginal sex'],          [833,'virgin'],                [895,'virtual reality'],
        [1506,'voiced'],               [757,'vore'],                  [485,'voyeurism']

    ].sort((a, b) => a[1].localeCompare(b[1]));

    const TAG_MAP = Object.fromEntries(
        ALL_TAGS.map(([id, name]) => [String(id), name])
    );

    const TAG_NAME_TO_ID = Object.fromEntries(
        ALL_TAGS.map(([id, name]) => [String(name).toLowerCase(), String(id)])
    );

    const HIGHLIGHT_COLOR_PRESETS = [
        { id: 'green',  name: 'Green',  bg: '#7CFF8A', fg: '#ffffff' },
        { id: 'blue',   name: 'Blue',   bg: '#2d72b8', fg: '#ffffff' },
        { id: 'yellow', name: 'Yellow', bg: '#d1a83a', fg: '#111111' },
        { id: 'orange', name: 'Orange', bg: '#b86b1f', fg: '#ffffff' },
        { id: 'purple', name: 'Purple', bg: '#6b4aa0', fg: '#ffffff' },
        { id: 'gray',   name: 'Gray',   bg: '#4b5563', fg: '#ffffff' },
        { id: 'dark',   name: 'Dark',   bg: '#252a33', fg: '#ffffff' }
    ];

    const MAX_TAG_HIGHLIGHT_GROUPS = 6;
    const MAX_RATING_RULES = 8;

    const DEFAULT_TAG_HIGHLIGHTS = [
        { id: 'h1', name: 'Highlight 1', color: 'green', tags: [] }
    ];

    const DEFAULT_RATING_RULES = [
        { threshold: 4.5, color: 'green' }
    ];

    const KEY_THREAD_IDS      = 'f95helper_thread_ids';
    const KEY_TAG_IDS         = 'f95helper_tag_ids';
    const KEY_FILTER_MODE     = 'f95helper_filter_mode';
    const KEY_HIDE_IGNORED    = 'f95helper_hide_ignored';
    const KEY_DIM_STRENGTH    = 'f95helper_dim_strength';
    const KEY_CARDS_PER_ROW   = 'f95helper_cards_per_row';
    const KEY_LATEST_WIDE     = 'f95helper_latest_wide';
    const KEY_HIDE_REACTIONS  = 'f95helper_hide_reactions';
    const KEY_COMPACT_USERS   = 'f95helper_compact_users';
    const KEY_HIDE_SIGNATURES = 'f95helper_hide_signatures';
    const KEY_TAG_HIGHLIGHTS  = 'f95helper_tag_highlights';
    const KEY_RATING_RULES    = 'f95helper_rating_rules';

    const KEY_RATING_FILTER_ENABLED  = 'f95helper_rating_filter_enabled';
    const KEY_RATING_FILTER_MIN      = 'f95helper_rating_filter_min';
    const KEY_RATING_FILTER_BEHAVIOR = 'f95helper_rating_filter_behavior';
    const KEY_RATING_FILTER_UNRATED  = 'f95helper_rating_filter_unrated';

    const KEY_WATCHLIST       = 'f95helper_watchlist';
    const KEY_WATCH_INTERVAL  = 'f95helper_watch_interval_hours';
    const KEY_CLEAN_REMINDER  = 'f95helper_last_cleanup_reminder';

    const KEY_AUTOFILL_ENABLED     = 'f95helper_autofill_enabled';
    const KEY_AUTOFILL_TARGET      = 'f95helper_autofill_target_visible';
    const KEY_AUTOFILL_MAX_PAGES   = 'f95helper_autofill_max_pages';

    function loadJson(key, fallback) {
        try {
            return JSON.parse(GM_getValue(key, JSON.stringify(fallback)));
        } catch {
            return fallback;
        }
    }

    function saveJson(key, value) {
        GM_setValue(key, JSON.stringify(value));
    }

    function cleanThreadIds(ids) {
        return (ids || []).map(String).filter(id => /^\d+$/.test(id));
    }

    function cleanTagIds(ids) {
        return (ids || []).map(String).filter(id => /^\d+$/.test(id) && TAG_MAP[id]);
    }

    function makeLocalId(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function cleanHighlightName(name, fallback) {
        const clean = String(name || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 32);

        return clean || fallback;
    }

    function cleanTagHighlights(groups) {
        const source = Array.isArray(groups) && groups.length ? groups : DEFAULT_TAG_HIGHLIGHTS;
        const allowedColors = new Set(HIGHLIGHT_COLOR_PRESETS.map(color => color.id));
        const oldFixedFormat = source.every(item => item && !Object.prototype.hasOwnProperty.call(item, 'id') && !Object.prototype.hasOwnProperty.call(item, 'name'));
        const seenGroupIds = new Set();
        const seenTags = new Set();
        const result = [];

        source.slice(0, MAX_TAG_HIGHLIGHT_GROUPS).forEach((item, index) => {
            const fallback = DEFAULT_TAG_HIGHLIGHTS[0];
            const number = result.length + 1;
            const rawId = String(item?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
            const groupId = rawId && !seenGroupIds.has(rawId) ? rawId : makeLocalId('h');
            const color = allowedColors.has(item?.color) ? item.color : (HIGHLIGHT_COLOR_PRESETS[index % HIGHLIGHT_COLOR_PRESETS.length]?.id || fallback.color);
            const name = cleanHighlightName(item?.name, `Highlight ${number}`);
            const tags = [];

            cleanTagIds(item?.tags || []).forEach(tagId => {
                if (seenTags.has(tagId)) return;
                seenTags.add(tagId);
                tags.push(tagId);
            });

            seenGroupIds.add(groupId);
            result.push({ id: groupId, name, color, tags });
        });

        // Migration polish:
        // v0.4.4 had three fixed empty groups. In v0.5.0, empty unused groups are removed.
        if (oldFixedFormat && result.length > 1) {
            const compact = result.filter((group, index) => index === 0 || group.tags.length > 0);
            return compact.length ? compact : [result[0]];
        }

        if (!result.length) {
            return [{ ...DEFAULT_TAG_HIGHLIGHTS[0], id: makeLocalId('h') }];
        }

        return result;
    }

    function cleanRatingRules(rules) {
        const source = Array.isArray(rules) ? rules : DEFAULT_RATING_RULES;
        const allowedColors = new Set(HIGHLIGHT_COLOR_PRESETS.map(color => color.id));
        const byThreshold = new Map();

        source.slice(0, MAX_RATING_RULES).forEach(rule => {
            const rawThreshold = Number(rule?.threshold);
            if (!Number.isFinite(rawThreshold)) return;

            const threshold = Math.max(0, Math.min(5, Math.round(rawThreshold * 10) / 10));
            const color = allowedColors.has(rule?.color) ? rule.color : 'green';

            byThreshold.set(threshold.toFixed(1), { threshold, color });
        });

        return [...byThreshold.values()].sort((a, b) => b.threshold - a.threshold);
    }

    function cleanWatchlist(list) {
        return (Array.isArray(list) ? list : [])
            .filter(item => item && /^\d+$/.test(String(item.id)))
            .map(item => ({
                id: String(item.id),
                title: item.title || `Game ${item.id}`,
                url: item.url || `https://f95zone.to/threads/${item.id}/`,
                developer: item.developer || '',
                status: item.status || 'Active',
                savedVersion: item.savedVersion || item.currentVersion || '',
                currentVersion: item.currentVersion || item.savedVersion || '',
                lastChecked: Number(item.lastChecked || 0),
                lastResult: item.lastResult || '',
                note: item.note || ''
            }));
    }

    let dimmedThreadIds = new Set(cleanThreadIds(loadJson(KEY_THREAD_IDS, [])));
    let dimmedTagIds = new Set(cleanTagIds(loadJson(KEY_TAG_IDS, [])));

    let filterMode = GM_getValue(KEY_FILTER_MODE, 'dim');
    if (!['off', 'dim', 'hide'].includes(filterMode)) filterMode = 'dim';

    let hideIgnored = GM_getValue(KEY_HIDE_IGNORED, false);

    let dimStrength = Number(GM_getValue(KEY_DIM_STRENGTH, 20));
    if (!Number.isFinite(dimStrength)) dimStrength = 20;
    dimStrength = Math.max(5, Math.min(80, dimStrength));

    let cardsPerRow = Number(GM_getValue(KEY_CARDS_PER_ROW, 3));
    if (![3, 4].includes(cardsPerRow)) cardsPerRow = 3;

    let latestWide = GM_getValue(KEY_LATEST_WIDE, false);
    let hideReactions = GM_getValue(KEY_HIDE_REACTIONS, false);
    let compactUsers = GM_getValue(KEY_COMPACT_USERS, false);
    let hideSignatures = GM_getValue(KEY_HIDE_SIGNATURES, false);
    let tagHighlights = cleanTagHighlights(loadJson(KEY_TAG_HIGHLIGHTS, DEFAULT_TAG_HIGHLIGHTS));
    let ratingRules = cleanRatingRules(loadJson(KEY_RATING_RULES, DEFAULT_RATING_RULES));

    let ratingFilterEnabled = GM_getValue(KEY_RATING_FILTER_ENABLED, false);

    let ratingFilterMin = Number(GM_getValue(KEY_RATING_FILTER_MIN, 2));
    if (!Number.isFinite(ratingFilterMin)) ratingFilterMin = 2;
    ratingFilterMin = Math.max(0, Math.min(5, Math.round(ratingFilterMin * 10) / 10));

    let ratingFilterBehavior = GM_getValue(KEY_RATING_FILTER_BEHAVIOR, 'hide');
    if (!['off', 'dim', 'hide'].includes(ratingFilterBehavior)) ratingFilterBehavior = 'hide';

    let ratingFilterUnrated = GM_getValue(KEY_RATING_FILTER_UNRATED, 'keep');
    if (!['keep', 'low'].includes(ratingFilterUnrated)) ratingFilterUnrated = 'keep';

    let watchlist = cleanWatchlist(loadJson(KEY_WATCHLIST, []));
    let watchIntervalHours = Number(GM_getValue(KEY_WATCH_INTERVAL, 24));
    if (![24, 48, 72, 96, 168, 720].includes(watchIntervalHours)) watchIntervalHours = 24;

    let autoFillEnabled = GM_getValue(KEY_AUTOFILL_ENABLED, false);

    let autoFillTarget = Number(GM_getValue(KEY_AUTOFILL_TARGET, 24));
    if (![12, 18, 24, 36, 48].includes(autoFillTarget)) autoFillTarget = 24;

    let autoFillMaxPages = Number(GM_getValue(KEY_AUTOFILL_MAX_PAGES, 3));
    if (![1, 2, 3, 5].includes(autoFillMaxPages)) autoFillMaxPages = 3;

    const AUTOFILL_FUTURE_PAGE_BUTTONS = 2;

    let activePage = 'filters';
    let feedbackTimer = null;
    let filterTimer = null;
    let autoFillTimer = null;
    let autoFillSignatureTimer = null;
    let isCheckingUpdates = false;
    let stopCheckingUpdates = false;
    let isAutoFilling = false;
    let stopAutoFilling = false;
    let autoFillSuppressSchedule = false;
    let autoFillBaseSignature = '';
    let autoFillBasePage = 1;
    let autoFillTotalPages = 0;
    let autoFillLoadedPages = new Set();
    let autoFillStatusMessage = '';
    let autoFillStatusIsError = false;
    let activeAutoFillRequest = null;
    let activeWatchRequest = null;

    saveJson(KEY_THREAD_IDS, [...dimmedThreadIds]);
    saveJson(KEY_TAG_IDS, [...dimmedTagIds]);
    saveJson(KEY_TAG_HIGHLIGHTS, tagHighlights);
    saveJson(KEY_RATING_RULES, ratingRules);
    saveJson(KEY_WATCHLIST, watchlist);

    // =====================================================
    // 1B. INLINE SVG ICONS
    // =====================================================
    // Centralized icon pack.
    // Keep all SVG code here so UI sections stay readable.
    // These icons are inline SVG strings, so the script does not need external files,
    // web fonts, icon fonts, or OS emoji rendering.

    const SVG_ICONS = Object.freeze({
        gear: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M10.45 3.25h3.1l.45 2.2c.55.14 1.07.35 1.55.62l1.86-1.22 2.19 2.19-1.22 1.86c.27.48.48 1 .62 1.55l2.2.45v3.1l-2.2.45a7.2 7.2 0 0 1-.62 1.55l1.22 1.86-2.19 2.19-1.86-1.22c-.48.27-1 .48-1.55.62l-.45 2.2h-3.1l-.45-2.2a7.2 7.2 0 0 1-1.55-.62l-1.86 1.22-2.19-2.19 1.22-1.86a7.2 7.2 0 0 1-.62-1.55l-2.2-.45v-3.1l2.2-.45c.14-.55.35-1.07.62-1.55L4.4 7.04l2.19-2.19 1.86 1.22c.48-.27 1-.48 1.55-.62z" fill="none" stroke="#b9dcff" stroke-width="1.75" stroke-linejoin="round"/>
                <circle cx="12" cy="12" r="3.15" fill="none" stroke="#ffd166" stroke-width="1.65"/>
            </svg>
        `,

        filters: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M2.9 12s3.45-5.6 9.1-5.6c1.9 0 3.55.55 4.9 1.33" stroke="#5aa9ff" stroke-width="1.85" stroke-linecap="round"/>
                <path d="M21.1 12s-3.45 5.6-9.1 5.6c-1.9 0-3.55-.55-4.9-1.33" stroke="#5aa9ff" stroke-width="1.85" stroke-linecap="round"/>
                <path d="M9.95 9.95a2.9 2.9 0 0 0 4.1 4.1" stroke="#ffd166" stroke-width="1.85" stroke-linecap="round"/>
                <path d="M4 4l16 16" stroke="#ff6b6b" stroke-width="2.05" stroke-linecap="round"/>
            </svg>
        `,

        filter: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M2.9 12s3.45-5.6 9.1-5.6c1.9 0 3.55.55 4.9 1.33" stroke="#5aa9ff" stroke-width="1.85" stroke-linecap="round"/>
                <path d="M21.1 12s-3.45 5.6-9.1 5.6c-1.9 0-3.55-.55-4.9-1.33" stroke="#5aa9ff" stroke-width="1.85" stroke-linecap="round"/>
                <path d="M9.95 9.95a2.9 2.9 0 0 0 4.1 4.1" stroke="#ffd166" stroke-width="1.85" stroke-linecap="round"/>
                <path d="M4 4l16 16" stroke="#ff6b6b" stroke-width="2.05" stroke-linecap="round"/>
            </svg>
        `,

        watchlist: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 3.2l2.7 5.45 6 .87-4.35 4.24 1.03 5.98L12 16.9 6.62 19.74l1.03-5.98L3.3 9.52l6-.87z" fill="#ffd166" stroke="#ffefad" stroke-width="1.35" stroke-linejoin="round"/>
            </svg>
        `,

        watch: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 3.2l2.7 5.45 6 .87-4.35 4.24 1.03 5.98L12 16.9 6.62 19.74l1.03-5.98L3.3 9.52l6-.87z" fill="#ffd166" stroke="#ffefad" stroke-width="1.35" stroke-linejoin="round"/>
            </svg>
        `,

        highlights: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M20 10.25l-8.35 8.35a2.05 2.05 0 0 1-2.9 0L4.2 14.05V4.2h9.85z" fill="none" stroke="#7CFF8A" stroke-width="1.7" stroke-linejoin="round"/>
                <circle cx="8.35" cy="8.35" r="1.35" fill="#ffd166"/>
                <path d="M14 6.5l3.6 3.6" stroke="#5aa9ff" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
        `,

        tag: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M20 10.25l-8.35 8.35a2.05 2.05 0 0 1-2.9 0L4.2 14.05V4.2h9.85z" fill="none" stroke="#7CFF8A" stroke-width="1.7" stroke-linejoin="round"/>
                <circle cx="8.35" cy="8.35" r="1.35" fill="#ffd166"/>
                <path d="M14 6.5l3.6 3.6" stroke="#5aa9ff" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
        `,

        appearance: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6h1.15a1.7 1.7 0 0 0 1.12-2.98 1.5 1.5 0 0 1 1-2.62h1.65A4 4 0 0 0 20.9 11.2c0-4.42-3.9-8-8.9-8z" fill="none" stroke="#5aa9ff" stroke-width="1.65" stroke-linejoin="round"/>
                <circle cx="7.55" cy="10.1" r="1" fill="#ff6b6b"/>
                <circle cx="10.25" cy="7.35" r="1" fill="#ffd166"/>
                <circle cx="14.1" cy="7.55" r="1" fill="#7CFF8A"/>
                <circle cx="16.65" cy="10.65" r="1" fill="#ff7ad9"/>
            </svg>
        `,

        palette: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6h1.15a1.7 1.7 0 0 0 1.12-2.98 1.5 1.5 0 0 1 1-2.62h1.65A4 4 0 0 0 20.9 11.2c0-4.42-3.9-8-8.9-8z" fill="none" stroke="#5aa9ff" stroke-width="1.65" stroke-linejoin="round"/>
                <circle cx="7.55" cy="10.1" r="1" fill="#ff6b6b"/>
                <circle cx="10.25" cy="7.35" r="1" fill="#ffd166"/>
                <circle cx="14.1" cy="7.55" r="1" fill="#7CFF8A"/>
                <circle cx="16.65" cy="10.65" r="1" fill="#ff7ad9"/>
            </svg>
        `,

        backup: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M5 4.3h11.5L19 6.8v13H5z" fill="none" stroke="#5aa9ff" stroke-width="1.65" stroke-linejoin="round"/>
                <path d="M8 4.4v5.1h7.1V4.4" stroke="#ffd166" stroke-width="1.45"/>
                <path d="M8 19.8v-5.2h8v5.2" stroke="#7CFF8A" stroke-width="1.45"/>
                <circle cx="16.2" cy="7" r="0.8" fill="#ff7ad9"/>
            </svg>
        `,

        save: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M5 4.3h11.5L19 6.8v13H5z" fill="none" stroke="#5aa9ff" stroke-width="1.65" stroke-linejoin="round"/>
                <path d="M8 4.4v5.1h7.1V4.4" stroke="#ffd166" stroke-width="1.45"/>
                <path d="M8 19.8v-5.2h8v5.2" stroke="#7CFF8A" stroke-width="1.45"/>
                <circle cx="16.2" cy="7" r="0.8" fill="#ff7ad9"/>
            </svg>
        `,

        watched: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 3.2l2.7 5.45 6 .87-4.35 4.24 1.03 5.98L12 16.9 6.62 19.74l1.03-5.98L3.3 9.52l6-.87z" fill="#ffd166" stroke="#ffefad" stroke-width="1.25" stroke-linejoin="round"/>
            </svg>
        `,

        star: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 3.2l2.7 5.45 6 .87-4.35 4.24 1.03 5.98L12 16.9 6.62 19.74l1.03-5.98L3.3 9.52l6-.87z" fill="#ffd166" stroke="#ffefad" stroke-width="1.25" stroke-linejoin="round"/>
            </svg>
        `,

        update: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 19V5.2" stroke="#7CFF8A" stroke-width="2.45" stroke-linecap="round"/>
                <path d="M6.7 10.5L12 5.2l5.3 5.3" stroke="#7CFF8A" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `,

        arrowUp: `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
                <path d="M12 19V5.2" stroke="#7CFF8A" stroke-width="2.45" stroke-linecap="round"/>
                <path d="M6.7 10.5L12 5.2l5.3 5.3" stroke="#7CFF8A" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `
    });


    function svgIcon(name, extraClass = '') {
        const raw = SVG_ICONS[name] || '';
        if (!raw) return '';

        const cleanClass = String(extraClass || '')
            .split(/\s+/)
            .filter(cls => /^[a-z0-9_-]+$/i.test(cls))
            .join(' ');

        const className = cleanClass ? `f95h-svg-icon ${cleanClass}` : 'f95h-svg-icon';

        return raw.trim().replace('<svg ', `<svg class="${className}" aria-hidden="true" focusable="false" `);
    }

    function appendSvgIcon(parent, name, extraClass = '') {
        if (!parent) return null;

        const wrap = document.createElement('span');
        wrap.className = 'f95h-svg-wrap';
        wrap.innerHTML = svgIcon(name, extraClass);
        parent.appendChild(wrap);
        return wrap;
    }

    // =====================================================
    // 2. SHARED HELPERS
    // =====================================================
    // General helpers used by more than one feature.

    function showFeedback(message, isError = false) {
        const el = document.getElementById('f95h-feedback');
        if (!el) return;

        el.textContent = message;
        el.classList.toggle('error', isError);

        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => {
            el.textContent = '';
            el.classList.remove('error');
        }, 3500);
    }

    function extractThreadId(raw) {
        raw = String(raw || '').trim();
        if (!raw) return null;

        if (/^\d+$/.test(raw)) return raw;

        let m = raw.match(/\/threads\/(\d+)(?:\/|$)/i);
        if (m) return m[1];

        m = raw.match(/\/threads\/[^/]*\.(\d+)(?:\/|$)/i);
        if (m) return m[1];

        m = raw.match(/\.(\d+)\/?$/);
        if (m) return m[1];

        m = raw.match(/(\d+)\/?$/);
        return m ? m[1] : null;
    }

    function makeCleanThreadUrl(id) {
        return `https://f95zone.to/threads/${id}/`;
    }

    function absoluteUrl(url) {
        try {
            return new URL(url, location.origin).href;
        } catch {
            return '';
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function now() {
        return Date.now();
    }

    function hoursToMs(hours) {
        return Number(hours) * 60 * 60 * 1000;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function randomCheckDelayMs() {
        // Slower than one request every 5 seconds.
        // Random timing feels more natural and less bot-like.
        return 8000 + Math.floor(Math.random() * 4000);
    }

    function estimateRemainingText(remainingChecks) {
        // We check one game every about 8–12 seconds.
        // Average is around 10 seconds.
        const seconds = remainingChecks * 10;

        if (seconds < 60) {
            return `~${seconds}s`;
        }

        const minutes = Math.ceil(seconds / 60);

        if (minutes < 60) {
            return `~${minutes} min`;
        }

        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;

        return `~${hours}h ${restMinutes}m`;
    }

    function normalizeVersion(version) {
        return String(version || '')
            .toLowerCase()
            .replace(/^version\s*:/i, '')
            .replace(/^v/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function versionChanged(savedVersion, currentVersion) {
        if (!savedVersion || !currentVersion) return false;
        return normalizeVersion(savedVersion) !== normalizeVersion(currentVersion);
    }

    function formatAge(timestamp) {
        if (!timestamp) return 'never';

        const diff = now() - timestamp;
        const hours = Math.floor(diff / (60 * 60 * 1000));
        const days = Math.floor(hours / 24);

        if (hours < 1) return 'less than 1 hour ago';
        if (hours < 24) return `${hours}h ago`;
        if (days < 30) return `${days}d ago`;

        const months = Math.floor(days / 30);
        return `${months}mo ago`;
    }

    function getEffectiveIntervalHours(item) {
        const userInterval = Math.max(24, Number(watchIntervalHours || 24));
        const status = (item.status || '').toLowerCase();

        if (status === 'completed' || status === 'onhold' || status === 'on hold') {
            return Math.max(userInterval, 48);
        }

        return userInterval;
    }

    function canCheckItem(item) {
        if (!item.lastChecked) return true;
        return now() - Number(item.lastChecked || 0) >= hoursToMs(getEffectiveIntervalHours(item));
    }

    function countCheckableItems(startIndex = 0) {
        return watchlist
            .slice(startIndex)
            .filter(item => {
                const status = (item.status || '').toLowerCase();

                if (status === 'abandoned') return false;
                if (!canCheckItem(item)) return false;

                return true;
            })
            .length;
    }

    function nextAllowedText(item) {
        if (!item.lastChecked) return 'now';

        const nextTime = Number(item.lastChecked) + hoursToMs(getEffectiveIntervalHours(item));
        const diff = nextTime - now();

        if (diff <= 0) return 'now';

        const hours = Math.ceil(diff / (60 * 60 * 1000));
        if (hours < 24) return `${hours}h`;

        const days = Math.ceil(hours / 24);
        return `${days}d`;
    }

    function readJsonFileToTextarea(file, textarea) {
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.json')) {
            showFeedback('Please choose a .json file.', true);
            return;
        }

        const reader = new FileReader();

        reader.onload = ev => {
            textarea.value = ev.target.result;
            showFeedback('✓ JSON file loaded. Click Import to apply it.');
        };

        reader.onerror = () => {
            showFeedback('Could not read the JSON file.', true);
        };

        reader.readAsText(file);
    }


    function isLatestPage() {
        return location.pathname.startsWith('/sam/latest_alpha/');
    }

    function isThreadPage() {
        return location.pathname.startsWith('/threads/');
    }

    function normalizeTagName(name) {
        return String(name || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function getTagIdFromName(name) {
        return TAG_NAME_TO_ID[normalizeTagName(name)] || '';
    }

    function getHighlightPreset(colorId) {
        return HIGHLIGHT_COLOR_PRESETS.find(color => color.id === colorId) || HIGHLIGHT_COLOR_PRESETS[0];
    }

    function saveTagHighlights() {
        tagHighlights = cleanTagHighlights(tagHighlights);
        saveJson(KEY_TAG_HIGHLIGHTS, tagHighlights);
    }

    function saveRatingRules() {
        ratingRules = cleanRatingRules(ratingRules);
        saveJson(KEY_RATING_RULES, ratingRules);
    }

    function getHighlightGroupById(groupId) {
        return tagHighlights.find(group => group.id === groupId) || null;
    }

    function getHighlightGroupIndexForTag(tagId) {
        tagId = String(tagId);
        return tagHighlights.findIndex(group => group.tags.includes(tagId));
    }

    function getHighlightForTagId(tagId) {
        const index = getHighlightGroupIndexForTag(tagId);
        if (index < 0) return null;

        return {
            groupIndex: index,
            group: tagHighlights[index],
            preset: getHighlightPreset(tagHighlights[index].color)
        };
    }

    function removeTagFromAllHighlightGroups(tagId) {
        tagId = String(tagId);
        tagHighlights.forEach(group => {
            group.tags = group.tags.filter(id => id !== tagId);
        });
    }

    function setHighlightedTagStyle(el, preset) {
        el.classList.add('f95h-tag-highlighted');
        el.style.setProperty('background-color', preset.bg, 'important');
        el.style.setProperty('color', preset.fg, 'important');
    }

    function clearHighlightedTagStyle(el) {
        if (!el.classList.contains('f95h-tag-highlighted')) return;

        el.classList.remove('f95h-tag-highlighted');
        el.style.removeProperty('background-color');
        el.style.removeProperty('color');
    }

    function parseRatingValue(text) {
        const m = String(text || '').match(/(\d+(?:\.\d+)?)/);
        if (!m) return null;

        const value = Number(m[1]);
        return Number.isFinite(value) ? value : null;
    }

    function getRatingRuleForValue(value) {
        if (!Number.isFinite(value)) return null;

        const sorted = [...ratingRules].sort((a, b) => b.threshold - a.threshold);
        return sorted.find(rule => value >= rule.threshold) || null;
    }

    function setHighlightedRatingStyle(el, preset) {
        el.classList.add('f95h-rating-highlighted');
        el.style.setProperty('color', preset.bg, 'important');
    }

    function clearHighlightedRatingStyle(el) {
        if (!el.classList.contains('f95h-rating-highlighted')) return;

        el.classList.remove('f95h-rating-highlighted');
        el.style.removeProperty('color');
    }

    function cleanRatingFilterMin(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return ratingFilterMin;
        return Math.max(0, Math.min(5, Math.round(number * 10) / 10));
    }

    function getCardRatingValue(card) {
        const ratingEl = card.querySelector('.resource-tile_info-meta_rating');
        if (!ratingEl) return null;
        return parseRatingValue(ratingEl.textContent);
    }

    function getRatingFilterAction(card) {
        if (!ratingFilterEnabled || ratingFilterBehavior === 'off') return '';

        const value = getCardRatingValue(card);

        if (value === null) {
            return ratingFilterUnrated === 'low' && ratingFilterMin > 0 ? ratingFilterBehavior : '';
        }

        return value < ratingFilterMin ? ratingFilterBehavior : '';
    }

    function saveRatingFilterSettings() {
        GM_setValue(KEY_RATING_FILTER_ENABLED, ratingFilterEnabled);
        GM_setValue(KEY_RATING_FILTER_MIN, ratingFilterMin);
        GM_setValue(KEY_RATING_FILTER_BEHAVIOR, ratingFilterBehavior);
        GM_setValue(KEY_RATING_FILTER_UNRATED, ratingFilterUnrated);
    }

    function ratingFilterSignature() {
        return [
            ratingFilterEnabled ? 'ratingOn' : 'ratingOff',
            ratingFilterMin.toFixed(1),
            ratingFilterBehavior,
            ratingFilterUnrated
        ].join(':');
    }

    function applyTagHighlights() {
        // Latest Updates hover tags.
        document.querySelectorAll('.resource-tile_tags span').forEach(tag => {
            const id = getTagIdFromName(tag.textContent);
            const highlight = id ? getHighlightForTagId(id) : null;

            if (highlight) {
                setHighlightedTagStyle(tag, highlight.preset);
            } else {
                clearHighlightedTagStyle(tag);
            }
        });

        // Thread page tag list.
        document.querySelectorAll('.tagItem, .tagList a[href*="/tags/"]').forEach(tag => {
            const id = getTagIdFromName(tag.textContent);
            const highlight = id ? getHighlightForTagId(id) : null;

            if (highlight) {
                setHighlightedTagStyle(tag, highlight.preset);
            } else {
                clearHighlightedTagStyle(tag);
            }
        });
    }

    function applyRatingHighlights() {
        if (!isLatestPage()) return;

        document.querySelectorAll('.resource-tile_info-meta_rating').forEach(ratingEl => {
            const value = parseRatingValue(ratingEl.textContent);
            const rule = value !== null ? getRatingRuleForValue(value) : null;

            if (rule) {
                setHighlightedRatingStyle(ratingEl, getHighlightPreset(rule.color));
            } else {
                clearHighlightedRatingStyle(ratingEl);
            }
        });
    }

    function applyAllHighlights() {
        applyTagHighlights();
        applyRatingHighlights();
    }

    function rememberActiveRequest(kind, request) {
        if (kind === 'auto') activeAutoFillRequest = request;
        if (kind === 'watch') activeWatchRequest = request;
    }

    function forgetActiveRequest(kind, request) {
        if (kind === 'auto' && activeAutoFillRequest === request) activeAutoFillRequest = null;
        if (kind === 'watch' && activeWatchRequest === request) activeWatchRequest = null;
    }

    function abortActiveRequest(kind) {
        const request = kind === 'auto' ? activeAutoFillRequest : activeWatchRequest;
        if (!request || typeof request.abort !== 'function') return false;

        try {
            request.abort();
        } catch {
            // Some userscript engines may throw if the request already finished.
        }

        if (kind === 'auto') activeAutoFillRequest = null;
        if (kind === 'watch') activeWatchRequest = null;
        return true;
    }

    // =====================================================
    // 3. THREAD HTML FETCH / METADATA PARSER
    // =====================================================
    // Watchlist update checks fetch only the HTML text.
    // Images, videos, CSS, and external scripts are not requested by this code.

    function fetchHtmlOnly(url, trackAs = '') {
        return new Promise((resolve, reject) => {
            let request = null;

            const finish = () => {
                if (trackAs) forgetActiveRequest(trackAs, request);
            };

            request = GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    Accept: 'text/html,application/xhtml+xml'
                },
                timeout: 30000,
                onload: response => {
                    finish();

                    if (response.status >= 200 && response.status < 400) {
                        resolve({
                            html: response.responseText || '',
                            finalUrl: response.finalUrl || url
                        });
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: () => {
                    finish();
                    reject(new Error('Request failed'));
                },
                ontimeout: () => {
                    finish();
                    reject(new Error('Request timed out'));
                },
                onabort: () => {
                    finish();
                    reject(new Error('Request aborted'));
                }
            });

            if (trackAs) rememberActiveRequest(trackAs, request);
        });
    }

    function fetchJsonOnly(url, trackAs = '') {
        return new Promise((resolve, reject) => {
            let request = null;

            const finish = () => {
                if (trackAs) forgetActiveRequest(trackAs, request);
            };

            request = GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    Accept: 'application/json,text/javascript,*/*;q=0.01'
                },
                timeout: 30000,
                onload: response => {
                    finish();

                    if (response.status < 200 || response.status >= 400) {
                        reject(new Error(`HTTP ${response.status}`));
                        return;
                    }

                    try {
                        resolve(JSON.parse(response.responseText || '{}'));
                    } catch {
                        reject(new Error('Invalid JSON response'));
                    }
                },
                onerror: () => {
                    finish();
                    reject(new Error('Request failed'));
                },
                ontimeout: () => {
                    finish();
                    reject(new Error('Request timed out'));
                },
                onabort: () => {
                    finish();
                    reject(new Error('Request aborted'));
                }
            });

            if (trackAs) rememberActiveRequest(trackAs, request);
        });
    }

    function getMeta(doc, selector, attr = 'content') {
        const el = doc.querySelector(selector);
        return el ? (el.getAttribute(attr) || '').trim() : '';
    }

    function extractStatusFromTitle(title) {
        const clean = String(title || '');

        if (/\bAbandoned\b/i.test(clean)) return 'Abandoned';
        if (/\bCompleted\b/i.test(clean)) return 'Completed';
        if (/\bOnhold\b/i.test(clean) || /\bOn Hold\b/i.test(clean)) return 'Onhold';

        return 'Active';
    }

    function extractVersionFromTitle(title) {
        const brackets = [...String(title || '').matchAll(/\[([^\]]+)\]/g)]
            .map(m => m[1].trim());

        return brackets.find(x => {
            return (
                /^v?\d/i.test(x) ||
                /^patch\s*\d/i.test(x) ||
                /^ch\.?\s*\d/i.test(x) ||
                /^chapter\s*\d/i.test(x)
            );
        }) || '';
    }

    function extractDeveloperFromTitle(title) {
        const brackets = [...String(title || '').matchAll(/\[([^\]]+)\]/g)]
            .map(m => m[1].trim());

        if (brackets.length >= 2) return brackets[brackets.length - 1];
        return '';
    }

    function elementToReadableText(el) {
        if (!el) return '';

        const clone = el.cloneNode(true);

        // <br> does not always become a line break in textContent,
        // so we manually turn it into "\n".
        clone.querySelectorAll('br').forEach(br => {
            br.replaceWith('\n');
        });

        // Add line breaks after common block elements.
        clone.querySelectorAll('div, p, li, tr').forEach(block => {
            block.append('\n');
        });

        return clone.textContent
            .replace(/\u200b/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s+/g, '\n')
            .replace(/\n{2,}/g, '\n')
            .trim();
    }

    function getThreadStarterText(doc) {
        const starter =
            doc.querySelector('.message-threadStarterPost .bbWrapper') ||
            doc.querySelector('article.message-threadStarterPost .message-body') ||
            doc.querySelector('article.message-threadStarterPost');

        return elementToReadableText(starter);
    }

    function extractNamedField(text, fieldName) {
        const safeName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${safeName}\\s*:\\s*([^\\n\\r]+)`, 'i');

        const m = String(text || '').match(regex);
        if (!m) return '';

        return m[1]
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80);
    }

    function extractVersionFromText(text) {
        // Best source:
        // The actual "Version:" line from the thread starter post.
        const versionField = extractNamedField(text, 'Version');

        if (versionField) {
            return versionField.slice(0, 60).trim();
        }

        // Backup:
        // Bracket versions like [v0.2], [Patch 24], [2026.1.5].
        const clean = String(text || '').replace(/\s+/g, ' ').trim();

        let m = clean.match(/\[(v\d+[^\]]{0,50})\]/i);
        if (m) return m[1].trim();

        m = clean.match(/\[(patch\s*\d+[^\]]{0,30})\]/i);
        if (m) return m[1].trim();

        m = clean.match(/\[(\d{4}[.\-_]\d{1,2}[.\-_]\d{1,2}[^\]]{0,20})\]/i);
        if (m) return m[1].trim();

        return '';
    }

    function extractGameTitleFromTitle(fullTitle) {
        let title = String(fullTitle || '')
            .replace(/\s*\|\s*F95zone.*$/i, '')
            .trim();

        // Remove common F95 title prefixes.
        title = title.replace(/^(VN|Ren'Py|RPGM|HTML|Unity|Unreal|Java|Flash|QSP|Wolf RPG|ADRIFT|Others?)\s*-\s*/i, '');
        title = title.replace(/^(VN|Ren'Py|RPGM|HTML|Unity|Unreal|Java|Flash|QSP|Wolf RPG|ADRIFT|Others?)\s*-\s*/i, '');
        title = title.replace(/^(Completed|Abandoned|Onhold|On Hold)\s*-\s*/i, '');

        // Remove version/developer brackets from the end.
        title = title.replace(/\s*\[[^\]]+\]\s*\[[^\]]+\]\s*$/, '');
        title = title.replace(/\s*\[[^\]]+\]\s*$/, '');

        return title.trim() || fullTitle;
    }

    function parseThreadMetadata(html, fallbackId, fallbackUrl) {
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const ogTitle = getMeta(doc, 'meta[property="og:title"]');
        const pageTitle = doc.querySelector('title')?.textContent?.trim() || '';
        const rawTitle = ogTitle || pageTitle || `Game ${fallbackId}`;

        const canonical =
            getMeta(doc, 'meta[property="og:url"]') ||
            getMeta(doc, 'link[rel="canonical"]', 'href') ||
            fallbackUrl ||
            makeCleanThreadUrl(fallbackId);

        const id = extractThreadId(canonical) || fallbackId;
        const starterText = getThreadStarterText(doc);
        const bodyText = doc.body?.innerText || '';

        const status = extractStatusFromTitle(rawTitle);
        const title = extractGameTitleFromTitle(rawTitle);
        let version =
            extractVersionFromText(starterText) ||
            extractVersionFromTitle(rawTitle) ||
            extractVersionFromText(bodyText);

        if (version.length > 60) {
            version = '';
        }
        const developer = extractDeveloperFromTitle(rawTitle);

        return {
            id: String(id),
            title,
            url: absoluteUrl(canonical) || makeCleanThreadUrl(id),
            developer,
            status,
            savedVersion: version,
            currentVersion: version,
            lastChecked: now(),
            lastResult: 'Added',
            note: ''
        };
    }

    async function getThreadMetadataFromInput(rawInput) {
        const id = extractThreadId(rawInput);

        if (!id) {
            throw new Error('Could not find a thread ID.');
        }

        const inputUrl = absoluteUrl(rawInput) || makeCleanThreadUrl(id);
        const result = await fetchHtmlOnly(inputUrl);

        return parseThreadMetadata(result.html, id, result.finalUrl || inputUrl);
    }

    // =====================================================
    // 4. PAGE CARD HELPERS
    // =====================================================
    // These only work on Latest Updates cards.

    function getCards() {
        return [...document.querySelectorAll('.resource-tile[data-thread-id]')];
    }

    function getOnPageIds() {
        return new Set(
            getCards()
                .map(card => card.dataset.threadId)
                .filter(Boolean)
        );
    }

    function getTitleFromCard(threadId) {
        const card = document.querySelector(`.resource-tile[data-thread-id="${threadId}"]`);
        if (!card) return '';

        const titleEl = card.querySelector(
            '[class*="title"] a, [class*="title"], .resource-tile__title, h3, h4, a[title]'
        );

        if (!titleEl) return '';

        return (
            titleEl.getAttribute('title') ||
            titleEl.textContent ||
            ''
        ).trim();
    }

    function getCardThreadUrl(card) {
        const link = card.querySelector('a[href*="/threads/"]');
        return link ? absoluteUrl(link.href) : makeCleanThreadUrl(card.dataset.threadId);
    }

    function updateCounts() {
        const gameCount = document.getElementById('f95h-game-count');
        const tagCount = document.getElementById('f95h-tag-count');
        const navFilterCount = document.getElementById('f95h-nav-filter-count');
        const watchCount = document.getElementById('f95h-watch-count');
        const navWatchCount = document.getElementById('f95h-nav-watch-count');
        const navHighlightCount = document.getElementById('f95h-nav-highlight-count');

        if (gameCount) gameCount.textContent = dimmedThreadIds.size;
        if (tagCount) tagCount.textContent = dimmedTagIds.size;
        if (navFilterCount) navFilterCount.textContent = dimmedThreadIds.size + dimmedTagIds.size;

        if (watchCount) watchCount.textContent = watchlist.length;
        if (navWatchCount) navWatchCount.textContent = watchlist.length;

        const highlightCount = tagHighlights.reduce((total, group) => total + group.tags.length, 0) + ratingRules.length;
        if (navHighlightCount) navHighlightCount.textContent = highlightCount;
    }

    // =====================================================
    // 5. LATEST PAGE AUTO-FILL HELPERS
    // =====================================================
    // Auto-fill is separate from the watchlist.
    // It only fetches Latest Updates list data, appends extra cards,
    // and then lets the existing filter/highlight/watch systems process them.

    function getPageWindow() {
        try {
            if (typeof unsafeWindow !== 'undefined') return unsafeWindow;
        } catch {
            // Some userscript engines do not expose unsafeWindow.
        }

        return window;
    }

    function getLatestOptions() {
        const pageWin = getPageWindow();
        return pageWin?.latestUpdates?.options || {};
    }

    function getLatestOption(name, fallback = '') {
        const value = getLatestOptions()?.[name];
        return value === undefined || value === null ? fallback : String(value);
    }

    function uniqueList(list) {
        return [...new Set((list || []).map(String).filter(Boolean))];
    }

    function parseLatestState(hash = location.hash) {
        const source = String(hash || '');
        const get = pattern => {
            const m = source.match(pattern);
            return m ? m[1] : '';
        };

        const splitIds = value => {
            return value
                ? uniqueList(value.split(',').filter(id => /^\d+$/.test(id)))
                : [];
        };

        const page = Math.max(1, Number(get(/\/page=([0-9]+)/)) || 1);

        return {
            cat: get(/\/cat=([a-z]+)/) || 'games',
            page,
            tags: splitIds(get(/\/tags=([0-9,]+)/)),
            notags: splitIds(get(/\/notags=([0-9,]+)/)),
            prefixes: splitIds(get(/\/prefixes=([0-9,]+)/)),
            noprefixes: splitIds(get(/\/noprefixes=([0-9,]+)/)),
            tagtype: get(/\/tagtype=(and|or)/) || 'and',
            search: decodeURIComponent(get(/\/search=(.*?)(?:\/|$)/) || '').trim(),
            creator: decodeURIComponent(get(/\/creator=(.*?)(?:\/|$)/) || '').trim(),
            sort: get(/\/sort=([a-z]+)/) || 'date',
            date: Number(get(/\/date=([0-9]+)/)) || 0
        };
    }

    function latestStateSignature(state) {
        return [
            state.cat,
            state.page,
            state.tags.join(','),
            state.notags.join(','),
            state.prefixes.join(','),
            state.noprefixes.join(','),
            state.tagtype,
            state.search,
            state.creator,
            state.sort,
            state.date
        ].join('|');
    }

    function buildLatestHash(state, page = state.page) {
        let hash = `/cat=${state.cat}/page=${page}`;

        if (state.tags.length) hash += `/tags=${state.tags.join(',')}`;
        if (state.notags.length) hash += `/notags=${state.notags.join(',')}`;
        if (state.tagtype && state.tagtype !== 'and') hash += `/tagtype=${state.tagtype}`;
        if (state.prefixes.length) hash += `/prefixes=${state.prefixes.join(',')}`;
        if (state.noprefixes.length) hash += `/noprefixes=${state.noprefixes.join(',')}`;
        if (state.sort && state.sort !== 'date') hash += `/sort=${state.sort}`;
        if (state.search) hash += `/search=${encodeURIComponent(state.search)}`;
        if (state.creator) hash += `/creator=${encodeURIComponent(state.creator)}`;
        if (state.date) hash += `/date=${state.date}`;

        return hash;
    }

    function appendArrayParams(params, name, list) {
        (list || []).forEach(value => params.append(`${name}[]`, value));
    }

    function buildLatestDataUrl(state, page) {
        const params = new URLSearchParams();
        const rows = Number(getLatestOption('rows', 30));

        params.set('cmd', 'list');
        params.set('cat', state.cat);
        params.set('page', page);

        appendArrayParams(params, 'prefixes', state.prefixes);
        appendArrayParams(params, 'noprefixes', state.noprefixes);
        appendArrayParams(params, 'tags', state.tags);
        appendArrayParams(params, 'notags', state.notags);

        if (state.search) params.set('search', state.search);
        if (state.creator) params.set('creator', state.creator);
        params.set('sort', state.sort || 'date');
        if (state.date) params.set('date', state.date);
        if (rows && rows !== 30) params.set('rows', rows);
        if (hideIgnored || getLatestOption('ignoredThreads') === 'hide') params.set('ignored', 'hide');
        if (state.tagtype === 'or') params.set('tagtype', 'or');

        return `${location.origin}/sam/latest_alpha/latest_data.php?${params.toString()}`;
    }

    function randomAutoFillDelayMs() {
        return 1800 + Math.floor(Math.random() * 1400);
    }

    function countVisibleCards() {
        return getCards().filter(card => !card.classList.contains('f95h-hidden')).length;
    }

    function getAutoFillDefaultStatusText() {
        if (!isLatestPage()) return 'Auto-fill works only on Latest Updates.';
        if (!autoFillEnabled) return 'Off. Enable it to refill hidden cards.';
        if (filterMode !== 'hide') return 'Ready, but it only runs when filter mode is Hide.';
        if (isCheckingUpdates) return 'Paused while watchlist update checking is running.';
        if (isAutoFilling) return 'Loading extra pages...';

        const loaded = [...autoFillLoadedPages].sort((a, b) => a - b);
        if (loaded.length) {
            const highestLoaded = Math.max(...loaded);
            return `Loaded page${loaded.length === 1 ? '' : 's'} ${loaded.join(', ')}. Next useful pages: ${highestLoaded + 1}, ${highestLoaded + 2}.`;
        }

        return `Ready. Target: ${autoFillTarget} visible cards.`;
    }

    function renderAutoFillStatus() {
        const progress = document.getElementById('f95h-autofill-progress');
        if (!progress) return;

        progress.textContent = autoFillStatusMessage || getAutoFillDefaultStatusText();
        progress.classList.toggle('error', autoFillStatusIsError);
    }

    function updateAutoFillUI() {
        const enabled = document.getElementById('f95h-autofill-enabled');
        const target = document.getElementById('f95h-autofill-target');
        const maxPages = document.getElementById('f95h-autofill-max-pages');
        const clearBtn = document.getElementById('f95h-autofill-clear');

        if (enabled) enabled.checked = autoFillEnabled;
        if (target) target.value = String(autoFillTarget);
        if (maxPages) maxPages.value = String(autoFillMaxPages);
        if (clearBtn) clearBtn.disabled = isAutoFilling || !autoFillLoadedPages.size;

        renderAutoFillStatus();
    }

    function setAutoFillProgress(message, isError = false) {
        autoFillStatusMessage = String(message || '');
        autoFillStatusIsError = Boolean(isError);
        renderAutoFillStatus();
    }

    function clearAutoFillProgress() {
        autoFillStatusMessage = '';
        autoFillStatusIsError = false;
        renderAutoFillStatus();
    }

    function cancelAutoFill(message = '', isError = false) {
        stopAutoFilling = true;
        clearTimeout(autoFillTimer);
        abortActiveRequest('auto');

        if (message) {
            setAutoFillProgress(message, isError);
        }

        updateAutoFillUI();
    }

    function latestAutoFillContextSignature(state = parseLatestState()) {
        return [
            latestStateSignature(state),
            filterMode,
            hideIgnored ? 'hideIgnored' : 'showIgnored',
            ratingFilterSignature(),
            getLatestOption('rows', 30),
            getLatestOption('ignoredThreads', ''),
            getLatestOption('newTab', ''),
            getLatestOption('searchHighlight', '')
        ].join('|');
    }

    function resetAutoFillState(removeCards = true, silent = false) {
        clearTimeout(autoFillTimer);

        if (removeCards) {
            document.querySelectorAll('[data-f95h-autofill="1"], .f95h-auto-page-break').forEach(el => el.remove());
        }

        autoFillLoadedPages.clear();
        const state = parseLatestState();
        autoFillBasePage = state.page;
        autoFillBaseSignature = latestAutoFillContextSignature(state);
        autoFillTotalPages = getKnownTotalPages();
        syncAutoFillPagination();

        if (!silent) clearAutoFillProgress();
        updateAutoFillUI();
    }

    function getKnownTotalPages() {
        const pages = [...document.querySelectorAll('.sub-nav_info-paging_nums a.nav_num[data-page]:not(.f95h-auto-page-extra)')]
            .map(a => Number(a.dataset.page || a.textContent || 0))
            .filter(Number.isFinite);

        return pages.length ? Math.max(...pages) : autoFillTotalPages;
    }

    function canRunAutoFill() {
        return (
            isLatestPage() &&
            autoFillEnabled &&
            filterMode === 'hide' &&
            !isCheckingUpdates
        );
    }

    function nextAutoFillPage(state) {
        const onPage = new Set([state.page, ...autoFillLoadedPages]);
        let page = state.page + 1;

        while (onPage.has(page)) page++;
        return page;
    }

    function latestPrefixInfo(prefixId, cat) {
        const pageWin = getPageWindow();
        const groups = pageWin?.latestUpdates?.prefixes?.[cat] || [];

        for (const group of groups) {
            for (const prefix of group.prefixes || []) {
                if (String(prefix.id) === String(prefixId)) {
                    return {
                        parentId: Number(group.id),
                        name: prefix.name || String(prefixId),
                        className: prefix.class || 'label--gray'
                    };
                }
            }
        }

        return null;
    }

    function formatShortNumber(value) {
        const number = Number(value) || 0;
        if (number > 1000000) return `${Math.round(number / 100000) / 10}M`;
        if (number > 1000) return `${Math.round(number / 1000)}K`;
        return String(value ?? 0);
    }

    function makeEl(tag, className = '', text = '') {
        const el = document.createElement(tag);

        if (className) {
            String(className)
                .split(/\s+/)
                .filter(Boolean)
                .forEach(cls => el.classList.add(cls));
        }

        if (text !== '') el.textContent = String(text);
        return el;
    }

    function applySafeClassName(el, className, fallback = 'label--gray') {
        const classes = String(className || fallback)
            .split(/\s+/)
            .map(cls => cls.trim())
            .filter(cls => /^[a-z0-9_-]+$/i.test(cls));

        (classes.length ? classes : [fallback]).forEach(cls => el.classList.add(cls));
    }

    function appendLatestDate(parent, dateText) {
        const clean = String(dateText || '');
        const m = clean.match(/^([0-9]+ )?([A-Za-z ]+)$/i);

        if (!m) {
            parent.textContent = clean;
            return;
        }

        const span = document.createElement('span');
        span.className = `tile-date_${m[2].toLowerCase().replace(/ /g, '')}`;
        span.textContent = m[1] ? m[1].trim() : '';
        parent.appendChild(span);
    }

    function appendHighlightedText(parent, text, search) {
        const title = String(text || '');
        const cleanSearch = String(search || '').replace(/\s+/g, ' ').trim();

        if (!cleanSearch) {
            parent.textContent = title;
            return;
        }

        const terms = uniqueList([cleanSearch, ...cleanSearch.split(' ')]).filter(Boolean);
        if (!terms.length) {
            parent.textContent = title;
            return;
        }

        const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(title))) {
            if (match.index > lastIndex) {
                parent.appendChild(document.createTextNode(title.slice(lastIndex, match.index)));
            }

            const span = document.createElement('span');
            span.className = 'search-highlight';
            span.textContent = match[0];
            parent.appendChild(span);
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < title.length) {
            parent.appendChild(document.createTextNode(title.slice(lastIndex)));
        }
    }

    function makeLatestLabel(prefixId, state) {
        const info = latestPrefixInfo(prefixId, state.cat);
        if (!info) return null;

        const label = document.createElement('div');
        applySafeClassName(label, info.className);
        label.textContent = info.name;
        label.dataset.f95hParentId = String(info.parentId);
        return label;
    }

    function buildLatestCardElement(item, state, sourcePage) {
        const threadId = String(item?.thread_id || '');
        const rating = Math.max(0, Math.min(5, Number(item?.rating || 0)));
        const isAssets = state.cat === 'assets';
        const isComics = state.cat === 'comics';
        const versionText = !isAssets && item?.version !== 'Unknown' ? String(item?.version || '') : '';
        const newTab = getLatestOption('newTab', 'true') === 'true';
        const searchHighlight = getLatestOption('searchHighlight', 'true') === 'true';
        const images = (item?.screens && item.screens.length ? item.screens : [item?.cover]).filter(Boolean).map(String);

        const card = makeEl('div', `resource-tile ${item?.ignored ? 'resource-tile_ignored' : ''} ${item?.new ? 'resource-tile_new' : 'resource-tile_update'}`);
        card.dataset.f95hAutofill = '1';
        card.dataset.f95hSourcePage = String(sourcePage);
        card.dataset.threadId = threadId;
        card.dataset.tags = (item?.tags || []).join(',');
        card.dataset.images = images.join(',');

        const link = makeEl('a', 'resource-tile_link');
        link.href = makeCleanThreadUrl(threadId);
        link.rel = 'noopener';
        if (newTab) link.target = '_blank';
        card.appendChild(link);

        const thumbWrap = makeEl('div', 'resource-tile_thumb-wrap');
        const thumb = makeEl('div', 'resource-tile_thumb');
        if (item?.cover) thumb.style.backgroundImage = `url(${JSON.stringify(String(item.cover))})`;
        if (item?.watched) thumb.appendChild(makeEl('i', 'far fa-eye watch-icon'));
        thumbWrap.appendChild(thumb);
        link.appendChild(thumbWrap);

        const body = makeEl('div', 'resource-tile_body');
        link.appendChild(body);

        const labelWrap = makeEl('div', 'resource-tile_label-wrap');
        const labelsLeft = makeEl('div', 'resource-tile_label-wrap_left');
        const labelsRight = makeEl('div', 'resource-tile_label-wrap_right');

        [...(item?.prefixes || [])]
            .sort((a, b) => Number(b) - Number(a))
            .forEach(prefixId => {
                const label = makeLatestLabel(prefixId, state);
                if (!label) return;

                if (label.dataset.f95hParentId === '4') {
                    labelsRight.appendChild(label);
                } else {
                    labelsLeft.appendChild(label);
                }
            });

        labelsRight.appendChild(makeEl('div', 'resource-tile_label-version', versionText));
        labelWrap.appendChild(labelsLeft);
        labelWrap.appendChild(labelsRight);
        body.appendChild(labelWrap);

        const info = makeEl('div', 'resource-tile_info');
        const header = makeEl('header', 'resource-tile_info-header');
        const titleWrap = makeEl('div', 'header_title-wrap');
        const title = makeEl('h2', 'resource-tile_info-header_title');

        if (searchHighlight && state.search) {
            appendHighlightedText(title, item?.title || '', state.search);
        } else {
            title.textContent = String(item?.title || '');
        }

        titleWrap.appendChild(title);
        header.appendChild(titleWrap);
        header.appendChild(makeEl('div', 'header_title-ver', versionText));
        header.appendChild(makeEl('div', 'resource-tile_dev fas fa-user', !isAssets ? String(item?.creator || '') : ''));
        info.appendChild(header);

        const meta = makeEl('div', 'resource-tile_info-meta');
        const time = makeEl('div', 'resource-tile_info-meta_time');
        appendLatestDate(time, item?.date || '');
        meta.appendChild(time);
        meta.appendChild(makeEl('div', 'resource-tile_info-meta_likes', item?.likes ?? 0));
        meta.appendChild(makeEl('div', 'resource-tile_info-meta_views', formatShortNumber(item?.views)));

        if (!isAssets && !isComics) {
            meta.appendChild(makeEl('div', 'resource-tile_info-meta_rating', rating === 0 ? '-' : Math.round(10 * rating) / 10));
        }

        const ratingBar = makeEl('div', 'resource-tile_rating');
        const ratingFill = document.createElement('span');
        ratingFill.style.width = `${20 * rating}%`;
        ratingBar.appendChild(ratingFill);
        meta.appendChild(ratingBar);
        info.appendChild(meta);
        body.appendChild(info);

        return card;
    }

    function getLatestCardsFromHtml(html, sourcePage) {
        if (!html || typeof html !== 'string') return [];

        const doc = new DOMParser().parseFromString(html, 'text/html');
        return [...doc.querySelectorAll('#latest-page_items-wrap_inner .resource-tile[data-thread-id], .resource-tile[data-thread-id]')]
            .map(card => {
                const imported = document.importNode(card, true);
                imported.dataset.f95hAutofill = '1';
                imported.dataset.f95hSourcePage = String(sourcePage);
                imported.style.display = '';
                return imported;
            });
    }

    function getLatestCardsFromMessage(msg, state, sourcePage) {
        const htmlCards = [
            ...getLatestCardsFromHtml(msg?.html, sourcePage),
            ...getLatestCardsFromHtml(msg?.content, sourcePage),
            ...getLatestCardsFromHtml(typeof msg === 'string' ? msg : '', sourcePage)
        ];

        if (htmlCards.length) return htmlCards;

        const data = Array.isArray(msg?.data) ? msg.data : [];
        return data
            .filter(item => /^\d+$/.test(String(item?.thread_id || '')))
            .map(item => buildLatestCardElement(item, state, sourcePage));
    }

    function appendAutoFillPage(msg, sourcePage, state) {
        const wrap = document.querySelector('#latest-page_items-wrap_inner');
        if (!wrap) return 0;

        const existingIds = getOnPageIds();
        const cards = getLatestCardsFromMessage(msg, state, sourcePage);
        let added = 0;

        if (!cards.length) return 0;

        const breakEl = document.createElement('div');
        breakEl.className = 'f95h-auto-page-break';
        breakEl.dataset.f95hPageBreak = String(sourcePage);
        breakEl.textContent = `Loaded from page ${sourcePage}`;
        wrap.appendChild(breakEl);

        cards.forEach(card => {
            const id = String(card?.dataset?.threadId || '');
            if (!/^\d+$/.test(id) || existingIds.has(id)) return;

            card.dataset.f95hAutofill = '1';
            card.dataset.f95hSourcePage = String(sourcePage);
            wrap.appendChild(card);
            existingIds.add(id);
            added++;
        });

        if (!added) breakEl.remove();
        return added;
    }

    async function fetchLatestListPage(state, page) {
        const url = buildLatestDataUrl(state, page);
        const json = await fetchJsonOnly(url, 'auto');

        if (json.status !== 'ok') {
            throw new Error(json.msg || 'Latest page request failed');
        }

        return json.msg || {};
    }

    function scheduleAutoFillIfNeeded(reason = '') {
        clearTimeout(autoFillTimer);

        if (autoFillSuppressSchedule || isAutoFilling || !autoFillEnabled || !isLatestPage()) {
            syncAutoFillPagination();
            updateAutoFillUI();
            return;
        }

        autoFillTimer = setTimeout(() => {
            runAutoFill(reason).catch(error => {
                isAutoFilling = false;
                stopAutoFilling = false;

                if (error.message === 'Request aborted') {
                    setAutoFillProgress('Auto-fill stopped.');
                } else {
                    setAutoFillProgress(error.message || 'Auto-fill failed.', true);
                }

                syncAutoFillPagination();
                updateAutoFillUI();
            });
        }, 450);
    }

    async function runAutoFill(reason = 'auto') {
        if (isAutoFilling) {
            updateAutoFillUI();
            return;
        }

        if (!canRunAutoFill()) {
            if (autoFillEnabled && filterMode === 'hide' && isCheckingUpdates) {
                setAutoFillProgress('Auto-fill paused while watchlist checking is running.');
            } else {
                clearAutoFillProgress();
            }

            updateAutoFillUI();
            return;
        }

        let state = parseLatestState();
        let signature = latestAutoFillContextSignature(state);

        if (autoFillBaseSignature && autoFillBaseSignature !== signature) {
            resetAutoFillState(true, true);
            state = parseLatestState();
            signature = latestAutoFillContextSignature(state);
        }

        autoFillBaseSignature = signature;
        autoFillBasePage = state.page;
        autoFillTotalPages = getKnownTotalPages();
        isAutoFilling = true;
        stopAutoFilling = false;
        clearAutoFillProgress();
        updateAutoFillUI();

        let fetchedPages = 0;
        let addedCards = 0;
        let visible = countVisibleCards();

        try {
            if (visible >= autoFillTarget) {
                setAutoFillProgress(`Target already reached: ${visible}/${autoFillTarget} visible cards.`);
                return;
            }

            while (
                visible < autoFillTarget &&
                fetchedPages < autoFillMaxPages &&
                !stopAutoFilling
            ) {
                const currentState = parseLatestState();
                const currentSignature = latestAutoFillContextSignature(currentState);

                if (currentSignature !== autoFillBaseSignature) {
                    resetAutoFillState(true, true);
                    setAutoFillProgress('Page context changed. Extra cards were reset.');
                    break;
                }

                const page = nextAutoFillPage(state);
                const total = autoFillTotalPages || getKnownTotalPages();

                if (total && page > total) {
                    setAutoFillProgress('No more pages to load.');
                    break;
                }

                setAutoFillProgress(`Loading page ${page}... ${visible}/${autoFillTarget} visible cards.`);

                const msg = await fetchLatestListPage(state, page);
                const pagination = msg.pagination || {};
                autoFillTotalPages = Number(pagination.total || autoFillTotalPages || 0);

                const added = appendAutoFillPage(msg, page, state);
                autoFillLoadedPages.add(page);
                fetchedPages++;
                addedCards += added;

                autoFillSuppressSchedule = true;
                applyFilteringNow();
                applyAllHighlights();
                markWatchedCards();
                autoFillSuppressSchedule = false;

                visible = countVisibleCards();
                syncAutoFillPagination();

                if (!added) {
                    setAutoFillProgress(`Page ${page} had no new cards. Stopped.`);
                    break;
                }

                if (visible >= autoFillTarget) break;
                if (fetchedPages >= autoFillMaxPages) break;

                await delay(randomAutoFillDelayMs());
            }

            const loaded = [...autoFillLoadedPages].sort((a, b) => a - b);

            if (stopAutoFilling) {
                setAutoFillProgress(`Stopped. Loaded ${loaded.length} extra page${loaded.length === 1 ? '' : 's'}.`);
            } else if (addedCards > 0) {
                setAutoFillProgress(`Done. Visible cards: ${countVisibleCards()}. Loaded pages: ${loaded.join(', ')}.`);
            } else if (reason === 'manual' || reason === 'toggle' || reason === 'target') {
                setAutoFillProgress('Nothing to add right now.');
            }
        } catch (error) {
            if (error.message === 'Request aborted' || stopAutoFilling) {
                setAutoFillProgress('Auto-fill stopped.');
            } else {
                setAutoFillProgress(error.message || 'Auto-fill failed.', true);
            }
        } finally {
            isAutoFilling = false;
            stopAutoFilling = false;
            syncAutoFillPagination();
            updateAutoFillUI();
        }
    }

    function makePageAnchor(page, state) {
        const a = document.createElement('a');
        a.className = 'nav_num f95h-auto-page-extra';
        a.dataset.page = String(page);
        a.href = `#${buildLatestHash(state, page)}`;
        a.rel = 'ajax';
        a.textContent = String(page);
        return a;
    }

    function markLoadedPageAnchor(anchor, page) {
        const loaded = autoFillLoadedPages.has(page);
        anchor.classList.toggle('f95h-auto-page-loaded', loaded);
        anchor.title = loaded ? 'Already auto-filled into this page' : '';
    }

    function syncAutoFillPagination() {
        if (!isLatestPage()) return;

        const state = parseLatestState();
        const loadedPages = [...autoFillLoadedPages].sort((a, b) => a - b);
        const highestLoaded = loadedPages.length ? Math.max(...loadedPages) : state.page;
        const lastPage = autoFillTotalPages || getKnownTotalPages();
        const endPage = Math.min(lastPage || highestLoaded + AUTOFILL_FUTURE_PAGE_BUTTONS, highestLoaded + AUTOFILL_FUTURE_PAGE_BUTTONS);

        document.querySelectorAll('.sub-nav_info-paging_nums').forEach(nums => {
            nums.querySelectorAll('.f95h-auto-page-extra').forEach(a => a.remove());

            nums.querySelectorAll('a.nav_num[data-page]').forEach(anchor => {
                markLoadedPageAnchor(anchor, Number(anchor.dataset.page));
            });

            if (!autoFillEnabled || !loadedPages.length || endPage <= state.page) return;

            const existing = new Set(
                [...nums.querySelectorAll('a.nav_num[data-page]')]
                    .map(a => Number(a.dataset.page))
                    .filter(Number.isFinite)
            );

            for (let page = state.page + 1; page <= endPage; page++) {
                if (existing.has(page)) continue;

                const anchor = makePageAnchor(page, state);
                markLoadedPageAnchor(anchor, page);

                const numericAnchors = [...nums.querySelectorAll('a.nav_num[data-page]')]
                    .filter(a => Number(a.dataset.page) > page);
                const firstHigher = numericAnchors.sort((a, b) => Number(a.dataset.page) - Number(b.dataset.page))[0];
                const trailingEllipsis = firstHigher?.previousElementSibling?.classList?.contains('page-num_input')
                    ? firstHigher.previousElementSibling
                    : null;

                nums.insertBefore(anchor, trailingEllipsis || firstHigher || null);
                existing.add(page);
            }
        });
    }

    function wireAutoFillControls() {
        const enabled = document.getElementById('f95h-autofill-enabled');
        const target = document.getElementById('f95h-autofill-target');
        const maxPages = document.getElementById('f95h-autofill-max-pages');
        const clearBtn = document.getElementById('f95h-autofill-clear');

        if (enabled) {
            enabled.addEventListener('change', () => {
                autoFillEnabled = enabled.checked;
                GM_setValue(KEY_AUTOFILL_ENABLED, autoFillEnabled);

                if (!autoFillEnabled) {
                    cancelAutoFill('Auto-fill turned off. Extra cards cleared.');
                    resetAutoFillState(true, true);
                    setAutoFillProgress('Auto-fill turned off. Extra cards cleared.');
                    return;
                }

                resetAutoFillState(false, true);
                setAutoFillProgress('Auto-fill enabled. Checking if more cards are needed...');
                scheduleAutoFillIfNeeded('toggle');
            });
        }

        if (target) {
            target.addEventListener('change', () => {
                autoFillTarget = Number(target.value);
                GM_setValue(KEY_AUTOFILL_TARGET, autoFillTarget);
                clearAutoFillProgress();
                scheduleAutoFillIfNeeded('target');
            });
        }

        if (maxPages) {
            maxPages.addEventListener('change', () => {
                autoFillMaxPages = Number(maxPages.value);
                GM_setValue(KEY_AUTOFILL_MAX_PAGES, autoFillMaxPages);
                clearAutoFillProgress();
                updateAutoFillUI();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                cancelAutoFill();
                resetAutoFillState(true, true);
                setAutoFillProgress('Extra cards cleared.');
            });
        }
    }

    function watchLatestSignature() {
        if (!isLatestPage()) return;

        clearInterval(autoFillSignatureTimer);
        autoFillBaseSignature = latestAutoFillContextSignature(parseLatestState());

        autoFillSignatureTimer = setInterval(() => {
            if (!isLatestPage()) return;

            const signature = latestAutoFillContextSignature(parseLatestState());
            if (signature === autoFillBaseSignature) {
                syncAutoFillPagination();
                return;
            }

            if (isAutoFilling) cancelAutoFill();
            resetAutoFillState(true, true);
            autoFillBaseSignature = signature;
            setAutoFillProgress('Page/filter context changed. Extra cards reset.');
            scheduleAutoFillIfNeeded('navigation');
        }, 800);
    }

    // =====================================================
    // 6. GLOBAL CSS
    // =====================================================

    GM_addStyle(`
        :root {
            --f95h-bg: #151922;
            --f95h-panel: #1b202b;
            --f95h-card: #222837;
            --f95h-card2: #283041;
            --f95h-border: #3a4354;
            --f95h-text: #e8edf7;
            --f95h-muted: #9aa7bd;
            --f95h-blue: #438bd3;
            --f95h-blue2: #2d72b8;
            --f95h-red: #d66;
            --f95h-green: #6dbf6d;
            --f95h-yellow: #e0bb55;
            --f95h-dim-opacity: 20;
            --f95h-icon-blue: #69b7ff;
            --f95h-icon-yellow: #ffd166;
            --f95h-icon-green: #7CFF8A;
            --f95h-icon-orange: #ff9f43;
            --f95h-icon-red: #ff6b6b;
            --f95h-icon-pink: #ff7ad9;
            --f95h-icon-cream: #fff0a8;
        }

        .f95h-dimmed {
            opacity: calc(var(--f95h-dim-opacity) / 100) !important;
            filter: saturate(0.35) grayscale(0.15);
            transition: opacity .15s, filter .15s;
        }

        .f95h-dimmed:hover {
            opacity: 1 !important;
            filter: none;
        }

        .f95h-hidden {
            display: none !important;
        }

        .f95h-svg-icon {
            display: block;
            width: 20px;
            height: 20px;
            stroke-width: 1.55;
            stroke-linecap: round;
            stroke-linejoin: round;
            overflow: visible;
        }

        .f95h-svg-icon path,
        .f95h-svg-icon rect,
        .f95h-svg-icon circle,
        .f95h-svg-icon ellipse,
        .f95h-svg-icon polygon {
            fill: revert-layer;
            stroke: revert-layer;
        }

        .f95h-svg-icon [fill="none"] {
            fill: none !important;
        }

        .f95h-svg-icon [stroke="#b9dcff"] { stroke: #b9dcff !important; }
        .f95h-svg-icon [stroke="#5aa9ff"] { stroke: #5aa9ff !important; }
        .f95h-svg-icon [stroke="#ffd166"] { stroke: #ffd166 !important; }
        .f95h-svg-icon [stroke="#ffefad"] { stroke: #ffefad !important; }
        .f95h-svg-icon [stroke="#7CFF8A"] { stroke: #7CFF8A !important; }
        .f95h-svg-icon [stroke="#ff6b6b"] { stroke: #ff6b6b !important; }

        .f95h-svg-icon [fill="#ffd166"] { fill: #ffd166 !important; }
        .f95h-svg-icon [fill="#ffefad"] { fill: #ffefad !important; }
        .f95h-svg-icon [fill="#7CFF8A"] { fill: #7CFF8A !important; }
        .f95h-svg-icon [fill="#ff6b6b"] { fill: #ff6b6b !important; }
        .f95h-svg-icon [fill="#ff7ad9"] { fill: #ff7ad9 !important; }


        .f95h-svg-wrap {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            line-height: 0;
            flex-shrink: 0;
        }

        #f95h-fab .f95h-svg-icon {
            width: 25px;
            height: 25px;
        }

        #f95h-brand-icon .f95h-svg-icon {
            width: 24px;
            height: 24px;
        }

        .f95h-nav-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .f95h-nav-icon .f95h-svg-icon {
            width: 20px;
            height: 20px;
        }

        .f95h-badge .f95h-svg-wrap {
            margin-right: 4px;
        }

        .f95h-badge .f95h-svg-icon {
            width: 11px;
            height: 11px;
        }

        .f95h-card-watch-badge .f95h-svg-icon {
            width: 16px;
            height: 16px;
        }

        .f95h-card-watch-badge {
            position: absolute;
            top: 7px;
            right: 7px;
            z-index: 30;
            min-width: 28px;
            height: 24px;
            padding: 0 7px;
            border-radius: 999px;
            background: rgba(20, 26, 38, .88);
            border: 1px solid rgba(224, 187, 85, .85);
            color: #ffd66b;
            font-size: 12px;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,.35);
        }

        .f95h-card-watch-badge.update {
            background: rgba(224, 187, 85, .95);
            color: #111;
        }

        .f95h-watched-card {
            outline: 2px solid rgba(224, 187, 85, .8) !important;
            outline-offset: -2px;
        }

        html.f95h-latest-wide .p-body-inner {
            max-width: min(1680px, calc(100vw - 36px)) !important;
            width: min(1680px, calc(100vw - 36px)) !important;
        }

        html.f95h-latest-wide #latest-page_main-wrap,
        html.f95h-latest-wide #latest-page_items-wrap {
            max-width: none !important;
            width: 100% !important;
        }

        html.f95h-hide-reactions .reactionsBar {
            display: none !important;
        }

        html.f95h-compact-users .message-userExtras {
            display: none !important;
        }

        html.f95h-hide-signatures .message-signature,
        html.f95h-hide-signatures .js-signatureToggle {
            display: none !important;
        }

        html.f95h-latest-four-cols #latest-page_items-wrap_inner.grid.grid-normal {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 14px !important;
        }

        html.f95h-latest-four-cols #latest-page_items-wrap_inner.grid.grid-normal > * {
            width: auto !important;
            max-width: none !important;
            min-width: 0 !important;
        }

        @media (max-width: 1100px) {
            html.f95h-latest-four-cols #latest-page_items-wrap_inner.grid.grid-normal {
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            }
        }

        @media (max-width: 760px) {
            html.f95h-latest-four-cols #latest-page_items-wrap_inner.grid.grid-normal {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
        }

        #f95h-fab {
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 99999;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, #438bd3, #285f9f);
            color: white;
            font-size: 22px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0,0,0,.45);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform .18s ease, box-shadow .18s ease;
        }

        #f95h-fab:hover {
            transform: scale(1.08);
            box-shadow: 0 6px 22px rgba(0,0,0,.6);
        }

        #f95h-panel {
            position: fixed;
            right: 20px;
            bottom: 82px;
            z-index: 99999;
            width: 800px;
            max-width: calc(100vw - 40px);
            height: 580px;
            max-height: calc(100vh - 110px);
            background: var(--f95h-bg);
            color: var(--f95h-text);
            border: 1px solid var(--f95h-border);
            border-radius: 18px;
            box-shadow: 0 8px 40px rgba(0,0,0,.7);
            overflow: hidden;
            display: none;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        #f95h-panel.open {
            display: grid;
            grid-template-columns: 190px 1fr;
            animation: f95h-pop .18s ease;
        }

        @keyframes f95h-pop {
            from {
                opacity: 0;
                transform: translateY(12px) scale(.98);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        #f95h-sidebar {
            background: #111722;
            border-right: 1px solid var(--f95h-border);
            padding: 14px;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        #f95h-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 6px 14px;
            border-bottom: 1px solid #2b3443;
            margin-bottom: 12px;
        }

        #f95h-brand-icon {
            width: 36px;
            height: 36px;
            border-radius: 12px;
            background: #263044;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }

        #f95h-brand-title {
            font-size: 15px;
            font-weight: 800;
            color: white;
            line-height: 1.2;
        }

        #f95h-brand-sub {
            font-size: 11px;
            color: var(--f95h-muted);
            margin-top: 2px;
        }

        .f95h-nav-btn {
            width: 100%;
            background: transparent;
            color: #b4bfd1;
            border: none;
            border-radius: 12px;
            padding: 10px 10px;
            margin-bottom: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            text-align: left;
            font-size: 13px;
            font-weight: 650;
            transition: background .15s, color .15s;
        }

        .f95h-nav-btn:hover {
            background: #1c2535;
            color: #fff;
        }

        .f95h-nav-btn.active {
            background: #223d63;
            color: white;
        }

        .f95h-nav-icon {
            width: 24px;
            text-align: center;
            font-size: 16px;
        }

        .f95h-nav-pill {
            margin-left: auto;
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            border-radius: 999px;
            background: #374052;
            color: #c5cedd;
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .f95h-nav-btn.active .f95h-nav-pill {
            background: var(--f95h-blue);
            color: white;
        }

        #f95h-sidebar-bottom {
            margin-top: auto;
            font-size: 11px;
            color: #7d8ba3;
            padding: 12px 6px 4px;
            border-top: 1px solid #2b3443;
            line-height: 1.35;
        }

        #f95h-main {
            display: flex;
            flex-direction: column;
            min-width: 0;
            min-height: 0;
        }

        #f95h-header {
            min-height: 64px;
            border-bottom: 1px solid var(--f95h-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 18px;
            background: #171d28;
        }

        #f95h-page-title {
            font-size: 18px;
            font-weight: 800;
            color: white;
        }

        #f95h-page-desc {
            font-size: 12px;
            color: var(--f95h-muted);
            margin-top: 2px;
        }

        #f95h-close {
            width: 32px;
            height: 32px;
            border-radius: 10px;
            border: none;
            background: #283142;
            color: #cbd5e6;
            cursor: pointer;
            font-size: 18px;
        }

        #f95h-close:hover {
            background: #344158;
            color: white;
        }

        #f95h-content {
            padding: 16px;
            overflow-y: auto;
            min-height: 0;
        }

        .f95h-page {
            display: none;
        }

        .f95h-page.active {
            display: block;
            animation: f95h-fade .15s ease;
        }

        @keyframes f95h-fade {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .f95h-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }

        .f95h-box {
            background: var(--f95h-panel);
            border: 1px solid var(--f95h-border);
            border-radius: 16px;
            padding: 14px;
            min-width: 0;
        }

        .f95h-box.full {
            grid-column: 1 / -1;
        }

        .f95h-box-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 800;
            color: white;
            margin-bottom: 4px;
        }

        .f95h-box-desc {
            font-size: 11px;
            color: var(--f95h-muted);
            margin-bottom: 12px;
            line-height: 1.45;
        }

        .f95h-settings-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .f95h-setting-group-title {
            color: #fff;
            font-size: 12px;
            font-weight: 850;
            letter-spacing: .3px;
            text-transform: uppercase;
            margin: 2px 0 0;
        }

        .f95h-setting-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 14px;
            align-items: center;
            background: #151c29;
            border: 1px solid #344052;
            border-radius: 14px;
            padding: 11px 12px;
        }

        .f95h-setting-name {
            color: #fff;
            font-size: 13px;
            font-weight: 800;
            margin-bottom: 2px;
        }

        .f95h-setting-desc {
            color: var(--f95h-muted);
            font-size: 11px;
            line-height: 1.4;
        }

        .f95h-setting-control {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            min-width: 150px;
        }

        .f95h-setting-control.wide {
            grid-column: 1 / -1;
            min-width: 0;
            justify-content: stretch;
        }

        @media (max-width: 760px) {
            .f95h-setting-row {
                grid-template-columns: 1fr;
            }

            .f95h-setting-control {
                justify-content: flex-start;
                min-width: 0;
            }
        }

        .f95h-help {
            width: 15px;
            height: 15px;
            border-radius: 999px;
            border: 1px solid #536178;
            color: #aeb9ca;
            font-size: 10px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: help;
            position: relative;
        }

        .f95h-help:hover::after {
            content: attr(data-help);
            position: absolute;
            left: 50%;
            top: 20px;
            transform: translateX(-50%);
            width: 220px;
            background: #080d16;
            border: 1px solid #40506d;
            color: #e8edf7;
            border-radius: 10px;
            padding: 8px 9px;
            font-size: 11px;
            line-height: 1.35;
            font-weight: 500;
            z-index: 100002;
            box-shadow: 0 8px 25px rgba(0,0,0,.45);
        }

        .f95h-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .f95h-row.space {
            justify-content: space-between;
        }

        .f95h-input {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            background: #111722;
            color: #edf3ff;
            border: 1px solid #455166;
            border-radius: 10px;
            padding: 7px 10px;
            font-size: 13px;
        }

        select.f95h-input {
            padding-right: 6px;
        }

        textarea.f95h-input {
            resize: vertical;
            min-height: 110px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 12px;
            line-height: 1.45;
        }

        .f95h-input:focus {
            outline: none;
            border-color: var(--f95h-blue);
        }

        .f95h-input.f95h-drop-active {
            border-color: var(--f95h-blue);
            box-shadow: 0 0 0 2px rgba(67, 139, 211, .22);
        }

        .f95h-btn {
            border: none;
            border-radius: 10px;
            background: var(--f95h-blue);
            color: white;
            cursor: pointer;
            font-size: 13px;
            font-weight: 750;
            padding: 7px 11px;
            white-space: nowrap;
        }

        .f95h-btn:hover {
            background: var(--f95h-blue2);
        }

        .f95h-btn.secondary {
            background: #313b4e;
            color: #e3e9f5;
        }

        .f95h-btn.secondary:hover {
            background: #3b485f;
        }

        .f95h-btn.danger {
            background: #653030;
        }

        .f95h-btn.danger:hover {
            background: #7a3939;
        }

        .f95h-btn:disabled {
            opacity: .45;
            cursor: not-allowed;
        }

        .f95h-segment {
            display: flex;
            gap: 5px;
            background: #111722;
            padding: 4px;
            border-radius: 12px;
            border: 1px solid #3a4354;
        }

        .f95h-seg-btn {
            border: none;
            border-radius: 9px;
            background: transparent;
            color: #9aa7bd;
            padding: 7px 12px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 750;
        }

        .f95h-seg-btn:hover {
            background: #222b3a;
            color: #fff;
        }

        .f95h-seg-btn.active {
            background: var(--f95h-blue);
            color: white;
        }

        .f95h-switch {
            position: relative;
            width: 46px;
            height: 25px;
            flex-shrink: 0;
        }

        .f95h-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .f95h-switch span {
            position: absolute;
            inset: 0;
            border-radius: 999px;
            background: #465166;
            cursor: pointer;
            transition: background .15s;
        }

        .f95h-switch span::before {
            content: "";
            position: absolute;
            width: 19px;
            height: 19px;
            left: 3px;
            top: 3px;
            border-radius: 50%;
            background: white;
            transition: transform .15s;
        }

        .f95h-switch input:checked + span {
            background: var(--f95h-blue);
        }

        .f95h-switch input:checked + span::before {
            transform: translateX(21px);
        }

        .f95h-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 230px;
            overflow-y: auto;
            padding-right: 2px;
            overscroll-behavior: contain;
        }

        .f95h-list.empty::before {
            content: "Nothing visible on this page.";
            color: #7d8ba3;
            font-size: 12px;
            font-style: italic;
            padding: 8px 2px;
        }

        .f95h-game-row {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--f95h-card);
            border: 1px solid #3a4354;
            border-radius: 11px;
            padding: 2px 8px;
            font-size: 12px;
        }

        .f95h-game-row.on-page {
            background: #203a5d;
            border-color: var(--f95h-blue);
        }

        .f95h-game-id {
            color: #a6d2ff;
            min-width: 52px;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
        }

        .f95h-game-title {
            min-width: 0;
            flex: 1;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            color: #e8edf7;
        }

        .f95h-del {
            width: 24px;
            height: 24px;
            border-radius: 7px;
            border: none;
            background: transparent;
            color: #9aa7bd;
            cursor: pointer;
            flex-shrink: 0;
        }

        .f95h-del:hover {
            background: #4a2d35;
            color: #ff9c9c;
        }

        .f95h-chip-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            max-height: 230px;
            overflow-y: auto;
            overscroll-behavior: contain;
        }

        .f95h-chip-list.empty::before {
            content: "Nothing added yet.";
            color: #7d8ba3;
            font-size: 12px;
            font-style: italic;
            padding: 8px 2px;
        }

        .f95h-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: var(--f95h-card);
            border: 1px solid #3a4354;
            border-radius: 999px;
            padding: 5px 8px 5px 10px;
            font-size: 12px;
            color: #e8edf7;
        }

        #f95h-tag-wrap {
            position: relative;
        }

        #f95h-tag-dropdown {
            position: absolute;
            top: calc(100% + 5px);
            left: 0;
            right: 0;
            z-index: 100001;
            background: #161c27;
            border: 1px solid #455166;
            border-radius: 12px;
            overflow: hidden;
            max-height: 210px;
            overflow-y: auto;
            display: none;
        }

        .f95h-tag-option {
            padding: 8px 10px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            gap: 8px;
            color: #e8edf7;
        }

        .f95h-tag-option:hover {
            background: #222b3a;
        }

        .f95h-tag-option.added {
            opacity: .45;
            cursor: default;
        }

        .f95h-tag-id {
            color: #9aa7bd;
            font-size: 11px;
        }

        .f95h-badge {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            background: #3d3021;
            color: #f0b96a;
            font-size: 10px;
            font-weight: 800;
            padding: 3px 7px;
            text-transform: uppercase;
            letter-spacing: .4px;
        }

        .f95h-badge.active {
            background: #263a28;
            color: #91e494;
        }

        .f95h-badge.completed {
            background: #263a28;
            color: #91e494;
        }

        .f95h-badge.abandoned {
            background: #45292f;
            color: #ff9c9c;
        }

        .f95h-badge.update {
            background: var(--f95h-yellow);
            color: #111;
        }

        .f95h-watch-controls {
            flex-wrap: wrap;
        }

        .f95h-watch-controls select {
            width: 86px;
            flex: 0 0 86px;
        }

        .f95h-watch-progress {
            font-size: 11px;
            color: var(--f95h-muted);
            margin-top: 9px;
            line-height: 1.4;
        }

        .f95h-watch-list {
            max-height: 285px;
        }

        .f95h-watch-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
            align-items: start;
            background: var(--f95h-card);
            border: 1px solid #3a4354;
            border-radius: 12px;
            padding: 8px;
            font-size: 12px;
        }

        .f95h-watch-row.has-update {
            border-color: var(--f95h-yellow);
            background: rgba(224, 187, 85, .08);
        }

        .f95h-watch-title {
            font-size: 13px;
            font-weight: 800;
            color: #fff;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        .f95h-watch-meta {
            color: var(--f95h-muted);
            font-size: 11px;
            line-height: 1.45;
            margin-top: 3px;
        }

        .f95h-watch-actions {
            display: flex;
            flex-direction: column;
            gap: 5px;
            align-items: stretch;
        }

        .f95h-mini-btn {
            border: none;
            border-radius: 8px;
            background: #313b4e;
            color: #e3e9f5;
            cursor: pointer;
            font-size: 11px;
            font-weight: 750;
            padding: 5px 7px;
            white-space: nowrap;
        }

        .f95h-mini-btn:hover {
            background: #3b485f;
        }

        .f95h-mini-btn.danger:hover {
            background: #653030;
            color: #fff;
        }


        .f95h-highlight-groups,
        .f95h-rating-rules {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .f95h-highlight-toolbar {
            display: flex;
            justify-content: flex-end;
            margin-top: 12px;
        }

        .f95h-highlight-group,
        .f95h-rating-rule {
            background: #151c29;
            border: 1px solid #344052;
            border-radius: 14px;
            padding: 12px;
            min-width: 0;
        }

        .f95h-highlight-head,
        .f95h-rating-rule {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .f95h-highlight-title {
            color: #fff;
            font-size: 13px;
            font-weight: 850;
        }

        .f95h-highlight-sub {
            color: var(--f95h-muted);
            font-size: 11px;
            margin-top: 2px;
        }

        .f95h-highlight-controls {
            display: flex;
            align-items: center;
            gap: 7px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }

        .f95h-highlight-name {
            width: 132px;
            flex: 0 0 132px;
        }

        .f95h-highlight-color,
        .f95h-rating-color {
            width: 118px;
            flex: 0 0 118px;
        }

        .f95h-rating-threshold {
            width: 82px;
            flex: 0 0 82px;
            text-align: center;
        }

        .f95h-rating-label {
            color: #fff;
            font-size: 13px;
            font-weight: 800;
            white-space: nowrap;
        }

        .f95h-tag-picker {
            position: relative;
            margin-top: 10px;
        }

        .f95h-highlight-dropdown {
            position: absolute;
            top: calc(100% + 5px);
            left: 0;
            right: 0;
            z-index: 100001;
            background: #161c27;
            border: 1px solid #455166;
            border-radius: 12px;
            overflow: hidden;
            max-height: 210px;
            overflow-y: auto;
            display: none;
        }

        .f95h-highlight-list {
            margin-top: 10px;
            max-height: 120px;
        }

        .f95h-tag-highlighted {
            transition: background-color .12s ease, color .12s ease;
        }

        .f95h-rating-highlighted {
            transition: color .12s ease;
            font-weight: 300 !important;
            text-shadow: 0 0 2px currentColor, 0 0 2px currentColor;
        }

        .f95h-rating-rules.empty::before {
            content: "No rating rules yet.";
            color: #7d8ba3;
            font-size: 12px;
            font-style: italic;
            padding: 8px 2px;
        }



        .f95h-autofill-settings,
        .f95h-rating-filter-settings {
            display: grid;
            gap: 10px;
            align-items: end;
            margin-top: 12px;
        }

        .f95h-autofill-settings {
            grid-template-columns: minmax(130px, 160px) minmax(130px, 160px) minmax(128px, 1fr);
        }

        .f95h-rating-filter-settings {
            grid-template-columns: minmax(110px, 140px) minmax(110px, 140px) minmax(160px, 190px);
        }

        .f95h-mini-field {
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 0;
        }

        .f95h-mini-field span {
            color: var(--f95h-muted);
            font-size: 11px;
            line-height: 1.2;
        }

        .f95h-mini-field select,
        .f95h-mini-field input {
            width: 100%;
        }

        .f95h-autofill-actions {
            display: flex;
            gap: 8px;
            flex-wrap: nowrap;
            justify-content: flex-end;
            align-items: end;
            min-width: 0;
        }

        .f95h-autofill-actions .f95h-btn {
            min-width: 128px;
            width: auto;
        }

        .f95h-autofill-progress {
            font-size: 11px;
            color: var(--f95h-muted);
            margin-top: 9px;
            line-height: 1.4;
        }

        .f95h-autofill-progress.error {
            color: var(--f95h-red);
        }

        .f95h-auto-page-break {
            grid-column: 1 / -1;
            width: 100%;
            margin: 3px 0 1px;
            padding: 7px 10px;
            border: 1px solid rgba(224, 187, 85, .35);
            border-radius: 8px;
            background: rgba(224, 187, 85, .08);
            color: #e7c66d;
            font-size: 12px;
            font-weight: 800;
            text-align: center;
        }

        .sub-nav_paging a.nav_num.f95h-auto-page-loaded {
            background: rgba(224, 187, 85, .92) !important;
            border-color: rgba(0, 0, 0, .25) !important;
            color: #151515 !important;
            font-weight: 900;
        }

        .sub-nav_paging a.nav_num.f95h-auto-page-loaded:hover {
            background: rgba(236, 203, 105, .98) !important;
            color: #111 !important;
        }

        .sub-nav_paging a.nav_num.f95h-auto-page-extra {
            box-shadow: inset 0 -2px 0 rgba(224, 187, 85, .5);
        }

        @media (max-width: 760px) {
            .f95h-autofill-settings,
            .f95h-rating-filter-settings {
                grid-template-columns: 1fr;
            }

            .f95h-autofill-actions {
                justify-content: stretch;
            }

            .f95h-autofill-actions .f95h-btn {
                flex: 1 1 auto;
                width: 100%;
            }
        }

        .f95h-slider {
            width: 100%;
            accent-color: var(--f95h-blue);
        }

        .f95h-backup-grid {
            grid-template-columns: 1fr 1fr;
        }

        .f95h-import-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        .f95h-import-actions .f95h-btn {
            width: 100%;
            padding-left: 8px;
            padding-right: 8px;
            text-align: center;
        }

        #f95h-feedback {
            min-height: 20px;
            margin-top: 12px;
            font-size: 12px;
            color: var(--f95h-green);
        }

        #f95h-feedback.error {
            color: var(--f95h-red);
        }

        @media (max-width: 900px) {
            .f95h-backup-grid {
                grid-template-columns: 1fr;
            }

            .f95h-import-actions {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 760px) {
            #f95h-panel.open {
                grid-template-columns: 1fr;
                width: calc(100vw - 24px);
                right: 12px;
            }

            #f95h-sidebar {
                border-right: none;
                border-bottom: 1px solid var(--f95h-border);
                overflow-x: auto;
            }

            .f95h-nav-btn {
                display: inline-flex;
                width: auto;
            }

            .f95h-grid {
                grid-template-columns: 1fr;
            }
        }
    `);

    // =====================================================
    // 6. MAIN UI SHELL
    // =====================================================

    function buildMainUI() {
        const fab = document.createElement('button');
        fab.id = 'f95h-fab';
        fab.title = 'F95 Helper';
        fab.innerHTML = svgIcon('gear');
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'f95h-panel';

        panel.innerHTML = `
            <aside id="f95h-sidebar">
                <div id="f95h-brand">
                    <div id="f95h-brand-icon">${svgIcon('gear')}</div>
                    <div>
                        <div id="f95h-brand-title">F95 Helper</div>
                        <div id="f95h-brand-sub">clean tools</div>
                    </div>
                </div>

                <button class="f95h-nav-btn active" data-page="filters">
                    <span class="f95h-nav-icon">${svgIcon('filters')}</span>
                    <span>Filters</span>
                    <span class="f95h-nav-pill" id="f95h-nav-filter-count">0</span>
                </button>

                <button class="f95h-nav-btn" data-page="watchlist">
                    <span class="f95h-nav-icon">${svgIcon('watchlist')}</span>
                    <span>Watchlist</span>
                    <span class="f95h-nav-pill" id="f95h-nav-watch-count">0</span>
                </button>

                <button class="f95h-nav-btn" data-page="highlights">
                    <span class="f95h-nav-icon">${svgIcon('highlights')}</span>
                    <span>Highlights</span>
                    <span class="f95h-nav-pill" id="f95h-nav-highlight-count">0</span>
                </button>

                <button class="f95h-nav-btn" data-page="appearance">
                    <span class="f95h-nav-icon">${svgIcon('appearance')}</span>
                    <span>Appearance</span>
                </button>

                <button class="f95h-nav-btn" data-page="backup">
                    <span class="f95h-nav-icon">${svgIcon('backup')}</span>
                    <span>Backup</span>
                </button>

                <div id="f95h-sidebar-bottom">
                    Filters work.<br>
                    Watchlist checks manually.<br>
                    Tag/rating highlights and cleanup.
                </div>
            </aside>

            <main id="f95h-main">
                <header id="f95h-header">
                    <div>
                        <div id="f95h-page-title">Filters</div>
                        <div id="f95h-page-desc">Hide or dim games by game ID, link, tag, or ignored status.</div>
                    </div>
                    <button id="f95h-close" title="Close">×</button>
                </header>

                <section id="f95h-content">
                    ${filtersTabUI()}
                    ${watchlistTabUI()}
                    ${highlightsTabUI()}
                    ${appearanceTabUI()}
                    ${backupTabUI()}

                    <div id="f95h-feedback"></div>
                </section>
            </main>
        `;

        document.body.appendChild(panel);
    }

    // =====================================================
    // 7. MAIN UI LOGIC
    // =====================================================

    function wireMainUI() {
        const fab = document.getElementById('f95h-fab');
        const panel = document.getElementById('f95h-panel');
        const close = document.getElementById('f95h-close');

        fab.addEventListener('click', () => {
            panel.classList.toggle('open');

            renderFilteredGames();
            renderFilteredTags();
            renderWatchlist();
            renderHighlightGroups();
            renderRatingRules();
            updateCounts();
            updateFilterUI();
            updateAppearanceUI();
            applyAppearanceSettings();

            if (isLatestPage()) {
                markWatchedCards();
            }
        });

        close.addEventListener('click', () => {
            panel.classList.remove('open');
        });

        document.querySelectorAll('.f95h-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = btn.dataset.page;
                activePage = page;

                document.querySelectorAll('.f95h-nav-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });

                document.querySelectorAll('.f95h-page').forEach(p => {
                    p.classList.toggle('active', p.id === `f95h-page-${page}`);
                });

                const titles = {
                    filters: [
                        'Filters',
                        'Hide or dim games by game ID, link, tag, or ignored status.'
                    ],
                    watchlist: [
                        'Watchlist',
                        'Follow games you care about. Updates are checked only when you press the button.'
                    ],
                    highlights: [
                        'Highlights',
                        'Color tag labels and Latest Updates rating numbers.'
                    ],
                    appearance: [
                        'Appearance',
                        'Functional visual settings for Latest Updates and thread pages.'
                    ],
                    backup: [
                        'Backup',
                        'Export and import your helper settings.'
                    ]
                };

                document.getElementById('f95h-page-title').textContent = titles[page][0];
                document.getElementById('f95h-page-desc').textContent = titles[page][1];

                renderWatchlist();
                renderHighlightGroups();
                renderRatingRules();
                updateCounts();
            });
        });
    }

    // =====================================================
    // 8. FILTERS TAB UI
    // =====================================================

    function filtersTabUI() {
        return `
            <div class="f95h-page active" id="f95h-page-filters">
                <div class="f95h-grid">

                    <div class="f95h-box full">
                        <div class="f95h-row space">
                            <div>
                                <div class="f95h-box-title">
                                    Matched card behavior
                                    <span class="f95h-help" data-help="Off does nothing. Dim makes matched cards transparent. Hide removes matched cards from the page.">?</span>
                                </div>
                                <div class="f95h-box-desc">Choose what happens when a game matches your filter list.</div>
                            </div>

                            <div class="f95h-segment" id="f95h-mode-segment">
                                <button class="f95h-seg-btn" data-mode="off">Off</button>
                                <button class="f95h-seg-btn" data-mode="dim">Dim</button>
                                <button class="f95h-seg-btn" data-mode="hide">Hide</button>
                            </div>
                        </div>
                    </div>

                    <div class="f95h-box full">
                        <div class="f95h-row space">
                            <div>
                                <div class="f95h-box-title">
                                    Rating filter
                                    <span class="f95h-help" data-help="Separately dim or hide Latest Updates cards below your chosen rating. Hide is stronger than dim when rules overlap.">?</span>
                                </div>
                                <div class="f95h-box-desc">Optional quality filter. It works together with normal game/tag filters and auto-fill.</div>
                            </div>

                            <label class="f95h-switch">
                                <input type="checkbox" id="f95h-rating-filter-enabled">
                                <span></span>
                            </label>
                        </div>

                        <div class="f95h-rating-filter-settings">
                            <label class="f95h-mini-field">
                                <span>Minimum rating</span>
                                <input class="f95h-input" id="f95h-rating-filter-min" type="number" min="0" max="5" step="0.1" inputmode="decimal">
                            </label>

                            <label class="f95h-mini-field">
                                <span>Behavior</span>
                                <select class="f95h-input" id="f95h-rating-filter-behavior">
                                    <option value="off">Off</option>
                                    <option value="dim">Dim</option>
                                    <option value="hide">Hide</option>
                                </select>
                            </label>

                            <label class="f95h-mini-field">
                                <span>Unrated games</span>
                                <select class="f95h-input" id="f95h-rating-filter-unrated">
                                    <option value="keep">Keep</option>
                                    <option value="low">Treat as low rating</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    <div class="f95h-box full">
                        <div class="f95h-row space">
                            <div>
                                <div class="f95h-box-title">
                                    Auto-fill hidden cards
                                    <span class="f95h-help" data-help="When Hide mode leaves too few cards, this safely loads cards from the next Latest Updates pages and marks those page numbers as already loaded.">?</span>
                                </div>
                                <div class="f95h-box-desc">Works only with Hide mode. Loaded page numbers are highlighted, and the helper extends pagination with the next unloaded pages.</div>
                            </div>

                            <label class="f95h-switch">
                                <input type="checkbox" id="f95h-autofill-enabled">
                                <span></span>
                            </label>
                        </div>

                        <div class="f95h-autofill-settings">
                            <label class="f95h-mini-field">
                                <span>Target visible cards</span>
                                <select class="f95h-input" id="f95h-autofill-target">
                                    <option value="12">12</option>
                                    <option value="18">18</option>
                                    <option value="24">24</option>
                                    <option value="36">36</option>
                                    <option value="48">48</option>
                                </select>
                            </label>

                            <label class="f95h-mini-field">
                                <span>Max extra pages</span>
                                <select class="f95h-input" id="f95h-autofill-max-pages">
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="5">5</option>
                                </select>
                            </label>

                            <div class="f95h-autofill-actions">
                                <button class="f95h-btn secondary" id="f95h-autofill-clear">Clear extra cards</button>
                            </div>
                        </div>

                        <div class="f95h-autofill-progress" id="f95h-autofill-progress">Ready.</div>
                    </div>

                    <div class="f95h-box">
                        <div class="f95h-box-title">
                            Add game
                            <span class="f95h-help" data-help="Paste a thread URL or game ID. If this tab is active, drag-and-drop also adds to Filters.">?</span>
                        </div>
                        <div class="f95h-box-desc">Paste a thread URL or game ID.</div>

                        <div class="f95h-row">
                            <input class="f95h-input" id="f95h-thread-input" placeholder="Thread URL or ID">
                            <button class="f95h-btn" id="f95h-thread-add">Add</button>
                        </div>
                    </div>

                    <div class="f95h-box">
                        <div class="f95h-box-title">
                            Site ignored games
                            <span class="f95h-help" data-help="Also hide games that F95 itself marks as ignored.">?</span>
                        </div>
                        <div class="f95h-box-desc">Also hide games that F95 itself marks as ignored.</div>

                        <div class="f95h-row space">
                            <span>Hide ignored games</span>
                            <label class="f95h-switch">
                                <input type="checkbox" id="f95h-hide-ignored">
                                <span></span>
                            </label>
                        </div>
                    </div>

                    <div class="f95h-box">
                        <div class="f95h-row space">
                            <div>
                                <div class="f95h-box-title">Filtered games</div>
                                <div class="f95h-box-desc"><span id="f95h-game-count">0</span> games saved. Only visible matches are shown below.</div>
                            </div>
                            <button class="f95h-btn danger" id="f95h-clear-games">Clear</button>
                        </div>

                        <div class="f95h-list" id="f95h-thread-list"></div>
                    </div>

                    <div class="f95h-box">
                        <div class="f95h-box-title">Filtered tags</div>
                        <div class="f95h-box-desc"><span id="f95h-tag-count">0</span> tags added.</div>

                        <div id="f95h-tag-wrap">
                            <input class="f95h-input" id="f95h-tag-search" placeholder="Search tag, e.g. romance">
                            <div id="f95h-tag-dropdown"></div>
                        </div>

                        <div style="height: 10px;"></div>

                        <div class="f95h-chip-list" id="f95h-tag-list"></div>

                        <div style="height: 10px;"></div>

                        <button class="f95h-btn danger" id="f95h-clear-tags">Clear tags</button>
                    </div>

                </div>
            </div>
        `;
    }

    // =====================================================
    // 9. FILTERS TAB LOGIC
    // =====================================================

    function wireFiltersTab() {
        const input = document.getElementById('f95h-thread-input');
        const addBtn = document.getElementById('f95h-thread-add');

        addBtn.addEventListener('click', () => {
            if (addFilteredGame(input.value)) input.value = '';
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                if (addFilteredGame(input.value)) input.value = '';
            }
        });

        document.getElementById('f95h-mode-segment').addEventListener('click', e => {
            const btn = e.target.closest('.f95h-seg-btn');
            if (!btn) return;

            filterMode = btn.dataset.mode;
            GM_setValue(KEY_FILTER_MODE, filterMode);

            if (filterMode !== 'hide') {
                resetAutoFillState(true);
            }

            updateFilterUI();
            updateAutoFillUI();
            applyAppearanceSettings();
            updateAppearanceUI();
            applyFiltering();
        });

        const ignoredToggle = document.getElementById('f95h-hide-ignored');
        ignoredToggle.checked = hideIgnored;

        ignoredToggle.addEventListener('change', () => {
            hideIgnored = ignoredToggle.checked;
            GM_setValue(KEY_HIDE_IGNORED, hideIgnored);
            applyFiltering();
        });

        wireRatingFilterControls();
        wireAutoFillControls();
        updateAutoFillUI();

        document.getElementById('f95h-clear-games').addEventListener('click', () => {
            if (!dimmedThreadIds.size) return;
            if (!confirm(`Remove all ${dimmedThreadIds.size} filtered games?`)) return;

            dimmedThreadIds.clear();
            saveJson(KEY_THREAD_IDS, []);

            renderFilteredGames();
            updateCounts();
            applyFiltering();

            showFeedback('All games cleared.');
        });

        document.getElementById('f95h-clear-tags').addEventListener('click', () => {
            if (!dimmedTagIds.size) return;
            if (!confirm(`Remove all ${dimmedTagIds.size} filtered tags?`)) return;

            dimmedTagIds.clear();
            saveJson(KEY_TAG_IDS, []);

            renderFilteredTags();
            updateCounts();
            applyFiltering();

            showFeedback('All tags cleared.');
        });

        const tagSearch = document.getElementById('f95h-tag-search');
        const dropdown = document.getElementById('f95h-tag-dropdown');

        tagSearch.addEventListener('focus', () => buildTagDropdown(tagSearch.value));
        tagSearch.addEventListener('input', () => buildTagDropdown(tagSearch.value));

        document.addEventListener('click', e => {
            const wrap = document.getElementById('f95h-tag-wrap');
            if (wrap && !wrap.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function addFilteredGame(raw) {
        const id = extractThreadId(raw);

        if (!id) {
            showFeedback('Could not find a game/thread ID.', true);
            return false;
        }

        if (dimmedThreadIds.has(String(id))) {
            showFeedback(`Game ${id} is already added to Filters.`, true);
            return false;
        }

        dimmedThreadIds.add(String(id));
        saveJson(KEY_THREAD_IDS, [...dimmedThreadIds]);

        renderFilteredGames();
        updateCounts();
        applyFiltering();

        showFeedback(`✓ Game ${id} added to Filters.`);
        return true;
    }

    function addFilteredTag(id) {
        id = String(id);

        if (!TAG_MAP[id]) {
            showFeedback('Unknown tag ID.', true);
            return false;
        }

        if (dimmedTagIds.has(id)) {
            showFeedback(`"${TAG_MAP[id]}" is already added.`, true);
            return false;
        }

        dimmedTagIds.add(id);
        saveJson(KEY_TAG_IDS, [...dimmedTagIds]);

        renderFilteredTags();
        updateCounts();
        applyFiltering();

        showFeedback(`✓ Tag "${TAG_MAP[id]}" added.`);
        return true;
    }

    function resetAutoFillAfterRatingFilterChange() {
        if (isLatestPage()) {
            resetAutoFillState(true, true);
        }
    }

    function wireRatingFilterControls() {
        const enabled = document.getElementById('f95h-rating-filter-enabled');
        const minInput = document.getElementById('f95h-rating-filter-min');
        const behavior = document.getElementById('f95h-rating-filter-behavior');
        const unrated = document.getElementById('f95h-rating-filter-unrated');

        if (enabled) {
            enabled.addEventListener('change', () => {
                ratingFilterEnabled = enabled.checked;
                saveRatingFilterSettings();
                resetAutoFillAfterRatingFilterChange();
                updateFilterUI();
                applyFiltering();
            });
        }

        if (minInput) {
            minInput.addEventListener('change', () => {
                ratingFilterMin = cleanRatingFilterMin(minInput.value);
                saveRatingFilterSettings();
                resetAutoFillAfterRatingFilterChange();
                updateFilterUI();
                applyFiltering();
            });
        }

        if (behavior) {
            behavior.addEventListener('change', () => {
                ratingFilterBehavior = ['off', 'dim', 'hide'].includes(behavior.value) ? behavior.value : 'hide';
                saveRatingFilterSettings();
                resetAutoFillAfterRatingFilterChange();
                updateFilterUI();
                applyFiltering();
            });
        }

        if (unrated) {
            unrated.addEventListener('change', () => {
                ratingFilterUnrated = unrated.value === 'low' ? 'low' : 'keep';
                saveRatingFilterSettings();
                resetAutoFillAfterRatingFilterChange();
                updateFilterUI();
                applyFiltering();
            });
        }
    }

    function updateFilterUI() {
        document.querySelectorAll('.f95h-seg-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === filterMode);
        });

        const ignored = document.getElementById('f95h-hide-ignored');
        if (ignored) ignored.checked = hideIgnored;

        const ratingEnabled = document.getElementById('f95h-rating-filter-enabled');
        const ratingMin = document.getElementById('f95h-rating-filter-min');
        const ratingBehavior = document.getElementById('f95h-rating-filter-behavior');
        const ratingUnrated = document.getElementById('f95h-rating-filter-unrated');

        if (ratingEnabled) ratingEnabled.checked = ratingFilterEnabled;
        if (ratingMin) {
            ratingMin.value = ratingFilterMin.toFixed(1);
            ratingMin.disabled = !ratingFilterEnabled;
        }
        if (ratingBehavior) {
            ratingBehavior.value = ratingFilterBehavior;
            ratingBehavior.disabled = !ratingFilterEnabled;
        }
        if (ratingUnrated) {
            ratingUnrated.value = ratingFilterUnrated;
            ratingUnrated.disabled = !ratingFilterEnabled;
        }

        const slider = document.getElementById('f95h-dim-slider');
        const value = document.getElementById('f95h-dim-value');

        if (slider) slider.value = dimStrength;
        if (value) value.textContent = dimStrength;

        document.documentElement.style.setProperty('--f95h-dim-opacity', dimStrength);

        updateAutoFillUI();
        updateCounts();
    }

    function renderFilteredGames() {
        const list = document.getElementById('f95h-thread-list');
        if (!list) return;

        list.innerHTML = '';

        const onPageIds = getOnPageIds();

        // Important:
        // The saved filter list can be large, but this UI only shows games
        // that are currently visible on the Latest Updates page.
        const visibleIds = [...dimmedThreadIds]
            .filter(id => onPageIds.has(id))
            .sort((a, b) => Number(a) - Number(b));

        list.classList.toggle('empty', visibleIds.length === 0);

        visibleIds.forEach(id => {
            const title = getTitleFromCard(id) || 'Game on this page';

            const row = document.createElement('div');
            row.className = 'f95h-game-row on-page';

            row.innerHTML = `
                <span class="f95h-game-id">#${id}</span>
                <span class="f95h-game-title"></span>
                <button class="f95h-del" title="Remove">×</button>
            `;

            row.querySelector('.f95h-game-title').textContent = title;
            row.querySelector('.f95h-game-title').title = title;

            row.querySelector('.f95h-del').addEventListener('click', () => {
                dimmedThreadIds.delete(id);
                saveJson(KEY_THREAD_IDS, [...dimmedThreadIds]);

                renderFilteredGames();
                updateCounts();
                applyFiltering();

                showFeedback(`Removed game ${id}.`);
            });

            list.appendChild(row);
        });
    }

    function renderFilteredTags() {
        const list = document.getElementById('f95h-tag-list');
        if (!list) return;

        list.innerHTML = '';

        const ids = [...dimmedTagIds].sort((a, b) => {
            return TAG_MAP[a].localeCompare(TAG_MAP[b]);
        });

        list.classList.toggle('empty', ids.length === 0);

        ids.forEach(id => {
            const chip = document.createElement('span');
            chip.className = 'f95h-chip';

            chip.innerHTML = `
                <span>${TAG_MAP[id]}</span>
                <button class="f95h-del" title="Remove">×</button>
            `;

            chip.querySelector('.f95h-del').addEventListener('click', () => {
                dimmedTagIds.delete(id);
                saveJson(KEY_TAG_IDS, [...dimmedTagIds]);

                renderFilteredTags();
                buildTagDropdown(document.getElementById('f95h-tag-search')?.value || '');
                updateCounts();
                applyFiltering();

                showFeedback(`Removed tag "${TAG_MAP[id]}".`);
            });

            list.appendChild(chip);
        });
    }

    function buildTagDropdown(query) {
        const dropdown = document.getElementById('f95h-tag-dropdown');
        if (!dropdown) return;

        dropdown.innerHTML = '';

        const q = String(query || '').trim().toLowerCase();

        const matches = q
            ? ALL_TAGS.filter(([, name]) => name.toLowerCase().includes(q))
            : ALL_TAGS;

        if (!matches.length) {
            dropdown.innerHTML = `
                <div class="f95h-tag-option added">
                    No tags found
                </div>
            `;
            dropdown.style.display = 'block';
            return;
        }

        matches.forEach(([id, name]) => {
            id = String(id);

            const alreadyAdded = dimmedTagIds.has(id);

            const row = document.createElement('div');
            row.className = 'f95h-tag-option' + (alreadyAdded ? ' added' : '');

            row.innerHTML = `
                <span>${name}</span>
                <span class="f95h-tag-id">#${id}${alreadyAdded ? ' ✓' : ''}</span>
            `;

            if (!alreadyAdded) {
                row.addEventListener('click', () => {
                    addFilteredTag(id);
                    document.getElementById('f95h-tag-search').value = '';
                    dropdown.style.display = 'none';
                });
            }

            dropdown.appendChild(row);
        });

        dropdown.style.display = 'block';
    }

    // =====================================================
    // 10. FILTERING ENGINE
    // =====================================================

    function isSiteIgnored(card) {
        return card.classList.contains('resource-tile_ignored');
    }

    function shouldFilterCard(card) {
        const threadId = card.dataset.threadId;

        if (threadId && dimmedThreadIds.has(threadId)) {
            return true;
        }

        const rawTags = card.dataset.tags;

        if (rawTags) {
            const tags = rawTags.split(',').map(t => t.trim());
            if (tags.some(tag => dimmedTagIds.has(tag))) {
                return true;
            }
        }

        return false;
    }

    function applyFilteringNow() {
        document.documentElement.style.setProperty('--f95h-dim-opacity', dimStrength);

        getCards().forEach(card => {
            const matched = shouldFilterCard(card);
            const ignored = isSiteIgnored(card);
            const ratingAction = getRatingFilterAction(card);

            const hideByIgnored = hideIgnored && ignored;
            const hideByFilter = matched && filterMode === 'hide';
            const dimByFilter = matched && filterMode === 'dim';
            const hideByRating = ratingAction === 'hide';
            const dimByRating = ratingAction === 'dim';
            const shouldHide = hideByIgnored || hideByFilter || hideByRating;
            const shouldDim = !shouldHide && (dimByFilter || dimByRating);

            card.classList.toggle('f95h-hidden', shouldHide);
            card.classList.toggle('f95h-dimmed', shouldDim);
            card.classList.toggle('f95h-rating-filtered', Boolean(ratingAction));
        });

        renderFilteredGames();
        updateCounts();
        updateFilterUI();
        updateAppearanceUI();
        applyAllHighlights();

        if (isLatestPage()) {
            markWatchedCards();
            syncAutoFillPagination();
            scheduleAutoFillIfNeeded('filtering');
        }
    }

    function applyFiltering() {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(applyFilteringNow, 120);
    }

    // =====================================================
    // 11. WATCHLIST TAB UI
    // =====================================================

    function watchlistTabUI() {
        return `
            <div class="f95h-page" id="f95h-page-watchlist">
                <div class="f95h-grid">

                    <div class="f95h-box">
                        <div class="f95h-box-title">
                            Add game
                            <span class="f95h-help" data-help="Paste a thread URL or ID. The script fetches only HTML, reads title/status/version, and blocks Abandoned games.">?</span>
                        </div>
                        <div class="f95h-box-desc">Abandoned games are blocked. Completed games check slower.</div>

                        <div class="f95h-row">
                            <input class="f95h-input" id="f95h-watch-input" placeholder="Thread URL or ID">
                            <button class="f95h-btn" id="f95h-watch-add">Add</button>
                        </div>
                    </div>

                    <div class="f95h-box">
                        <div class="f95h-box-title">
                            Update checking
                            <span class="f95h-help" data-help="No passive checks. Press Check manually. Games checked too recently are skipped.">?</span>
                        </div>
                        <div class="f95h-box-desc">Manual only. One request every 8–12 seconds.</div>

                        <div class="f95h-row f95h-watch-controls">
                            <select class="f95h-input" id="f95h-watch-interval">
                                <option value="24">24h</option>
                                <option value="48">48h</option>
                                <option value="72">3d</option>
                                <option value="96">4d</option>
                                <option value="168">1w</option>
                                <option value="720">1mo</option>
                            </select>

                            <button class="f95h-btn" id="f95h-check-updates">Check</button>
                            <button class="f95h-btn danger" id="f95h-stop-updates" disabled>Stop</button>
                        </div>

                        <div class="f95h-watch-progress" id="f95h-check-progress">
                            Ready. No automatic checks.
                        </div>
                    </div>

                    <div class="f95h-box full">
                        <div class="f95h-row space">
                            <div>
                                <div class="f95h-box-title">
                                    Watched games
                                    <span class="f95h-help" data-help="↑ Update means current version differs from your saved version. Use Mark current after you have checked it.">?</span>
                                </div>
                                <div class="f95h-box-desc"><span id="f95h-watch-count">0</span> watched games saved.</div>
                            </div>
                            <button class="f95h-btn danger" id="f95h-clear-watchlist">Clear</button>
                        </div>

                        <div class="f95h-list f95h-watch-list" id="f95h-watch-list"></div>
                    </div>

                </div>
            </div>
        `;
    }

    // =====================================================
    // 12. WATCHLIST TAB LOGIC
    // =====================================================

    function wireWatchlistTab() {
        const input = document.getElementById('f95h-watch-input');
        const addBtn = document.getElementById('f95h-watch-add');
        const interval = document.getElementById('f95h-watch-interval');

        interval.value = String(watchIntervalHours);

        interval.addEventListener('change', () => {
            watchIntervalHours = Number(interval.value);
            GM_setValue(KEY_WATCH_INTERVAL, watchIntervalHours);
            renderWatchlist();
            showFeedback(`Watch interval set to ${interval.options[interval.selectedIndex].text}.`);
        });

        addBtn.addEventListener('click', async () => {
            if (await addWatchedGame(input.value)) input.value = '';
        });

        input.addEventListener('keydown', async e => {
            if (e.key === 'Enter') {
                if (await addWatchedGame(input.value)) input.value = '';
            }
        });

        document.getElementById('f95h-check-updates').addEventListener('click', checkWatchlistUpdates);

        document.getElementById('f95h-stop-updates').addEventListener('click', () => {
            stopCheckingUpdates = true;
            abortActiveRequest('watch');
            showFeedback('Stopping update check.');
        });

        document.getElementById('f95h-clear-watchlist').addEventListener('click', () => {
            if (!watchlist.length) return;
            if (!confirm(`Remove all ${watchlist.length} watched games?`)) return;

            watchlist = [];
            saveJson(KEY_WATCHLIST, watchlist);

            renderWatchlist();
            updateCounts();
            markWatchedCards();

            showFeedback('Watchlist cleared.');
        });
    }

    async function addWatchedGame(raw) {
        const id = extractThreadId(raw);

        if (!id) {
            showFeedback('Could not find a game/thread ID.', true);
            return false;
        }

        if (watchlist.some(item => String(item.id) === String(id))) {
            showFeedback(`Game ${id} is already in Watchlist.`, true);
            return false;
        }

        try {
            showFeedback('Reading thread HTML...');

            const item = await getThreadMetadataFromInput(raw);

            if (watchlist.some(existing => String(existing.id) === String(item.id))) {
                showFeedback(`Game ${item.id} is already in Watchlist.`, true);
                return false;
            }

            if ((item.status || '').toLowerCase() === 'abandoned') {
                showFeedback(`Not added: "${item.title}" is Abandoned.`, true);
                return false;
            }

            watchlist.push(item);
            saveJson(KEY_WATCHLIST, watchlist);

            renderWatchlist();
            updateCounts();
            markWatchedCards();

            showFeedback(`✓ "${item.title}" added to Watchlist.`);
            return true;
        } catch (err) {
            showFeedback(`Could not add game: ${err.message}`, true);
            return false;
        }
    }

    function renderWatchlist() {
        const list = document.getElementById('f95h-watch-list');
        if (!list) return;

        list.innerHTML = '';

        const sorted = [...watchlist].sort((a, b) => {
            return String(a.title).localeCompare(String(b.title));
        });

        list.classList.toggle('empty', sorted.length === 0);

        sorted.forEach(item => {
            const hasUpdate = versionChanged(item.savedVersion, item.currentVersion);
            const statusClass = String(item.status || 'active')
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '');

            const row = makeEl('div', 'f95h-watch-row');
            row.classList.toggle('has-update', hasUpdate);

            const infoWrap = document.createElement('div');
            const title = makeEl('div', 'f95h-watch-title', item.title || `Game ${item.id}`);
            title.title = item.title || `Game ${item.id}`;
            infoWrap.appendChild(title);

            const meta = makeEl('div', 'f95h-watch-meta');
            meta.appendChild(document.createTextNode(`#${item.id}`));

            if (item.developer) {
                meta.appendChild(document.createTextNode(` · ${item.developer}`));
            }

            meta.appendChild(document.createTextNode(' · '));
            const status = makeEl('span', 'f95h-badge', item.status || 'Active');
            if (statusClass) status.classList.add(statusClass);
            meta.appendChild(status);

            if (hasUpdate) {
                meta.appendChild(document.createTextNode(' '));
                const updateBadge = makeEl('span', 'f95h-badge update');
                appendSvgIcon(updateBadge, 'update');
                updateBadge.appendChild(document.createTextNode('Update'));
                meta.appendChild(updateBadge);
            }

            meta.appendChild(document.createElement('br'));
            meta.appendChild(document.createTextNode(
                hasUpdate
                    ? `${item.savedVersion || '?'} → ${item.currentVersion || '?'}`
                    : `${item.currentVersion || item.savedVersion || '?'}`
            ));
            meta.appendChild(document.createElement('br'));
            meta.appendChild(document.createTextNode(`checked: ${formatAge(item.lastChecked)} · next: ${nextAllowedText(item)}`));
            infoWrap.appendChild(meta);
            row.appendChild(infoWrap);

            const actions = makeEl('div', 'f95h-watch-actions');
            const openBtn = makeEl('button', 'f95h-mini-btn', 'Open');
            const markBtn = makeEl('button', 'f95h-mini-btn', 'Mark');
            const removeBtn = makeEl('button', 'f95h-mini-btn danger', 'Remove');
            actions.appendChild(openBtn);
            actions.appendChild(markBtn);
            actions.appendChild(removeBtn);
            row.appendChild(actions);

            openBtn.addEventListener('click', () => {
                window.open(item.url || makeCleanThreadUrl(item.id), '_blank');
            });

            markBtn.addEventListener('click', () => {
                item.savedVersion = item.currentVersion || item.savedVersion;
                item.lastResult = 'Marked current';

                saveJson(KEY_WATCHLIST, watchlist);
                renderWatchlist();
                markWatchedCards();

                showFeedback(`Marked "${item.title}" as current.`);
            });

            removeBtn.addEventListener('click', () => {
                watchlist = watchlist.filter(x => x.id !== item.id);
                saveJson(KEY_WATCHLIST, watchlist);

                renderWatchlist();
                updateCounts();
                markWatchedCards();

                showFeedback(`Removed "${item.title}".`);
            });

            list.appendChild(row);
        });
    }

    async function checkWatchlistUpdates() {
        if (isCheckingUpdates) return;

        if (isAutoFilling) {
            showFeedback('Auto-fill is running. Please wait until it finishes.', true);
            return;
        }

        isCheckingUpdates = true;
        stopCheckingUpdates = false;

        const checkBtn = document.getElementById('f95h-check-updates');
        const stopBtn = document.getElementById('f95h-stop-updates');
        const progress = document.getElementById('f95h-check-progress');

        checkBtn.disabled = true;
        stopBtn.disabled = false;

        let checked = 0;
        let skipped = 0;
        let updated = 0;
        let failed = 0;

        maybeShowCleanupReminder();

        try {
            for (let i = 0; i < watchlist.length; i++) {
                if (stopCheckingUpdates) break;

                const item = watchlist[i];

                if ((item.status || '').toLowerCase() === 'abandoned') {
                    skipped++;
                    item.lastResult = 'Skipped: abandoned';
                    continue;
                }

                if (!canCheckItem(item)) {
                    skipped++;
                    item.lastResult = 'Skipped: too soon';
                    progress.textContent = `Checked ${checked} · skipped ${skipped} · updates ${updated} · failed ${failed}`;
                    continue;
                }

                const remainingChecks = countCheckableItems(i + 1);
                const estimatedLeft = estimateRemainingText(remainingChecks);

                progress.textContent =
                    `Checking ${i + 1}/${watchlist.length}: ${item.title} · left ${estimatedLeft}`;

                try {
                    const result = await fetchHtmlOnly(item.url || makeCleanThreadUrl(item.id), 'watch');
                    const fresh = parseThreadMetadata(result.html, item.id, result.finalUrl || item.url);

                    const oldCurrent = item.currentVersion;

                    item.title = fresh.title || item.title;
                    item.url = fresh.url || item.url;
                    item.developer = fresh.developer || item.developer;
                    item.status = fresh.status || item.status;
                    item.currentVersion = fresh.currentVersion || item.currentVersion;
                    item.lastChecked = now();

                    if ((item.status || '').toLowerCase() === 'abandoned') {
                        item.lastResult = 'Now abandoned';
                        skipped++;
                    } else if (versionChanged(oldCurrent, item.currentVersion) || versionChanged(item.savedVersion, item.currentVersion)) {
                        item.lastResult = 'Update found';
                        updated++;
                        checked++;
                    } else {
                        item.lastResult = 'No update';
                        checked++;
                    }
                } catch (err) {
                    if (stopCheckingUpdates && err.message === 'Request aborted') {
                        item.lastResult = 'Stopped';
                        break;
                    }

                    item.lastResult = `Failed: ${err.message}`;
                    failed++;
                }

                saveJson(KEY_WATCHLIST, watchlist);
                renderWatchlist();
                updateCounts();
                markWatchedCards();

                const remainingBefore = countCheckableItems(i + 1);
                const estimatedBefore = estimateRemainingText(remainingBefore);

                progress.textContent =
                    `Checked ${checked} · skipped ${skipped} · updates ${updated} · failed ${failed} · left ${estimatedBefore}`;

                if (i < watchlist.length - 1 && !stopCheckingUpdates) {
                    await delay(randomCheckDelayMs());
                }
            }
        } finally {
            saveJson(KEY_WATCHLIST, watchlist);
            renderWatchlist();
            updateCounts();
            markWatchedCards();

            progress.textContent = stopCheckingUpdates
                ? `Stopped. Checked ${checked} · skipped ${skipped} · updates ${updated} · failed ${failed}`
                : `Done. Checked ${checked} · skipped ${skipped} · updates ${updated} · failed ${failed}`;

            isCheckingUpdates = false;
            stopCheckingUpdates = false;

            checkBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    function maybeShowCleanupReminder() {
        const last = Number(GM_getValue(KEY_CLEAN_REMINDER, 0));
        const twoWeeks = 14 * 24 * 60 * 60 * 1000;

        if (watchlist.length >= 30 && now() - last > twoWeeks) {
            GM_setValue(KEY_CLEAN_REMINDER, now());
            showFeedback('Reminder: remove completed or unimportant games to keep checks lighter.');
        }
    }



    // =====================================================
    // 13. HIGHLIGHTS TAB UI / LOGIC
    // =====================================================

    function highlightColorOptions(selectedColor) {
        return HIGHLIGHT_COLOR_PRESETS.map(color => {
            const selected = color.id === selectedColor ? 'selected' : '';
            return `<option value="${color.id}" ${selected}>${color.name}</option>`;
        }).join('');
    }

    function tagHighlightGroupUI(group, index) {
        const number = index + 1;
        const disableDelete = tagHighlights.length <= 1 ? 'disabled' : '';

        return `
            <div class="f95h-highlight-group" data-highlight-group-id="${group.id}">
                <div class="f95h-highlight-head">
                    <div>
                        <div class="f95h-highlight-title">Group ${number}</div>
                        <div class="f95h-highlight-sub">Search and add tags to color them.</div>
                    </div>

                    <div class="f95h-highlight-controls">
                        <input class="f95h-input f95h-highlight-name" id="f95h-highlight-name-${group.id}" value="${escapeHtml(group.name)}" maxlength="32">
                        <select class="f95h-input f95h-highlight-color" id="f95h-highlight-color-${group.id}">
                            ${highlightColorOptions(group.color)}
                        </select>
                        <button class="f95h-mini-btn danger" id="f95h-highlight-delete-${group.id}" ${disableDelete}>Delete</button>
                    </div>
                </div>

                <div class="f95h-tag-picker" id="f95h-highlight-picker-${group.id}">
                    <input class="f95h-input" id="f95h-highlight-search-${group.id}" placeholder="Search tag, e.g. fantasy">
                    <div class="f95h-highlight-dropdown" id="f95h-highlight-dropdown-${group.id}"></div>
                </div>

                <div class="f95h-chip-list f95h-highlight-list" id="f95h-highlight-list-${group.id}"></div>
            </div>
        `;
    }

    function ratingRuleUI(rule, index) {
        const threshold = Number(rule.threshold).toFixed(1);

        return `
            <div class="f95h-rating-rule" data-rating-rule-index="${index}">
                <div class="f95h-row">
                    <span class="f95h-rating-label">Rating ≥</span>
                    <input class="f95h-input f95h-rating-threshold" id="f95h-rating-threshold-${index}" type="number" min="0" max="5" step="0.1" value="${threshold}">
                </div>

                <div class="f95h-row">
                    <select class="f95h-input f95h-rating-color" id="f95h-rating-color-${index}">
                        ${highlightColorOptions(rule.color)}
                    </select>
                    <button class="f95h-mini-btn danger" id="f95h-rating-delete-${index}">Delete</button>
                </div>
            </div>
        `;
    }

    function highlightsTabUI() {
        return `
            <div class="f95h-page" id="f95h-page-highlights">
                <div class="f95h-grid">

                    <div class="f95h-box full">
                        <div class="f95h-box-title">
                            Tag highlights
                            <span class="f95h-help" data-help="Highlight tag labels on Latest Updates hover cards and on thread pages. Each tag can only be in one highlight group.">?</span>
                        </div>
                        <div class="f95h-box-desc">
                            Add only the groups you need. Tags keep the site's normal shape and only their background color changes.
                        </div>

                        <div class="f95h-highlight-groups" id="f95h-highlight-groups"></div>

                        <div class="f95h-highlight-toolbar">
                            <button class="f95h-btn secondary" id="f95h-add-highlight-group">+ Add group</button>
                        </div>
                    </div>

                    <div class="f95h-box full">
                        <div class="f95h-box-title">
                            Rating colors
                            <span class="f95h-help" data-help="Color Latest Updates rating numbers. Rules are sorted from highest to lowest, so the highest matching threshold wins.">?</span>
                        </div>
                        <div class="f95h-box-desc">
                            Example: Rating ≥ 4.5 green, Rating ≥ 4.0 yellow. A 4.6 rating uses the 4.5 rule.
                        </div>

                        <div class="f95h-rating-rules" id="f95h-rating-rules"></div>

                        <div class="f95h-highlight-toolbar">
                            <button class="f95h-btn secondary" id="f95h-add-rating-rule">+ Add rating rule</button>
                        </div>
                    </div>

                </div>
            </div>
        `;
    }

    function wireHighlightsTab() {
        const addGroupBtn = document.getElementById('f95h-add-highlight-group');
        const addRatingBtn = document.getElementById('f95h-add-rating-rule');

        if (addGroupBtn) {
            addGroupBtn.addEventListener('click', addTagHighlightGroup);
        }

        if (addRatingBtn) {
            addRatingBtn.addEventListener('click', addRatingRule);
        }

        document.addEventListener('click', e => {
            if (e.target.closest?.('.f95h-tag-picker')) return;
            document.querySelectorAll('.f95h-highlight-dropdown').forEach(dropdown => {
                dropdown.style.display = 'none';
            });
        });

        renderHighlightGroups();
        renderRatingRules();
    }

    function renderHighlightGroups() {
        const wrap = document.getElementById('f95h-highlight-groups');
        if (!wrap) return;

        wrap.innerHTML = tagHighlights.map((group, index) => tagHighlightGroupUI(group, index)).join('');

        tagHighlights.forEach(group => {
            wireHighlightGroup(group.id);
            renderHighlightGroup(group.id);
        });

        updateCounts();
    }

    function wireHighlightGroup(groupId) {
        const group = getHighlightGroupById(groupId);
        if (!group) return;

        const nameInput = document.getElementById(`f95h-highlight-name-${groupId}`);
        const colorSelect = document.getElementById(`f95h-highlight-color-${groupId}`);
        const deleteBtn = document.getElementById(`f95h-highlight-delete-${groupId}`);
        const search = document.getElementById(`f95h-highlight-search-${groupId}`);

        if (nameInput) {
            nameInput.addEventListener('change', () => {
                group.name = cleanHighlightName(nameInput.value, group.name || 'Highlight');
                saveTagHighlights();
                renderHighlightGroups();
                showFeedback(`Group renamed to "${group.name}".`);
            });
        }

        if (colorSelect) {
            colorSelect.addEventListener('change', () => {
                group.color = colorSelect.value;
                saveTagHighlights();
                renderHighlightGroups();
                applyAllHighlights();

                const preset = getHighlightPreset(group.color);
                showFeedback(`${group.name} color set to ${preset.name}.`);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteTagHighlightGroup(groupId));
        }

        if (search) {
            search.addEventListener('focus', () => buildHighlightDropdown(groupId, search.value));
            search.addEventListener('input', () => buildHighlightDropdown(groupId, search.value));
        }
    }

    function renderHighlightGroup(groupId) {
        const group = getHighlightGroupById(groupId);
        const list = document.getElementById(`f95h-highlight-list-${groupId}`);
        const colorSelect = document.getElementById(`f95h-highlight-color-${groupId}`);
        const nameInput = document.getElementById(`f95h-highlight-name-${groupId}`);

        if (!group) return;
        if (colorSelect) colorSelect.value = group.color;
        if (nameInput) nameInput.value = group.name;
        if (!list) return;

        list.innerHTML = '';

        const ids = [...group.tags].sort((a, b) => TAG_MAP[a].localeCompare(TAG_MAP[b]));
        list.classList.toggle('empty', ids.length === 0);

        ids.forEach(id => {
            const chip = document.createElement('span');
            chip.className = 'f95h-chip';

            chip.innerHTML = `
                <span>${TAG_MAP[id]}</span>
                <button class="f95h-del" title="Remove">×</button>
            `;

            chip.querySelector('.f95h-del').addEventListener('click', () => {
                removeHighlightTag(groupId, id);
            });

            list.appendChild(chip);
        });
    }

    function buildHighlightDropdown(groupId, query) {
        const group = getHighlightGroupById(groupId);
        const groupIndex = tagHighlights.findIndex(item => item.id === groupId);
        const dropdown = document.getElementById(`f95h-highlight-dropdown-${groupId}`);
        if (!group || !dropdown) return;

        dropdown.innerHTML = '';

        const q = normalizeTagName(query);
        const matches = q
            ? ALL_TAGS.filter(([, name]) => normalizeTagName(name).includes(q))
            : ALL_TAGS;

        if (!matches.length) {
            dropdown.innerHTML = `
                <div class="f95h-tag-option added">
                    No tags found
                </div>
            `;
            dropdown.style.display = 'block';
            return;
        }

        matches.forEach(([id, name]) => {
            id = String(id);

            const usedInGroup = getHighlightGroupIndexForTag(id);
            const alreadyHere = group.tags.includes(id);
            const usedElsewhere = usedInGroup >= 0 && usedInGroup !== groupIndex;
            const usedGroup = usedElsewhere ? tagHighlights[usedInGroup] : null;

            const row = document.createElement('div');
            row.className = 'f95h-tag-option' + (alreadyHere ? ' added' : '');

            const suffix = alreadyHere
                ? ' ✓'
                : usedElsewhere
                    ? ` ${usedGroup?.name || `Group ${usedInGroup + 1}`}`
                    : '';

            row.innerHTML = `
                <span>${name}</span>
                <span class="f95h-tag-id">#${id}${escapeHtml(suffix)}</span>
            `;

            if (!alreadyHere) {
                row.addEventListener('click', () => {
                    addHighlightTag(groupId, id);
                    const search = document.getElementById(`f95h-highlight-search-${groupId}`);
                    if (search) search.value = '';
                    dropdown.style.display = 'none';
                });
            }

            dropdown.appendChild(row);
        });

        dropdown.style.display = 'block';
    }

    function addTagHighlightGroup() {
        if (tagHighlights.length >= MAX_TAG_HIGHLIGHT_GROUPS) {
            showFeedback(`Maximum ${MAX_TAG_HIGHLIGHT_GROUPS} highlight groups.`, true);
            return;
        }

        const index = tagHighlights.length;
        const preset = HIGHLIGHT_COLOR_PRESETS[index % HIGHLIGHT_COLOR_PRESETS.length];

        tagHighlights.push({
            id: makeLocalId('h'),
            name: `Highlight ${index + 1}`,
            color: preset.id,
            tags: []
        });

        saveTagHighlights();
        renderHighlightGroups();
        showFeedback(`✓ Highlight ${index + 1} added.`);
    }

    function deleteTagHighlightGroup(groupId) {
        const group = getHighlightGroupById(groupId);
        if (!group) return;

        if (tagHighlights.length <= 1) {
            showFeedback('At least one highlight group is needed.', true);
            return;
        }

        if (group.tags.length && !confirm(`Delete "${group.name}" and its ${group.tags.length} tags?`)) {
            return;
        }

        tagHighlights = tagHighlights.filter(item => item.id !== groupId);
        saveTagHighlights();
        renderHighlightGroups();
        applyAllHighlights();

        showFeedback(`Deleted "${group.name}".`);
    }

    function addHighlightTag(groupId, id) {
        const group = getHighlightGroupById(groupId);
        id = String(id);

        if (!group) {
            showFeedback('Highlight group not found.', true);
            return false;
        }

        if (!TAG_MAP[id]) {
            showFeedback('Unknown tag ID.', true);
            return false;
        }

        removeTagFromAllHighlightGroups(id);
        group.tags.push(id);
        group.tags = [...new Set(group.tags)];

        saveTagHighlights();
        renderHighlightGroups();
        applyAllHighlights();

        showFeedback(`✓ Tag "${TAG_MAP[id]}" added to ${group.name}.`);
        return true;
    }

    function removeHighlightTag(groupId, id) {
        const group = getHighlightGroupById(groupId);
        id = String(id);

        if (!group) return;

        group.tags = group.tags.filter(tagId => tagId !== id);

        saveTagHighlights();
        renderHighlightGroups();
        applyAllHighlights();

        showFeedback(`Removed tag "${TAG_MAP[id]}" from ${group.name}.`);
    }

    function renderRatingRules() {
        const wrap = document.getElementById('f95h-rating-rules');
        if (!wrap) return;

        wrap.innerHTML = ratingRules.map((rule, index) => ratingRuleUI(rule, index)).join('');
        wrap.classList.toggle('empty', ratingRules.length === 0);

        ratingRules.forEach((rule, index) => {
            const thresholdInput = document.getElementById(`f95h-rating-threshold-${index}`);
            const colorSelect = document.getElementById(`f95h-rating-color-${index}`);
            const deleteBtn = document.getElementById(`f95h-rating-delete-${index}`);

            if (thresholdInput) {
                thresholdInput.addEventListener('change', () => updateRatingThreshold(index, thresholdInput.value));
            }

            if (colorSelect) {
                colorSelect.addEventListener('change', () => updateRatingColor(index, colorSelect.value));
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => deleteRatingRule(index));
            }
        });

        updateCounts();
    }

    function findNewRatingThreshold() {
        const preferred = [4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 1.0, 0.0];
        const used = new Set(ratingRules.map(rule => Number(rule.threshold).toFixed(1)));
        const preferredValue = preferred.find(value => !used.has(value.toFixed(1)));

        if (preferredValue !== undefined) return preferredValue;

        for (let value = 5; value >= 0; value -= 0.1) {
            const rounded = Math.round(value * 10) / 10;
            if (!used.has(rounded.toFixed(1))) return rounded;
        }

        return 0;
    }

    function suggestRatingColor(threshold) {
        if (threshold >= 4.5) return 'green';
        if (threshold >= 4.0) return 'yellow';
        if (threshold >= 3.0) return 'orange';
        return 'dark';
    }

    function addRatingRule() {
        if (ratingRules.length >= MAX_RATING_RULES) {
            showFeedback(`Maximum ${MAX_RATING_RULES} rating rules.`, true);
            return;
        }

        const threshold = findNewRatingThreshold();
        ratingRules.push({ threshold, color: suggestRatingColor(threshold) });
        saveRatingRules();
        renderRatingRules();
        applyAllHighlights();

        showFeedback(`✓ Rating rule ≥ ${threshold.toFixed(1)} added.`);
    }

    function updateRatingThreshold(index, rawValue) {
        if (!ratingRules[index]) return;

        const value = Number(rawValue);
        if (!Number.isFinite(value)) {
            showFeedback('Rating threshold must be a number.', true);
            renderRatingRules();
            return;
        }

        const threshold = Math.max(0, Math.min(5, Math.round(value * 10) / 10));
        ratingRules[index].threshold = threshold;

        // If another rule already had this threshold, keep the edited rule and remove the duplicate.
        ratingRules = ratingRules.filter((rule, i) => {
            return i === index || Number(rule.threshold).toFixed(1) !== threshold.toFixed(1);
        });

        saveRatingRules();
        renderRatingRules();
        applyAllHighlights();

        showFeedback('Rating rules updated. Highest matching rule wins.');
    }

    function updateRatingColor(index, color) {
        if (!ratingRules[index]) return;

        ratingRules[index].color = color;
        saveRatingRules();
        renderRatingRules();
        applyAllHighlights();

        showFeedback('Rating color updated.');
    }

    function deleteRatingRule(index) {
        if (!ratingRules[index]) return;

        const threshold = ratingRules[index].threshold;
        ratingRules.splice(index, 1);
        saveRatingRules();
        renderRatingRules();
        applyAllHighlights();

        showFeedback(`Deleted rating rule ≥ ${Number(threshold).toFixed(1)}.`);
    }

    // =====================================================
    // 14. APPEARANCE TAB UI / LOGIC
    // =====================================================

    function appearanceTabUI() {
        return `
            <div class="f95h-page" id="f95h-page-appearance">
                <div class="f95h-box full">
                    <div class="f95h-settings-list">

                        <div class="f95h-setting-group-title">Latest Updates</div>

                        <div class="f95h-setting-row">
                            <div>
                                <div class="f95h-setting-name">Page width</div>
                                <div class="f95h-setting-desc">Gives the Latest Updates card area more horizontal room.</div>
                            </div>
                            <div class="f95h-setting-control">
                                <div class="f95h-segment" id="f95h-latest-width-segment">
                                    <button class="f95h-seg-btn" data-latest-wide="false">Normal</button>
                                    <button class="f95h-seg-btn" data-latest-wide="true">Wide</button>
                                </div>
                            </div>
                        </div>

                        <div class="f95h-setting-row">
                            <div>
                                <div class="f95h-setting-name">Cards per row</div>
                                <div class="f95h-setting-desc">Only affects the normal grid view on the Latest Updates page.</div>
                            </div>
                            <div class="f95h-setting-control">
                                <div class="f95h-segment" id="f95h-cards-row-segment">
                                    <button class="f95h-seg-btn" data-cards-row="3">3 / row</button>
                                    <button class="f95h-seg-btn" data-cards-row="4">4 / row</button>
                                </div>
                            </div>
                        </div>

                        <div class="f95h-setting-group-title">Thread pages</div>

                        <div class="f95h-setting-row">
                            <div>
                                <div class="f95h-setting-name">Hide reaction bars</div>
                                <div class="f95h-setting-desc">Removes the reaction summary under posts, while keeping Like, Quote, Reply, and Report.</div>
                            </div>
                            <div class="f95h-setting-control">
                                <label class="f95h-switch">
                                    <input type="checkbox" id="f95h-hide-reactions">
                                    <span></span>
                                </label>
                            </div>
                        </div>

                        <div class="f95h-setting-row">
                            <div>
                                <div class="f95h-setting-name">Compact user info</div>
                                <div class="f95h-setting-desc">Keeps avatars, usernames, titles, and banners, but hides joined date, messages, likes, and points.</div>
                            </div>
                            <div class="f95h-setting-control">
                                <label class="f95h-switch">
                                    <input type="checkbox" id="f95h-compact-users">
                                    <span></span>
                                </label>
                            </div>
                        </div>

                        <div class="f95h-setting-row">
                            <div>
                                <div class="f95h-setting-name">Hide signatures</div>
                                <div class="f95h-setting-desc">Removes user signatures below posts to reduce visual clutter.</div>
                            </div>
                            <div class="f95h-setting-control">
                                <label class="f95h-switch">
                                    <input type="checkbox" id="f95h-hide-signatures">
                                    <span></span>
                                </label>
                            </div>
                        </div>

                        <div class="f95h-setting-group-title">Filters</div>

                        <div class="f95h-setting-row">
                            <div>
                                <div class="f95h-setting-name">Dimming power</div>
                                <div class="f95h-setting-desc">Controls how transparent filtered cards become when filter mode is Dim.</div>
                            </div>
                            <div class="f95h-setting-control">
                                <strong><span id="f95h-dim-value">20</span>% visible</strong>
                            </div>
                            <div class="f95h-setting-control wide">
                                <input class="f95h-slider" id="f95h-dim-slider" type="range" min="5" max="80" step="5">
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;
    }

    function wireAppearanceTab() {
        const slider = document.getElementById('f95h-dim-slider');
        const value = document.getElementById('f95h-dim-value');
        const rowSegment = document.getElementById('f95h-cards-row-segment');
        const widthSegment = document.getElementById('f95h-latest-width-segment');
        const reactionsToggle = document.getElementById('f95h-hide-reactions');
        const compactUsersToggle = document.getElementById('f95h-compact-users');
        const signaturesToggle = document.getElementById('f95h-hide-signatures');

        if (slider && value) {
            slider.value = dimStrength;
            value.textContent = dimStrength;

            slider.addEventListener('input', () => {
                dimStrength = Number(slider.value);
                value.textContent = dimStrength;

                GM_setValue(KEY_DIM_STRENGTH, dimStrength);
                document.documentElement.style.setProperty('--f95h-dim-opacity', dimStrength);

                if (isLatestPage()) {
                    applyFiltering();
                }
            });
        }

        if (rowSegment) {
            rowSegment.addEventListener('click', e => {
                const btn = e.target.closest('.f95h-seg-btn[data-cards-row]');
                if (!btn) return;

                cardsPerRow = Number(btn.dataset.cardsRow);
                if (![3, 4].includes(cardsPerRow)) cardsPerRow = 3;

                GM_setValue(KEY_CARDS_PER_ROW, cardsPerRow);
                applyAppearanceSettings();
                updateAppearanceUI();

                showFeedback(`Latest page layout set to ${cardsPerRow} cards per row.`);
            });
        }

        if (widthSegment) {
            widthSegment.addEventListener('click', e => {
                const btn = e.target.closest('.f95h-seg-btn[data-latest-wide]');
                if (!btn) return;

                latestWide = btn.dataset.latestWide === 'true';
                GM_setValue(KEY_LATEST_WIDE, latestWide);
                applyAppearanceSettings();
                updateAppearanceUI();

                showFeedback(`Latest page width set to ${latestWide ? 'Wide' : 'Normal'}.`);
            });
        }

        if (reactionsToggle) {
            reactionsToggle.addEventListener('change', () => {
                hideReactions = reactionsToggle.checked;
                GM_setValue(KEY_HIDE_REACTIONS, hideReactions);
                applyAppearanceSettings();
                showFeedback(`Reaction bars ${hideReactions ? 'hidden' : 'shown'}.`);
            });
        }

        if (compactUsersToggle) {
            compactUsersToggle.addEventListener('change', () => {
                compactUsers = compactUsersToggle.checked;
                GM_setValue(KEY_COMPACT_USERS, compactUsers);
                applyAppearanceSettings();
                showFeedback(`Compact user info ${compactUsers ? 'enabled' : 'disabled'}.`);
            });
        }

        if (signaturesToggle) {
            signaturesToggle.addEventListener('change', () => {
                hideSignatures = signaturesToggle.checked;
                GM_setValue(KEY_HIDE_SIGNATURES, hideSignatures);
                applyAppearanceSettings();
                showFeedback(`Signatures ${hideSignatures ? 'hidden' : 'shown'}.`);
            });
        }

        updateAppearanceUI();
    }

    function updateAppearanceUI() {
        const value = document.getElementById('f95h-dim-value');
        const slider = document.getElementById('f95h-dim-slider');
        const reactionsToggle = document.getElementById('f95h-hide-reactions');
        const compactUsersToggle = document.getElementById('f95h-compact-users');
        const signaturesToggle = document.getElementById('f95h-hide-signatures');

        if (value) value.textContent = dimStrength;
        if (slider) slider.value = dimStrength;

        if (reactionsToggle) reactionsToggle.checked = hideReactions;
        if (compactUsersToggle) compactUsersToggle.checked = compactUsers;
        if (signaturesToggle) signaturesToggle.checked = hideSignatures;

        document.querySelectorAll('#f95h-cards-row-segment .f95h-seg-btn').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.cardsRow) === cardsPerRow);
        });

        document.querySelectorAll('#f95h-latest-width-segment .f95h-seg-btn').forEach(btn => {
            btn.classList.toggle('active', String(latestWide) === btn.dataset.latestWide);
        });
    }

    function applyLatestGridLayout() {
        document.documentElement.classList.toggle('f95h-latest-four-cols', isLatestPage() && cardsPerRow === 4);
        document.documentElement.classList.toggle('f95h-latest-three-cols', isLatestPage() && cardsPerRow === 3);
        document.documentElement.classList.toggle('f95h-latest-wide', isLatestPage() && latestWide);
    }

    function applyThreadCleanup() {
        document.documentElement.classList.toggle('f95h-hide-reactions', isThreadPage() && hideReactions);
        document.documentElement.classList.toggle('f95h-compact-users', isThreadPage() && compactUsers);
        document.documentElement.classList.toggle('f95h-hide-signatures', isThreadPage() && hideSignatures);
    }

    function applyAppearanceSettings() {
        applyLatestGridLayout();
        applyThreadCleanup();
        applyAllHighlights();
    }

    // =====================================================
    // 15. BACKUP TAB UI
    // =====================================================

    function backupTabUI() {
        return `
            <div class="f95h-page" id="f95h-page-backup">
                <div class="f95h-grid f95h-backup-grid">
                    <div class="f95h-box">
                        <div class="f95h-box-title">Export backup</div>
                        <div class="f95h-box-desc">
                            Download filters, watchlist, and settings as JSON.
                        </div>

                        <button class="f95h-btn" id="f95h-export">
                            Download backup
                        </button>
                    </div>

                    <div class="f95h-box">
                        <div class="f95h-box-title">Import backup</div>
                        <div class="f95h-box-desc">
                            Paste JSON, load a JSON file, or drag a .json file onto the box.
                        </div>

                        <textarea
                            class="f95h-input"
                            id="f95h-import-text"
                            rows="6"
                            placeholder='{"threads":["123"],"tags":["330"],"watchlist":[]}'
                        ></textarea>

                        <div style="height: 8px;"></div>

                        <div class="f95h-import-actions">
                            <button class="f95h-btn secondary" id="f95h-load-file">
                                Load JSON
                            </button>

                            <button class="f95h-btn" id="f95h-import">
                                Import
                            </button>
                        </div>

                        <input
                            type="file"
                            id="f95h-file-input"
                            accept=".json,application/json"
                            style="display:none"
                        >
                    </div>

                    <div class="f95h-box full">
                        <div class="f95h-box-title">What is saved?</div>
                        <div class="f95h-box-desc">
                            Saved data includes filtered game IDs, filtered tag IDs, filter mode,
                            ignored-games setting, rating filter settings, dimming power, tag highlight groups, rating color rules, latest-page layout, thread-page cleanup settings, watchlist, and watch interval.
                            Old Card Dimmer-style backups still work.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // =====================================================
    // 16. BACKUP TAB LOGIC
    // =====================================================

    function wireBackupTab() {
        const importText = document.getElementById('f95h-import-text');
        const fileInput = document.getElementById('f95h-file-input');
        const loadFileBtn = document.getElementById('f95h-load-file');

        document.getElementById('f95h-export').addEventListener('click', () => {
            const data = {
                version: 8,
                exportedAt: new Date().toISOString(),

                threads: [...dimmedThreadIds],
                tags: [...dimmedTagIds],
                tagHighlights,
                ratingRules,

                filterMode,
                cardMode: filterMode,

                ratingFilterEnabled,
                ratingFilterMin,
                ratingFilterBehavior,
                ratingFilterUnrated,

                hideIgnored,
                dimStrength,
                autoFillEnabled,
                autoFillTarget,
                autoFillMaxPages,
                cardsPerRow,
                latestWide,
                hideReactions,
                compactUsers,
                hideSignatures,

                watchIntervalHours,
                watchlist
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'f95-helper-backup.json';
            a.click();

            setTimeout(() => URL.revokeObjectURL(url), 100);
            showFeedback('✓ Backup downloaded.');
        });

        loadFileBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            readJsonFileToTextarea(file, importText);
            e.target.value = '';
        });

        importText.addEventListener('dragover', e => {
            e.preventDefault();
            importText.classList.add('f95h-drop-active');
        });

        importText.addEventListener('dragleave', () => {
            importText.classList.remove('f95h-drop-active');
        });

        importText.addEventListener('drop', e => {
            e.preventDefault();
            importText.classList.remove('f95h-drop-active');

            const file = e.dataTransfer.files[0];

            if (!file) {
                showFeedback('Drop a .json file here.', true);
                return;
            }

            readJsonFileToTextarea(file, importText);
        });

        document.getElementById('f95h-import').addEventListener('click', () => {
            const raw = importText.value.trim();

            if (!raw) {
                showFeedback('Paste or load backup JSON first.', true);
                return;
            }

            let data;

            try {
                data = JSON.parse(raw);
            } catch {
                showFeedback('Invalid JSON.', true);
                return;
            }

            const inThreads = cleanThreadIds(data.threads || []);
            const inTags = cleanTagIds(data.tags || []);
            const inHighlights = cleanTagHighlights(data.tagHighlights || tagHighlights);
            const inRatingRules = Array.isArray(data.ratingRules) ? cleanRatingRules(data.ratingRules) : ratingRules;

            inThreads.forEach(id => dimmedThreadIds.add(id));
            inTags.forEach(id => dimmedTagIds.add(id));
            tagHighlights = inHighlights;
            ratingRules = inRatingRules;
            saveTagHighlights();
            saveRatingRules();

            const importedMode = data.filterMode || data.cardMode;

            if (['off', 'dim', 'hide'].includes(importedMode)) {
                filterMode = importedMode;
                GM_setValue(KEY_FILTER_MODE, filterMode);
            }

            if (typeof data.hideIgnored === 'boolean') {
                hideIgnored = data.hideIgnored;
                GM_setValue(KEY_HIDE_IGNORED, hideIgnored);
            }

            if (typeof data.ratingFilterEnabled === 'boolean') {
                ratingFilterEnabled = data.ratingFilterEnabled;
            }

            if (Number.isFinite(Number(data.ratingFilterMin))) {
                ratingFilterMin = cleanRatingFilterMin(data.ratingFilterMin);
            }

            if (['off', 'dim', 'hide'].includes(data.ratingFilterBehavior)) {
                ratingFilterBehavior = data.ratingFilterBehavior;
            }

            if (['keep', 'low'].includes(data.ratingFilterUnrated)) {
                ratingFilterUnrated = data.ratingFilterUnrated;
            }

            saveRatingFilterSettings();

            if (typeof data.autoFillEnabled === 'boolean') {
                autoFillEnabled = data.autoFillEnabled;
                GM_setValue(KEY_AUTOFILL_ENABLED, autoFillEnabled);
            }

            if ([12, 18, 24, 36, 48].includes(Number(data.autoFillTarget))) {
                autoFillTarget = Number(data.autoFillTarget);
                GM_setValue(KEY_AUTOFILL_TARGET, autoFillTarget);
            }

            if ([1, 2, 3, 5].includes(Number(data.autoFillMaxPages))) {
                autoFillMaxPages = Number(data.autoFillMaxPages);
                GM_setValue(KEY_AUTOFILL_MAX_PAGES, autoFillMaxPages);
            }

            if (Number.isFinite(Number(data.dimStrength))) {
                dimStrength = Number(data.dimStrength);
                dimStrength = Math.max(5, Math.min(80, dimStrength));
                GM_setValue(KEY_DIM_STRENGTH, dimStrength);
                document.documentElement.style.setProperty('--f95h-dim-opacity', dimStrength);
            }

            if ([3, 4].includes(Number(data.cardsPerRow))) {
                cardsPerRow = Number(data.cardsPerRow);
                GM_setValue(KEY_CARDS_PER_ROW, cardsPerRow);
            }

            if (typeof data.latestWide === 'boolean') {
                latestWide = data.latestWide;
                GM_setValue(KEY_LATEST_WIDE, latestWide);
            }

            if (typeof data.hideReactions === 'boolean') {
                hideReactions = data.hideReactions;
                GM_setValue(KEY_HIDE_REACTIONS, hideReactions);
            }

            if (typeof data.compactUsers === 'boolean') {
                compactUsers = data.compactUsers;
                GM_setValue(KEY_COMPACT_USERS, compactUsers);
            }

            if (typeof data.hideSignatures === 'boolean') {
                hideSignatures = data.hideSignatures;
                GM_setValue(KEY_HIDE_SIGNATURES, hideSignatures);
            }

            if ([24, 48, 72, 96, 168, 720].includes(Number(data.watchIntervalHours))) {
                watchIntervalHours = Number(data.watchIntervalHours);
                GM_setValue(KEY_WATCH_INTERVAL, watchIntervalHours);
            }

            const importedWatchlist = cleanWatchlist(data.watchlist || []);

            importedWatchlist.forEach(item => {
                if (
                    !watchlist.some(existing => existing.id === item.id) &&
                    (item.status || '').toLowerCase() !== 'abandoned'
                ) {
                    watchlist.push(item);
                }
            });

            saveJson(KEY_THREAD_IDS, [...dimmedThreadIds]);
            saveJson(KEY_TAG_IDS, [...dimmedTagIds]);
            saveJson(KEY_RATING_RULES, ratingRules);
            saveJson(KEY_WATCHLIST, watchlist);

            importText.value = '';

            renderFilteredGames();
            renderFilteredTags();
            renderWatchlist();
            renderHighlightGroups();
            renderRatingRules();
            updateCounts();
            updateFilterUI();
            applyAppearanceSettings();
            applyAllHighlights();
            updateAppearanceUI();

            if (isLatestPage()) {
                applyFiltering();
                markWatchedCards();
            }

            const interval = document.getElementById('f95h-watch-interval');
            if (interval) interval.value = String(watchIntervalHours);

            const highlightCount = tagHighlights.reduce((total, group) => total + group.tags.length, 0);
            showFeedback(`✓ Imported. Filters: ${dimmedThreadIds.size + dimmedTagIds.size}, Tag highlights: ${highlightCount}, Rating rules: ${ratingRules.length}, Watchlist: ${watchlist.length}.`);
        });
    }

    // =====================================================
    // 17. DRAG-TO-LIST LOGIC
    // =====================================================
    // Drag behavior depends on active tab:
    // Filters tab   → add to Filters.
    // Watchlist tab → add to Watchlist.
    // Other tabs    → do nothing.

    function installDragToList() {
        document.addEventListener('dragover', e => {
            const dt = e.dataTransfer;
            if (!dt) return;

            const types = [...dt.types];

            if (
                types.includes('text/uri-list') ||
                types.includes('text/plain') ||
                types.includes('text/html')
            ) {
                e.preventDefault();
                dt.dropEffect = 'copy';
            }
        }, true);

        document.addEventListener('drop', async e => {
            const dt = e.dataTransfer;
            if (!dt) return;

            if (e.target.closest?.('#f95h-import-text')) return;
            if (dt.files && dt.files.length > 0) return;

            const candidates = [];

            const uri = dt.getData('text/uri-list');
            const plain = dt.getData('text/plain');
            const html = dt.getData('text/html');

            if (uri) candidates.push(uri);
            if (plain) candidates.push(plain);

            if (html) {
                candidates.push(html);

                const hrefMatch = html.match(/href=["']([^"']+)["']/i);
                if (hrefMatch) candidates.push(hrefMatch[1]);
            }

            const card = e.target.closest?.('.resource-tile[data-thread-id]');
            if (card?.dataset?.threadId) {
                candidates.push(card.dataset.threadId);
                candidates.push(getCardThreadUrl(card));
            }

            const found = candidates.find(item => extractThreadId(item));

            if (!found) return;

            e.preventDefault();

            if (activePage === 'filters') {
                addFilteredGame(found);
                return;
            }

            if (activePage === 'watchlist') {
                await addWatchedGame(found);
                return;
            }

            showFeedback('Open Filters or Watchlist before dragging a game.');
        }, true);
    }

    // =====================================================
    // 18. WATCHED CARD BADGES
    // =====================================================
    // No add/remove stars on every card.
    // Only already-watched games get a small visual badge.

    function markWatchedCards() {
        document.querySelectorAll('.f95h-card-watch-badge').forEach(el => el.remove());

        const watchedMap = new Map(watchlist.map(item => [String(item.id), item]));

        getCards().forEach(card => {
            const id = String(card.dataset.threadId || '');
            const item = watchedMap.get(id);

            card.classList.toggle('f95h-watched-card', !!item);

            if (!item) return;

            const hasUpdate = versionChanged(item.savedVersion, item.currentVersion);

            card.style.position = card.style.position || 'relative';

            const badge = document.createElement('div');
            badge.className = 'f95h-card-watch-badge' + (hasUpdate ? ' update' : '');
            badge.innerHTML = svgIcon(hasUpdate ? 'update' : 'watchBadge', 'badge');

            card.appendChild(badge);
        });
    }

    // =====================================================
    // 19. SCROLL HELPERS
    // =====================================================

    function lockScrollInside(selector) {
        const el = document.querySelector(selector);
        if (!el) return;

        el.addEventListener('wheel', e => {
            e.stopPropagation();
        }, { passive: true });
    }

    // =====================================================
    // 20. PAGE WATCHER
    // =====================================================

    function watchForCards() {
        const observer = new MutationObserver(mutations => {
            const hasNewCards = mutations.some(mutation => {
                return [...mutation.addedNodes].some(node => {
                    return node.nodeType === 1 && (
                        node.matches?.('.resource-tile[data-thread-id]') ||
                        node.querySelector?.('.resource-tile[data-thread-id]')
                    );
                });
            });

            const hasHighlightContent = mutations.some(mutation => {
                return [...mutation.addedNodes].some(node => {
                    return node.nodeType === 1 && (
                        node.matches?.('.resource-tile_tags, .tagItem, .tagList, .resource-tile_info-meta_rating') ||
                        node.querySelector?.('.resource-tile_tags, .tagItem, .tagList, .resource-tile_info-meta_rating')
                    );
                });
            });

            if (hasNewCards && isLatestPage()) {
                applyLatestGridLayout();
                applyFiltering();
                markWatchedCards();
                syncAutoFillPagination();
            }

            if (hasNewCards || hasHighlightContent) {
                applyAllHighlights();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // =====================================================
    // 21. INIT
    // =====================================================

    function init() {
        buildMainUI();

        wireMainUI();
        wireFiltersTab();
        wireWatchlistTab();
        wireHighlightsTab();
        wireAppearanceTab();
        wireBackupTab();

        lockScrollInside('#f95h-thread-list');
        lockScrollInside('#f95h-tag-list');
        lockScrollInside('#f95h-watch-list');

        document.documentElement.style.setProperty('--f95h-dim-opacity', dimStrength);
        applyAppearanceSettings();

        renderFilteredGames();
        renderFilteredTags();
        renderWatchlist();
        renderHighlightGroups();
        renderRatingRules();
        updateCounts();
        updateFilterUI();
        updateAutoFillUI();
        updateAppearanceUI();

        applyAllHighlights();
        watchForCards();

        if (isLatestPage()) {
            watchLatestSignature();
            autoFillBaseSignature = latestStateSignature(parseLatestState());
            autoFillBasePage = parseLatestState().page;
            autoFillTotalPages = getKnownTotalPages();
            applyFiltering();
            markWatchedCards();
            syncAutoFillPagination();
            scheduleAutoFillIfNeeded('init');
            installDragToList();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();