export function getRecord(core, payload) {
  return core.invokeCoreAction("idb.get", payload || {});
}

export function putRecord(core, payload) {
  return core.invokeCoreAction("idb.put", payload || {});
}

export function deleteRecord(core, payload) {
  return core.invokeCoreAction("idb.delete", payload || {});
}

export function bulkPutRecords(core, payload) {
  return core.invokeCoreAction("idb.bulkPut", payload || {});
}

export function queryRecords(core, payload) {
  return core.invokeCoreAction("idb.query", payload || {});
}

export function countRecords(core, payload) {
  return core.invokeCoreAction("idb.count", payload || {});
}
