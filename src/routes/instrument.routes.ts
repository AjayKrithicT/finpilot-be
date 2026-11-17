import { Router } from 'express';
import { getInstruments } from '../controllers/instrument.controller';

const router = Router();

// GET /instruments
router.get('/', getInstruments);

export default router;
