/* ============================================================================
   SMART EVENT-DRIVEN TO-DO MANAGER
   ----------------------------------------------------------------------------
   Node.js Laboratory Practical Project
   Uses ONLY Node.js built-in modules: http, url, fs, path, events, querystring
   NO Express.js / NO Database / NO external frameworks
============================================================================ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const EventEmitter = require("events");

/* ============================================================================
   1. IN-MEMORY DATA STORE (no database is allowed in this project)
============================================================================ */

// Predefined users for login
const users = [
  { username: "karthik", password: "1234" },
  { username: "admin", password: "admin" }
];

// All tasks are stored here (array of objects)
const tasks = [];

// Every activity (login, task created, reminder etc.) is logged here
const activityLogs = [];

// Toast notifications waiting to be picked up by the frontend (polling)
const notifications = [];

// token -> username   (very small in-memory "session" store, session only)
const sessions = {};

// taskId -> setTimeout handle for that task's reminder.
// Kept OUTSIDE the task object itself so tasks stay plain, JSON-serializable
// objects (a Timeout handle contains circular references and cannot be
// sent to the browser as JSON).
const reminderTimers = {};

// Running id counters
let taskIdCounter = 1;
let activityIdCounter = 1;
let notificationIdCounter = 1;

// Session / lab statistics (used in the Session Summary printed every 60s)
const stats = {
  serverStartTime: Date.now(),
  visitors: 0,
  loggedUsers: new Set(),
  tasksCreated: 0,
  tasksUpdated: 0,
  tasksCompleted: 0,
  tasksDeleted: 0,
  remindersSent: 0
};

/* ============================================================================
   2. EVENTEMITTER SETUP
   ----------------------------------------------------------------------------
   taskEmitter is the central nervous system of the whole application.
   Every important thing that happens in the app is emit()-ed here, and a
   single set of on() listeners react to it (log to console, store activity,
   push a toast notification, and mark the dashboard as "dirty").
============================================================================ */

const taskEmitter = new EventEmitter();

/* ---------- small helper: pretty console section printer ---------- */
function printSection(title, lines = []) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================");
  lines.forEach((l) => console.log(l));
}

/* ---------- helper: store an activity log entry ---------- */
function addActivity(message, type = "info") {
  const entry = {
    id: activityIdCounter++,
    time: new Date().toLocaleTimeString(),
    message,
    type
  };
  activityLogs.push(entry);
  if (activityLogs.length > 200) activityLogs.shift(); // keep memory bounded
  return entry;
}

/* ---------- helper: push a toast notification for the frontend ---------- */
function pushNotification(message, type = "info") {
  const note = {
    id: notificationIdCounter++,
    message,
    type,
    time: new Date().toLocaleTimeString()
  };
  notifications.push(note);
  if (notifications.length > 100) notifications.shift();
  return note;
}

/* dashboard "dirty" flag - flipped true whenever data changes so the
   frontend polling /api/dashboard always gets a fresh snapshot */
let dashboardDirty = true;

/* ============================================================================
   3. on() LISTENERS  -  fire EVERY time the related event is emitted
============================================================================ */

// ---- LOGIN ----
taskEmitter.on("login", (username) => {
  printSection("LOGIN SUCCESS", [`User : ${username}`]);
  addActivity(`Login - ${username}`, "login");
  pushNotification(`Welcome back, ${username}!`, "success");
});

// ---- LOGOUT ----
taskEmitter.on("logout", (username) => {
  printSection("LOGOUT", [`User : ${username}`]);
  addActivity(`Logout - ${username}`, "logout");
  pushNotification(`${username} logged out`, "info");
});

// ---- TASK CREATED ----
taskEmitter.on("taskCreated", (task) => {
  printSection("TASK CREATED", [`Title : ${task.title}`, `Priority : ${task.priority}`]);
  addActivity(`Task Created - "${task.title}"`, "created");
  pushNotification(`Task added: "${task.title}"`, "success");
  stats.tasksCreated++;
});

// ---- TASK UPDATED ----
taskEmitter.on("taskUpdated", (task) => {
  printSection("TASK UPDATED", [`Title : ${task.title}`]);
  addActivity(`Task Updated - "${task.title}"`, "updated");
  pushNotification(`Task updated: "${task.title}"`, "info");
  stats.tasksUpdated++;
});

