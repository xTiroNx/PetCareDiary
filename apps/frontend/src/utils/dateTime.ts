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
