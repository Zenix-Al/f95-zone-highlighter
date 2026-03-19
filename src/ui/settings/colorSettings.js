import {
  debouncedProcessAllTilesReset,
  debouncedProcessThreadTags,
} from "../../core/tasksRegistry";
import { updateColorStyle } from "../helpers/updateColorStyle";
import { buildSettingsMap, createColorSetting } from "./metaFactory";

const executeBothQueuedTasks = () => {
  debouncedProcessAllTilesReset();
  debouncedProcessThreadTags();
};

const createColorEffect = (colorName) => () => {
  updateColorStyle(colorName);
  executeBothQueuedTasks();
};

const COLOR_SETTING_DEFS = [
  { key: "completedColor", text: "Completed", colorName: "completed" },
  { key: "onholdColor", text: "On Hold", colorName: "onhold" },
  { key: "abandonedColor", text: "Abandoned", colorName: "abandoned" },
  { key: "highVersionColor", text: "High Version", colorName: "highVersion" },
  { key: "invalidVersionColor", text: "Invalid Version", colorName: "invalidVersion" },
  { key: "tileInfoColor", text: "Tile Info", colorName: "tileInfo" },
  { key: "tileHeaderColor", text: "Tile Header", colorName: "tileHeader" },
  { key: "preferredColor", text: "Preferred", colorName: "preferred", before: "hr" },
  { key: "preferredTextColor", text: "Preferred Text", colorName: "preferredText" },
  { key: "excludedColor", text: "Excluded", colorName: "excluded" },
  { key: "excludedTextColor", text: "Excluded Text", colorName: "excludedText" },
  { key: "markedColor", text: "Marked", colorName: "marked" },
  { key: "markedTextColor", text: "Marked Text", colorName: "markedText" },
];

export const colorSettingsMeta = buildSettingsMap(
  COLOR_SETTING_DEFS.map(({ key, text, colorName, before }) => [
    key,
    createColorSetting({
      text,
      config: `color.${colorName}`,
      before,
      custom: createColorEffect(colorName),
      toast: () => `${text} color updated`,
    }),
  ]),
);

export const colorSettingsDisabledMeta = {
  info: {
    type: "info",
    text: "Color settings are disabled because Overlay is turned off in Overall Settings.",
  },
};
