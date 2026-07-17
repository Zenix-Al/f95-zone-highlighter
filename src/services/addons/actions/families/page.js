import {
  actionPageGetContext,
  validatePageContextPayload,
  validatePageContextResult,
} from "../pageContext.js";
import { defineAction } from "../contract.js";

export const pageActions = Object.freeze([
  defineAction({
    id: "page.getContext", requiredCapabilities: ["page"],
    validatePayload: validatePageContextPayload,
    validateResult: validatePageContextResult,
    ownership: "request-scoped-read-only",
    cleanup: "none; no live references or resources are returned",
    execute: () => actionPageGetContext(),
  }),
]);
