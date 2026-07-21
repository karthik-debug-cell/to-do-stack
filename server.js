/* ============================================================================
   SERVER.JS — Smart Event-Driven TO-DO Manager
   ----------------------------------------------------------------------------
   Node.js Laboratory Practical Project
   Stack : Node.js built-in HTTP module • MongoDB (official driver) • EventEmitter
   No Express.js • No Mongoose • No external frameworks
   ============================================================================

   Required Node.js concepts demonstrated
   ──────────────────────────────────────
   ✔ http.createServer()        — manual HTTP server & routing
   ✔ EventEmitter               — central event bus (taskEmitter)
   ✔ emit()                     — raise domain events
   ✔ on()                       — persistent listeners
   ✔ once()                     — one-shot listeners
   ✔ setTimeout()               — per-task reminder after 30 s
   ✔ clearTimeout()             — cancel reminder on delete / complete
   ✔ setInterval()              — background overdue-check every 15 s
   ✔ clearInterval()            — clean-up on SIGINT
   ✔ setImmediate()             — post-I/O dashboard refresh
   ✔ clearImmediate()           — cancel deferred work on validation failure
   ✔ Callback functions         — all DB operations follow (err, result) style
   ✔ MongoDB driver             — full CRUD via official mongodb package
============================================================================ */

"use strict";

/* ── Built-in modules ─────────────────────────────────────────────────── */
const http         = require("http");
const fs           = require("fs");
const path         = require("path");
const url          = require("url");
const EventEmitter = require("events");
const { ObjectId } = require("mongodb");

/* ── Application modules ──────────────────────────────────────────────── */
const config = require("./config");
const mongo  = require("./database/mongo");

/* ============================================================================
   1. IN-MEMORY EPHEMERAL STATE
   ----------------------------------------------------------------------------
   Only data that does NOT need to survive a server restart lives in memory:
     • sessions    — token → username map
     • notifications — toast queue polled by the frontend
     • reminderTimers — setTimeout handles (cannot be serialised to DB)
     • stats       — server-lifetime counters
============================================================================ */

const sessions       = {};   // token → username
const notifications  = [];   // pending toast messages for the frontend
const reminderTimers = {};   // taskId(string) → setTimeout handle

let notificationIdCounter = 1;

const stats = {
  serverStartTime: Date.now(),
  visitors:        0,
  loggedUsers:     new Set(),
  tasksCreated:    0,
  tasksUpdated:    0,
  tasksCompleted:  0,
  tasksDeleted:    0,
  remindersSent:   0
};

/* ============================================================================
   2. EVENT EMITTER — CENTRAL NERVOUS SYSTEM
============================================================================ */

const taskEmitter = new EventEmitter();
taskEmitter.setMaxListeners(20);

/* ── Pretty console section printer ── */
function printSection(title, lines = []) {
  console.log("\n========================================");
  console.log(` ${title}`);
  console.log("========================================");
  lines.forEach((l) => console.log("  " + l));
}

/* ── Push toast to the frontend notification queue ── */
function pushNotification(message, type = "info") {
  const note = {
    id:      notificationIdCounter++,
    message,
    type,
    time:    new Date().toLocaleTimeString()
  };
  notifications.push(note);
  if (notifications.length > 100) notifications.shift();
  return note;
}

/* ── Write an entry to the MongoDB ActivityLogs collection ── */
function addActivity(username, event, description, callback) {
  const entry = {
    username:    username || "system",
    event,
    description,
    timestamp:   new Date()
  };
  mongo.activityLogs().insertOne(entry, (err) => {
    if (err) console.error("[ActivityLog] Insert error:", err.message);
    if (callback) callback(err, entry);
  });
}

/* ── Dashboard dirty flag (set after any write, cleared on GET /api/dashboard) ── */
let dashboardDirty = true;

/* ============================================================================
   3. on() LISTENERS — fire EVERY time the related event is emitted
============================================================================ */

