import type { Request, Response, NextFunction } from 'express';
import { listActiveInstruments } from '../services/instrument.service';
import { HTTP_STATUS } from '../constants/http.constants';

export async function getInstruments(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await listActiveInstruments();
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
