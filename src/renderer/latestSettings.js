import { config } from "../constants";

export function renderLatest() {
  const elAuto = document.getElementById("settings-auto-refresh");
  if (elAuto) elAuto.checked = !!config.latestSettings.autoRefresh;

  const elNotif = document.getElementById("settings-web-notif");
  if (elNotif) elNotif.checked = !!config.latestSettings.webNotif;

  // settings-script-notif
}
