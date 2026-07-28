export function createSnapshotSourceRegistry() {
  let generation = null;
  let sequence = 0;
  const sources = new Map();

  function begin(nextGeneration) {
    clear();
    generation = Number(nextGeneration);
  }

  function retain(node, kind = "source") {
    if (!node || generation === null) return "";
    const token = `${String(kind || "source")}:${generation}:${++sequence}`;
    sources.set(token, { generation, node });
    return token;
  }

  function get(token, expectedGeneration = generation) {
    const source = sources.get(String(token || ""));
    if (!source || source.generation !== Number(expectedGeneration)) return null;
    return source.node?.isConnected === false ? null : source.node;
  }

  function clear() {
    sources.clear();
    generation = null;
  }

  return {
    begin,
    clear,
    get,
    getGeneration: () => generation,
    getSnapshot: () => [...sources.keys()],
    retain,
  };
}
