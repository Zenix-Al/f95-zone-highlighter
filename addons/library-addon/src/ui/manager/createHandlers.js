import { createHandlerContext } from "./handlerContext.js";
import { createBulkHandlers } from "./handlers/bulkHandlers.js";
import { createNavigationHandlers } from "./handlers/navigationHandlers.js";
import { createNoteHandlers } from "./handlers/noteHandlers.js";
import { createRowHandlers } from "./handlers/rowHandlers.js";
import { createSelectionHandlers } from "./handlers/selectionHandlers.js";
import { createStatusHandlers } from "./handlers/statusHandlers.js";
import { createWorkflowHandlers } from "./handlers/workflowHandlers.js";

export function createManagerHandlers(state, api, deps) {
  const context = createHandlerContext(state, api, deps);

  return {
    ...createNavigationHandlers(context),
    ...createRowHandlers(context),
    ...createStatusHandlers(context),
    ...createNoteHandlers(context),
    ...createSelectionHandlers(context),
    ...createBulkHandlers(context),
    ...createWorkflowHandlers(context),
  };
}
