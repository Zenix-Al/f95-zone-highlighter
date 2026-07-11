import { registerDiagnosticsProvider } from "./featureHealth.js";

class ResourceManager {
  constructor() {
    this.resources = new Map();
    this.owners = new Map();
  }

  register(id, cleanup, ownerId = null) {
    if (!id || typeof cleanup !== "function") return;
    if (this.resources.has(id)) {
      throw new Error(`ResourceManager: Resource '${id}' already registered.`);
    }
    const resource = { id, cleanup, createdAt: Date.now(), ownerId: ownerId || null };
    this.resources.set(id, resource);
    if (ownerId) {
      const ownerResources = this.owners.get(ownerId) || [];
      ownerResources.push(resource);
      this.owners.set(ownerId, ownerResources);
    }
    return resource;
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
    if (res.ownerId) {
      const ownerResources = this.owners.get(res.ownerId) || [];
      const nextResources = ownerResources.filter((entry) => entry.id !== id);
      if (nextResources.length > 0) {
        this.owners.set(res.ownerId, nextResources);
      } else {
        this.owners.delete(res.ownerId);
      }
    }
  }

  unregister(id) {
    this.cleanup(id);
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

  createOwner(ownerId) {
    if (!ownerId || this.owners.has(ownerId)) {
      return this.getOwner(ownerId);
    }

    const owner = {
      ownerId,
      register: (resourceId, cleanup) => {
        if (!resourceId || typeof cleanup !== "function") return null;
        const existing = Array.from(this.resources.values()).find(
          (resource) => resource.ownerId === ownerId && resource.id === resourceId,
        );
        if (existing) {
          throw new Error(`ResourceManager: Resource '${resourceId}' already registered for owner '${ownerId}'.`);
        }
        return this.register(resourceId, cleanup, ownerId);
      },
      release: () => {
        const resources = Array.from(this.resources.values()).filter(
          (resource) => resource.ownerId === ownerId,
        );
        for (const resource of resources) {
          this.cleanup(resource.id);
        }
        return resources.length;
      },
    };

    this.owners.set(ownerId, []);
    return owner;
  }

  getOwner(ownerId) {
    if (!ownerId) return null;
    return {
      ownerId,
      register: (resourceId, cleanup) => {
        if (!resourceId || typeof cleanup !== "function") return null;
        const existing = Array.from(this.resources.values()).find(
          (resource) => resource.ownerId === ownerId && resource.id === resourceId,
        );
        if (existing) {
          throw new Error(`ResourceManager: Resource '${resourceId}' already registered for owner '${ownerId}'.`);
        }
        return this.register(resourceId, cleanup, ownerId);
      },
      release: () => {
        const resources = Array.from(this.resources.values()).filter(
          (resource) => resource.ownerId === ownerId,
        );
        for (const resource of resources) {
          this.cleanup(resource.id);
        }
        return resources.length;
      },
    };
  }

  getSnapshot() {
    const owners = {};
    for (const [ownerId, resources] of this.owners.entries()) {
      owners[ownerId] = {
        ownerId,
        resources: resources.map((resource) => ({
          id: resource.id,
          ownerId: resource.ownerId,
          createdAt: resource.createdAt,
        })),
      };
    }
    return {
      owners,
      totalResources: this.resources.size,
    };
  }
}

export function createResourceOwner(ownerId) {
  return resourceManager.createOwner(ownerId);
}

export function releaseOwner(ownerId) {
  const owner = resourceManager.getOwner(ownerId);
  if (!owner) {
    return { ownerId, released: 0, alreadyReleased: true };
  }

  const released = owner.release();
  return { ownerId, released, alreadyReleased: false };
}

export function getResourceSnapshot() {
  return resourceManager.getSnapshot();
}

export const resourceManager = new ResourceManager();

registerDiagnosticsProvider("resources", () => {
  const snapshot = getResourceSnapshot();
  return { totalResources: snapshot.totalResources, ownerCount: Object.keys(snapshot.owners).length };
});
