export function createInitialState() {
  return {
    // Registration happens before addon.access resolves. Start from the
    // canonical optimistic state so the runtime does not disable its own
    // handshake; persisted core state is applied immediately afterward.
    enabled: true,
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
