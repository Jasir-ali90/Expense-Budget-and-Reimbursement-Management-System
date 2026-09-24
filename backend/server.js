const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB, getDatabaseName, warnIfNonLocalDatabase } = require('./config/db');
const logger = require('./utils/logger');

/**
 * Local development entry point.
 * Starts the Express API against the configured MongoDB instance.
 *
 *   npm start   -> node server.js
 *   npm run dev -> nodemon server.js
 */
const start = async () => {
  try {
    await connectDB();
    warnIfNonLocalDatabase();

    logger.info(
      `Expense, Budget and Reimbursement API listening on http://localhost:${env.port} (db: ${getDatabaseName()})`,
    );
    logger.info(`Environment: ${env.nodeEnv} | API base: http://localhost:${env.port}/api`);

    const server = app.listen(env.port);

    /** Close the HTTP server and the database connection cleanly. */
    const shutdown = async (signal) => {
      logger.info(`${signal} received - shutting down gracefully`);
      server.close(async () => {
        await disconnectDB().catch(() => {});
        process.exit(0);
      });
    };

    ['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));
    return server;
  } catch (error) {
    logger.error('Unable to start the API server', error);
    process.exit(1);
  }
};

start();
