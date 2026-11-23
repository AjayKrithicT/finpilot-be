import { Router } from 'express';
import { getCustomers, getCustomerById } from '../controllers/customer.controller';
import { getPortfolio, getPositions } from '../controllers/portfolio.controller';
import { getTransactions } from '../controllers/transaction.controller';
import { getGoals, postGoal } from '../controllers/goal.controller';
import { validate } from '../middleware/validate';
import { customerListQuerySchema, customerIdParamSchema } from '../validators/customer.validator';
import { transactionListQuerySchema } from '../validators/transaction.validator';
import { positionListQuerySchema } from '../validators/portfolio.validator';
import { createGoalSchema } from '../validators/goal.validator';

const router = Router();

// GET /customers
router.get(
  '/',
  validate(customerListQuerySchema, 'query'),
  getCustomers,
);

// GET /customers/:id
router.get(
  '/:id',
  validate(customerIdParamSchema, 'params'),
  getCustomerById,
);

// GET /customers/:id/portfolio
router.get(
  '/:id/portfolio',
  validate(customerIdParamSchema, 'params'),
  getPortfolio,
);

// GET /customers/:id/portfolio/positions
router.get(
  '/:id/portfolio/positions',
  validate(customerIdParamSchema, 'params'),
  validate(positionListQuerySchema, 'query'),
  getPositions,
);

// GET /customers/:id/transactions
router.get(
  '/:id/transactions',
  validate(customerIdParamSchema, 'params'),
  validate(transactionListQuerySchema, 'query'),
  getTransactions,
);

// GET /customers/:id/goals
router.get(
  '/:id/goals',
  validate(customerIdParamSchema, 'params'),
  getGoals,
);

// POST /customers/:id/goals
router.post(
  '/:id/goals',
  validate(customerIdParamSchema, 'params'),
  validate(createGoalSchema, 'body'),
  postGoal,
);

export default router;
