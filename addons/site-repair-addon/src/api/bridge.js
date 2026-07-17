export {
  waitForCorePing,
  registerAddonRuntime as registerRuntime,
  updateAddonRuntimeStatus as updateRuntimeStatus,
  bindRuntimeCommands,
  notifyTeardownComplete as acknowledgeTeardown,
} from "../../../shared/runtimeKit.js";
