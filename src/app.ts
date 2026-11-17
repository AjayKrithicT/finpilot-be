import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/index';

const app = express();

// ---------------------------------------------------------------------------
// Security & transport middleware
// ---------------------------------------------------------------------------
app.use(
  helmet({
    // Allow swagger-ui to load inline scripts and styles
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------------
// Request correlation & structured logging
// ---------------------------------------------------------------------------
app.use(requestLogger);

// ---------------------------------------------------------------------------
// Swagger UI — served at /api-docs, backed by docs/openapi.yaml
// ---------------------------------------------------------------------------
const openapiPath = join(__dirname, '..', 'docs', 'openapi.yaml');
const openapiDocument = parseYaml(readFileSync(openapiPath, 'utf8')) as Record<string, unknown>;

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

// ---------------------------------------------------------------------------
// Versioned API routes
// ---------------------------------------------------------------------------
app.use('/api/v1', apiRouter);

// ---------------------------------------------------------------------------
// Global error handler (must be last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

export default app;
