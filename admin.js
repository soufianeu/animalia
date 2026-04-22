const API_BASE_URL = (window.__ANIMALIA_API_URL__ || "").trim().replace(/\/+$/, "");
const TOKEN_STORAGE_KEY = "animalia_admin_token";

const STATUS_ORDER = ["new", "confirmed", "shipped", "delivered", "cancelled"];
const STATUS_LABELS = {
  new: "Nouveau",
  confirmed: "Confirme",
  shipped: "Expedie",
  delivered: "Livre",
  cancelled: "Annule",
};

const apiUrlInput = document.getElementById("apiUrl");
const adminTokenInput = document.getElementById("adminToken");
const connectBtn = document.getElementById("connectBtn");
const refreshBtn = document.getElementById("refreshBtn");
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

function setDashboardStatus(message, type) {
  dashboardStatus.textContent = message;
  dashboardStatus.classList.remove("success", "error");
  if (type) {
    dashboardStatus.classList.add(type);
  }
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

async function apiRequest(path, method, body) {
  if (!API_BASE_URL) {
    throw new Error("API URL not configured. Edit config.js first.");
  }

  if (!adminToken) {
    throw new Error("Admin token is required.");
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

async function fetchOrders() {
  if (!adminToken) {
    setDashboardStatus("Entrez un token admin pour continuer.", "error");
    return;
  }

  setDashboardStatus("Chargement des commandes...", "");
  connectBtn.disabled = true;
  refreshBtn.disabled = true;

  try {
    const payload = await apiRequest("/orders", "GET");
    orders = Array.isArray(payload.orders) ? payload.orders : [];
    renderOrders();
    setDashboardStatus(`Commandes chargees: ${orders.length}.`, "success");
  } catch (error) {
    setDashboardStatus(error.message, "error");
  } finally {
    connectBtn.disabled = false;
    refreshBtn.disabled = false;
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
    setDashboardStatus("Statut mis a jour.", "success");
  } catch (error) {
    selectElement.value = previousStatus;
    setDashboardStatus(error.message, "error");
  } finally {
    selectElement.disabled = false;
  }
}

connectBtn.addEventListener("click", () => {
  adminToken = adminTokenInput.value.trim();
  localStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
  fetchOrders();
});

refreshBtn.addEventListener("click", () => {
  adminToken = adminTokenInput.value.trim();
  fetchOrders();
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
  apiUrlInput.value = API_BASE_URL || "Not configured in config.js";
  adminToken = localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  adminTokenInput.value = adminToken;

  if (!API_BASE_URL) {
    connectBtn.disabled = true;
    refreshBtn.disabled = true;
    setDashboardStatus("Set window.__ANIMALIA_API_URL__ in config.js.", "error");
    renderOrders();
    return;
  }

  renderOrders();
  if (adminToken) {
    fetchOrders();
  } else {
    setDashboardStatus("Entrez votre token admin, puis cliquez Connecter.", "");
  }
}

init();
