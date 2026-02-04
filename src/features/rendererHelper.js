export function getByPath(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

export function setByPath(obj, path, value) {
  const keys = path.split(".");
  const firstKey = keys[0];

  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;

  return firstKey;
}
