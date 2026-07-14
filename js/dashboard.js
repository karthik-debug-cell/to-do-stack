/* ============================================================================
   DASHBOARD CLIENT SCRIPT
   Handles: auth guard, live clock, stats, task CRUD, search/filter/sort,
   activity timeline polling, toast notification polling, keyboard shortcuts.
============================================================================ */

/* ---------------- AUTH GUARD ---------------- */
const token = sessionStorage.getItem("todo_token");
const username = sessionStorage.getItem("todo_username");

if (!token) {
  window.location.href = "/index.html";
}

document.getElementById("welcomeTitle").textContent = `Welcome, ${username}!`;

/* ---------------- API HELPER (always attaches auth token) ---------------- */
function api(pathname, options = {}) {
  return fetch(pathname, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  }).then((res) => res.json());
}

/* ---------------- TOASTS ---------------- */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast glass ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ---------------- LIVE CLOCK ---------------- */
function updateClock() {
  const now = new Date();
  document.getElementById("liveClock").textContent = now.toLocaleTimeString();
  document.getElementById("liveDate").textContent = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}
updateClock();
setInterval(updateClock, 1000);

/* ---------------- DASHBOARD STATS ---------------- */
function refreshDashboard() {
  api("/api/dashboard").then((data) => {
    if (!data.success) return;
    const s = data.stats;
    document.getElementById("statTotal").textContent = s.totalTasks;
    document.getElementById("statCompleted").textContent = s.completed;
    document.getElementById("statPending").textContent = s.pending;
    document.getElementById("statOverdue").textContent = s.overdue;
    document.getElementById("statHigh").textContent = s.highPriority;
    document.getElementById("productivityLabel").textContent = `${s.productivity}%`;
    document.getElementById("progressFill").style.width = `${s.productivity}%`;
  });
}

/* ---------------- TASK RENDERING ---------------- */
function priorityBadge(p) {
  return `<span class="badge ${p}">${p}</span>`;
}
function statusBadge(s) {
  return `<span class="badge ${s}">${s}</span>`;
}

function renderTasks(taskArray) {
  const list = document.getElementById("taskList");

  if (!taskArray || taskArray.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">🗒️</div>
        <div>No tasks found. Add your first task!</div>
      </div>`;
    return;
  }

  list.innerHTML = taskArray
    .map((t) => {
      const due = t.dueDate ? new Date(t.dueDate).toLocaleString() : "No due date";
      return `
      <div class="task-item priority-${t.priority} status-${t.status}" data-id="${t.id}">
        <div class="task-top-row">
          <div>
            <div class="task-title ${t.status === "Completed" ? "done" : ""}">${escapeHtml(t.title)}</div>
            <div class="task-desc">${escapeHtml(t.description || "")}</div>
          </div>
          <div class="task-actions">
            ${
              t.status === "Completed"
                ? `<button class="icon-btn" title="Mark Pending" onclick="markPending(${t.id})">↺</button>`
                : `<button class="icon-btn" title="Complete" onclick="completeTask(${t.id})">✔</button>`
            }
            <button class="icon-btn" title="Edit" onclick="openEditModal(${t.id})">✎</button>
            <button class="icon-btn" title="Delete" onclick="deleteTask(${t.id})">🗑</button>
          </div>
        </div>
        <div class="task-meta">
          ${priorityBadge(t.priority)}
          ${statusBadge(t.status)}
          <span class="text-muted">📅 ${due}</span>
        </div>
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

let currentTasksCache = [];

function loadTasks() {
  const search = document.getElementById("searchInput").value.trim();
  const priority = document.getElementById("priorityFilter").value;
  const status = document.getElementById("statusFilter").value;
  const sort = document.getElementById("sortFilter").value;

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (priority && priority !== "All") params.set("priority", priority);
  if (status && status !== "All") params.set("status", status);
  if (sort) params.set("sort", sort);

  api(`/api/tasks?${params.toString()}`).then((data) => {
    if (!data.success) return;
    currentTasksCache = data.tasks;
    renderTasks(data.tasks);
  });
}

/* ---------------- TASK ACTIONS (exposed globally for inline onclick) ---------------- */
window.completeTask = function (id) {
  api(`/api/tasks/${id}/complete`, { method: "POST" }).then((data) => {
    if (data.success) {
      showToast(`Task completed: "${data.task.title}"`, "success");
      loadTasks();
      refreshDashboard();
    }
  });
};

window.markPending = function (id) {
  api(`/api/tasks/${id}/pending`, { method: "POST" }).then((data) => {
    if (data.success) {
      showToast(`Task marked pending: "${data.task.title}"`, "info");
      loadTasks();
      refreshDashboard();
    }
  });
};

window.deleteTask = function (id) {
  if (!confirm("Delete this task?")) return;
  api(`/api/tasks/${id}`, { method: "DELETE" }).then((data) => {
    if (data.success) {
      showToast(`Task deleted: "${data.task.title}"`, "error");
      loadTasks();
      refreshDashboard();
    }
  });
};

window.openEditModal = function (id) {
  const task = currentTasksCache.find((t) => t.id === id);
  if (!task) return;
  document.getElementById("modalTitle").textContent = "Edit Task";
  document.getElementById("taskId").value = task.id;
  document.getElementById("taskTitle").value = task.title;
  document.getElementById("taskDescription").value = task.description;
  document.getElementById("taskPriority").value = task.priority;
  document.getElementById("taskDueDate").value = task.dueDate ? task.dueDate.slice(0, 16) : "";
  document.getElementById("taskModal").classList.add("open");
};

/* ---------------- MODAL CONTROLS ---------------- */
const taskModal = document.getElementById("taskModal");

function openAddModal() {
  document.getElementById("modalTitle").textContent = "Add New Task";
  document.getElementById("taskForm").reset();
  document.getElementById("taskId").value = "";
  taskModal.classList.add("open");
}

document.getElementById("openAddTaskBtn").addEventListener("click", openAddModal);
document.getElementById("cancelModalBtn").addEventListener("click", () => taskModal.classList.remove("open"));
taskModal.addEventListener("click", (e) => {
  if (e.target === taskModal) taskModal.classList.remove("open");
});

document.getElementById("taskForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = document.getElementById("taskId").value;
  const payload = {
    title: document.getElementById("taskTitle").value.trim(),
    description: document.getElementById("taskDescription").value.trim(),
    priority: document.getElementById("taskPriority").value,
    dueDate: document.getElementById("taskDueDate").value || null
  };

  const request = id
    ? api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) })
    : api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });

  request.then((data) => {
    if (!data.success) {
      showToast(data.message || "Something went wrong", "error");
      return;
    }
    showToast(id ? `Task updated: "${data.task.title}"` : `Task added: "${data.task.title}"`, "success");
    taskModal.classList.remove("open");
    loadTasks();
    refreshDashboard();
  });
});

