import type { Request, Response, NextFunction } from 'express';
import { getCustomerPortfolio, getPortfolioPositionsPage } from '../services/portfolio.service';
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

export async function getPositions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const query = req.query as {
      page?: number;
      limit?: number;
      search?: string;
      asset_class?: string;
    };
    const result = await getPortfolioPositionsPage(id, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      asset_class: query.asset_class as never,
    });
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
