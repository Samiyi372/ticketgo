const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Formats a "YYYY-MM-DD" date + "HH:mm" time into the ticket's English display
// string, e.g. "Wednesday, 24 June 2026 14:00".
export function formatShowDateTime(dateStr, timeStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const weekday = WEEKDAYS[date.getDay()];
  const month = MONTHS[date.getMonth()];
  const datePart = `${weekday}, ${date.getDate()} ${month} ${date.getFullYear()}`;
  return timeStr ? `${datePart} ${timeStr}` : datePart;
}
