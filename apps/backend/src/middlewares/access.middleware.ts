import type { NextFunction, Request, Response } from "express";
import { hasActiveAccess } from "../utils/access.js";
import { HttpError } from "../utils/httpError.js";

export function requireActiveAccess(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "UNAUTHORIZED", "User is not authenticated."));
  if (!hasActiveAccess(req.user)) {
    return next(new HttpError(403, "ACCESS_EXPIRED", "Trial or paid access has expired."));
  }
  next();
}
