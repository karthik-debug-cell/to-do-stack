/* ============================================================================
   CONFIG.JS — MongoDB Connection Configuration
   Smart Event-Driven TO-DO Manager
   ============================================================================
   Store all application-level configuration here.
   Imported by database/mongo.js and server.js.
============================================================================ */

module.exports = {
  /* MongoDB connection URI — change this to your Atlas URI for cloud hosting */
  mongoURI: "mongodb://localhost:27017/todo_app",

  /* Server port */
  PORT: process.env.PORT || 3000,

  /* Session token prefix */
  TOKEN_PREFIX: "tok_",

  /* Reminder delay after task creation (milliseconds) */
  REMINDER_DELAY_MS: 30000,

  /* Overdue check interval (milliseconds) */
  OVERDUE_CHECK_INTERVAL_MS: 15000,

  /* Session summary interval (milliseconds) */
  SUMMARY_INTERVAL_MS: 60000,

  /* Maximum activity log entries to keep in DB query */
  MAX_ACTIVITY_ENTRIES: 200,

  /* Demo seed accounts (inserted on first run if Users collection is empty) */
  SEED_USERS: [
    { username: "karthik", password: "1234" },
    { username: "admin",   password: "admin" }
  ]
};
