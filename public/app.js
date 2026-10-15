
const form = document.getElementById("authForm");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const nameField = document.getElementById("nameField");
const nameInput = document.getElementById("name");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");
const accountPanel = document.getElementById("accountPanel");
const accountName = document.getElementById("accountName");

let mode = "login";

function showMessage(text, success = false) {
  message.textContent = text;
  message.className = "message " + (success ? "success" : "error");
}

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";

  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  nameField.hidden = !registering;
  nameInput.required = registering;
  passwordInput.autocomplete = registering
    ? "new-password"
    : "current-password";
  submitButton.textContent = registering
    ? "Create account"
    : "Sign in";

  message.textContent = "";
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

async function request(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(data)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Request failed. Please try again.");
  }

  return result;
}

function showAccount(user) {
  form.hidden = true;
  loginTab.hidden = true;
  registerTab.hidden = true;
  accountPanel.hidden = false;
  accountName.textContent = "Signed in as " + user.name +
    " (" + user.email + ")";
  showMessage("Signed in successfully.", true);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "";

  const data = {
    email: document.getElementById("email").value.trim(),
    password: passwordInput.value
  };

  if (mode === "register") {
    data.name = nameInput.value.trim();

    if (data.password.length < 10) {
      showMessage("Use a password with at least 10 characters.");
      return;
    }
  }

  submitButton.disabled = true;

  try {
    const result = await request(
      mode === "register" ? "/api/register" : "/api/login",
      data
    );

    showAccount(result.user);
  } catch (error) {
    showMessage(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin"
    });

    accountPanel.hidden = true;
    form.hidden = false;
    loginTab.hidden = false;
    registerTab.hidden = false;
    form.reset();
    setMode("login");
    showMessage("You have signed out.", true);
  } catch {
    showMessage("Could not sign out. Please try again.");
  }
});

async function checkSession() {
  try {
    const response = await fetch("/api/me", {
      credentials: "same-origin"
    });

    if (response.ok) {
      const result = await response.json();
      showAccount(result.user);
    }
  } catch {
    // The user can still open the sign-in form.
  }
}

checkSession();
  
