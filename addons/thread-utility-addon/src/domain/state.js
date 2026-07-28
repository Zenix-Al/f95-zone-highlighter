export function createInitialState() {
  return {
    enabled: false,
    pageContext: null,
    snapshot: null,
    settings: {
      showLauncher: true,
      visibleTagLimit: 8,
      excludedTagMode: "muted",
      openSearchesInNewTab: true,
      searchScope: "thread",
      quickSearches: [],
      descriptionPreviewLines: 4,
    },
    tagPrefs: null,
    displayTags: [],
    utilities: [],
    content: null,
    downloads: [],
    ui: {
      styleRegistered: false,
      launcherMounted: false,
      dialogOpen: false,
      dialogOpening: false,
      dialogGeneration: null,
      tagsExpanded: false,
      openContentSection: null,
    },
  };
}