taskEmitter.on("login", (username) => {
  printSection("LOGIN SUCCESS", [`User : ${username}`]);
  addActivity(username, "login", `User ${username} logged in`);
  pushNotification(`Welcome back, ${username}!`, "success");
  stats.visitors++;
  stats.loggedUsers.add(username);
});

taskEmitter.on("logout", (username) => {
  printSection("LOGOUT", [`User : ${username}`]);
  addActivity(username, "logout", `User ${username} logged out`);
  pushNotification(`${username} logged out`, "info");
});

taskEmitter.on("register", (username) => {
  printSection("NEW USER REGISTERED", [`User : ${username}`]);
  addActivity(username, "register", `New user ${username} registered`);
  pushNotification(`Welcome ${username}! Your account was created.`, "success");
});

taskEmitter.on("taskCreated", (username, task) => {
  printSection("TASK CREATED", [
    `Title    : ${task.title}`,
    `Priority : ${task.priority}`,
    `User     : ${username}`
  ]);
  addActivity(username, "taskCreated", `Task created: "${task.title}"`);
  pushNotification(`Task added: "${task.title}"`, "success");
  stats.tasksCreated++;
  dashboardDirty = true;
});

taskEmitter.on("taskUpdated", (username, task) => {
  printSection("TASK UPDATED", [`Title : ${task.title}`, `User  : ${username}`]);
  addActivity(username, "taskUpdated", `Task updated: "${task.title}"`);
  pushNotification(`Task updated: "${task.title}"`, "info");
  stats.tasksUpdated++;
  dashboardDirty = true;
});

taskEmitter.on("taskDeleted", (username, task) => {
  printSection("TASK DELETED", [`Title : ${task.title}`, `User  : ${username}`]);
  addActivity(username, "taskDeleted", `Task deleted: "${task.title}"`);
  pushNotification(`Task deleted: "${task.title}"`, "error");
  stats.tasksDeleted++;
  dashboardDirty = true;
});

taskEmitter.on("taskCompleted", (username, task) => {
  printSection("TASK COMPLETED", [`Title : ${task.title}`, `User  : ${username}`]);
  addActivity(username, "taskCompleted", `Task completed: "${task.title}"`);
  pushNotification(`✅ Task completed: "${task.title}"`, "success");
  stats.tasksCompleted++;
  dashboardDirty = true;
});

taskEmitter.on("taskReminder", (task) => {
  printSection("⏰ REMINDER SENT", [`Complete your task: ${task.title}`]);
  addActivity("system", "reminder", `Reminder: "${task.title}" is still pending`);
  pushNotification(`⏰ Reminder: complete "${task.title}"`, "warning");
  stats.remindersSent++;
});

taskEmitter.on("taskOverdue", (task) => {
  printSection("⚠ TASK OVERDUE", [`Overdue : ${task.title}`]);
  addActivity("system", "overdue", `Task overdue: "${task.title}"`);
  pushNotification(`⚠ Task overdue: "${task.title}"`, "error");
  dashboardDirty = true;
});

taskEmitter.on("dashboardUpdated", () => {
  dashboardDirty = true;
});

/* ============================================================================
   4. once() LISTENERS — handler body runs only for the FIRST occurrence
============================================================================ */

taskEmitter.once("firstLogin", (username) => {
  console.log("\n****************************************");
  console.log(` First login since server start: ${username}`);
  console.log("****************************************\n");
  pushNotification("Welcome! First login since the server started.", "success");
});

taskEmitter.once("firstTaskCreated", (task) => {
  console.log("\n****************************************");
  console.log(` First task created: "${task.title}"`);
  console.log("****************************************\n");
  pushNotification(`🎉 Congratulations! First task: "${task.title}"`, "success");
});

/* ============================================================================
   5. CORE APPLICATION LOGIC — ALL USE CALLBACK FUNCTIONS (err, result)
============================================================================ */

