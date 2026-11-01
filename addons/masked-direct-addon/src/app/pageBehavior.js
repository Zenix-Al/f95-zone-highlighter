// F95 no longer owns resolving, download controls or external tab lifecycle.
export function createMaskedDirectPageBehavior({
  clearOwnedResources,
  feedback,
  getIsEnabled = () => true,
  getIsBlocked = () => false,
}) {
  return {
    async apply() {
      clearOwnedResources();
      if (getIsEnabled() && !getIsBlocked()) feedback?.start();
    },
  };
}
