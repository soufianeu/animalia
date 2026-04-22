const API_BASE_URL = (window.__ANIMALIA_API_URL__ || "").trim().replace(/\/+$/, "");

const STATUS_ORDER = ["new", "confirmed", "shipped", "delivered", "cancelled"];
const STATUS_LABELS = {
  new: "Nouveau",
  confirmed: "Confirme",
  shipped: "Expedie",
  delivered: "Livre",
  cancelled: "Annule",
};

const loginCard = document.getElementById("loginCard");
const loginForm = document.getElementById("loginForm");
const adminTokenInput = document.getElementById("adminTokenInput");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const dashboardShell = document.getElementById("dashboardShell");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const dashboardStatus = document.getElementById("dashboardStatus");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const ordersTableBody = document.getElementById("ordersTableBody");
const emptyState = document.getElementById("emptyState");

const statTotal = document.getElementById("statTotal");
const statNew = document.getElementById("statNew");
const statConfirmed = document.getElementById("statConfirmed");
const statDelivered = document.getElementById("statDelivered");

let orders = [];
let adminToken = "";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(element, message, type) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("success", "error");
  if (type) {
    element.classList.add(type);
  }
}

function showLogin() {
  loginCard.hidden = false;
  dashboardShell.hidden = true;
}

function showDashboard() {
  loginCard.hidden = true;
  dashboardShell.hidden = false;
}

function normalizeStatus(status) {
  if (!status || !STATUS_LABELS[status]) {
    return "new";
  }
  return status;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleString("fr-FR");
}

function updateStats(items) {
  const total = items.length;
  const newCount = items.filter((item) => normalizeStatus(item.status) === "new").length;
  const confirmedCount = items.filter(
    (item) => normalizeStatus(item.status) === "confirmed"
  ).length;
  const deliveredCount = items.filter(
    (item) => normalizeStatus(item.status) === "delivered"
  ).length;

  statTotal.textContent = String(total);
  statNew.textContent = String(newCount);
  statConfirmed.textContent = String(confirmedCount);
  statDelivered.textContent = String(deliveredCount);
}

function filteredOrders() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;

  return orders.filter((order) => {
    const status = normalizeStatus(order.status);
    const haystack = [order.fullName, order.phone, order.address, order.message]
      .join(" ")
      .toLowerCase();

    const matchesText = !query || haystack.includes(query);
    const matchesStatus = !selectedStatus || status === selectedStatus;
    return matchesText && matchesStatus;
  });
}

