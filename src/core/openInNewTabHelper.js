export function openInNewTabHelper(url) {
  // Keep host tab automation non-intrusive when opening a new tab.
  GM_openInTab(url, {
    active: false,
    insert: true,
    setParent: true,
  });
}
