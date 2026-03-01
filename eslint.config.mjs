import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";
import pkgUnusedImports from "eslint-plugin-unused-imports"; // CommonJS default import

const unusedImports = pkgUnusedImports; // may need .default if ESM resolution

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
  "GM_addValueChangeListener",
  "GM_removeValueChangeListener",
  "GM",
  "grecaptcha",
].reduce((acc, name) => ((acc[name] = "readonly"), acc), {});

export default defineConfig([
  {
    files: ["src/**/*.{js,mjs,cjs,user.js}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...gmGlobals,
        __F95UE_DEBUG__: "readonly",
      },
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { vars: "all", args: "after-used", ignoreRestSiblings: false }],
      "unused-imports/no-unused-vars": "warn",
    },
  },
  {
    files: ["build.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