// ---- TASK DELETED ----
taskEmitter.on("taskDeleted", (task) => {
  printSection("TASK DELETED", [`Title : ${task.title}`]);
  addActivity(`Task Deleted - "${task.title}"`, "deleted");
  pushNotification(`Task deleted: "${task.title}"`, "error");
  stats.tasksDeleted++;
});

// ---- TASK COMPLETED ----
taskEmitter.on("taskCompleted", (task) => {
  printSection("TASK COMPLETED", [`Title : ${task.title}`]);
  addActivity(`Task Completed - "${task.title}"`, "completed");
  pushNotification(`Task completed: "${task.title}"`, "success");
  stats.tasksCompleted++;
});

// ---- TASK REMINDER (fired by setTimeout, 30s after creation) ----
taskEmitter.on("taskReminder", (task) => {
  printSection("REMINDER SENT", [`Complete your task`, `${task.title}`]);
  addActivity(`Reminder Sent - "${task.title}"`, "reminder");
  pushNotification(`Reminder: complete "${task.title}"`, "warning");
  stats.remindersSent++;
});

// ---- TASK OVERDUE (fired by setInterval monitor every 15s) ----
taskEmitter.on("taskOverdue", (task) => {
  printSection("CHECKING OVERDUE TASKS", [`Overdue : ${task.title}`]);
  addActivity(`Task Overdue - "${task.title}"`, "overdue");
  pushNotification(`Task overdue: "${task.title}"`, "error");
});

// ---- DASHBOARD UPDATED (fired via setImmediate after any task change) ----
taskEmitter.on("dashboardUpdated", () => {
  dashboardDirty = true;
});

/* ============================================================================
   4. once() LISTENERS
   ----------------------------------------------------------------------------
   These events are emitted EVERY time login/task-creation happens, but
   because they are registered with once(), the handler body below will only
   ever run for the very first occurrence after the server starts.
============================================================================ */

taskEmitter.once("firstLogin", (username) => {
  console.log("\n****************************************");
  console.log(" Welcome!");
  console.log(` This is the first login after server start (${username}).`);
  console.log("****************************************\n");
  pushNotification("Welcome! This is the first login since the server started.", "success");
});

taskEmitter.once("firstTaskCreated", (task) => {
  console.log("\n****************************************");
  console.log(" Congratulations!");
  console.log(` First Task Created: "${task.title}"`);
  console.log("****************************************\n");
  pushNotification("Congratulations! You created your first task.", "success");
});

/* ============================================================================
   5. CORE APPLICATION LOGIC  -  ALL USE CALLBACK FUNCTIONS  callback(err, result)
============================================================================ */

