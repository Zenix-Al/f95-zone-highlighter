export const CONFIG_TRANSFER_DIALOG_ID = "latest-config-dialog";
export const CONFIG_TRANSFER_ERROR_ID = "config-transfer-dialog-error";
export const ERROR_TOAST_DURATION = 6000;

import { getExportableConfigKeys } from "../../config/schema.js";

export const EXPORTABLE_CONFIG_KEYS = Object.freeze(getExportableConfigKeys());
