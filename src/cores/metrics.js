import { config } from "../constants";
import { saveConfigKeys } from "../storage/save";

export function recordSuccess(img, duration, updateToast) {
  config.metrics.succeeded++;
  config.metrics.avgCache =
    (config.metrics.avgCache * (config.metrics.succeeded - 1) + duration) /
    config.metrics.succeeded;
  config.metrics.highest = Math.max(config.metrics.highest, duration);
  config.metrics.lowest = Math.min(config.metrics.lowest, duration);
  config.metrics.mean = (config.metrics.highest + config.metrics.lowest) / 2;

  saveConfigKeys({ metrics: config.metrics });
  if (updateToast) updateToast();
}

export function recordFail(updateToast) {
  config.metrics.failed++;
  saveConfigKeys({ metrics: config.metrics });
  if (updateToast) updateToast();
}