function renderOrders() {
  updateStats(orders);
  const rows = filteredOrders();

  if (!rows.length) {
    ordersTableBody.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  ordersTableBody.innerHTML = rows
    .map((order) => {
      const status = normalizeStatus(order.status);
      const details = [
        `Adresse: ${escapeHtml(order.address || "-")}`,
        `Message: ${escapeHtml(order.message || "-")}`,
      ].join("<br/>");

      const statusOptions = STATUS_ORDER.map((value) => {
        const selected = value === status ? "selected" : "";
        return `<option value="${value}" ${selected}>${STATUS_LABELS[value]}</option>`;
      }).join("");

      return `
        <tr>
          <td>${formatDate(order.createdAt)}</td>
          <td>${escapeHtml(order.fullName || "-")}</td>
          <td>${escapeHtml(order.phone || "-")}</td>
          <td>${escapeHtml(order.product || "-")}</td>
          <td>
            <span class="status-badge status-${status}">${STATUS_LABELS[status]}</span><br/>
            <select class="status-select" data-order-id="${escapeHtml(order.id)}" data-current-status="${status}">
              ${statusOptions}
            </select>
          </td>
          <td>${details}</td>
        </tr>
      `;
    })
    .join("");
}

function clearSession() {
  adminToken = "";
  orders = [];
}

async function apiRequest(path, method, body) {
  if (!API_BASE_URL) {
    throw new Error("API URL not configured. Edit config.js first.");
  }

  if (!adminToken) {
    throw new Error("Secret key is required.");
  }

  const headers = {
    Accept: "application/json",
    "x-admin-token": adminToken,
  };

  const fetchOptions = {
    method,
    headers,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, fetchOptions);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

async function loginWithToken(token, options = {}) {
  const { silent = false } = options;
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    setStatus(loginStatus, "Entrez votre cle secrete.", "error");
    return false;
  }

  adminToken = trimmedToken;
  loginBtn.disabled = true;
  setStatus(loginStatus, "Verification de la cle secrete...", "");

  try {
    const payload = await apiRequest("/orders", "GET");
    orders = Array.isArray(payload.orders) ? payload.orders : [];
    renderOrders();
    showDashboard();
    setStatus(dashboardStatus, `Commandes chargees: ${orders.length}.`, "success");

    if (!silent) {
      setStatus(loginStatus, "", "");
    }
    return true;
  } catch (error) {
    clearSession();
    renderOrders();
    showLogin();
    setStatus(loginStatus, error.message || "Cle secrete invalide.", "error");
    return false;
  } finally {
    loginBtn.disabled = false;
  }
}

async function fetchOrders() {
  if (!adminToken) {
    showLogin();
    setStatus(loginStatus, "Entrez votre cle secrete.", "error");
    return;
  }

  setStatus(dashboardStatus, "Chargement des commandes...", "");
  refreshBtn.disabled = true;
  logoutBtn.disabled = true;

  try {
    const payload = await apiRequest("/orders", "GET");
    orders = Array.isArray(payload.orders) ? payload.orders : [];
    renderOrders();
    setStatus(dashboardStatus, `Commandes chargees: ${orders.length}.`, "success");
  } catch (error) {
    const message = error.message || "Request failed.";
    setStatus(dashboardStatus, message, "error");

    if (message.toLowerCase().includes("unauthorized")) {
      clearSession();
      renderOrders();
      showLogin();
      setStatus(loginStatus, "Session expiree. Entrez la cle secrete.", "error");
    }
  } finally {
    refreshBtn.disabled = false;
    logoutBtn.disabled = false;
  }
}

async function updateOrderStatus(orderId, nextStatus, selectElement) {
  const previousStatus = selectElement.dataset.currentStatus || "new";
  selectElement.disabled = true;

  try {
    const payload = await apiRequest(`/orders/${encodeURIComponent(orderId)}`, "PATCH", {
      status: nextStatus,
    });

    const updatedOrder = payload.order || {};
    orders = orders.map((item) => {
      if (item.id !== orderId) {
        return item;
      }
      return {
        ...item,
        status: normalizeStatus(updatedOrder.status || nextStatus),
      };
    });

    renderOrders();
    setStatus(dashboardStatus, "Statut mis a jour.", "success");
  } catch (error) {
    selectElement.value = previousStatus;
    setStatus(dashboardStatus, error.message || "Request failed.", "error");
  } finally {
    selectElement.disabled = false;
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginWithToken(adminTokenInput.value);
});

refreshBtn.addEventListener("click", () => {
  fetchOrders();
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  adminTokenInput.value = "";
  renderOrders();
  showLogin();
  setStatus(dashboardStatus, "", "");
  setStatus(loginStatus, "Session fermee.", "success");
});

searchInput.addEventListener("input", renderOrders);
statusFilter.addEventListener("change", renderOrders);

ordersTableBody.addEventListener("change", (event) => {
  const selectElement = event.target;
  if (!selectElement.classList.contains("status-select")) {
    return;
  }

  const orderId = selectElement.dataset.orderId;
  const nextStatus = selectElement.value;
  updateOrderStatus(orderId, nextStatus, selectElement);
});

function init() {
  renderOrders();

  if (!API_BASE_URL) {
    loginBtn.disabled = true;
    showLogin();
    setStatus(loginStatus, "API URL not configured. Edit config.js first.", "error");
    return;
  }

  showLogin();
  setStatus(loginStatus, "Entrez la cle secrete pour acceder au dashboard.", "");
}

init();
