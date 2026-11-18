import { z } from 'zod';
import { ASSET_CLASSES, PAGINATION } from '../constants/domain.constants';

export const positionListQuerySchema = z.object({
  search: z.string().optional(),
  asset_class: z.enum(ASSET_CLASSES).optional(),
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

export type PositionListQuerySchema = z.infer<typeof positionListQuerySchema>;
