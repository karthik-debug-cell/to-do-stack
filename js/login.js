/* ============================================================================
   LOGIN.JS — Authentication Client Script
   Smart Event-Driven TO-DO Manager
   ============================================================================
   Handles:
     • Tab switching between Login and Register forms
     • POST /api/login  — authenticate existing user
     • POST /api/register — create new account in MongoDB
     • Session token storage (sessionStorage)
     • Toast notifications
============================================================================ */

"use strict";

/* ── Elements ────────────────────────────────────────────────────────────── */
const loginForm    = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const errorMsg     = document.getElementById("errorMsg");
const loginBtn     = document.getElementById("loginBtn");
const registerBtn  = document.getElementById("registerBtn");
const tabLogin     = document.getElementById("tabLogin");
const tabRegister  = document.getElementById("tabRegister");
const demoHint     = document.getElementById("demoHint");

/* ── If already logged in, skip straight to the dashboard ────────────────── */
if (sessionStorage.getItem("todo_token")) {
  window.location.href = "/dashboard.html";
}

/* ============================================================================
   TAB SWITCHER
============================================================================ */
function showLoginTab() {
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  demoHint.classList.remove("hidden");
  hideError();
}

function showRegisterTab() {
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  demoHint.classList.add("hidden");
  hideError();
}

tabLogin.addEventListener("click",    showLoginTab);
tabRegister.addEventListener("click", showRegisterTab);

/* ============================================================================
   UTILITIES
============================================================================ */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast     = document.createElement("div");
  toast.className = `toast glass ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showError(message) {
  errorMsg.textContent  = message;
  errorMsg.style.display = "block";
}

function hideError() {
  errorMsg.style.display = "none";
  errorMsg.textContent   = "";
}

/* Redirect to dashboard after a short delay */
function redirectToDashboard(ms = 600) {
  setTimeout(() => {
    window.location.href = "/dashboard.html";
  }, ms);
}

/* ============================================================================
   LOGIN
============================================================================ */
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideError();

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!username || !password) {
    showError("Please enter both username and password.");
    return;
  }

  loginBtn.textContent = "Logging in…";
  loginBtn.disabled    = true;

  fetch("/api/login", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password })
  })
    .then((res) => res.json())
    .then((data) => {
      loginBtn.textContent = "Login";
      loginBtn.disabled    = false;

      if (!data.success) {
        showError(data.message || "Invalid username or password.");
        return;
      }

      sessionStorage.setItem("todo_token",    data.token);
      sessionStorage.setItem("todo_username", data.username);

      showToast(`Welcome back, ${data.username}! 👋`, "success");
      redirectToDashboard();
    })
    .catch(() => {
      loginBtn.textContent = "Login";
      loginBtn.disabled    = false;
      showError("Unable to reach the server. Is the Node.js server running?");
    });
});

/* ============================================================================
   REGISTER
============================================================================ */
registerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideError();

  const username = document.getElementById("regUsername").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirm  = document.getElementById("regConfirm").value;

  if (!username || !password || !confirm) {
    showError("Please fill in all fields.");
    return;
  }
  if (password !== confirm) {
    showError("Passwords do not match.");
    return;
  }
  if (username.length < 3) {
    showError("Username must be at least 3 characters.");
    return;
  }
  if (password.length < 4) {
    showError("Password must be at least 4 characters.");
    return;
  }

  registerBtn.textContent = "Creating account…";
  registerBtn.disabled    = true;

  fetch("/api/register", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ username, password })
  })
    .then((res) => res.json())
    .then((data) => {
      registerBtn.textContent = "Create Account";
      registerBtn.disabled    = false;

      if (!data.success) {
        showError(data.message || "Registration failed. Please try a different username.");
        return;
      }

      sessionStorage.setItem("todo_token",    data.token);
      sessionStorage.setItem("todo_username", data.username);

      showToast(`Account created! Welcome, ${data.username}! 🎉`, "success");
      redirectToDashboard();
    })
    .catch(() => {
      registerBtn.textContent = "Create Account";
      registerBtn.disabled    = false;
      showError("Unable to reach the server. Is the Node.js server running?");
    });
});

/* ============================================================================
   KEYBOARD
============================================================================ */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideError();
});
