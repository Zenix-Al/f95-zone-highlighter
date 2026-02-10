export function openInNewTabHelper(url) {
  GM_openInTab(url, {
    active: false, // try to keep in background
    insert: true, // put at end of tab bar
    setParent: true, // sometimes helps referrer
  });
}