/* ── Helper: safely convert a string to a MongoDB ObjectId ── */
function toObjectId(id) {
  try { return new ObjectId(id); }
  catch (_) { return null; }
}

/* ────────────────────────────────── LOGIN ────────────────────────────── */
function loginUser(username, password, callback) {
  mongo.users().findOne({ username, password }, (err, user) => {
    if (err)   return callback(err);
    if (!user) return callback(new Error("Invalid username or password"));

    const token = `${config.TOKEN_PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    sessions[token] = username;

    taskEmitter.emit("login", username);
    taskEmitter.emit("firstLogin", username); // once() — only fires first time

    callback(null, { token, username });
  });
}

/* ────────────────────────────────── REGISTER ─────────────────────────── */
function registerUser(username, password, callback) {
  if (!username || !password || username.trim() === "" || password.trim() === "") {
    return process.nextTick(() => callback(new Error("Username and password are required")));
  }
  if (username.length < 3) {
    return process.nextTick(() => callback(new Error("Username must be at least 3 characters")));
  }
  if (password.length < 4) {
    return process.nextTick(() => callback(new Error("Password must be at least 4 characters")));
  }

  /* Check for duplicate username */
  mongo.users().findOne({ username }, (err, existing) => {
    if (err)      return callback(err);
    if (existing) return callback(new Error("Username already taken"));

    const doc = {
      username:  username.trim(),
      password:  password.trim(),
      createdAt: new Date()
    };

    mongo.users().insertOne(doc, (insertErr, result) => {
      if (insertErr) return callback(insertErr);

      const token = `${config.TOKEN_PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      sessions[token] = username;

      taskEmitter.emit("register", username);

      callback(null, { token, username });
    });
  });
}

/* ────────────────────────────────── LOGOUT ───────────────────────────── */
function logoutUser(token, callback) {
  const username = sessions[token];
  if (!username) return process.nextTick(() => callback(new Error("Not logged in")));
  delete sessions[token];
  taskEmitter.emit("logout", username);
  process.nextTick(() => callback(null, { message: "Logged out successfully" }));
}

/* ────────────────────────────────── ADD TASK ─────────────────────────── */
function addTask(username, taskData, callback) {
  /* Validation — demonstrate setImmediate + clearImmediate on failure */
  if (!taskData || !taskData.title || taskData.title.trim() === "") {
    const failImmediate = setImmediate(() => {
      console.log("[addTask] This deferred work was cancelled.");
    });
    clearImmediate(failImmediate);
    printSection("TASK OPERATION FAILED", [
      "Reason : Title is required",
      "Note   : setImmediate was scheduled then cancelled (clearImmediate)"
    ]);
    return process.nextTick(() => callback(new Error("Task title is required")));
  }

  const doc = {
    userId:      username,
    title:       taskData.title.trim(),
    description: taskData.description || "",
    priority:    taskData.priority    || "Medium",
    dueDate:     taskData.dueDate     ? new Date(taskData.dueDate) : null,
    status:      "Pending",
    createdAt:   new Date(),
    completedAt: null
  };

  mongo.tasks().insertOne(doc, (err, result) => {
    if (err) return callback(err);

    const task = { ...doc, _id: result.insertedId };

    /* ── setTimeout: automatic reminder 30 s after creation ── */
    const timerId = setTimeout(() => {
      /* Re-query the task from DB to get its current status */
      mongo.tasks().findOne({ _id: result.insertedId }, (qErr, latest) => {
        if (latest && latest.status !== "Completed" && latest.status !== "Deleted") {
          taskEmitter.emit("taskReminder", latest);
        }
        delete reminderTimers[result.insertedId.toString()];
      });
    }, config.REMINDER_DELAY_MS);

    reminderTimers[result.insertedId.toString()] = timerId;

    taskEmitter.emit("taskCreated", username, task);
    taskEmitter.emit("firstTaskCreated", task); // once() — only fires first time

    /* ── setImmediate: emit dashboardUpdated after current I/O cycle ── */
    setImmediate(() => {
      taskEmitter.emit("dashboardUpdated");
    });

    callback(null, task);
  });
}

