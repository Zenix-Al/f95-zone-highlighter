class ResourceManager {
  constructor() {
    this.resources = new Map();
  }

  register(id, cleanup) {
    if (!id || typeof cleanup !== "function") return;
    if (this.resources.has(id)) {
      console.warn(`ResourceManager: Resource '${id}' already registered.`);
      return;
    }
    this.resources.set(id, { cleanup, createdAt: Date.now() });
  }

  cleanup(id) {
    const res = this.resources.get(id);
    if (!res) return;
    try {
      res.cleanup();
    } catch (err) {
      console.warn(`ResourceManager: cleanup for '${id}' threw:`, err);
    }
    this.resources.delete(id);
  }

  unregister(id) {
    this.resources.delete(id);
  }

  cleanupAll(pattern) {
    if (!pattern) {
      // cleanup everything
      for (const id of Array.from(this.resources.keys())) this.cleanup(id);
      return;
    }

    const isWildcard = pattern.endsWith("*");
    const prefix = isWildcard ? pattern.slice(0, -1) : pattern;

    for (const id of Array.from(this.resources.keys())) {
      if (isWildcard) {
        if (id.startsWith(prefix)) this.cleanup(id);
      } else if (id === pattern) {
        this.cleanup(id);
      }
    }
  }
}

const resourceManager = new ResourceManager();
export default resourceManager;
