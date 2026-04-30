import type { NextFunction, Request, Response } from "express";
import { isAdminUser } from "../utils/admin.js";
import { HttpError } from "../utils/httpError.js";

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !isAdminUser(req.user)) {
    return next(new HttpError(403, "ADMIN_REQUIRED", "Admin access is required."));
  }

  req.isAdmin = true;
  return next();
}
