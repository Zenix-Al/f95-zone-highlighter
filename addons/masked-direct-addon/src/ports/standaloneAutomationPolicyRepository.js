export const STANDALONE_AUTOMATION_POLICY_KEY =
  "f95ue.addon.maskedDirect.standaloneAutomationPolicy";
export const STANDALONE_AUTOMATION_POLICY_VERSION = 1;
export const MISSING_CORE_OVERRIDE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CORE_PROBE_LEASE_TTL_MS = 20 * 1000;
const CORE_PROBE_POLL_MS = 100;

const EMPTY_POLICY = Object.freeze({
  version: STANDALONE_AUTOMATION_POLICY_VERSION,
  userPreference: false,
  skipMaskedLink: true,
  forcedByMissingCore: false,
  observedAt: 0,
  expiresAt: 0,
  coreState: "unknown",
  probeStartedAt: 0,
  probeExpiresAt: 0,
});

export function createStandaloneAutomationPolicyRepository({
  GMApi,
  now = Date.now,
} = {}) {
  async function read() {
    if (typeof GMApi?.getValue !== "function") return { ...EMPTY_POLICY };
    try {
      const raw = await GMApi.getValue(STANDALONE_AUTOMATION_POLICY_KEY, null);
      return normalizePolicy(raw, now());
    } catch {
      return { ...EMPTY_POLICY };
    }
  }

  async function write(next) {
    const timestamp = now();
    const normalized = normalizePolicy(next, timestamp, { allowExpired: true });
    if (!normalized.observedAt) return read();
    const current = await readRawPolicy(GMApi, timestamp);
    if (current.observedAt > normalized.observedAt) return current;
    if (
      current.observedAt === normalized.observedAt &&
      current.forcedByMissingCore === false &&
      normalized.forcedByMissingCore === true
    ) {
      return current;
    }
    if (typeof GMApi?.setValue !== "function") return normalized;
    try {
      await GMApi.setValue(STANDALONE_AUTOMATION_POLICY_KEY, normalized);
    } catch {
      // A storage failure leaves the prior policy authoritative.
      return current;
    }
    return normalized;
  }

  async function recordMissingCore() {
    const timestamp = now();
    const current = await read();
    return write({
      version: STANDALONE_AUTOMATION_POLICY_VERSION,
      userPreference: current.userPreference,
      skipMaskedLink: current.skipMaskedLink,
      forcedByMissingCore: true,
      observedAt: timestamp,
      expiresAt: timestamp + MISSING_CORE_OVERRIDE_TTL_MS,
      coreState: "confirmed-missing",
      probeStartedAt: 0,
      probeExpiresAt: 0,
    });
  }

  async function recordCoreAvailable({ userPreference, skipMaskedLink } = {}) {
    const timestamp = now();
    const current = await read();
    return write({
      version: STANDALONE_AUTOMATION_POLICY_VERSION,
      userPreference:
        typeof userPreference === "boolean"
          ? userPreference
          : current.userPreference,
      skipMaskedLink:
        typeof skipMaskedLink === "boolean"
          ? skipMaskedLink
          : current.skipMaskedLink,
      forcedByMissingCore: false,
      observedAt: timestamp,
      expiresAt: 0,
      coreState: "available",
      probeStartedAt: 0,
      probeExpiresAt: 0,
    });
  }

  async function recordCoreProbing() {
    const timestamp = now();
    const current = await read();
    return write({
      version: STANDALONE_AUTOMATION_POLICY_VERSION,
      userPreference: current.userPreference,
      skipMaskedLink: current.skipMaskedLink,
      forcedByMissingCore: current.forcedByMissingCore,
      observedAt: timestamp,
      expiresAt: current.forcedByMissingCore ? current.expiresAt : 0,
      coreState: "probing",
      probeStartedAt: timestamp,
      probeExpiresAt: timestamp + CORE_PROBE_LEASE_TTL_MS,
    });
  }

  async function getEffectivePolicy({
    waitForProbe = true,
    sleep = defaultSleep,
  } = {}) {
    let policy = await read();
    while (
      waitForProbe &&
      policy.coreState === "probing" &&
      policy.probeExpiresAt > now()
    ) {
      await sleep(
        Math.min(CORE_PROBE_POLL_MS, Math.max(1, policy.probeExpiresAt - now())),
      );
      policy = await read();
    }
    const probeBlocksStandalone = ["probing", "probe-expired"].includes(
      policy.coreState,
    );
    return {
      ...policy,
      effectiveAutomateRegardless: Boolean(
        !probeBlocksStandalone &&
          (policy.userPreference || policy.forcedByMissingCore),
      ),
    };
  }

  return {
    getEffectivePolicy,
    read,
    recordCoreAvailable,
    recordCoreProbing,
    recordMissingCore,
  };
}

