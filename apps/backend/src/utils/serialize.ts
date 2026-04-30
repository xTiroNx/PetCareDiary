export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, current) => {
      if (typeof current === "bigint") return current.toString();
      return current;
    })
  ) as T;
}
