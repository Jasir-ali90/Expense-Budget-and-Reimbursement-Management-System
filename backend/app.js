const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
const apiRoutes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

/**
 * Builds the Express application.
 *
 * Kept separate from server.js so the app can be imported directly by the
 * automated tests (supertest) without opening a port, and so the middleware
 * order stays in one obvious place:
 *   body parsing -> cors -> logging -> static uploads -> API -> 404 -> errors
 */
const buildApp = () => {
  const app = express();

  app.disable('x-powered-by');
  /**
   * API payloads are per user and change constantly, so conditional GETs are
   * simply wrong here: Express would answer a repeat request with an empty
   * `304 Not Modified` (for example the 60s /notifications/unread-count poll),
   * which reaches the browser/axios as a failed, body-less response and can
   * leave the header badge stale. Never cache and never send an ETag.
   */
  app.disable('etag');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  /**
   * Express 4 leaves `req.body` undefined when a request has no body
   * (or an unparsable content type). Controllers use `req.body.x` freely,
   * so guarantee it is always a plain object.
   */
  app.use((req, _res, next) => {
    if (req.body === undefined || req.body === null || typeof req.body !== 'object') {
      req.body = {};
    }
    next();
  });

  app.use(
    cors({
      origin: env.corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false,
    }),
  );

  // Request logging - silenced during tests to keep the output readable.
  if (!env.isProduction && env.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  /**
   * Uploaded receipts / invoices.
   * Served read-only with `nosniff` so a crafted file can never be executed by
   * the browser, and directory listings are disabled.
   */
  app.use(
    '/uploads',
    express.static(env.uploadPath, {
      index: false,
      dotfiles: 'deny',
      fallthrough: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
      },
    }),
  );

  /**
   * Authenticated API responses must never be cached by a browser or proxy -
   * both the ETag above and this header keep every poll a real 200 answer.
   */
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Every REST endpoint lives under /api
  app.use('/api', apiRoutes);

  // Centralised 404 + error handling (must be registered last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

const app = buildApp();

module.exports = app;
module.exports.buildApp = buildApp;
