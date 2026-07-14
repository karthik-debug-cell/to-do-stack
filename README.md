# Smart Event-Driven TO-DO Manager

A complete, professional, **event-driven** Smart TO-DO List Web Application built entirely with **Node.js core modules** — no Express, no database, no frontend frameworks. Built for a Node.js Laboratory Practical to demonstrate `EventEmitter`, Timer APIs, and Callback-based programming inside a real, working web app.

---

## 📖 Project Description

Smart TO-DO Manager lets a user log in and manage personal tasks (create, edit, complete, delete, search, filter, sort). Every action in the app — logging in, creating a task, completing a task, a reminder firing, a task going overdue — is modeled as an **event**, emitted through a central `EventEmitter`, and reacted to by listeners that update an in-memory activity log, push toast notifications, and refresh dashboard statistics.

Since no database is permitted, all data (users, tasks, activity logs, notifications, sessions) lives in plain JavaScript arrays/objects in server memory and resets whenever the server restarts.

---

## ✨ Features

- Modern glassmorphism dark-theme UI, fully responsive
- Secure-enough demo login with predefined users and session tokens (session-only, no persistence)
- Dashboard with live stat cards: Total, Completed, Pending, Overdue, High Priority
- Live clock, today's date, and productivity progress bar
- Full task CRUD: Add / Edit / Delete / Complete / Mark Pending
- Quick Search, Priority Filter, Status Filter, and Sort (priority / due date / newest)
- Live Activity Timeline (auto-refreshing)
- Toast notification popups for every major action (polled from the server)
- Automatic task reminders (30s after creation) and automatic overdue detection (checked every 15s)
- Periodic server-side session summary printed to the console every 60 seconds
- Keyboard shortcuts: `Ctrl+K` to search, `Ctrl+N` to add a task, `Esc` to close dialogs
- Empty-state illustration when there are no tasks
- Clean, fully commented, callback-based backend code

---

## 📂 Folder Structure

```
Todo-App/
│── server.js            # Single Node.js backend file (http + EventEmitter + timers)
│── package.json
│── README.md
│
├── public/
│      index.html         # Login page
│      dashboard.html     # Main application dashboard
│
├── css/
│      style.css          # Shared glassmorphism dark-theme stylesheet
│
├── js/
│      login.js           # Login page client logic
│      dashboard.js       # Dashboard client logic (CRUD, polling, shortcuts)
│
├── images/                # Static image assets (empty placeholder folder)
│
└── assets/                # Additional static assets (empty placeholder folder)
```

---

## 🛠 Installation

