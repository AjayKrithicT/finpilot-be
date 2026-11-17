import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';
import type { ApiErrorResponse } from '../types/common.types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  // --- AppError (operational) ---
  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        request_id: requestId,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // --- ZodError (from validators used outside the validate() wrapper) ---
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      issue: issue.message,
    }));
    const body: ApiErrorResponse = {
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed',
        details,
        request_id: requestId,
      },
    };
    res.status(HTTP_STATUS.BAD_REQUEST).json(body);
    return;
  }

  // --- MulterError (file upload issues) ---
  if (err instanceof MulterError) {
    const body: ApiErrorResponse = {
      error: {
        code: ERROR_CODES.INVALID_CSV_FORMAT,
        message: err.message,
        request_id: requestId,
      },
    };
    res.status(HTTP_STATUS.BAD_REQUEST).json(body);
    return;
  }

  // --- Unhandled / unknown error ---
  // Log full details internally; never expose stack traces or SQL errors to the client.
  logger.error('Unhandled server error', {
    request_id: requestId,
    method: req.method,
    path: req.path,
    user_id: req.user?.userId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const body: ApiErrorResponse = {
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'An unexpected internal error occurred',
      request_id: requestId,
    },
  };
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(body);
}
