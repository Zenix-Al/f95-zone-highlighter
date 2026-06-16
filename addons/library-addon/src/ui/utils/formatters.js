export function fmtDate(ts) {
  const value = Number(ts || 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString();
}

export function safeText(value) {
  return String(value || "").trim();
}