/* ────────────────────────────────── UPDATE TASK ──────────────────────── */
function updateTask(username, id, data, callback) {
  const oid = toObjectId(id);
  if (!oid) {
    const failImmediate = setImmediate(() => {});
    clearImmediate(failImmediate);
    return process.nextTick(() => callback(new Error("Invalid task ID")));
  }

  const $set = {};
  if (data.title       !== undefined) $set.title       = data.title;
  if (data.description !== undefined) $set.description = data.description;
  if (data.priority    !== undefined) $set.priority    = data.priority;
  if (data.dueDate     !== undefined) $set.dueDate     = data.dueDate ? new Date(data.dueDate) : null;
  if (data.status      !== undefined) $set.status      = data.status;

  mongo.tasks().findOneAndUpdate(
    { _id: oid },
    { $set },
    { returnDocument: "after" },
    (err, result) => {
      if (err)    return callback(err);
      if (!result) return callback(new Error("Task not found"));

      const task = result;

      taskEmitter.emit("taskUpdated", username, task);

      setImmediate(() => {
        taskEmitter.emit("dashboardUpdated");
      });

      callback(null, task);
    }
  );
}

/* ────────────────────────────────── DELETE TASK ──────────────────────── */
function deleteTask(username, id, callback) {
  const oid = toObjectId(id);
  if (!oid) {
    const failImmediate = setImmediate(() => {});
    clearImmediate(failImmediate);
    return process.nextTick(() => callback(new Error("Invalid task ID")));
  }

  mongo.tasks().findOneAndDelete({ _id: oid }, (err, result) => {
    if (err)    return callback(err);
    if (!result) return callback(new Error("Task not found"));

    const removed = result;

    /* ── clearTimeout: cancel reminder for deleted task ── */
    const key = oid.toString();
    if (reminderTimers[key]) {
      clearTimeout(reminderTimers[key]);
      delete reminderTimers[key];
      console.log(`  [clearTimeout] Reminder cancelled — task deleted: "${removed.title}"`);
    }

    taskEmitter.emit("taskDeleted", username, removed);

    setImmediate(() => {
      taskEmitter.emit("dashboardUpdated");
    });

    callback(null, removed);
  });
}

/* ────────────────────────────────── COMPLETE TASK ────────────────────── */
function completeTask(username, id, callback) {
  const oid = toObjectId(id);
  if (!oid) return process.nextTick(() => callback(new Error("Invalid task ID")));

  mongo.tasks().findOneAndUpdate(
    { _id: oid },
    { $set: { status: "Completed", completedAt: new Date() } },
    { returnDocument: "after" },
    (err, result) => {
      if (err)    return callback(err);
      if (!result) return callback(new Error("Task not found"));

      const task = result;

      /* ── clearTimeout: task completed before reminder fired ── */
      const key = oid.toString();
      if (reminderTimers[key]) {
        clearTimeout(reminderTimers[key]);
        delete reminderTimers[key];
        console.log(`  [clearTimeout] Reminder cancelled — task completed: "${task.title}"`);
        addActivity(username, "reminderCancelled", `Reminder cancelled: "${task.title}"`);
      }

      taskEmitter.emit("taskCompleted", username, task);

      setImmediate(() => {
        taskEmitter.emit("dashboardUpdated");
      });

      callback(null, task);
    }
  );
}

/* ────────────────────────────────── MARK PENDING ─────────────────────── */
function markPending(username, id, callback) {
  const oid = toObjectId(id);
  if (!oid) return process.nextTick(() => callback(new Error("Invalid task ID")));

  mongo.tasks().findOneAndUpdate(
    { _id: oid },
    { $set: { status: "Pending", completedAt: null } },
    { returnDocument: "after" },
    (err, result) => {
      if (err)    return callback(err);
      if (!result) return callback(new Error("Task not found"));

      taskEmitter.emit("taskUpdated", username, result);

      setImmediate(() => {
        taskEmitter.emit("dashboardUpdated");
      });

      callback(null, result);
    }
  );
}

