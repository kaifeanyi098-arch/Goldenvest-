
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
  
const dashboardMessage = document.getElementById("dashboardMessage");
const accountBalance = document.getElementById("accountBalance");
const transactionList = document.getElementById("transactionList");
const requestPanel = document.getElementById("requestPanel");
const requestForm = document.getElementById("requestForm");
let requestType = "deposit";

async function loadDashboard() {
  try {
    const response = await fetch("/api/me", {
      credentials: "same-origin"
    });

    if (!response.ok) return;

    const data = await response.json();

    const balance = Number(data.ledger?.reduce((total, entry) => {
      const amount = Number(entry.amount) || 0;
      return total + (entry.entry_type === "debit" ? -amount : amount);
    }, 0) ?? 0);

    if (accountBalance) {
      accountBalance.textContent = "₦" + balance.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    if (transactionList) {
      transactionList.replaceChildren();

      if (!data.transactions?.length) {
        transactionList.textContent = "No test transactions yet.";
      } else {
        data.transactions.forEach(tx => {
          const item = document.createElement("p");
          item.textContent =
            `${tx.type.replaceAll("_", " ")} — ${tx.currency} ${tx.amount} — ${tx.status}`;
          transactionList.appendChild(item);
        });
      }
    }
  } catch (error) {
    if (dashboardMessage) {
      dashboardMessage.textContent = "Could not load dashboard information.";
    }
  }
}

document.getElementById("showDepositButton")?.addEventListener("click", () => {
  requestType = "deposit";
  document.getElementById("requestTitle").textContent = "Test deposit request";
  document.getElementById("depositMethodField").hidden = false;
  document.getElementById("withdrawalMethodField").hidden = true;
  document.getElementById("requestDetails").required = false;
  requestPanel.hidden = false;
});

document.getElementById("showWithdrawalButton")?.addEventListener("click", () => {
  requestType = "withdrawal";
  document.getElementById("requestTitle").textContent = "Test withdrawal request";
  document.getElementById("depositMethodField").hidden = true;
  document.getElementById("withdrawalMethodField").hidden = false;
  document.getElementById("requestDetails").required = true;
  requestPanel.hidden = false;
});

document.getElementById("cancelRequestButton")?.addEventListener("click", () => {
  requestPanel.hidden = true;
  requestForm.reset();
});

requestForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const amount = Number(document.getElementById("requestAmount").value);
  const details = document.getElementById("requestDetails").value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    dashboardMessage.textContent = "Enter a valid amount.";
    return;
  }

  let endpoint;
  let payload;

  if (requestType === "deposit") {
    const method = document.getElementById("depositMethod").value;
    if (method === "bitcoin_deposit" && !details) {
      dashboardMessage.textContent = "Enter a test note for this request.";
      return;
    }
    endpoint = "/api/deposit-request";
    payload = { amount, method, reference: details };
  } else {
    endpoint = "/api/withdrawal-request";
    payload = {
      amount,
      method: document.getElementById("withdrawalMethod").value,
      details
    };
  }

  const submit = document.getElementById("requestSubmit");
  submit.disabled = true;

  try {
    const result = await request(endpoint, payload);
    dashboardMessage.textContent = result.message;
    requestPanel.hidden = true;
    requestForm.reset();
    await loadDashboard();
  } catch (error) {
    dashboardMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

const originalShowAccount = showAccount;
showAccount = function(user) {
  originalShowAccount(user);
  loadDashboard();
};
    
