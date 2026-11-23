import type { Request, Response, NextFunction } from 'express';
import {
  importTransactionsCsv,
  getImportRejections,
} from '../services/transactionImport.service';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';

export async function postImportTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_CSV_FORMAT,
        'No file uploaded. Send the CSV as multipart/form-data field "file".',
      );
    }

    const userId = req.user!.userId;
    const result = await importTransactionsCsv(
      req.file.buffer,
      req.file.originalname,
      userId,
    );

    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTransactionRejections(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { batchId } = req.params as { batchId: string };
    const query = req.query as { page?: number; limit?: number };
    const result = await getImportRejections(
      batchId,
      query.page ?? 1,
      query.limit ?? 20,
    );
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
