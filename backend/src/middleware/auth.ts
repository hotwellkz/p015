import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  uid: string;
  email?: string;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Временная реализация: принимаем Firebase ID Token и декодируем его БЕЗ проверки подписи.
 * Для продакшена это нужно заменить на проверку через firebase-admin (verifyIdToken).
 */
export function authRequired(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.decode(token) as
      | { user_id?: string; uid?: string; email?: string }
      | null;

    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const uid = decoded.user_id || decoded.uid;
    if (!uid) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    req.user = {
      uid,
      email: decoded.email
    };

    return next();
  } catch (e) {
    console.error("authRequired decode error:", e);
    return res.status(401).json({ error: "Invalid token" });
  }
}


