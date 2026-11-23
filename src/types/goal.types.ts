import type { GoalType, Priority } from '../constants/domain.constants';

// ----- Database row -----
export interface GoalRow {
  goal_id: string;
  customer_id: string;
  goal_type: GoalType;
  goal_name: string;
  target_amount: string;          // NUMERIC from pg
  current_funded_amount: string;  // NUMERIC from pg
  target_date: Date;
  priority: Priority;
  is_active: boolean;
  created_by: string | null;
  modified_by: string | null;
  created_at: Date;
  modified_at: Date;
}

// ----- Response DTO -----
export interface GoalItemDto {
  goal_id: string;
  customer_id: string;
  goal_type: GoalType;
  goal_name: string;
  target_amount: number;
  current_funded_amount: number;
  target_date: string;
  priority: Priority;
  funded_percentage: number;
  is_overdue: boolean;
  is_overfunded: boolean;
}

// ----- Request DTOs -----
export interface CreateGoalDto {
  goal_type: GoalType;
  goal_name: string;
  target_amount: number;
  current_funded_amount: number;
  target_date: string;    // YYYY-MM-DD
  priority: Priority;
}

export interface UpdateGoalDto {
  goal_type?: GoalType;
  goal_name?: string;
  target_amount?: number;
  current_funded_amount?: number;
  target_date?: string;   // YYYY-MM-DD
  priority?: Priority;
}
