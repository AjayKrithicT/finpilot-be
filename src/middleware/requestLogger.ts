import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { HTTP_HEADERS } from '../constants/http.constants';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers[HTTP_HEADERS.REQUEST_ID.toLowerCase()] as string | undefined)
    ?? randomUUID();

  req.requestId = requestId;
  res.setHeader(HTTP_HEADERS.REQUEST_ID, requestId);

  const startMs = Date.now();

  res.on('finish', () => {
    logger.info('http request', {
      request_id: requestId,
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: Date.now() - startMs,
      user_id: req.user?.userId,
    });
  });

  next();
}
