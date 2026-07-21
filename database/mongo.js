/* ============================================================================
   DATABASE/MONGO.JS — Reusable MongoDB Singleton Connection
   Smart Event-Driven TO-DO Manager
   ============================================================================
   Provides a single shared MongoClient instance across the entire application.

   Usage:
     const mongo = require('./database/mongo');
     mongo.connect((err) => {
       if (err) throw err;
       const db = mongo.getDb();          // raw Db instance
       const tasks = mongo.tasks();       // tasks collection
       const users = mongo.users();       // users collection
       const logs  = mongo.activityLogs(); // activityLogs collection
     });

   All exports use callback-style (err, result) patterns — no Promises,
   no Mongoose, no external ORM.
============================================================================ */

"use strict";

const { MongoClient } = require("mongodb");
const config          = require("../config");

/* ── Private module-level state ─────────────────────────────────────────── */
let _client = null;   // the one shared MongoClient
let _db     = null;   // the one shared Db handle

/* ============================================================================
   connect(callback)
   Opens the connection the first time; subsequent calls are no-ops.
   callback signature: (err) => void
============================================================================ */
function connect(callback) {
  /* Already connected — call back immediately */
  if (_client && _db) {
    return setImmediate(() => callback(null));
  }

  const client = new MongoClient(config.mongoURI);

  client.connect((err) => {
    if (err) {
      console.error("[MongoDB] Connection failed:", err.message);
      return callback(err);
    }

    _client = client;
    _db     = client.db(); // database name is embedded in the URI

    console.log("[MongoDB] Connected to:", config.mongoURI);

    /* ── Graceful shutdown ── */
    process.on("SIGINT",  () => _client.close(() => process.exit(0)));
    process.on("SIGTERM", () => _client.close(() => process.exit(0)));

    callback(null);
  });
}

/* ============================================================================
   disconnect(callback)
   Cleanly closes the client. Mainly used in tests / graceful shutdown hooks.
   callback signature: (err) => void
============================================================================ */
function disconnect(callback) {
  if (!_client) return setImmediate(() => callback(null));
  _client.close((err) => {
    _client = null;
    _db     = null;
    callback(err || null);
  });
}

/* ============================================================================
   getDb()
   Returns the raw Db instance (for ad-hoc queries not covered below).
   Throws if connect() has not been called yet.
============================================================================ */
function getDb() {
  if (!_db) throw new Error("[MongoDB] Not connected. Call connect() first.");
  return _db;
}

/* ============================================================================
   Collection helpers
   Centralise collection names so a typo only needs fixing in one place.
============================================================================ */
function users()        { return getDb().collection("Users"); }
function tasks()        { return getDb().collection("Tasks"); }
function activityLogs() { return getDb().collection("ActivityLogs"); }

/* ============================================================================
   seedUsers(callback)
   Inserts the demo accounts from config.SEED_USERS if the Users collection
   is empty. Called once from server.js after connecting.
   callback signature: (err) => void
============================================================================ */
function seedUsers(callback) {
  users().countDocuments({}, (err, count) => {
    if (err)    return callback(err);
    if (count > 0) return callback(null); // already seeded

    const docs = config.SEED_USERS.map((u) => ({
      username:  u.username,
      password:  u.password,
      createdAt: new Date()
    }));

    users().insertMany(docs, (insertErr) => {
      if (insertErr) return callback(insertErr);
      console.log(`[MongoDB] Seeded ${docs.length} demo user(s).`);
      callback(null);
    });
  });
}

/* ============================================================================
   ensureIndexes(callback)
   Creates indexes the first time the server starts.
   Idempotent — safe to call on every restart.
   callback signature: (err) => void
============================================================================ */
function ensureIndexes(callback) {
  let pending = 3;
  let firstErr = null;

  function done(err) {
    if (err && !firstErr) firstErr = err;
    if (--pending === 0) callback(firstErr);
  }

  /* Users — unique username */
  users().createIndex({ username: 1 }, { unique: true }, done);

  /* Tasks — query by userId and status frequently */
  tasks().createIndex({ userId: 1, status: 1 }, done);

  /* ActivityLogs — query by username, sort by timestamp */
  activityLogs().createIndex({ username: 1, timestamp: -1 }, done);
}

/* ── Public API ─────────────────────────────────────────────────────────── */
module.exports = {
  connect,
  disconnect,
  getDb,
  users,
  tasks,
  activityLogs,
  seedUsers,
  ensureIndexes
};
