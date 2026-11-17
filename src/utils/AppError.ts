import type { HttpStatus } from '../constants/http.constants';
import type { ErrorCode } from '../constants/error.constants';
import type { ValidationIssue } from '../types/common.types';

/**
 * Operational error with an explicit HTTP status code, machine-readable error
 * code, and optional field-level validation details.  Thrown by services and
 * repositories; caught and serialised by errorHandler middleware.
 */
export class AppError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly code: ErrorCode;
  public readonly details?: ValidationIssue[];
  public readonly isOperational = true;

  constructor(
    statusCode: HttpStatus,
    code: ErrorCode,
    message: string,
    details?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Restore prototype chain (required when extending built-ins in TS/ES5 targets)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
