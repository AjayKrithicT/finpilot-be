import { createServer } from 'http';
import app from './app';
import { env } from './config/env';
import pool from './config/db';
import { logger } from './utils/logger';

const server = createServer(app);

server.listen(env.PORT, () => {
  logger.info('Server started', {
    port: env.PORT,
    node_env: env.NODE_ENV,
    swagger: `http://localhost:${env.PORT}/api-docs`,
  });
});

// ---------------------------------------------------------------------------
// Graceful shutdown — drain in-flight requests then close the DB pool
// ---------------------------------------------------------------------------
function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    try {
      await pool.end();
      logger.info('Database pool closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing database pool', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown takes more than 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default server;
