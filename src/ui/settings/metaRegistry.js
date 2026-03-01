import { overlaySettingsMeta } from "./overlaySettings";
import { colorSettingsMeta } from "./colorSettings";
import { latestSettingsMeta } from "./latestSettings";
import { threadSettingsMeta, directDownloadSettingsMeta } from "./threadSettings";

export const metaRegistry = {
  overlaySettings: overlaySettingsMeta,
  color: colorSettingsMeta,
  latestSettings: latestSettingsMeta,
  threadSettings: {
    ...threadSettingsMeta,
    ...directDownloadSettingsMeta,
  },
};
