export function createUpdateNotificationCoordinator({
  notify,
  isActive = () => true,
} = {}) {
  let delivered = false;

  function notifyFirstChanged() {
    if (delivered || !isActive()) return false;
    delivered = true;
    notify?.("There are updated games in your Library.", "success");
    return true;
  }

  return {
    notifyFirstChanged,
    getSnapshot: () => ({ delivered }),
  };
}
