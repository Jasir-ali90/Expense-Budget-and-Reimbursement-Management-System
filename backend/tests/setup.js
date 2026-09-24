/**
 * Jest bootstrap for the backend test suites.
 *
 * - runs with NODE_ENV=test (config/env.js then prefers MONGO_URI_TEST)
 * - opens one database connection for the whole run
 * - empties every collection before each test so suites never interfere
 *
 * IMPORTANT: integration tests therefore always talk to the *test* database
 * declared in backend/.env (or backend/.env.local), never to the dev database.
 */
process.env.NODE_ENV = 'test';

const { connectTestDb, disconnectTestDb, clearDatabase } = require('./helpers/db');

jest.setTimeout(30000);

beforeAll(async () => {
  await connectTestDb();
});

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await disconnectTestDb();
});
