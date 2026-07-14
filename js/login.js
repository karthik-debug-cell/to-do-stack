/* ============================================================================
   LOGIN PAGE CLIENT SCRIPT
============================================================================ */

const loginForm = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");
const loginBtn = document.getElementById("loginBtn");

// If a valid session already exists, skip straight to the dashboard
if (sessionStorage.getItem("todo_token")) {
  window.location.href = "/dashboard.html";
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast glass ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = "block";
}

function hideError() {
  errorMsg.style.display = "none";
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  hideError();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!username || !password) {
    showError("Please enter both username and password.");
    return;
  }

  loginBtn.textContent = "Logging in...";
  loginBtn.disabled = true;

  fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  })
    .then((res) => res.json())
    .then((data) => {
      loginBtn.textContent = "Login";
      loginBtn.disabled = false;

      if (!data.success) {
        showError(data.message || "Invalid username or password.");
        return;
      }

      // Store the session token (cleared automatically when the tab/session ends)
      sessionStorage.setItem("todo_token", data.token);
      sessionStorage.setItem("todo_username", data.username);
      if (rememberMe) sessionStorage.setItem("todo_remember", "1");

      showToast(`Welcome, ${data.username}!`, "success");
      setTimeout(() => {
        window.location.href = "/dashboard.html";
      }, 500);
    })
    .catch(() => {
      loginBtn.textContent = "Login";
      loginBtn.disabled = false;
      showError("Unable to reach the server. Please try again.");
    });
});

/* Keyboard shortcut: Enter submits (native), Escape clears error */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideError();
});
