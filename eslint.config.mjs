import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

const gmGlobals = [
  "GM_getValue",
  "GM_setValue",
  "GM_addStyle",
  "GM_deleteValue",
  "GM_getValues",
  "GM_setValues",
  "GM_registerMenuCommand",
  "GM_notification",
  "GM_openInTab",
  "GM_xmlhttpRequest",
  "GM_download",
  "unsafeWindow",
].reduce((acc, name) => ((acc[name] = "readonly"), acc), {});

export default defineConfig([
  {
    files: ["src/**/*.{js,mjs,cjs,user.js}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...gmGlobals,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
    },
  },
  {
    files: ["build.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
