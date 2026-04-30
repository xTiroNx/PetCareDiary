import { useEffect } from "react";
import { telegramError } from "../utils/telegram";

type RequestErrorProps = {
  error: unknown;
};

export function RequestError({ error }: RequestErrorProps) {
  useEffect(() => {
    if (error) telegramError();
  }, [error]);

  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return <p className="text-sm font-semibold text-coral">{message}</p>;
}
