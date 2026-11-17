import type { Request, Response, NextFunction } from 'express';
import {
  listCustomerGoals,
  createGoal,
  updateGoalById,
} from '../services/goal.service';
import { HTTP_STATUS } from '../constants/http.constants';
import type { CreateGoalDto, UpdateGoalDto } from '../types/goal.types';

export async function getGoals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const result = await listCustomerGoals(id);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}

export async function postGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const dto = req.body as CreateGoalDto;
    const userId = req.user!.userId;
    const result = await createGoal(id, dto, userId);
    res.status(HTTP_STATUS.CREATED).json(result);
  } catch (err) {
    next(err);
  }
}

export async function patchGoal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { goalId } = req.params as { goalId: string };
    const dto = req.body as UpdateGoalDto;
    const userId = req.user!.userId;
    const result = await updateGoalById(goalId, dto, userId);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    next(err);
  }
}
