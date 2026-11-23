import { z } from 'zod';
import { GOAL_TYPES, PRIORITIES } from '../constants/domain.constants';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const createGoalSchema = z.object({
  goal_type: z.enum(GOAL_TYPES, { required_error: 'goal_type is required' }),
  goal_name: z
    .string({ required_error: 'goal_name is required' })
    .min(1, 'goal_name must not be empty'),
  target_amount: z
    .number({ required_error: 'target_amount is required', invalid_type_error: 'target_amount must be a number' })
    .gt(0, 'target_amount must be greater than 0'),
  current_funded_amount: z
    .number({ required_error: 'current_funded_amount is required', invalid_type_error: 'current_funded_amount must be a number' })
    .min(0, 'current_funded_amount must be >= 0'),
  target_date: z
    .string({ required_error: 'target_date is required' })
    .regex(ISO_DATE_REGEX, 'target_date must be YYYY-MM-DD'),
  priority: z.enum(PRIORITIES, { required_error: 'priority is required' }),
});

export const updateGoalSchema = z
  .object({
    goal_type: z.enum(GOAL_TYPES).optional(),
    goal_name: z.string().min(1, 'goal_name must not be empty').optional(),
    target_amount: z
      .number({ invalid_type_error: 'target_amount must be a number' })
      .gt(0, 'target_amount must be greater than 0')
      .optional(),
    current_funded_amount: z
      .number({ invalid_type_error: 'current_funded_amount must be a number' })
      .min(0, 'current_funded_amount must be >= 0')
      .optional(),
    target_date: z
      .string()
      .regex(ISO_DATE_REGEX, 'target_date must be YYYY-MM-DD')
      .optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine(
    (data) => Object.keys(data).some((k) => data[k as keyof typeof data] !== undefined),
    { message: 'At least one field must be provided for update' },
  );

export const goalIdParamSchema = z.object({
  goalId: z.string().min(1, 'goalId is required'),
});

export type CreateGoalSchema = z.infer<typeof createGoalSchema>;
export type UpdateGoalSchema = z.infer<typeof updateGoalSchema>;
export type GoalIdParamSchema = z.infer<typeof goalIdParamSchema>;
