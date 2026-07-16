export const HALLOWEEN_BACKGROUND_CSS = `
  .p-body {
    background-image: url('https://f95zone.to/assets/halloween/web-left.png'),
                      url('https://f95zone.to/assets/halloween/web-right.png');
    background-position: left top, right top;
    background-repeat: no-repeat;
  }
`;

const LOGO_SELECTOR = 'img[src*="/assets/logo.png"], img[srcset*="/assets/logo.png"]';

function replaceLogoPath(value) {
  return String(value || "").replaceAll("/assets/logo.png", "/assets/halloween/logo.png");
}

export function applyHalloweenBackground(styleId) {
  const id = String(styleId || "").trim();
  if (!id) return null;
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    style.dataset.addonOwner = "halloween-theme-addon";
    document.head.appendChild(style);
  }
  style.textContent = HALLOWEEN_BACKGROUND_CSS;
  return style;
}

export function removeHalloweenBackground(styleId) {
  const style = document.getElementById(String(styleId || "").trim());
  if (style?.dataset?.addonOwner === "halloween-theme-addon") style.remove();
}

export function applyHalloweenLogos(restorationRecords) {
  const records = restorationRecords instanceof Map ? restorationRecords : new Map();
  const nodes = document.querySelectorAll(LOGO_SELECTOR);
  for (const image of nodes) {
    if (image?.tagName !== "IMG") continue;
    if (!records.has(image)) {
      records.set(image, {
        hadSrc: image.hasAttribute("src"),
        src: image.getAttribute("src"),
        hadSrcset: image.hasAttribute("srcset"),
        srcset: image.getAttribute("srcset"),
      });
    }
    if (image.hasAttribute("src")) image.setAttribute("src", replaceLogoPath(image.getAttribute("src")));
    if (image.hasAttribute("srcset")) image.setAttribute("srcset", replaceLogoPath(image.getAttribute("srcset")));
  }
  return records;
}

export function restoreHalloweenLogos(restorationRecords) {
  if (!(restorationRecords instanceof Map)) return;
  for (const [image, record] of restorationRecords.entries()) {
    if (record.hadSrc) image.setAttribute("src", record.src || "");
    else image.removeAttribute("src");
    if (record.hadSrcset) image.setAttribute("srcset", record.srcset || "");
    else image.removeAttribute("srcset");
  }
  restorationRecords.clear();
}
