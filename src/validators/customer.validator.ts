import { z } from 'zod';
import {
  KYC_STATUSES,
  CUSTOMER_SEGMENTS,
  PAGINATION,
} from '../constants/domain.constants';

export const customerListQuerySchema = z.object({
  search: z.string().optional(),
  city: z.string().optional(),
  kyc_status: z.enum(KYC_STATUSES).optional(),
  segment: z.enum(CUSTOMER_SEGMENTS).optional(),
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

export const customerIdParamSchema = z.object({
  id: z.string().min(1, 'Customer ID is required'),
});

export type CustomerListQuerySchema = z.infer<typeof customerListQuerySchema>;
export type CustomerIdParamSchema = z.infer<typeof customerIdParamSchema>;
