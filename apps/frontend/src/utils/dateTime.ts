function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTimeInputValue(date = new Date()) {
  return `${localDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
