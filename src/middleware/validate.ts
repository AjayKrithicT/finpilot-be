import type { Request, Response, NextFunction } from 'express';
import { type ZodTypeAny, ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Returns Express middleware that parses and validates a specific part of the
 * request (`body`, `query`, or `params`) against the provided Zod schema.
 * On failure it throws an AppError with VALIDATION_ERROR so errorHandler can
 * serialise field-level details uniformly.
 *
 * We accept `ZodTypeAny` (rather than `ZodSchema<T>`) so that ZodPipeline
 * schemas (used for query-param coercion) are assignable without input-type
 * conflicts.
 */
export function validate(schema: ZodTypeAny, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));
      return next(
        new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
          'Request validation failed',
          details,
        ),
      );
    }

    // Replace the raw request part with the coerced/defaulted Zod output
    (req as unknown as Record<string, unknown>)[part] = result.data;
    next();
  };
}
