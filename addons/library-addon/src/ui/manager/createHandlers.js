import { createHandlerContext } from "./handlerContext.js";
import { createBulkHandlers } from "./handlers/bulkHandlers.js";
import { createNavigationHandlers } from "./handlers/navigationHandlers.js";
import { createNoteHandlers } from "./handlers/noteHandlers.js";
import { createRatingHandlers } from "./handlers/ratingHandlers.js";
import { createRowHandlers } from "./handlers/rowHandlers.js";
import { createSelectionHandlers } from "./handlers/selectionHandlers.js";
import { createStatusHandlers } from "./handlers/statusHandlers.js";
import { createWorkflowHandlers } from "./handlers/workflowHandlers.js";
import { createUpdateCheckHandlers } from "./handlers/updateCheckHandlers.js";

export function createManagerHandlers(state, api, deps) {
  const context = createHandlerContext(state, api, deps);

  return {
    ...createNavigationHandlers(context),
    ...createRowHandlers(context),
    ...createStatusHandlers(context),
    ...createNoteHandlers(context),
    ...createRatingHandlers(context),
    ...createSelectionHandlers(context),
    ...createBulkHandlers(context),
    ...createUpdateCheckHandlers(context),
    "open-updates": async () => deps.openUpdatesFn(),
    ...createWorkflowHandlers(context),
  };
}
