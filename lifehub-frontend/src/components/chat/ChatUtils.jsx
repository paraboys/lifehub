export function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function initials(name) {
  return String(name || "U").slice(0, 1).toUpperCase();
}