// ---------------- LOGIN ----------------
function loginUser(username, password, callback) {
  // simulate async work with process.nextTick (still a callback pattern)
  process.nextTick(() => {
    const user = users.find((u) => u.username === username && u.password === password);
    if (!user) {
      return callback(new Error("Invalid username or password"));
    }
    const token = `tok_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    sessions[token] = username;
    stats.visitors++;
    stats.loggedUsers.add(username);

    taskEmitter.emit("login", username);   // regular listener -> runs every time
    taskEmitter.emit("firstLogin", username); // once listener -> runs only the first time ever

    callback(null, { token, username });
  });
}

// ---------------- LOGOUT ----------------
function logoutUser(token, callback) {
  process.nextTick(() => {
    const username = sessions[token];
    if (!username) return callback(new Error("Not logged in"));
    delete sessions[token];
    taskEmitter.emit("logout", username);
    callback(null, { message: "Logged out successfully" });
  });
}

// ---------------- ADD TASK ----------------
function addTask(taskData, callback) {
  // Basic validation - if it fails we demonstrate setImmediate + clearImmediate
  if (!taskData || !taskData.title || taskData.title.trim() === "") {
    const failImmediate = setImmediate(() => {
      console.log("This will never print - immediate was cancelled");
    });
    clearImmediate(failImmediate); // cancel the scheduled immediate
    printSection("TASK OPERATION FAILED", ["Reason : Title is required", "Immediate execution cancelled (clearImmediate)"]);
    return callback(new Error("Task title is required"));
  }

  const task = {
    id: taskIdCounter++,
    title: taskData.title.trim(),
    description: taskData.description || "",
    priority: taskData.priority || "Medium",
    dueDate: taskData.dueDate || null,
    status: "Pending",
    createdTime: new Date().toISOString(),
    completedTime: null
  };

  tasks.push(task);

  // ---- setTimeout(): schedule an automatic reminder 30 seconds from now ----
  // The timer handle is stored in reminderTimers (NOT on the task object)
  // so the task remains plain and JSON-serializable.
  reminderTimers[task.id] = setTimeout(() => {
    const stillExists = tasks.find((t) => t.id === task.id);
    if (stillExists && stillExists.status !== "Completed") {
      taskEmitter.emit("taskReminder", stillExists);
    }
    delete reminderTimers[task.id];
  }, 30000);

  taskEmitter.emit("taskCreated", task);       // fires every time
  taskEmitter.emit("firstTaskCreated", task);  // fires (handled) only the first time

  // ---- setImmediate(): refresh dashboard + write activity log right after I/O ----
  setImmediate(() => {
    taskEmitter.emit("dashboardUpdated");
  });

  callback(null, task);
}

// ---------------- UPDATE TASK ----------------
function updateTask(id, data, callback) {
  const task = tasks.find((t) => t.id === Number(id));
  if (!task) {
    const failImmediate = setImmediate(() => {});
    clearImmediate(failImmediate);
    return callback(new Error("Task not found"));
  }

  if (data.title !== undefined) task.title = data.title;
  if (data.description !== undefined) task.description = data.description;
  if (data.priority !== undefined) task.priority = data.priority;
  if (data.dueDate !== undefined) task.dueDate = data.dueDate;
  if (data.status !== undefined) task.status = data.status;

  taskEmitter.emit("taskUpdated", task);

  setImmediate(() => {
    taskEmitter.emit("dashboardUpdated");
  });

  callback(null, task);
}

// ---------------- DELETE TASK ----------------
function deleteTask(id, callback) {
  const index = tasks.findIndex((t) => t.id === Number(id));
  if (index === -1) {
    const failImmediate = setImmediate(() => {});
    clearImmediate(failImmediate);
    return callback(new Error("Task not found"));
  }
  const [removed] = tasks.splice(index, 1);

  // ---- clearTimeout(): cancel any pending reminder for the deleted task ----
  if (reminderTimers[removed.id]) {
    clearTimeout(reminderTimers[removed.id]);
    delete reminderTimers[removed.id];
    console.log("Reminder Cancelled (task deleted)");
  }

  taskEmitter.emit("taskDeleted", removed);

  setImmediate(() => {
    taskEmitter.emit("dashboardUpdated");
  });

  callback(null, removed);
}

// ---------------- COMPLETE TASK ----------------
function completeTask(id, callback) {
  const task = tasks.find((t) => t.id === Number(id));
  if (!task) {
    return callback(new Error("Task not found"));
  }
  task.status = "Completed";
  task.completedTime = new Date().toISOString();

  // ---- clearTimeout(): task completed before the reminder fired ----
  if (reminderTimers[task.id]) {
    clearTimeout(reminderTimers[task.id]);
    delete reminderTimers[task.id];
    console.log("Reminder Cancelled");
    addActivity(`Reminder Cancelled - "${task.title}"`, "info");
  }

  taskEmitter.emit("taskCompleted", task);

  setImmediate(() => {
    taskEmitter.emit("dashboardUpdated");
  });

  callback(null, task);
}

// ---------------- MARK PENDING ----------------
function markPending(id, callback) {
  const task = tasks.find((t) => t.id === Number(id));
  if (!task) return callback(new Error("Task not found"));
  task.status = "Pending";
  task.completedTime = null;
  taskEmitter.emit("taskUpdated", task);
  setImmediate(() => taskEmitter.emit("dashboardUpdated"));
  callback(null, task);
}

// ---------------- SEARCH TASK ----------------
function searchTask(keyword, callback) {
  process.nextTick(() => {
    const k = (keyword || "").toLowerCase();
    const results = tasks.filter(
      (t) => t.title.toLowerCase().includes(k) || t.description.toLowerCase().includes(k)
    );
    callback(null, results);
  });
}

// ---------------- FILTER TASK ----------------
function filterTask(priority, callback) {
  process.nextTick(() => {
    if (!priority || priority === "All") return callback(null, tasks);
    const results = tasks.filter((t) => t.priority === priority);
    callback(null, results);
  });
}

/* ============================================================================
   6. TIMER-BASED BACKGROUND MONITORING
============================================================================ */

// ---- setInterval(): every 15 seconds check pending / overdue tasks ----
const monitorInterval = setInterval(() => {
  console.log("Checking Tasks...");
  const now = new Date();
  tasks.forEach((t) => {
    if (t.status !== "Completed" && t.status !== "Overdue" && t.dueDate) {
      if (new Date(t.dueDate) < now) {
        t.status = "Overdue";
        taskEmitter.emit("taskOverdue", t);
      }
    }
  });
}, 15000);

// ---- setInterval(): every 60 seconds print a full session summary ----
const summaryInterval = setInterval(() => {
  printSessionSummary();
}, 60000);

function printSessionSummary() {
  const uptimeSeconds = Math.floor((Date.now() - stats.serverStartTime) / 1000);
  const pending = tasks.filter((t) => t.status === "Pending").length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  const overdue = tasks.filter((t) => t.status === "Overdue").length;

  console.log("\n====================================");
  console.log("SESSION SUMMARY");
  console.log("====================================");
  console.log(`Server Uptime     : ${uptimeSeconds}s`);
  console.log(`Visitors          : ${stats.visitors}`);
  console.log(`Logged Users      : ${[...stats.loggedUsers].join(", ") || "none"}`);
  console.log(`Tasks Created     : ${stats.tasksCreated}`);
  console.log(`Tasks Updated     : ${stats.tasksUpdated}`);
  console.log(`Tasks Completed   : ${stats.tasksCompleted}`);
  console.log(`Tasks Deleted     : ${stats.tasksDeleted}`);
  console.log(`Pending Tasks     : ${pending}`);
  console.log(`Completed Tasks   : ${completed}`);
  console.log(`Overdue Tasks     : ${overdue}`);
  console.log(`Reminders Sent    : ${stats.remindersSent}`);
  console.log("====================================\n");
}

/* ============================================================================
   7. STATIC FILE SERVING (manual - no Express)
============================================================================ */

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 - File Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

/* ============================================================================
   8. HELPERS FOR THE API LAYER
============================================================================ */

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(body);
}

function readRequestBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (!body) return callback(null, {});
    try {
      const parsed = JSON.parse(body);
      callback(null, parsed);
    } catch (err) {
      callback(new Error("Invalid JSON body"));
    }
  });
}

function getAuthUsername(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "").trim();
  return sessions[token] || null;
}

function buildDashboardStats() {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  const pending = tasks.filter((t) => t.status === "Pending").length;
  const overdue = tasks.filter((t) => t.status === "Overdue").length;
  const highPriority = tasks.filter((t) => t.priority === "High" && t.status !== "Completed").length;
  const uptimeSeconds = Math.floor((Date.now() - stats.serverStartTime) / 1000);
  const now = new Date();

  return {
    totalTasks: total,
    completed,
    pending,
    overdue,
    highPriority,
    productivity: total === 0 ? 0 : Math.round((completed / total) * 100),
    todayDate: now.toLocaleDateString(),
    currentTime: now.toLocaleTimeString(),
    uptimeSeconds,
    visitors: stats.visitors,
    loggedUsers: [...stats.loggedUsers],
    tasksCreated: stats.tasksCreated,
    tasksUpdated: stats.tasksUpdated,
    tasksCompleted: stats.tasksCompleted,
    tasksDeleted: stats.tasksDeleted,
    remindersSent: stats.remindersSent,
    dirty: dashboardDirty
  };
}

/* ============================================================================
   9. HTTP SERVER + MANUAL ROUTING
============================================================================ */

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;
  const method = req.method;

  /* ---------------- STATIC ROUTES ---------------- */
  if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    return serveStaticFile(path.join(__dirname, "public", "index.html"), res);
  }
  if (method === "GET" && pathname === "/dashboard.html") {
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

  /* ---------------- API: LOGIN ---------------- */
  if (method === "POST" && pathname === "/api/login") {
    return readRequestBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { success: false, message: err.message });
      loginUser(body.username, body.password, (error, result) => {
        if (error) return sendJSON(res, 401, { success: false, message: error.message });
        sendJSON(res, 200, { success: true, ...result });
      });
    });
  }

  /* ---------------- API: LOGOUT ---------------- */
  if (method === "POST" && pathname === "/api/logout") {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "").trim();
    return logoutUser(token, (error, result) => {
      if (error) return sendJSON(res, 400, { success: false, message: error.message });
      sendJSON(res, 200, { success: true, ...result });
    });
  }

  /* ---------------- Everything below requires login ---------------- */
  const protectedApiPrefixes = ["/api/tasks", "/api/dashboard", "/api/activity", "/api/notifications"];
  if (protectedApiPrefixes.some((p) => pathname.startsWith(p))) {
    const username = getAuthUsername(req);
    if (!username) {
      return sendJSON(res, 401, { success: false, message: "Not authenticated" });
    }
  }

  /* ---------------- API: GET TASKS (list / search / filter / sort) ---------------- */
  if (method === "GET" && pathname === "/api/tasks") {
    const { search, priority, status, sort } = query;

    const finish = (list) => {
      let result = list;
      if (status && status !== "All") {
        result = result.filter((t) => t.status === status);
      }
      if (sort === "priority") {
        const order = { High: 0, Medium: 1, Low: 2 };
        result = [...result].sort((a, b) => order[a.priority] - order[b.priority]);
      } else if (sort === "dueDate") {
        result = [...result].sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
      } else if (sort === "newest") {
        result = [...result].sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      }
      sendJSON(res, 200, { success: true, tasks: result });
    };

    if (search) {
      return searchTask(search, (err, results) => finish(results));
    }
    if (priority) {
      return filterTask(priority, (err, results) => finish(results));
    }
    return finish(tasks);
  }

  /* ---------------- API: ADD TASK ---------------- */
  if (method === "POST" && pathname === "/api/tasks") {
    return readRequestBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { success: false, message: err.message });
      addTask(body, (error, task) => {
        if (error) return sendJSON(res, 400, { success: false, message: error.message });
        sendJSON(res, 201, { success: true, task });
      });
    });
  }

  /* ---------------- API: UPDATE TASK  (PUT /api/tasks/:id) ---------------- */
  const updateMatch = pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (method === "PUT" && updateMatch) {
    const id = updateMatch[1];
    return readRequestBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { success: false, message: err.message });
      updateTask(id, body, (error, task) => {
        if (error) return sendJSON(res, 404, { success: false, message: error.message });
        sendJSON(res, 200, { success: true, task });
      });
    });
  }

  /* ---------------- API: DELETE TASK ---------------- */
  if (method === "DELETE" && updateMatch) {
    const id = updateMatch[1];
    return deleteTask(id, (error, task) => {
      if (error) return sendJSON(res, 404, { success: false, message: error.message });
      sendJSON(res, 200, { success: true, task });
    });
  }

  /* ---------------- API: COMPLETE TASK ---------------- */
  const completeMatch = pathname.match(/^\/api\/tasks\/(\d+)\/complete$/);
  if (method === "POST" && completeMatch) {
    return completeTask(completeMatch[1], (error, task) => {
      if (error) return sendJSON(res, 404, { success: false, message: error.message });
      sendJSON(res, 200, { success: true, task });
    });
  }

  /* ---------------- API: MARK PENDING ---------------- */
  const pendingMatch = pathname.match(/^\/api\/tasks\/(\d+)\/pending$/);
  if (method === "POST" && pendingMatch) {
    return markPending(pendingMatch[1], (error, task) => {
      if (error) return sendJSON(res, 404, { success: false, message: error.message });
      sendJSON(res, 200, { success: true, task });
    });
  }

  /* ---------------- API: DASHBOARD STATS ---------------- */
  if (method === "GET" && pathname === "/api/dashboard") {
    dashboardDirty = false;
    return sendJSON(res, 200, { success: true, stats: buildDashboardStats() });
  }

  /* ---------------- API: ACTIVITY TIMELINE ---------------- */
  if (method === "GET" && pathname === "/api/activity") {
    return sendJSON(res, 200, { success: true, activity: activityLogs.slice(-50).reverse() });
  }

  /* ---------------- API: NOTIFICATIONS (polling) ---------------- */
  if (method === "GET" && pathname === "/api/notifications") {
    const since = Number(query.since) || 0;
    const fresh = notifications.filter((n) => n.id > since);
    return sendJSON(res, 200, { success: true, notifications: fresh });
  }

  /* ---------------- 404 fallback ---------------- */
  sendJSON(res, 404, { success: false, message: "Route not found" });
});

/* ============================================================================
   10. SERVER STARTUP
============================================================================ */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  printSection("SERVER STARTED", [
    `Port : ${PORT}`,
    `URL  : http://localhost:${PORT}`,
    `Time : ${new Date().toLocaleString()}`
  ]);
});

/* ============================================================================
   11. GRACEFUL SHUTDOWN  -  clearInterval() demonstration
============================================================================ */

process.on("SIGINT", () => {
  console.log("\nStopping background monitoring...");
  clearInterval(monitorInterval); // stop the 15s pending/overdue check
  clearInterval(summaryInterval); // stop the 60s session summary
  printSection("SERVER STOPPED", ["Goodbye!"]);
  server.close(() => process.exit(0));
});