function normalizePolicy(raw, timestamp, { allowExpired = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_POLICY };
  }
  if (raw.version !== STANDALONE_AUTOMATION_POLICY_VERSION) {
    return { ...EMPTY_POLICY };
  }
  const observedAt = Number(raw.observedAt);
  const expiresAt = Number(raw.expiresAt);
  if (!Number.isFinite(observedAt) || observedAt <= 0) {
    return { ...EMPTY_POLICY };
  }
  const forcedByMissingCore = raw.forcedByMissingCore === true;
  const rawCoreState = String(raw.coreState || "");
  const coreState = ["probing", "available", "confirmed-missing"].includes(
    rawCoreState,
  )
    ? rawCoreState
    : forcedByMissingCore
      ? "confirmed-missing"
      : "available";
  const probeStartedAt = Number(raw.probeStartedAt || 0);
  const probeExpiresAt = Number(raw.probeExpiresAt || 0);
  if (forcedByMissingCore && (!Number.isFinite(expiresAt) || expiresAt <= 0)) {
    return { ...EMPTY_POLICY };
  }
  if (forcedByMissingCore && !allowExpired && expiresAt <= timestamp) {
    return {
      version: STANDALONE_AUTOMATION_POLICY_VERSION,
      userPreference: raw.userPreference === true,
      skipMaskedLink: raw.skipMaskedLink !== false,
      forcedByMissingCore: false,
      observedAt,
      expiresAt: 0,
      coreState: "confirmed-missing",
      probeStartedAt: 0,
      probeExpiresAt: 0,
    };
  }
  if (!forcedByMissingCore && expiresAt !== 0) {
    return { ...EMPTY_POLICY };
  }
  if (coreState === "probing") {
    if (
      !Number.isFinite(probeStartedAt) ||
      probeStartedAt <= 0 ||
      !Number.isFinite(probeExpiresAt) ||
      probeExpiresAt <= probeStartedAt
    ) {
      return { ...EMPTY_POLICY };
    }
    if (!allowExpired && probeExpiresAt <= timestamp) {
      return {
        version: STANDALONE_AUTOMATION_POLICY_VERSION,
        userPreference: raw.userPreference === true,
        skipMaskedLink: raw.skipMaskedLink !== false,
        forcedByMissingCore: false,
        observedAt,
        expiresAt: 0,
        coreState: "probe-expired",
        probeStartedAt,
        probeExpiresAt,
      };
    }
  }
  return {
    version: STANDALONE_AUTOMATION_POLICY_VERSION,
    userPreference: raw.userPreference === true,
    skipMaskedLink: raw.skipMaskedLink !== false,
    forcedByMissingCore,
    observedAt,
    expiresAt: forcedByMissingCore ? expiresAt : 0,
    coreState,
    probeStartedAt: coreState === "probing" ? probeStartedAt : 0,
    probeExpiresAt: coreState === "probing" ? probeExpiresAt : 0,
  };
}

function defaultSleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function readRawPolicy(GMApi, timestamp) {
  if (typeof GMApi?.getValue !== "function") return { ...EMPTY_POLICY };
  try {
    const raw = await GMApi.getValue(STANDALONE_AUTOMATION_POLICY_KEY, null);
    return normalizePolicy(raw, timestamp, { allowExpired: true });
  } catch {
    return { ...EMPTY_POLICY };
  }
}
