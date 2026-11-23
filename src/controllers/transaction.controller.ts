import type { Request, Response, NextFunction } from 'express';
import { listCustomerTransactions } from '../services/transaction.service';
import { HTTP_STATUS } from '../constants/http.constants';
import type { TransactionListQuery } from '../types/transaction.types';

export async function getTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const query = req.query as unknown as TransactionListQuery;
    const result = await listCustomerTransactions(id, query);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
