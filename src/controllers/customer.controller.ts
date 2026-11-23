import type { Request, Response, NextFunction } from 'express';
import { listCustomers, getCustomerDetail } from '../services/customer.service';
import { HTTP_STATUS } from '../constants/http.constants';
import type { CustomerListQuery } from '../types/customer.types';

export async function getCustomers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = req.query as unknown as CustomerListQuery;
    const result = await listCustomers(query);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getCustomerById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const result = await getCustomerDetail(id);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
