import { z } from 'zod';
import { PAGINATION } from '../constants/domain.constants';

export const rejectionListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : PAGINATION.DEFAULT_PAGE))
    .pipe(z.number().int().min(1, 'page must be >= 1')),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : PAGINATION.DEFAULT_LIMIT))
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(PAGINATION.MAX_LIMIT, `limit must be <= ${PAGINATION.MAX_LIMIT}`),
    ),
});

export type RejectionListQuerySchema = z.infer<typeof rejectionListQuerySchema>;
