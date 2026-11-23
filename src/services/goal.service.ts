import {
  findGoalsByCustomerId,
  findActiveGoalById,
  insertGoal,
  updateGoal,
} from '../repositories/goal.repository';
import { findActiveCustomerById } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';
import type { GoalRow, GoalItemDto, CreateGoalDto, UpdateGoalDto } from '../types/goal.types';

// ---------------------------------------------------------------------------
// Derived fields — computed from persisted values, never stored
// ---------------------------------------------------------------------------

function toIsoDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function computeGoalFlags(row: GoalRow): {
  funded_percentage: number;
  is_overdue: boolean;
  is_overfunded: boolean;
} {
  const targetAmount = Number(row.target_amount);
  const currentFunded = Number(row.current_funded_amount);
  const targetDate = toIsoDate(row.target_date);
  const today = new Date().toISOString().slice(0, 10);

  const funded_percentage =
    targetAmount > 0
      ? Math.round((currentFunded / targetAmount) * 100 * 100) / 100
      : 0;

  const is_overdue = targetDate < today && currentFunded < targetAmount;
  const is_overfunded = currentFunded > targetAmount;

  return { funded_percentage, is_overdue, is_overfunded };
}

function toGoalItemDto(row: GoalRow): GoalItemDto {
  const { funded_percentage, is_overdue, is_overfunded } = computeGoalFlags(row);

  return {
    goal_id: row.goal_id,
    customer_id: row.customer_id,
    goal_type: row.goal_type,
    goal_name: row.goal_name,
    target_amount: Number(row.target_amount),
    current_funded_amount: Number(row.current_funded_amount),
    target_date: toIsoDate(row.target_date),
    priority: row.priority,
    funded_percentage,
    is_overdue,
    is_overfunded,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listCustomerGoals(customerId: string): Promise<GoalItemDto[]> {
  const customer = await findActiveCustomerById(customerId);
  if (!customer) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.CUSTOMER_NOT_FOUND,
      `Customer ${customerId} not found`,
    );
  }

  const rows = await findGoalsByCustomerId(customerId);
  return rows.map(toGoalItemDto);
}

export async function createGoal(
  customerId: string,
  dto: CreateGoalDto,
  userId: string,
): Promise<GoalItemDto> {
  const customer = await findActiveCustomerById(customerId);
  if (!customer) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.CUSTOMER_NOT_FOUND,
      `Customer ${customerId} not found`,
    );
  }

  const row = await insertGoal(customerId, dto, userId);
  return toGoalItemDto(row);
}

export async function updateGoalById(
  goalId: string,
  dto: UpdateGoalDto,
  userId: string,
): Promise<GoalItemDto> {
  const existing = await findActiveGoalById(goalId);
  if (!existing) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.GOAL_NOT_FOUND,
      `Goal ${goalId} not found`,
    );
  }

  const updated = await updateGoal(goalId, dto, userId);
  if (!updated) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.GOAL_NOT_FOUND,
      `Goal ${goalId} not found`,
    );
  }

  return toGoalItemDto(updated);
}
