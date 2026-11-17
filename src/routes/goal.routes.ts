import { Router } from 'express';
import { patchGoal } from '../controllers/goal.controller';
import { validate } from '../middleware/validate';
import { updateGoalSchema, goalIdParamSchema } from '../validators/goal.validator';

const router = Router();

// PATCH /goals/:goalId
router.patch(
  '/:goalId',
  validate(goalIdParamSchema, 'params'),
  validate(updateGoalSchema, 'body'),
  patchGoal,
);

export default router;
