const path = require('path');
const dotenv = require('dotenv');

// Load backend/.env regardless of the current working directory.
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// A local, git-ignored override file (backend/.env.local) is loaded afterwards
// and wins over .env. It lets a developer point the API at a different
// database for a while without editing the committed .env file.
dotenv.config({
  path: path.join(__dirname, '..', '.env.local'),
  override: true,
  quiet: true,
});

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: toNumber(process.env.PORT, 5000),
  mongoUri:
    process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expense_management_db',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  uploadDir,
  uploadPath: path.isAbsolute(uploadDir)
    ? uploadDir
    : path.join(__dirname, '..', uploadDir),
  maxFileSize: toNumber(process.env.MAX_FILE_SIZE, 5 * 1024 * 1024),
  /** Profile pictures are capped tighter than receipts / invoices. */
  maxAvatarSize: toNumber(process.env.MAX_AVATAR_SIZE, 2 * 1024 * 1024),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  slaDays: toNumber(process.env.SLA_DAYS, 3),
};

// The JWT secret must never silently fall back to a guessable default in
// production. Locally we use a clearly marked development-only value.
if (!env.jwtSecret) {
  if (env.isProduction) {
    throw new Error('JWT_SECRET must be defined when NODE_ENV=production');
  }
  env.jwtSecret = 'local_dev_only_jwt_secret_do_not_reuse_in_production';
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET was not set - using a local development default.');
}

if (!env.mongoUri.startsWith('mongodb://') && !env.mongoUri.startsWith('mongodb+srv://')) {
  throw new Error('MONGO_URI must be a valid MongoDB connection string');
}

/**
 * Automated tests always run against their own database when MONGO_URI_TEST is
 * provided, so `npm test` can never touch development or seeded data.
 */
if (nodeEnv === 'test' && process.env.MONGO_URI_TEST) {
  env.mongoUri = process.env.MONGO_URI_TEST;
}

module.exports = env;
