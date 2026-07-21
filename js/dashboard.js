/* ============================================================================
   DASHBOARD.JS — Dashboard Client Script
   Smart Event-Driven TO-DO Manager
   ============================================================================
   Handles:
     • Auth guard (redirect if no session token)
     • Live clock (setInterval)
     • Dashboard stats polling
     • Task CRUD (using MongoDB ObjectId _id strings)
     • Search / filter / sort
     • Activity timeline polling
     • Toast notification polling (server-sent via in-memory queue)
     • Keyboard shortcuts (Ctrl+K, Ctrl+N, Escape)
     • Sidebar navigation
============================================================================ */

"use strict";

/* ============================================================================
   AUTH GUARD
============================================================================ */
const token    = sessionStorage.getItem("todo_token");
const username = sessionStorage.getItem("todo_username");

if (!token) {
  window.location.href = "/index.html";
}

document.getElementById("welcomeTitle").textContent = `Welcome, ${username}! 👋`;

/* ============================================================================
   API HELPER — always attaches Bearer token
============================================================================ */
function api(pathname, options = {}) {
  return fetch(pathname, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers || {})
    }
  }).then((res) => {
    if (res.status === 401) {
      /* Session expired — go back to login */
      sessionStorage.clear();
      window.location.href = "/index.html";
    }
    return res.json();
  });
}

/* ============================================================================
   TOAST
============================================================================ */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast     = document.createElement("div");
  toast.className = `toast glass ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ============================================================================
   LIVE CLOCK  (setInterval — client side)
============================================================================ */
function updateClock() {
  const now = new Date();
  document.getElementById("liveClock").textContent = now.toLocaleTimeString();
  document.getElementById("liveDate").textContent  = now.toLocaleDateString(undefined, {
    weekday: "short",
    month:   "short",
    day:     "numeric"
  });
}

updateClock();
setInterval(updateClock, 1000);

/* ============================================================================
   DASHBOARD STATS
============================================================================ */
function refreshDashboard() {
  api("/api/dashboard").then((data) => {
    if (!data.success) return;
    const s = data.stats;
    document.getElementById("statTotal").textContent       = s.totalTasks;
    document.getElementById("statCompleted").textContent   = s.completed;
    document.getElementById("statPending").textContent     = s.pending;
    document.getElementById("statOverdue").textContent     = s.overdue;
    document.getElementById("statHigh").textContent        = s.highPriority;
    document.getElementById("productivityLabel").textContent = `${s.productivity}%`;
    document.getElementById("progressFill").style.width    = `${s.productivity}%`;
  });
}

/* ============================================================================
   HTML ESCAPE (XSS protection)
============================================================================ */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* ============================================================================
   TASK RENDERING
   NOTE: Tasks from MongoDB use _id (24-char hex ObjectId string) — NOT integer id
============================================================================ */
function priorityBadge(p) {
  return `<span class="badge ${escapeHtml(p)}">${escapeHtml(p)}</span>`;
}

function statusBadge(s) {
  return `<span class="badge ${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