/* ────────────────────────────────── SEARCH TASKS ─────────────────────── */
function searchTasks(username, keyword, callback) {
  process.nextTick(() => {
    const regex = new RegExp(keyword, "i");
    mongo.tasks()
      .find({
        userId: username,
        $or: [{ title: regex }, { description: regex }]
      })
      .toArray(callback);
  });
}

/* ────────────────────────────────── FILTER TASKS ─────────────────────── */
function filterTasks(username, priority, callback) {
  process.nextTick(() => {
    const filter = { userId: username };
    if (priority && priority !== "All") filter.priority = priority;
    mongo.tasks().find(filter).sort({ createdAt: -1 }).toArray(callback);
  });
}

/* ────────────────────────────────── DASHBOARD STATS ──────────────────── */
function buildDashboardStats(username, callback) {
  /* Run all countDocuments in parallel using a simple counter pattern */
  const result = {};
  let pending = 6;
  let firstErr = null;

  function done(err) {
    if (err && !firstErr) firstErr = err;
    if (--pending === 0) {
      if (firstErr) return callback(firstErr);
      const uptimeSeconds = Math.floor((Date.now() - stats.serverStartTime) / 1000);
      callback(null, {
        totalTasks:    result.total,
        completed:     result.completed,
        pending:       result.pending,
        overdue:       result.overdue,
        highPriority:  result.highPriority,
        inProgress:    result.inProgress,
        productivity:  result.total === 0 ? 0 : Math.round((result.completed / result.total) * 100),
        todayDate:     new Date().toLocaleDateString(),
        currentTime:   new Date().toLocaleTimeString(),
        uptimeSeconds,
        visitors:      stats.visitors,
        loggedUsers:   [...stats.loggedUsers],
        tasksCreated:  stats.tasksCreated,
        tasksUpdated:  stats.tasksUpdated,
        tasksCompleted:stats.tasksCompleted,
        tasksDeleted:  stats.tasksDeleted,
        remindersSent: stats.remindersSent,
        dirty:         dashboardDirty
      });
    }
  }

  mongo.tasks().countDocuments({ userId: username },                                  (e, n) => { result.total       = n || 0; done(e); });
  mongo.tasks().countDocuments({ userId: username, status: "Completed" },             (e, n) => { result.completed  = n || 0; done(e); });
  mongo.tasks().countDocuments({ userId: username, status: "Pending" },               (e, n) => { result.pending    = n || 0; done(e); });
  mongo.tasks().countDocuments({ userId: username, status: "Overdue" },               (e, n) => { result.overdue    = n || 0; done(e); });
  mongo.tasks().countDocuments({ userId: username, priority: "High", status: { $ne: "Completed" } }, (e, n) => { result.highPriority = n || 0; done(e); });
  mongo.tasks().countDocuments({ userId: username, status: "In Progress" },           (e, n) => { result.inProgress = n || 0; done(e); });
}

/* ============================================================================
   6. BACKGROUND MONITORING (setInterval / clearInterval)
============================================================================ */

let monitorInterval = null;
let summaryInterval = null;

