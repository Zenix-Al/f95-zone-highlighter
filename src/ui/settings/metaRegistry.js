import { colorSettingsMeta } from "./colorSettings";
import { threadSettingsMeta } from "./threadSettings";

export const metaRegistry = {
  color: colorSettingsMeta,
  threadSettings: {
    ...threadSettingsMeta,
  },
};
