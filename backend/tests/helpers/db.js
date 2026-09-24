const mongoose = require('mongoose');
const { connectDB, disconnectDB, getDatabaseName, isLocalMongoUri } = require('../../config/db');

/**
 * Test database helpers.
 * The connection target is resolved by config/env.js (MONGO_URI_TEST when
 * NODE_ENV=test), so tests never run against the development database.
 */

/**
 * Safety guard.
 *
 * The suite deletes every document before each test, so it refuses to start
 * unless the target really is a dedicated test database. Without this check a
 * plain `npm test` (with no MONGO_URI_TEST configured) would clear the seeded
 * development data.
 */
const assertTestDatabase = () => {
  const databaseName = getDatabaseName();
  const configured = process.env.MONGO_URI_TEST || '';
  const looksLikeTestDatabase = /test/i.test(databaseName) || /test/i.test(configured);

  if (!looksLikeTestDatabase) {
    throw new Error(
      [
        `Refusing to run the test suite against database "${databaseName}".`,
        'Every test starts by clearing the collections, so the suite must never point at',
        'development or seeded data. Set a separate database in backend/.env, for example:',
        '  MONGO_URI_TEST=mongodb://127.0.0.1:27017/expense_management_test_db',
      ].join('\n'),
    );
  }
};

const connectTestDb = async () => {
  assertTestDatabase();
  const connection = await connectDB();
  // eslint-disable-next-line no-console
  console.log(
    `[tests] connected to ${getDatabaseName()} (${isLocalMongoUri() ? 'local MongoDB' : 'dev fallback'})`,
  );
  return connection;
};

/** Remove every document from every collection (indexes are preserved). */
const clearDatabase = async () => {
  const { collections } = mongoose.connection;
  const names = Object.keys(collections);
  await Promise.all(names.map((name) => collections[name].deleteMany({})));
};

const disconnectTestDb = async () => {
  await disconnectDB();
};

module.exports = { connectTestDb, clearDatabase, disconnectTestDb };
