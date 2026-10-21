export function createMaskedDirectStyleController({ bridge, runtime, ui }) {
  async function invoke(action) {
    try {
      const result = await bridge.invokeCoreAction(action, {
        styleId: ui.styleId,
        ...(action.endsWith(".register") ? { cssText: ui.cssText } : {}),
      });
      if (!result?.ok) {
        console.warn(`[${runtime.addonId}] Failed to ${action}:`, result);
      }
    } catch (error) {
      console.warn(`[${runtime.addonId}] Error during ${action}:`, error);
    }
  }

  return {
    register: () => invoke("ui.style.register"),
    unregister: () => invoke("ui.style.unregister"),
  };
}