function renderTasks(taskArray) {
  const list = document.getElementById("taskList");

  /* Update count label */
  const countEl = document.getElementById("taskCount");
  if (countEl) {
    countEl.textContent = taskArray && taskArray.length
      ? `${taskArray.length} task${taskArray.length !== 1 ? "s" : ""}`
      : "";
  }

  if (!taskArray || taskArray.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🗒️</span>
        <p>No tasks found. Add your first task!</p>
      </div>`;
    return;
  }

  list.innerHTML = taskArray.map((t) => {
    const due      = t.dueDate ? new Date(t.dueDate).toLocaleString() : "No due date";
    const isDone   = t.status === "Completed";
    const isOverdue = t.status === "Overdue";

    return `
    <div class="task-item priority-${escapeHtml(t.priority)} status-${escapeHtml(t.status)}"
         data-id="${escapeHtml(t._id)}">
      <div class="task-top-row">
        <div style="min-width:0;flex:1">
          <div class="task-title ${isDone ? "done" : ""}">${escapeHtml(t.title)}</div>
          ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ""}
        </div>
        <div class="task-actions">
          ${isDone
            ? `<button class="icon-btn" title="Mark Pending"  onclick="markTaskPending('${t._id}')">↺</button>`
            : `<button class="icon-btn" title="Complete Task" onclick="markTaskComplete('${t._id}')">✔</button>`
          }
          <button class="icon-btn" title="Edit Task"   onclick="openEditModal('${t._id}')">✎</button>
          <button class="icon-btn" title="Delete Task" onclick="deleteTaskById('${t._id}')">🗑</button>
        </div>
      </div>
      <div class="task-meta">
        ${priorityBadge(t.priority)}
        ${statusBadge(t.status)}
        <span class="text-muted">📅 ${escapeHtml(due)}</span>
        ${isOverdue ? '<span style="color:var(--danger);font-size:11px;font-weight:700;">⚠ OVERDUE</span>' : ""}
      </div>
    </div>`;
  }).join("");
}

/* ============================================================================
   TASK LOADING  (with search / filter / sort)
============================================================================ */
let currentTasksCache = [];

function loadTasks() {
  const search   = document.getElementById("searchInput").value.trim();
  const priority = document.getElementById("priorityFilter").value;
  const status   = document.getElementById("statusFilter").value;
  const sort     = document.getElementById("sortFilter").value;

  const params = new URLSearchParams();
  if (search)                    params.set("search",   search);
  if (priority && priority !== "All") params.set("priority", priority);
  if (status   && status   !== "All") params.set("status",   status);
  if (sort)                      params.set("sort",     sort);

  api(`/api/tasks?${params.toString()}`).then((data) => {
    if (!data.success) return;
    currentTasksCache = data.tasks;
    renderTasks(data.tasks);
  });
}

/* ============================================================================
   TASK ACTIONS  (globally scoped for inline onclick attributes)
============================================================================ */

/* Complete a task */
window.markTaskComplete = function (id) {
  api(`/api/tasks/${id}/complete`, { method: "POST" }).then((data) => {
    if (data.success) {
      showToast(`✅ Completed: "${data.task.title}"`, "success");
      loadTasks();
      refreshDashboard();
    } else {
      showToast(data.message || "Could not complete task", "error");
    }
  });
};

/* Mark a task back to Pending */
window.markTaskPending = function (id) {
  api(`/api/tasks/${id}/pending`, { method: "POST" }).then((data) => {
    if (data.success) {
      showToast(`↺ Marked pending: "${data.task.title}"`, "info");
      loadTasks();
      refreshDashboard();
    } else {
      showToast(data.message || "Could not update task", "error");
    }
  });
};

/* Delete a task */
window.deleteTaskById = function (id) {
  if (!confirm("Delete this task? This cannot be undone.")) return;
  api(`/api/tasks/${id}`, { method: "DELETE" }).then((data) => {
    if (data.success) {
      showToast(`🗑 Deleted: "${data.task.title}"`, "error");
      loadTasks();
      refreshDashboard();
    } else {
      showToast(data.message || "Could not delete task", "error");
    }
  });
};

/* Open edit modal — look up task in the cache by _id */
window.openEditModal = function (id) {
  const task = currentTasksCache.find((t) => t._id === id);
  if (!task) { showToast("Task not found in cache. Please refresh.", "error"); return; }

  document.getElementById("modalTitle").textContent    = "Edit Task";
  document.getElementById("taskId").value              = task._id;
  document.getElementById("taskTitle").value           = task.title;
  document.getElementById("taskDescription").value     = task.description || "";
  document.getElementById("taskPriority").value        = task.priority;
  document.getElementById("taskDueDate").value         = task.dueDate
    ? new Date(task.dueDate).toISOString().slice(0, 16)
    : "";

  document.getElementById("taskModal").classList.add("open");
};

/* ============================================================================
   MODAL CONTROLS
============================================================================ */
const taskModal = document.getElementById("taskModal");

function openAddModal() {
  document.getElementById("modalTitle").textContent = "Add New Task";
  document.getElementById("taskForm").reset();
  document.getElementById("taskId").value           = "";
  taskModal.classList.add("open");
}

document.getElementById("openAddTaskBtn").addEventListener("click", openAddModal);

document.getElementById("cancelModalBtn").addEventListener("click", () => {
  taskModal.classList.remove("open");
});

/* Click outside the modal box to close */
taskModal.addEventListener("click", (e) => {
  if (e.target === taskModal) taskModal.classList.remove("open");
});

/* ── Save Task (Add or Edit) ── */
document.getElementById("taskForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const id      = document.getElementById("taskId").value;
  const title   = document.getElementById("taskTitle").value.trim();
  const saveBtn = document.getElementById("saveTaskBtn");

  if (!title) { showToast("Task title is required", "error"); return; }

  const payload = {
    title,
    description: document.getElementById("taskDescription").value.trim(),
    priority:    document.getElementById("taskPriority").value,
    dueDate:     document.getElementById("taskDueDate").value || null
  };

  saveBtn.textContent = "Saving…";
  saveBtn.disabled    = true;

  const request = id
    ? api(`/api/tasks/${id}`, { method: "PUT",  body: JSON.stringify(payload) })
    : api("/api/tasks",       { method: "POST", body: JSON.stringify(payload) });

  request.then((data) => {
    saveBtn.textContent = "Save Task";
    saveBtn.disabled    = false;

    if (!data.success) {
      showToast(data.message || "Something went wrong", "error");
      return;
    }

    const verb = id ? "Updated" : "Added";
    showToast(`${verb}: "${data.task.title}"`, "success");
    taskModal.classList.remove("open");
    loadTasks();
    refreshDashboard();
  }).catch(() => {
    saveBtn.textContent = "Save Task";
    saveBtn.disabled    = false;
    showToast("Server error — please try again", "error");
  });
});

/* ============================================================================
   SEARCH / FILTER / SORT
============================================================================ */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

document.getElementById("searchInput").addEventListener("input",  debounce(loadTasks, 300));
document.getElementById("priorityFilter").addEventListener("change", loadTasks);
document.getElementById("statusFilter").addEventListener("change",   loadTasks);
document.getElementById("sortFilter").addEventListener("change",     loadTasks);

/* ============================================================================
   ACTIVITY TIMELINE
============================================================================ */
const EVENT_LABELS = {
  login:           "Login",
  logout:          "Logout",
  register:        "Registered",
  taskCreated:     "Task Created",
  taskUpdated:     "Task Updated",
  taskCompleted:   "Completed",
  taskDeleted:     "Deleted",
  overdue:         "Overdue",
  reminder:        "Reminder",
  reminderCancelled: "Reminder Cancelled"
};

function loadActivity() {
  api("/api/activity").then((data) => {
    if (!data.success) return;
    const list = document.getElementById("timelineList");

    if (data.activity.length === 0) {
      list.innerHTML = `<div class="empty-state"><p>No activity yet.</p></div>`;
      return;
    }

    list.innerHTML = data.activity.map((a) => {
      const label = EVENT_LABELS[a.event] || a.event;
      return `
      <div class="timeline-item ev-${escapeHtml(a.event)}">
        <div class="dot"></div>
        <div>
          <div class="t-time">${escapeHtml(a.time)}</div>
          <div class="t-msg">${escapeHtml(a.description || label)}</div>
          <div class="t-user">@${escapeHtml(a.username)}</div>
        </div>
      </div>`;
    }).join("");
  });
}

/* ============================================================================
   NOTIFICATION POLLING  (toast pop-ups from server event queue)
============================================================================ */
let lastNotificationId = 0;

function pollNotifications() {
  api(`/api/notifications?since=${lastNotificationId}`).then((data) => {
    if (!data.success) return;
    data.notifications.forEach((n) => {
      showToast(n.message, n.type);
      lastNotificationId = Math.max(lastNotificationId, n.id);
    });
  });
}

/* ============================================================================
   LOGOUT
============================================================================ */
document.getElementById("logoutBtn").addEventListener("click", () => {
  api("/api/logout", { method: "POST" }).finally(() => {
    sessionStorage.removeItem("todo_token");
    sessionStorage.removeItem("todo_username");
    window.location.href = "/index.html";
  });
});

/* ============================================================================
   KEYBOARD SHORTCUTS
============================================================================ */
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    document.getElementById("searchInput").focus();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "n") {
    e.preventDefault();
    openAddModal();
  }
  if (e.key === "Escape") {
    taskModal.classList.remove("open");
  }
});

/* ============================================================================
   SIDEBAR NAVIGATION
============================================================================ */
document.querySelectorAll(".nav-item[data-section]").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item[data-section]").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");

    const section = item.dataset.section;
    if (section === "tasks") {
      document.querySelector(".content-grid").scrollIntoView({ behavior: "smooth" });
    } else if (section === "activity") {
      document.querySelector(".timeline").scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
});

/* ============================================================================
   INITIAL LOAD + POLLING INTERVALS
============================================================================ */
refreshDashboard();
loadTasks();
loadActivity();

setInterval(refreshDashboard,    5000);   // keep stat cards fresh
setInterval(loadTasks,          10000);   // keep task list fresh (overdue status)
setInterval(loadActivity,        5000);   // keep activity timeline fresh
setInterval(pollNotifications,   3000);   // pick up server-emitted toasts