function startBackgroundMonitors() {
  /* ── Every 15 s: scan for tasks that have passed their dueDate ── */
  monitorInterval = setInterval(() => {
    console.log("\n[Monitor] Checking for overdue tasks...");
    const now = new Date();

    mongo.tasks()
      .find({ status: { $in: ["Pending", "In Progress"] }, dueDate: { $lt: now, $ne: null } })
      .toArray((err, overdueTasks) => {
        if (err || !overdueTasks || overdueTasks.length === 0) return;

        const ids = overdueTasks.map((t) => t._id);
        mongo.tasks().updateMany(
          { _id: { $in: ids } },
          { $set: { status: "Overdue" } },
          (updateErr) => {
            if (updateErr) return console.error("[Monitor]", updateErr.message);
            overdueTasks.forEach((t) => taskEmitter.emit("taskOverdue", t));
          }
        );
      });
  }, config.OVERDUE_CHECK_INTERVAL_MS);

  /* ── Every 60 s: print a session summary to the console ── */
  summaryInterval = setInterval(() => {
    const uptimeSeconds = Math.floor((Date.now() - stats.serverStartTime) / 1000);
    console.log("\n====================================");
    console.log("  SESSION SUMMARY");
    console.log("====================================");
    console.log(`  Server Uptime      : ${uptimeSeconds}s`);
    console.log(`  Visitors           : ${stats.visitors}`);
    console.log(`  Logged Users       : [${[...stats.loggedUsers].join(", ") || "none"}]`);
    console.log(`  Tasks Created      : ${stats.tasksCreated}`);
    console.log(`  Tasks Updated      : ${stats.tasksUpdated}`);
    console.log(`  Tasks Completed    : ${stats.tasksCompleted}`);
    console.log(`  Tasks Deleted      : ${stats.tasksDeleted}`);
    console.log(`  Reminders Sent     : ${stats.remindersSent}`);
    console.log("====================================\n");
  }, config.SUMMARY_INTERVAL_MS);
}

/* ============================================================================
   7. STATIC FILE SERVING (manual — no Express)
============================================================================ */

const MIME_TYPES = {
  ".html":  "text/html",
  ".css":   "text/css",
  ".js":    "text/javascript",
  ".json":  "application/json",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".gif":   "image/gif",
  ".svg":   "image/svg+xml",
  ".ico":   "image/x-icon",
  ".woff":  "font/woff",
  ".woff2": "font/woff2"
};

function serveStaticFile(filePath, res) {
  const ext         = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 — File not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

/* ============================================================================
   8. API HELPERS
============================================================================ */

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function readRequestBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    if (!body) return callback(null, {});
    try {
      callback(null, JSON.parse(body));
    } catch (_) {
      callback(new Error("Invalid JSON body"));
    }
  });
}

function getAuthUsername(req) {
  const authHeader = req.headers["authorization"] || "";
  const token      = authHeader.replace("Bearer ", "").trim();
  return sessions[token] || null;
}

