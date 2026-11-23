import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS, HTTP_HEADERS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';
import type { JwtPayload, AuthenticatedUser } from '../types/auth.types';
import type { UserRole } from '../constants/domain.constants';

/**
 * Verifies the HS256 JWT in the `Authorization: Bearer <token>` header and
 * attaches the decoded payload to `req.user`.  Returns 401 on any failure.
 */
export function authenticateJwt(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers[HTTP_HEADERS.AUTHORIZATION.toLowerCase()] as string | undefined;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(
      new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Authentication required'),
    );
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    const user: AuthenticatedUser = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    req.user = user;
    next();
  } catch {
    next(
      new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Invalid or expired token'),
    );
  }
}

/**
 * Factory that returns middleware enforcing a minimum role.
 * Must be used AFTER `authenticateJwt` in the middleware chain.
 */
export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(
        new AppError(
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.UNAUTHORIZED,
          'Authentication required',
        ),
      );
    }

    if (req.user.role !== role) {
      return next(
        new AppError(
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.FORBIDDEN,
          'Insufficient permissions',
        ),
      );
    }

    next();
  };
}
