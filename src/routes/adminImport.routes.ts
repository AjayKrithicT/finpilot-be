import { Router } from 'express';
import multer from 'multer';
import { postImportTransactions } from '../controllers/adminImport.controller';
import { requireRole } from '../middleware/auth';
import { CSV_IMPORT } from '../constants/domain.constants';

const router = Router();

// Store file in memory so the buffer is available to the service for SHA-256 hashing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_IMPORT.MAX_FILE_SIZE_BYTES },
});

// POST /admin/imports/transactions
// requireRole('ADMIN') is applied here in addition to authenticateJwt on the parent router
router.post(
  '/transactions',
  requireRole('ADMIN'),
  upload.single('file'),
  postImportTransactions,
);

export default router;