/* ============================================================================
   9. HTTP SERVER — MANUAL ROUTING  (http.createServer — no Express)
============================================================================ */

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname  = parsedUrl.pathname;
  const query     = parsedUrl.query;
  const method    = req.method;

  /* ──────────────── CORS preflight ──────────────── */
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    return res.end();
  }

  /* ──────────────── STATIC ROUTES ──────────────── */
  if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    return serveStaticFile(path.join(__dirname, "public", "index.html"), res);
  }
  if (method === "GET" && (pathname === "/login" || pathname === "/login.html")) {
    return serveStaticFile(path.join(__dirname, "public", "index.html"), res);
  }
  if (method === "GET" && (pathname === "/dashboard" || pathname === "/dashboard.html")) {
    return serveStaticFile(path.join(__dirname, "public", "dashboard.html"), res);
  }
  if (method === "GET" && pathname.startsWith("/css/")) {
    return serveStaticFile(path.join(__dirname, pathname), res);
  }
  if (method === "GET" && pathname.startsWith("/js/")) {
    return serveStaticFile(path.join(__dirname, pathname), res);
  }
  if (method === "GET" && pathname.startsWith("/images/")) {
    return serveStaticFile(path.join(__dirname, pathname), res);
  }
  if (method === "GET" && pathname.startsWith("/assets/")) {
    return serveStaticFile(path.join(__dirname, pathname), res);
  }

  /* ──────────────── POST /api/login ──────────────── */
  if (method === "POST" && pathname === "/api/login") {
    return readRequestBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { success: false, message: err.message });
      loginUser(body.username, body.password, (error, result) => {
        if (error) return sendJSON(res, 401, { success: false, message: error.message });
        sendJSON(res, 200, { success: true, ...result });
      });
    });
  }

  /* ──────────────── POST /api/register ──────────────── */
  if (method === "POST" && pathname === "/api/register") {
    return readRequestBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { success: false, message: err.message });
      registerUser(body.username, body.password, (error, result) => {
        if (error) return sendJSON(res, 400, { success: false, message: error.message });
        sendJSON(res, 201, { success: true, ...result });
      });
    });
  }

  /* ──────────────── POST /api/logout ──────────────── */
  if (method === "POST" && pathname === "/api/logout") {
    const authHeader = req.headers["authorization"] || "";
    const token      = authHeader.replace("Bearer ", "").trim();
    return logoutUser(token, (error, result) => {
      if (error) return sendJSON(res, 400, { success: false, message: error.message });
      sendJSON(res, 200, { success: true, ...result });
    });
  }

  /* ──────────────── Protected routes (must be logged in) ──────────────── */
  const protectedPrefixes = ["/api/tasks", "/api/dashboard", "/api/activity", "/api/notifications"];
  if (protectedPrefixes.some((p) => pathname.startsWith(p))) {
    const username = getAuthUsername(req);
    if (!username) {
      return sendJSON(res, 401, { success: false, message: "Not authenticated" });
    }

    /* ════════ GET /api/tasks ════════ */
    if (method === "GET" && pathname === "/api/tasks") {
      const { search, priority, status, sort } = query;

      const finish = (err, list) => {
        if (err) return sendJSON(res, 500, { success: false, message: err.message });

        let result = list;

        /* status filter (client-side — already MongoDB-filtered on priority/search) */
        if (status && status !== "All") {
          result = result.filter((t) => t.status === status);
        }

        /* sort */
        const order = { High: 0, Medium: 1, Low: 2 };
        if (sort === "priority") {
          result = [...result].sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));
        } else if (sort === "dueDate") {
          result = [...result].sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
        } else {
          result = [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }

        /* Stringify ObjectId for the frontend */
        const serialised = result.map((t) => ({
          ...t,
          _id:    t._id.toString(),
          userId: t.userId
        }));

        sendJSON(res, 200, { success: true, tasks: serialised });
      };

      if (search) return searchTasks(username, search, finish);
      return filterTasks(username, priority || "All", finish);
    }

    /* ════════ POST /api/tasks ════════ */
    if (method === "POST" && pathname === "/api/tasks") {
      return readRequestBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { success: false, message: err.message });
        addTask(username, body, (error, task) => {
          if (error) return sendJSON(res, 400, { success: false, message: error.message });
          sendJSON(res, 201, { success: true, task: { ...task, _id: task._id.toString() } });
        });
      });
    }

    /* ════════ PUT /api/tasks/:id ════════ */
    const updateMatch = pathname.match(/^\/api\/tasks\/([a-f\d]{24})$/i);
    if (method === "PUT" && updateMatch) {
      const id = updateMatch[1];
      return readRequestBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { success: false, message: err.message });
        updateTask(username, id, body, (error, task) => {
          if (error) return sendJSON(res, 404, { success: false, message: error.message });
          sendJSON(res, 200, { success: true, task: { ...task, _id: task._id.toString() } });
        });
      });
    }

    /* ════════ DELETE /api/tasks/:id ════════ */
    if (method === "DELETE" && updateMatch) {
      const id = updateMatch[1];
      return deleteTask(username, id, (error, task) => {
        if (error) return sendJSON(res, 404, { success: false, message: error.message });
        sendJSON(res, 200, { success: true, task: { ...task, _id: task._id.toString() } });
      });
    }

    /* ════════ POST /api/tasks/:id/complete ════════ */
    const completeMatch = pathname.match(/^\/api\/tasks\/([a-f\d]{24})\/complete$/i);
    if (method === "POST" && completeMatch) {
      return completeTask(username, completeMatch[1], (error, task) => {
        if (error) return sendJSON(res, 404, { success: false, message: error.message });
        sendJSON(res, 200, { success: true, task: { ...task, _id: task._id.toString() } });
      });
    }

    /* ════════ POST /api/tasks/:id/pending ════════ */
    const pendingMatch = pathname.match(/^\/api\/tasks\/([a-f\d]{24})\/pending$/i);
    if (method === "POST" && pendingMatch) {
      return markPending(username, pendingMatch[1], (error, task) => {
        if (error) return sendJSON(res, 404, { success: false, message: error.message });
        sendJSON(res, 200, { success: true, task: { ...task, _id: task._id.toString() } });
      });
    }

    /* ════════ GET /api/dashboard ════════ */
    if (method === "GET" && pathname === "/api/dashboard") {
      dashboardDirty = false;
      return buildDashboardStats(username, (error, statsData) => {
        if (error) return sendJSON(res, 500, { success: false, message: error.message });
        sendJSON(res, 200, { success: true, stats: statsData });
      });
    }

    /* ════════ GET /api/activity ════════ */
    if (method === "GET" && pathname === "/api/activity") {
      return mongo.activityLogs()
        .find({})
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray((err, logs) => {
          if (err) return sendJSON(res, 500, { success: false, message: err.message });
          sendJSON(res, 200, {
            success: true,
            activity: logs.map((a) => ({
              ...a,
              _id:  a._id.toString(),
              time: new Date(a.timestamp).toLocaleTimeString()
            }))
          });
        });
    }

    /* ════════ GET /api/notifications (polling) ════════ */
    if (method === "GET" && pathname === "/api/notifications") {
      const since = Number(query.since) || 0;
      const fresh = notifications.filter((n) => n.id > since);
      return sendJSON(res, 200, { success: true, notifications: fresh });
    }
  }

  /* ──────────────── 404 fallback ──────────────── */
  sendJSON(res, 404, { success: false, message: "Route not found" });
});

