export function createUtilityRegistry() {
  const utilities = new Map();

  function register(definition) {
    const id = String(definition?.id || "").trim();
    if (!id || typeof definition?.execute !== "function") {
      throw new Error("invalid_utility_definition");
    }
    if (utilities.has(id)) throw new Error(`duplicate_utility_id:${id}`);
    const entry = Object.freeze({
      id,
      family: String(definition.family || "utility").trim() || "utility",
      label: String(definition.label || id).trim().slice(0, 60),
      execute: definition.execute,
    });
    utilities.set(id, entry);
    return entry;
  }

  function execute(id, context) {
    const utility = utilities.get(String(id || "").trim());
    if (!utility) return Promise.resolve({ ok: false, reason: "unknown_utility" });
    return Promise.resolve(utility.execute(context));
  }

  return {
    execute,
    get: (id) => utilities.get(String(id || "").trim()) || null,
    list: (family = "") => [...utilities.values()]
      .filter((utility) => !family || utility.family === family),
    register,
  };
}
