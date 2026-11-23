import { z } from 'zod';
import {
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  TRANSACTION_SORT_COLUMN_MAP,
  SORT_DIRECTIONS,
  PAGINATION,
} from '../constants/domain.constants';

// Derive the sort key enum tuple from the allowlist keys so there is no duplication
const SORT_KEYS = Object.keys(TRANSACTION_SORT_COLUMN_MAP) as [
  keyof typeof TRANSACTION_SORT_COLUMN_MAP,
  ...Array<keyof typeof TRANSACTION_SORT_COLUMN_MAP>,
];

export const transactionListQuerySchema = z.object({
  account_id: z.string().optional(),
  instrument_id: z.string().optional(),
  transaction_type: z.enum(TRANSACTION_TYPES).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from_date must be YYYY-MM-DD')
    .optional(),
  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to_date must be YYYY-MM-DD')
    .optional(),
  sort_by: z.enum(SORT_KEYS).optional(),
  sort_dir: z.enum(SORT_DIRECTIONS).optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : PAGINATION.DEFAULT_PAGE))
    .pipe(z.number().int().min(1, 'page must be >= 1')),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : PAGINATION.DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(PAGINATION.MAX_LIMIT, `limit must be <= ${PAGINATION.MAX_LIMIT}`)),
});

export type TransactionListQuerySchema = z.infer<typeof transactionListQuerySchema>;
