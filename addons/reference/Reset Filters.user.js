// ==UserScript==
// @name        Reset Filters
// @namespace   1330126-edexal
// @match       *://f95zone.to/sam/latest_alpha/*
// @grant       none
// @icon        https://external-content.duckduckgo.com/ip3/f95zone.to.ico
// @license     Unlicense
// @version     1.0.2
// @author      Edexal
// @description Reset individual filters in the filter drawer on the latest update page.
// @homepageURL https://sleazyfork.org/en/scripts/588436-reset-filters
// @supportURL  https://github.com/Edexaal/scripts/issues
// @require      https://cdn.jsdelivr.net/gh/Edexaal/scripts@20abbf4a49807e7d11a081eb3a8573d0cab83c1f/_lib/utility.js
// @downloadURL https://update.greasyfork.org/scripts/588436/Reset%20Filters.user.js
// @updateURL https://update.greasyfork.org/scripts/588436/Reset%20Filters.meta.js
// ==/UserScript==
(async () => {
  const SELECTOR = {
    INCLUDE_TAGS: "#filter-block_tags",
    EXCLUDE_TAGS: "#filter-block_tags_exclude",
    PREFIXES: "#filter-block_prefixes div.filter-block div.filter-block_content"
  }
  const ENGINE_SET = new Set([
    '1', '2', '3', '4', '5', '6', '7', '8', '12', '14', '17', '30', '31', '47', '116'
  ]);
  const OTHER_SET = new Set(['13', '19', '23']);
  const STATUS_SET = new Set(['18', '20', '22']);
  Edexal.addCSS(`
  .ed-filter_btn {
    display: block;
    background: linear-gradient(to top left, rgb(0 0 0 / 0.2), rgb(0 0 0 / 0.2) 30%, rgb(0 0 0 / 0)) #ba4545;
    color: yellow;
    width: 100%;
    height: 35px;
    margin: 10px auto 5px auto;
    font-size: 0.875em;
    font-weight: bold;
    border: 1px solid #a4a4a4;
    border-radius: 5px;
    transition: opacity .2s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
        opacity: 0.8;
        cursor: pointer;
    }

    &:active {
        opacity: 0.6;
    }
}`);


  function addButton(containerEl, newBtnId, btnEvent) {
    const newBtn = Edexal.newEl({element: "button", class: ["ed-filter_btn"], id: newBtnId, text: "Reset"});
    Edexal.on(newBtn, 'click', btnEvent);
    containerEl.append(newBtn);
  }

  function initPrefixBtns() {
    const prefixContainers = Edexal.$$(SELECTOR.PREFIXES);
    prefixContainers.forEach((node, i) => {
      switch (i) {
        case 0:
          addButton(node, "ed-engine_prefixes", () => prefixResetEvent(ENGINE_SET));
          break;
        case 1:
          addButton(node, "ed-other_prefixes", () => prefixResetEvent(OTHER_SET));
          break;
        default:
          addButton(node, "ed-status_prefixes", () => prefixResetEvent(STATUS_SET));
          break;
      }
    });
  }

  function initButtons() {
    addButton(Edexal.$(SELECTOR.INCLUDE_TAGS), 'ed-include_tags', () => tagResetEvent(/\/tags=(\d,?)+/, ''));
    addButton(Edexal.$(SELECTOR.EXCLUDE_TAGS), 'ed-exclude_tags', () => tagResetEvent(/\/notags=(\d,?)+/, ''));
    setTimeout(initPrefixBtns, 500);
  }

  function getNewPrefixURL(prefixSet, url, isPrefix) {
    const prefixPhrase = isPrefix ? "prefixes" : "noprefixes";
    const prefixRegex = new RegExp(`/${prefixPhrase}=\\d+(?:,\\d+)*`);
    const urlMatches = url.match(prefixRegex);
    const urlPrefix = urlMatches[0];
    const splitPrefix = urlPrefix.split('=');
    const urlPrefixNumbers = splitPrefix[1].split(',');
    const prefixesToKeep = [];
    for (const prefixNumber of urlPrefixNumbers) {
      if (!prefixSet.has(prefixNumber)) {
        prefixesToKeep.push(prefixNumber);
      }
    }
    if (!prefixesToKeep.length) {
      return url.replace(prefixRegex, '');
    }
    return url.replace(prefixRegex, `/${prefixPhrase}=${prefixesToKeep.join(',')}`);
  }

  function prefixResetEvent(prefixSet) {
    let url = location.href;
    if (url.includes("/prefixes=")) {
      url = getNewPrefixURL(prefixSet, url, true);
    }
    if (url.includes("/noprefixes=")) {
      url = getNewPrefixURL(prefixSet, url);
    }
    if (url !== location.href) {
      goToURL(url);
    }
  }


  function tagResetEvent(regex) {
    const newURL = location.href.replace(regex, '');
    goToURL(newURL);
  }

  function goToURL(url) {
    location.replace(url);
  }

  function run() {
    initButtons();
  }

  run();
})();