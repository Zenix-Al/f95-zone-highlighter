export async function probeMaskedDirectCore({ bridge, sleep }) {
  let ping = { ok: false, apiVersion: "" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    ping = await bridge.waitForCorePing(2200 + attempt * 600);
    if (ping.ok) return ping;
    await sleep(300 + attempt * 250);
  }

  const accessProbe = await bridge.getAddonAccess();
  return accessProbe?.ok
    ? { ok: true, apiVersion: "probed" }
    : ping;
}
