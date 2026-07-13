import { config } from "../config";
import { saveConfigKeys } from "./settingsService";

export function recordSuccess(img, duration, updateToast) {
  const metrics = { ...config.metrics };
  metrics.succeeded++;
  metrics.avgCache =
    (metrics.avgCache * (metrics.succeeded - 1) + duration) /
    metrics.succeeded;
  metrics.highest = Math.max(metrics.highest, duration);
  metrics.lowest = metrics.lowest > 0
    ? Math.min(metrics.lowest, duration)
    : duration;
  metrics.mean = (metrics.highest + metrics.lowest) / 2;

  void saveConfigKeys({ metrics });
  if (updateToast) updateToast();
}

export function recordFail(updateToast) {
  const metrics = { ...config.metrics, failed: config.metrics.failed + 1 };
  void saveConfigKeys({ metrics });
  if (updateToast) updateToast();
}
