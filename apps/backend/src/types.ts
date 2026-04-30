import type { User } from "@prisma/client";

export type TelegramAuthUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type AuthenticatedRequestUser = User;

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
      isAdmin?: boolean;
      telegramInitData?: string;
    }
  }
}