1. Make sure [Node.js](https://nodejs.org) is installed (v14 or later recommended).
2. Extract `Todo-App.zip`.
3. Open a terminal inside the `Todo-App` folder.
4. Install dependencies (there are none besides Node.js core, but this keeps `npm` happy):

   ```bash
   npm install
   ```

---

## ▶ How to Run

```bash
node server.js
```

or

```bash
npm start
```

Then open your browser at:

```
http://localhost:3000
```

Login with one of the demo accounts:

| Username | Password |
|----------|----------|
| karthik  | 1234     |
| admin    | admin    |

To stop the server, press `Ctrl + C` in the terminal — this triggers a graceful shutdown that clears the running intervals.

---

## 🧩 Node Version

Tested against Node.js **v14+** (uses only stable, long-standing core APIs: `http`, `events`, `fs`, `path`, `url` — no ES modules, no external packages required).

---

## 🖼 Screenshots

> _Add your own screenshots here after running the app locally._

- `Login Page` — screenshot placeholder
- `Dashboard Overview` — screenshot placeholder
- `Add Task Modal` — screenshot placeholder
- `Toast Notifications` — screenshot placeholder

---

## 🧪 Lab Concepts Used

This project intentionally demonstrates every required Node.js concept as a **natural part of the app's workflow** (not bolted on artificially):

- `EventEmitter` — the backbone connecting login/logout/task actions to logging, notifications, and dashboard refresh
- `emit()` — fired on every login, logout, task created/updated/deleted/completed, reminder, overdue check, and dashboard refresh
- `on()` — persistent listeners react to every one of those events, every time they occur
- `once()` — a "Welcome, first login!" message and a "Congratulations, first task!" message that only ever print the first time, even though the underlying events are emitted repeatedly
- `setTimeout()` / `clearTimeout()` — a 30-second reminder is scheduled the moment a task is created, and cancelled automatically if the task is completed or deleted first
- `setInterval()` / `clearInterval()` — a 15-second background check for overdue tasks, and a 60-second full session summary printed to the console; both intervals are cleared cleanly on server shutdown (`SIGINT`)
- `setImmediate()` / `clearImmediate()` — dashboard refresh + activity log generation is scheduled right after every task mutation; invalid operations schedule and then immediately cancel an immediate to demonstrate `clearImmediate()`
- Callback functions — every core operation (`loginUser`, `logoutUser`, `addTask`, `updateTask`, `deleteTask`, `completeTask`, `searchTask`, `filterTask`, `markPending`) follows the Node.js `(err, result)` callback convention

---

## 📌 Lab Requirements Mapping

| # | Concept | Where it's implemented in `server.js` |
|---|---------|----------------------------------------|
| 1 | **EventEmitter** | `const taskEmitter = new EventEmitter();` — created once and shared across the whole application (Section 2) |
| 2 | **emit()** | Called inside `loginUser`, `logoutUser`, `addTask`, `updateTask`, `deleteTask`, `completeTask`, the reminder `setTimeout` callback, and the overdue `setInterval` check — events emitted: `login`, `logout`, `taskCreated`, `taskUpdated`, `taskDeleted`, `taskCompleted`, `taskReminder`, `taskOverdue`, `dashboardUpdated`, `firstLogin`, `firstTaskCreated` |
| 3 | **on()** | Section 3 — persistent listeners for `login`, `logout`, `taskCreated`, `taskUpdated`, `taskDeleted`, `taskCompleted`, `taskReminder`, `taskOverdue`, and `dashboardUpdated`; each prints a console log, stores an activity entry, and pushes a toast notification |
| 4 | **once()** | Section 4 — `taskEmitter.once("firstLogin", ...)` prints a one-time welcome message; `taskEmitter.once("firstTaskCreated", ...)` prints a one-time congratulations message |
| 5 | **setTimeout()** | Inside `addTask()` — schedules an automatic 30-second reminder (`taskReminder` event) for every newly created task |
| 6 | **clearTimeout()** | Inside `completeTask()` and `deleteTask()` — cancels the pending reminder timeout when a task is completed or deleted before the reminder fires, printing `Reminder Cancelled` |
| 7 | **setInterval()** | `monitorInterval` — runs every 15 seconds, prints `Checking Tasks...`, and marks/emits overdue tasks. `summaryInterval` — runs every 60 seconds and prints the full Session Summary |
| 8 | **clearInterval()** | Inside the `process.on("SIGINT", ...)` graceful-shutdown handler — stops both `monitorInterval` and `summaryInterval` when the server is stopped |
| 9 | **setImmediate()** | Inside `addTask()`, `updateTask()`, `deleteTask()`, and `completeTask()` — schedules a `dashboardUpdated` emit (and activity log refresh) to run right after the current operation, and inside the validation-failure branches of `addTask`/`updateTask`/`deleteTask` |
| 10 | **clearImmediate()** | In the validation-failure branches of `addTask()`, `updateTask()`, and `deleteTask()` — an immediate is scheduled and then cancelled with `clearImmediate()` to demonstrate cancellation when an operation fails |
| 11 | **Callback Functions** | `loginUser(username, password, callback)`, `logoutUser(token, callback)`, `addTask(taskData, callback)`, `updateTask(id, data, callback)`, `deleteTask(id, callback)`, `completeTask(id, callback)`, `markPending(id, callback)`, `searchTask(keyword, callback)`, `filterTask(priority, callback)` — every one follows the `(err, result)` Node.js callback pattern and is wired into the manual HTTP routes |

---

## 🌐 Manual HTTP Routing (no Express)

All routing is done by hand inside `http.createServer()` using `url.parse()` and `RegExp` path matching:

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/`, `/index.html` | Serve login page |
| GET | `/dashboard.html` | Serve dashboard page |
| GET | `/css/style.css`, `/js/*.js`, `/images/*`, `/assets/*` | Serve static assets |
| POST | `/api/login` | Authenticate user, returns a session token |
| POST | `/api/logout` | End the session |
| GET | `/api/tasks` | List/search/filter/sort tasks |
| POST | `/api/tasks` | Add a new task |
| PUT | `/api/tasks/:id` | Update a task |
| DELETE | `/api/tasks/:id` | Delete a task |
| POST | `/api/tasks/:id/complete` | Mark a task completed |
| POST | `/api/tasks/:id/pending` | Mark a task pending again |
| GET | `/api/dashboard` | Fetch live dashboard statistics |
| GET | `/api/activity` | Fetch the activity timeline |
| GET | `/api/notifications` | Poll for new toast notifications |

---

Enjoy exploring the event-driven architecture — every console log you see while using the app traces directly back to an `emit()` call somewhere in `server.js`!
