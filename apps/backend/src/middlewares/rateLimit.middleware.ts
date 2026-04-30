import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function clientKey(req: Request, prefix: string) {
  const userPart = req.user?.id ?? req.ip ?? "anonymous";
  return `${prefix}:${userPart}`;
}

export function rateLimit({ windowMs, max, keyPrefix }: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = clientKey(req, keyPrefix);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(max - 1));
      return next();
    }

    if (bucket.count >= max) {
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", "0");
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return next(new HttpError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
    }

    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    return next();
  };
}

