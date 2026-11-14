// Quick Resolve has a local lifetime; external downloads remain independent.
export function createMaskedDirectPageBehavior({
  clearOwnedResources,
  feedback,
  quickResolver,
  getIsEnabled = () => true,
  getIsBlocked = () => false,
}) {
  return {
    async apply() {
      clearOwnedResources();
      if (getIsEnabled() && !getIsBlocked()) {
        feedback?.start();
        await quickResolver?.start();
      }
    },
  };
}