/* ---------------- FILTER / SEARCH / SORT LISTENERS ---------------- */
document.getElementById("searchInput").addEventListener("input", debounce(loadTasks, 300));
document.getElementById("priorityFilter").addEventListener("change", loadTasks);
document.getElementById("statusFilter").addEventListener("change", loadTasks);
document.getElementById("sortFilter").addEventListener("change", loadTasks);

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ---------------- ACTIVITY TIMELINE ---------------- */
function loadActivity() {
  api("/api/activity").then((data) => {
    if (!data.success) return;
    const list = document.getElementById("timelineList");
    if (data.activity.length === 0) {
      list.innerHTML = `<div class="empty-state"><div>No activity yet.</div></div>`;
      return;
    }
    list.innerHTML = data.activity
      .map(
        (a) => `
        <div class="timeline-item">
          <div class="dot"></div>
          <div>
            <div class="t-time">${a.time}</div>
            <div>${escapeHtml(a.message)}</div>
          </div>
        </div>`
      )
      .join("");
  });
}

/* ---------------- NOTIFICATION POLLING (toast popups) ---------------- */
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

/* ---------------- LOGOUT ---------------- */
document.getElementById("logoutBtn").addEventListener("click", () => {
  api("/api/logout", { method: "POST" }).finally(() => {
    sessionStorage.removeItem("todo_token");
    sessionStorage.removeItem("todo_username");
    window.location.href = "/index.html";
  });
});

/* ---------------- KEYBOARD SHORTCUTS ---------------- */
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

/* ---------------- SIDEBAR NAV (simple section scroll/highlight) ---------------- */
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

/* ---------------- INITIAL LOAD + POLLING INTERVALS ---------------- */
refreshDashboard();
loadTasks();
loadActivity();

setInterval(refreshDashboard, 5000);   // keep stat cards fresh
setInterval(loadTasks, 10000);         // keep task list fresh (e.g. overdue status)
setInterval(loadActivity, 5000);       // keep activity timeline fresh
setInterval(pollNotifications, 3000);  // pick up toast notifications from the server
