import type { Request, Response, NextFunction } from 'express';
import { checkDbHealth } from '../config/db';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';

export async function getHealth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await checkDbHealth();
    res.status(HTTP_STATUS.OK).json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
    });
  } catch {
    next(
      new AppError(
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Database connection failed',
      ),
    );
  }
}
