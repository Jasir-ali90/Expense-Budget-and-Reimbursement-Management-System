#!/usr/bin/env node
/**
 * Local database diagnostic tool.
 *
 * Usage:
 *   node scripts/check-db.js                 # checks the configured MONGO_URI
 *   node scripts/check-db.js mongodb://...   # checks an explicit URI
 *
 * Prints connection details, the result of a `ping` command and the document
 * count of every collection used by the application. Handy during handover to
 * confirm that the local MongoDB instance is reachable and seeded.
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const { isLocalMongoUri, getDatabaseName } = require('../config/db');

const MODELS = [
  ['Users', require('../models/User')],
  ['Departments', require('../models/Department')],
  ['Categories', require('../models/Category')],
  ['Budgets', require('../models/Budget')],
  ['Expenses', require('../models/Expense')],
  ['Claims', require('../models/Claim')],
  ['Notifications', require('../models/Notification')],
  ['Audit logs', require('../models/AuditLog')],
  ['Settings', require('../models/Setting')],
];

const maskUri = (uri) => String(uri).replace(/\/\/[^@]*@/, '//***:***@');

const run = async () => {
  const uri = process.argv[2] || env.mongoUri;

  console.log('-------------------------------------------------------------');
  console.log('MongoDB connectivity check');
  console.log('-------------------------------------------------------------');
  console.log(`URI          : ${maskUri(uri)}`);
  console.log(`Database     : ${getDatabaseName(uri)}`);
  console.log(`Local server : ${isLocalMongoUri(uri) ? 'yes' : 'NO (dev fallback in use)'}`);
  console.log('-------------------------------------------------------------');

  try {
    const connection = await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 });
    const ping = await connection.connection.db.admin().command({ ping: 1 });
    console.log(`Connection   : OK (ping: ${ping.ok === 1 ? 'successful' : 'unknown'})`);
    console.log(`Host         : ${connection.connection.host}`);
    console.log('');
    console.log('Collection counts:');
    for (const [label, Model] of MODELS) {
      // eslint-disable-next-line no-await-in-loop
      const count = await Model.countDocuments();
      console.log(`  ${label.padEnd(14)} ${String(count).padStart(6)}`);
    }
    console.log('-------------------------------------------------------------');
    console.log('Database check completed successfully.');
  } catch (error) {
    console.error(`Connection   : FAILED -> ${error.message}`);
    console.error('');
    console.error('Check that MongoDB is running locally (mongod) and that MONGO_URI');
    console.error('in backend/.env (or backend/.env.local) is correct.');
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
};

run();