/* ============================================================================
   10. SERVER STARTUP — wrapped inside mongo.connect() callback
       Guarantees the DB is ready before any request is accepted.
============================================================================ */

mongo.connect((connectErr) => {
  if (connectErr) {
    console.error("\n❌  MongoDB connection failed:", connectErr.message);
    console.error("    Make sure mongod is running on", config.mongoURI);
    process.exit(1);
  }

  /* Create indexes + seed demo users, then start listening */
  mongo.ensureIndexes((idxErr) => {
    if (idxErr) console.warn("[MongoDB] Index creation warning:", idxErr.message);

    mongo.seedUsers((seedErr) => {
      if (seedErr) console.warn("[MongoDB] Seed warning:", seedErr.message);

      server.listen(config.PORT, () => {
        printSection("SERVER STARTED", [
          `Port      : ${config.PORT}`,
          `URL       : http://localhost:${config.PORT}`,
          `Database  : ${config.mongoURI}`,
          `Time      : ${new Date().toLocaleString()}`,
          "",
          "Demo accounts: karthik / 1234  •  admin / admin"
        ]);

        /* Start background tasks only after server starts and DB is connected */
        startBackgroundMonitors();
      });
    });
  });
});

/* ============================================================================
   11. GRACEFUL SHUTDOWN — clearInterval() demonstration
============================================================================ */

process.on("SIGINT", () => {
  console.log("\n[SIGINT] Stopping background monitoring...");
  clearInterval(monitorInterval);  // stop the 15 s overdue check
  clearInterval(summaryInterval);  // stop the 60 s session summary

  /* Cancel all pending reminder timers */
  Object.keys(reminderTimers).forEach((key) => {
    clearTimeout(reminderTimers[key]);
    delete reminderTimers[key];
  });

  printSection("SERVER STOPPED", ["All intervals cleared. Goodbye! 👋"]);

  mongo.disconnect(() => {
    server.close(() => process.exit(0));
  });
});
