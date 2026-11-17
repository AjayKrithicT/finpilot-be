import type { Request, Response, NextFunction } from 'express';
import { getCustomerPortfolio } from '../services/portfolio.service';
import { HTTP_STATUS } from '../constants/http.constants';

export async function getPortfolio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const result = await getCustomerPortfolio(id);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
