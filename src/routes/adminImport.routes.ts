import { Router } from 'express';
import multer from 'multer';
import {
  postImportTransactions,
  getTransactionRejections,
} from '../controllers/adminImport.controller';
import { requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { rejectionListQuerySchema } from '../validators/import.validator';
import { CSV_IMPORT } from '../constants/domain.constants';

const router = Router();

// Store file in memory so the buffer is available to the service for SHA-256 hashing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_IMPORT.MAX_FILE_SIZE_BYTES },
});

// POST /admin/imports/transactions
router.post(
  '/transactions',
  requireRole('ADMIN'),
  upload.single('file'),
  postImportTransactions,
);

// GET /admin/imports/transactions/:batchId/rejections
router.get(
  '/transactions/:batchId/rejections',
  requireRole('ADMIN'),
  validate(rejectionListQuerySchema, 'query'),
  getTransactionRejections,
);

export default router;
