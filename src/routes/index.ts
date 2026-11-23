import { Router } from 'express';
import { authenticateJwt } from '../middleware/auth';
import healthRouter from './health.routes';
import authRouter from './auth.routes';
import customerRouter from './customer.routes';
import goalRouter from './goal.routes';
import instrumentRouter from './instrument.routes';
import adminImportRouter from './adminImport.routes';

const router = Router();

// Unauthenticated routes
router.use('/health', healthRouter);
router.use('/auth', authRouter);

// All routes below require a valid JWT
router.use(authenticateJwt);

router.use('/customers', customerRouter);
router.use('/goals', goalRouter);
router.use('/instruments', instrumentRouter);
router.use('/admin/imports', adminImportRouter);

export default router;
