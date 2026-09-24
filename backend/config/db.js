const mongoose = require('mongoose');
const env = require('./env');

/**
 * Connect to the local MongoDB instance.
 * Fails loudly so the developer immediately sees an unreachable database.
 */
const connectDB = async (uri = env.mongoUri) => {
  mongoose.set('strictQuery', true);

  const connection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  if (!env.isProduction) {
    console.log(`[db] Connected to ${connection.connection.host}:${connection.connection.port}/${connection.connection.name}`);
  }

  return connection;
};

const disconnectDB = async () => {
  await mongoose.connection.close();
};

/** Databases the assignment expects: a local MongoDB server only. */
const LOCAL_HOST_PATTERN = /^mongodb:\/\/(?:[^@/]*@)?(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i;

/** True when the URI points at a database running on this machine. */
const isLocalMongoUri = (uri = env.mongoUri) => LOCAL_HOST_PATTERN.test(String(uri || ''));

/** Extract the database name from a connection string for logs / health output. */
const getDatabaseName = (uri = env.mongoUri) => {
  const value = String(uri || '');
  const scheme = value.indexOf('://');
  if (scheme === -1) return '(unknown)';
  const rest = value.slice(scheme + 3);
  const slash = rest.indexOf('/');
  if (slash === -1) return '(default)';
  const name = rest.slice(slash + 1).split('?')[0].trim();
  return name || '(default)';
};

/**
 * The submission must run on a local MongoDB. During development the project
 * may temporarily point at a remote cluster - printing a clear banner makes
 * sure that fallback is never shipped by accident.
 */
const warnIfNonLocalDatabase = (uri = env.mongoUri) => {
  if (isLocalMongoUri(uri)) return false;
  // eslint-disable-next-line no-console
  console.warn(
    [
      '',
      '============================================================',
      ' WARNING: NON-LOCAL MONGODB URI IS IN USE',
      `   host: ${String(uri).replace(/\/\/[^@]*@/, '//***:***@')}`,
      '   This is a temporary development fallback only.',
      '   The graded submission must use local MongoDB:',
      '   MONGO_URI=mongodb://127.0.0.1:27017/expense_management_db',
      '============================================================',
      '',
    ].join('\n'),
  );
  return true;
};

module.exports = {
  connectDB,
  disconnectDB,
  isLocalMongoUri,
  getDatabaseName,
  warnIfNonLocalDatabase,
};
