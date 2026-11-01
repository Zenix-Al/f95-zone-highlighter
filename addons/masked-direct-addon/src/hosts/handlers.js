import { HOST_PROCESSORS } from "./metadata.js";
export const HOST_AUTOMATIONS = HOST_PROCESSORS.map((processor) => [
  processor.definition.canonicalHost,
  processor,
]);

export function createDirectDownloadHostHandlers({
  debugLog,
  createHostExecutionContext,
  getSettings,
}) {
  return Object.fromEntries(
    HOST_AUTOMATIONS.map(([host, processor]) => [
      host,
      (challengeGate, decision, execution) => {
        const context = execution || createHostExecutionContext(decision);
        return processor({
          challengeGate,
          debugLog,
          automationDecision: decision,
          notifyMainFailure: context.notifyMainFailure,
          reportAddonHealthy: context.reportAddonHealthy,
          ...(host === "datanodes.to"
            ? { settings: decision?.automationSettings || getSettings?.() || {} }
            : {}),
        });
      },
    ]),
  );
}
