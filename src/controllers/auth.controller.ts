import type { Request, Response, NextFunction } from 'express';
import { login } from '../services/auth.service';
import { HTTP_STATUS } from '../constants/http.constants';
import type { LoginRequestDto } from '../types/auth.types';

export async function postLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = req.body as LoginRequestDto;
    const result = await login(dto);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
