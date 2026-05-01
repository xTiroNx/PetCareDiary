function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTimeInputValue(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeInputValue(date = new Date()) {
  return `${localDateInputValue(date)}T${localTimeInputValue(date)}`;
}

export function mergeLocalDateTime(date: string, time: string) {
  return `${date || localDateInputValue()}T${time || localTimeInputValue()}`;
}

export function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

export function parseDisplayDate(value: string) {
  const parts = value.trim().split(/[./\-\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const [dayRaw, monthRaw, yearRaw] = parts;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function normalizeDateText(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

export function parseDisplayTime(value: string) {
  const parts = value.trim().split(/[:.\-\s]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

export function normalizeTimeText(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
