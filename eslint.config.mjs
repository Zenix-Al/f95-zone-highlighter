import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser, // if you want browser globals too
        GM_getValue: "readonly",
        GM_setValue: "readonly",
        GM_addStyle: "readonly",
        GM_deleteValue: "readonly",
      },
    },
    plugins: {
      js,
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": "warn",
    },
  },
]);
