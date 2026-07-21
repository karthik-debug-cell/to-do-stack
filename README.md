# Smart Event-Driven TO-DO Manager

A complete **Smart Event-Driven TO-DO List Web Application** built with:

| Technology | Usage |
|---|---|
| **Node.js HTTP Module** | HTTP server, manual routing (no Express) |
| **MongoDB** | Persistent storage via official driver |
| **EventEmitter** | Central event bus (`on`, `once`, `emit`) |
| **setTimeout / clearTimeout** | Per-task reminder system |
| **setInterval / clearInterval** | Background overdue monitor + session summary |
| **setImmediate / clearImmediate** | Post-I/O dashboard refresh |
| **Callback Functions** | All DB operations follow `(err, result)` pattern |
| **Vanilla HTML/CSS/JS** | Glassmorphism dark UI, no frameworks |

---

## Project Structure

```
Todo-App/
├── server.js           # HTTP server, routing, EventEmitter, all timer APIs
├── config.js           # MongoDB URI, PORT, and application constants
├── package.json        # Only dependency: mongodb@^6
├── README.md
│
├── database/
│   └── mongo.js        # Singleton MongoClient connection manager
│
├── public/
│   ├── index.html      # Login + Register page (tab switcher)
│   └── dashboard.html  # Main dashboard
│
├── css/
│   └── style.css       # Dark glassmorphism, Google Fonts (Inter), animations
│
├── js/
│   ├── login.js        # Login + Register client script
│   └── dashboard.js    # Dashboard CRUD, polling, keyboard shortcuts
│
├── images/             # Static image assets
└── assets/             # Other static assets
```

---

## Prerequisites

| Requirement | Minimum Version |
|---|---|
| Node.js | 14.x or higher |
| MongoDB | 5.0 or higher (local) |
| npm | 6.x or higher |

---

## Setup & Run

### 1. Install dependencies

```bash
npm install
```

This installs the only external dependency: `mongodb` (official Node.js driver).

### 2. Start MongoDB

**Windows (default install):**
```bash
mongod
```

**macOS (Homebrew):**
```bash
brew services start mongodb-community
```

**Linux:**
```bash
sudo systemctl start mongod
```

MongoDB must be listening on `mongodb://localhost:27017` (default).  
To use a different URI, edit `config.js`:

```js
module.exports = {
  mongoURI: "mongodb://localhost:27017/todo_app",
  // ... or your Atlas connection string
};
```

### 3. Start the server

```bash
node server.js
```

### 4. Open the app

```
http://localhost:3000
```

---

## Demo Accounts

Two demo accounts are **auto-seeded** into MongoDB on the first run:

| Username | Password |
|---|---|
| `karthik` | `1234` |
| `admin` | `admin` |

You can also register new accounts from the login page.

---

## MongoDB Collections

### `Users`
```json
{
  "_id":       "ObjectId",
  "username":  "karthik",
  "password":  "1234",
  "createdAt": "ISODate"
}
```

### `Tasks`
```json
{
  "_id":         "ObjectId",
  "userId":      "karthik",
  "title":       "Complete Node.js Lab",
  "description": "Implement MongoDB integration",
  "priority":    "High",
  "dueDate":     "ISODate",
  "status":      "Pending",
  "createdAt":   "ISODate",
  "completedAt": null
}
```

### `ActivityLogs`
```json
{
  "_id":         "ObjectId",
  "username":    "karthik",
  "event":       "taskCreated",
  "description": "Task created: \"Complete Node.js Lab\"",
  "timestamp":   "ISODate"
}
```

---

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/` | — | Serve `index.html` |
| `GET` | `/dashboard.html` | — | Serve `dashboard.html` |
| `POST` | `/api/login` | — | Authenticate user |
| `POST` | `/api/register` | — | Create new user |
| `POST` | `/api/logout` | ✔ | Invalidate session |
| `GET` | `/api/tasks` | ✔ | List / search / filter tasks |
| `POST` | `/api/tasks` | ✔ | Create a task |
| `PUT` | `/api/tasks/:id` | ✔ | Update a task |
| `DELETE` | `/api/tasks/:id` | ✔ | Delete a task |
| `POST` | `/api/tasks/:id/complete` | ✔ | Mark task completed |
| `POST` | `/api/tasks/:id/pending` | ✔ | Mark task pending |
| `GET` | `/api/dashboard` | ✔ | Aggregated stats |
| `GET` | `/api/activity` | ✔ | Last 50 activity logs |
| `GET` | `/api/notifications` | ✔ | In-memory toast queue |

---

## Node.js Concepts Demonstrated

| Concept | Location in Code |
|---|---|
| `EventEmitter` | `server.js` — `taskEmitter = new EventEmitter()` |
| `emit()` | Every task CRUD and login/logout |
| `on()` | `taskEmitter.on("taskCreated", ...)` — persistent listeners |
| `once()` | `taskEmitter.once("firstLogin", ...)` — fires only once |
| `setTimeout()` | 30-second reminder per task after creation |
| `clearTimeout()` | Cancel reminder on task delete / complete |
| `setInterval()` | Overdue check every 15s, session summary every 60s |
| `clearInterval()` | SIGINT graceful shutdown |
| `setImmediate()` | Post-I/O dashboard dirty-flag update |
| `clearImmediate()` | Cancelled on task validation failure |
| **Callbacks** | All MongoDB operations: `(err, result) => {}` |
| `http.createServer()` | Entire HTTP server — no Express |
| `fs.readFile()` | Static file serving |
| `process.on("SIGINT")` | Graceful shutdown hook |

---

## Graceful Shutdown

Press `Ctrl+C` to stop the server. It will:
1. Clear all `setInterval` monitors
2. Cancel all pending `setTimeout` reminders
3. Close the MongoDB connection
4. Close the HTTP server

---

## Packaging into a ZIP

```bash
# Windows PowerShell
Compress-Archive -Path .\* -DestinationPath ..\Todo-App.zip -Force
```

```bash
# macOS / Linux
cd ..
zip -r Todo-App.zip to-do-stack --exclude "*/node_modules/*"
```
