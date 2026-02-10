export function getReadableTextColor(hex) {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#181a1d" : "#d9d9d9";
}

export function getAverageHexColor(hexes) {
  let r = 0,
    g = 0,
    b = 0;

  hexes.forEach((hex) => {
    hex = hex.replace("#", "");
    r += parseInt(hex.slice(0, 2), 16);
    g += parseInt(hex.slice(2, 4), 16);
    b += parseInt(hex.slice(4, 6), 16);
  });

  r = Math.round(r / hexes.length);
  g = Math.round(g / hexes.length);
  b = Math.round(b / hexes.length);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
}

export function getTextColorForGradient(gradientStr) {
  const hexes = gradientStr.match(/#([0-9a-f]{6})/gi);
  if (!hexes) return "#ffffff";
  const avg = getAverageHexColor(hexes);
  return getReadableTextColor(avg);
}
