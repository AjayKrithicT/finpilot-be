import { Router } from 'express';
import { postLogin } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { loginSchema } from '../validators/auth.validator';

const router = Router();

router.post('/login', validate(loginSchema, 'body'), postLogin);

export default router;
