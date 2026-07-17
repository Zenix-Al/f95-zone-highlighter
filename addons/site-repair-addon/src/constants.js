export const IMAGE_HOST = "https://attachments.f95zone.to/";
export const IMAGE_OBSERVER_ID = "site-repair-image-attachments";
export const IMAGE_STYLE_ID = "site-repair-addon-style";
export const MAX_ATTEMPTS = 10;
export const RETRY_DELAY_MS = 4000;
export const SETTINGS_KEY = "settings";
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  repairs: Object.freeze({
    imageAttachments: Object.freeze({ enabled: true }),
    latestAjax: Object.freeze({ enabled: true }),
  }),
});
