import { bindRuntimeCommands } from "../api/bridge.js";

export function createLibraryCommandBinding(core, onCommand) {
  let unbind = () => {};
  return {
    bind() {
      unbind();
      unbind = bindRuntimeCommands(core, onCommand);
    },
    unbind() {
      unbind();
      unbind = () => {};
    },
  };
}
