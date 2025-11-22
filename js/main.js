// js/main.js

console.log("Bright Bears POS main.js loaded");

/* ============================================================
   FIRESTORE COLLECTIONS – keep app running even if Firebase fails
   ============================================================ */

let itemsCol, preordersCol, extraCol;

try {
  itemsCol = db.collection("items");
  preordersCol = db.collection("preorders");
  extraCol = db.collection("extraOrders");
  console.log("Firestore collections initialised");
} catch (e) {
  console.error("Firestore not initialised. Check firebase-config.js.", e);
}

/* In-memory state */
let items = [];
let preorders = [];
let extraOrders = [];

/* ============================================================
   BASIC NAVIGATION & SIDEBAR
   ============================================================ */

const sections = document.querySelectorAll(".section");
const navButtons = document.querySelectorAll(".nav-btn");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");

function showSection(id) {
  sections.forEach((s) => s.classList.remove("visible"));
  const target = document.getElementById(id);
  if (target) target.classList.add("visible");
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const sectionId = btn.dataset.section;
    if (!sectionId) return;

    showSection(sectionId);

    navButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    if (window.innerWidth <= 900 && sidebar) {
      sidebar.classList.remove("open");
    }
  });
});

if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// Ensure dashboard is visible on load
showSection("dashboard");

/* ============================================================
   GLOBAL HELPERS
   ============================================================ */

function formatCurrency(num) {
  return "R " + (num ? num.toFixed(2) : "0.00");
}

function findItemById(id) {
  return items.find((i) => i.id === id) || null;
}

function calcUsageByItem() {
  const preorderUsage = {};
  const extraUsage = {};

  preorders.forEach((p) => {
    preorderUsage[p.itemId] = (preorderUsage[p.itemId] || 0) + p.quantity;
  });

  extraOrders.forEach((o) => {
    extraUsage[o.itemId] = (extraUsage[o.itemId] || 0) + o.quantity;
  });

  return { preorderUsage, extraUsage };
}

/* ============================================================
   DOM REFERENCES
   ============================================================ */

// Settings
const itemForm = document.getElementById("item-form");
const itemFormReset = document.getElementById("item-form-reset");
const itemsTableBody = document.getElementById("items-table-body");

// Preorders
const preorderDialog = document.getElementById("preorder-dialog");
const preorderForm = document.getElementById("preorder-form");
const preorderCancelBtn = document.getElementById("preorder-cancel-btn");
const btnAddPreorder = document.getElementById("btn-add-preorder");

const preorderIdInput = document.getElementById("preorder-id");
const preorderNameInput = document.getElementById("preorder-name");
const preorderItemSelect = document.getElementById("preorder-item");
const preorderQtyInput = document.getElementById("preorder-qty");
const preorderCostLabel = document.getElementById("preorder-cost");
const preorderWarning = document.getElementById("preorder-stock-warning");

// Extra Orders
const extraDialog = document.getElementById("extra-dialog");
const extraForm = document.getElementById("extra-form");
const extraCancelBtn = document.getElementById("extra-cancel-btn");
const btnAddExtra = document.getElementById("btn-add-extra");

const extraIdInput = document.getElementById("extra-id");
const extraItemSelect = document.getElementById("extra-item");
const extraQtyInput = document.getElementById("extra-qty");
const extraPaymentSelect = document.getElementById("extra-payment");
const extraCostLabel = document.getElementById("extra-cost");
const extraWarning = document.getElementById("extra-stock-warning");

// Dashboard stats
const statTotalItems = document.getElementById("stat-total-items");
const statTotalPreorders = document.getElementById("stat-total-preorders");
const statTotalExtra = document.getElementById("stat-total-extra-orders");
const statPreRemaining = document.getElementById("stat-preorder-remaining");
const statExtraRemaining = document.getElementById("stat-extra-remaining");
const statCouponsGiven = document.getElementById("stat-coupons-given");
const statCouponsRedeemed = document.getElementById("stat-coupons-redeemed");
const statTotalRevenue = document.getElementById("stat-total-revenue");

/* ============================================================
   FIRESTORE LISTENERS (only if collections exist)
   ============================================================ */

if (itemsCol) {
  itemsCol.onSnapshot((snapshot) => {
    items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderItemsTable();
    populateItemSelects();
    updateDashboardStats();
  });
}

if (preordersCol) {
  preordersCol.orderBy("createdAt").onSnapshot((snapshot) => {
    preorders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderPreordersTable();
    updateDashboardStats();
  });
}

if (extraCol) {
  extraCol.orderBy("createdAt").onSnapshot((snapshot) => {
    extraOrders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderExtraTable();
    updateDashboardStats();
  });
}

/* ============================================================
   SETTINGS – ITEMS
   ============================================================ */

if (itemForm && itemsTableBody) {
  itemForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!itemsCol) return alert("Database not ready yet.");

    const id = document.getElementById("item-id").value || null;
    const name = document.getElementById("item-name").value.trim();
    const price = parseFloat(document.getElementById("item-price").value || "0");
    const preorderStock = parseInt(document.getElementById("item-preorder-stock").value || "0", 10);
    const extraStock = parseInt(document.getElementById("item-extra-stock").value || "0", 10);

    const data = { name, price, preorderStock, extraStock };

    try {
      if (id) {
        await itemsCol.doc(id).set(data, { merge: true });
      } else {
        await itemsCol.add(data);
      }
      itemForm.reset();
      document.getElementById("item-id").value = "";
    } catch (err) {
      alert("Error saving item: " + err.message);
    }
  });

  if (itemFormReset) {
    itemFormReset.addEventListener("click", () => {
      itemForm.reset();
      document.getElementById("item-id").value = "";
    });
  }
}

function renderItemsTable() {
  if (!itemsTableBody) return;
  const { preorderUsage, extraUsage } = calcUsageByItem();

  itemsTableBody.innerHTML = "";
  items.forEach((item) => {
    const usedPre = preorderUsage[item.id] || 0;
    const usedExtra = extraUsage[item.id] || 0;

    const remainingPre = item.preorderStock - usedPre;
    const remainingExtra = item.extraStock - usedExtra;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.price.toFixed(2)}</td>
      <td>${item.preorderStock}</td>
      <td>${usedPre}</td>
      <td>${remainingPre}</td>
      <td>${item.extraStock}</td>
      <td>${usedExtra}</td>
      <td>${remainingExtra}</td>
      <td>
        <button class="secondary-btn btn-small" data-action="edit" data-id="${item.id}">Edit</button>
        <button class="secondary-btn btn-small" data-action="delete" data-id="${item.id}">Delete</button>
      </td>
    `;
    itemsTableBody.appendChild(tr);
  });

  itemsTableBody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!itemsCol) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const item = findItemById(id);
      if (!item) return;

      if (action === "edit") {
        document.getElementById("item-id").value = id;
        document.getElementById("item-name").value = item.name;
        document.getElementById("item-price").value = item.price;
        document.getElementById("item-preorder-stock").value = item.preorderStock;
        document.getElementById("item-extra-stock").value = item.extraStock;
      } else if (action === "delete") {
        if (confirm(`Delete item "${item.name}"?`)) {
          await itemsCol.doc(id).delete();
        }
      }
    });
  });
}

/* ============================================================
   PREORDERS – MODAL + TABLE
   ============================================================ */

if (btnAddPreorder && preorderDialog && preorderForm) {
  btnAddPreorder.addEventListener("click", () => openPreorderDialog());
}

if (preorderCancelBtn && preorderDialog && preorderForm) {
  preorderCancelBtn.addEventListener("click", () => {
    preorderForm.reset();
    if (preorderWarning) preorderWarning.textContent = "";
    preorderDialog.close();
  });
}

function openPreorderDialog(existing = null) {
  if (!preorderDialog || !preorderForm) return;
  preorderForm.reset();
  if (preorderWarning) preorderWarning.textContent = "";

  if (preorderIdInput) preorderIdInput.value = existing ? existing.id : "";
  const titleEl = document.getElementById("preorder-dialog-title");
  if (titleEl) titleEl.textContent = existing ? "Edit Preorder" : "Add Preorder";

  if (existing) {
    if (preorderNameInput) preorderNameInput.value = existing.name;
    if (preorderItemSelect) preorderItemSelect.value = existing.itemId;
    if (preorderQtyInput) preorderQtyInput.value = existing.quantity;
    updatePreorderCost();
  } else if (preorderCostLabel) {
    preorderCostLabel.textContent = "R 0.00";
  }

  if (typeof preorderDialog.showModal === "function") {
    preorderDialog.showModal();
  } else {
    alert("Your browser does not support dialogs.");
  }
}

function updatePreorderCost() {
  if (!preorderItemSelect || !preorderQtyInput || !preorderCostLabel) return;
  const item = findItemById(preorderItemSelect.value);
  const qty = parseInt(preorderQtyInput.value || "0", 10);

  if (!item || !qty) {
    preorderCostLabel.textContent = "R 0.00";
    if (preorderWarning) preorderWarning.textContent = "";
    return;
  }

  const { preorderUsage } = calcUsageByItem();
  let usedPre = preorderUsage[item.id] || 0;
  const editingId = preorderIdInput ? preorderIdInput.value : "";

  if (editingId) {
    const existing = preorders.find((p) => p.id === editingId);
    if (existing && existing.itemId === item.id) {
      usedPre -= existing.quantity;
    }
  }

  const remainingBefore = item.preorderStock - usedPre;
  const remainingAfter = remainingBefore - qty;

  preorderCostLabel.textContent = formatCurrency(item.price * qty);

  if (preorderWarning) {
    if (remainingBefore <= 0) {
      preorderWarning.textContent = `No preorder stock left for ${item.name}.`;
    } else if (remainingAfter < 0) {
      preorderWarning.textContent = `Only ${remainingBefore} left. Reduce quantity.`;
    } else {
      preorderWarning.textContent = `Stock before: ${remainingBefore}, after this order: ${remainingAfter}.`;
    }
  }
}

if (preorderItemSelect) preorderItemSelect.addEventListener("change", updatePreorderCost);
if (preorderQtyInput) preorderQtyInput.addEventListener("input", updatePreorderCost);

if (preorderForm) {
  preorderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!preordersCol) return alert("Database not ready yet.");
    if (!preorderItemSelect || !preorderQtyInput || !preorderNameInput) return;

    const id = preorderIdInput ? preorderIdInput.value || null : null;
    const itemId = preorderItemSelect.value;
    const qty = parseInt(preorderQtyInput.value || "0", 10);
    const item = findItemById(itemId);
    if (!item) return alert("Please select an item.");

    const { preorderUsage } = calcUsageByItem();
    let usedPre = preorderUsage[item.id] || 0;

    if (id) {
      const existing = preorders.find((p) => p.id === id);
      if (existing && existing.itemId === item.id) {
        usedPre -= existing.quantity;
      }
    }

    const remainingBefore = item.preorderStock - usedPre;
    if (qty > remainingBefore) {
      return alert(`Not enough preorder stock. Only ${remainingBefore} left.`);
    }

    const data = {
      name: preorderNameInput.value.trim(),
      itemId,
      quantity: qty,
      cost: item.price * qty,
      createdAt: window.firebase
        ? firebase.firestore.FieldValue.serverTimestamp()
        : null,
    };

    try {
      if (id) {
        await preordersCol.doc(id).set(data, { merge: true });
      } else {
        data.couponGiven = false;
        data.couponRedeemed = false;
        await preordersCol.add(data);
      }
      preorderDialog.close();
    } catch (err) {
      alert("Error saving preorder: " + err.message);
    }
  });
}

function renderPreordersTable() {
  const tbody = document.getElementById("preorders-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  let totalValue = 0;

  preorders.forEach((order, index) => {
    totalValue += order.cost || 0;
    const item = findItemById(order.itemId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${order.name}</td>
      <td>${item ? item.name : "?"}</td>
      <td>${order.quantity}</td>
      <td>${(order.cost || 0).toFixed(2)}</td>
      <td>
        <span class="badge-toggle ${order.couponGiven ? "on" : "off"}"
              data-action="toggle-given" data-id="${order.id}">
          ${order.couponGiven ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <span class="badge-toggle ${order.couponRedeemed ? "on" : "off"}"
              data-action="toggle-redeemed" data-id="${order.id}">
          ${order.couponRedeemed ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <button class="secondary-btn btn-small" data-action="edit" data-id="${order.id}">Edit</button>
        <button class="secondary-btn btn-small" data-action="delete" data-id="${order.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const preCount = document.getElementById("preorders-count");
  const preValue = document.getElementById("preorders-value");
  if (preCount) preCount.textContent = preorders.length;
  if (preValue) preValue.textContent = formatCurrency(totalValue);

  tbody.querySelectorAll(".badge-toggle").forEach((badge) => {
    badge.addEventListener("click", async () => {
      if (!preordersCol) return;
      const id = badge.dataset.id;
      const action = badge.dataset.action;
      const order = preorders.find((p) => p.id === id);
      if (!order) return;

      const updates = {};
      if (action === "toggle-given") updates.couponGiven = !order.couponGiven;
      if (action === "toggle-redeemed")
        updates.couponRedeemed = !order.couponRedeemed;

      await preordersCol.doc(id).set(updates, { merge: true });
    });
  });

  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!preordersCol) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const order = preorders.find((p) => p.id === id);
      if (!order) return;

      if (action === "edit") {
        openPreorderDialog(order);
      } else if (action === "delete") {
        if (confirm("Delete this preorder?")) {
          await preordersCol.doc(id).delete();
        }
      }
    });
  });
}

/* ============================================================
   EXTRA ORDERS – MODAL + TABLE
   ============================================================ */

if (btnAddExtra && extraDialog && extraForm) {
  btnAddExtra.addEventListener("click", () => openExtraDialog());
}

if (extraCancelBtn && extraDialog && extraForm) {
  extraCancelBtn.addEventListener("click", () => {
    extraForm.reset();
    if (extraWarning) extraWarning.textContent = "";
    extraDialog.close();
  });
}

function openExtraDialog(existing = null) {
  if (!extraDialog || !extraForm) return;
  extraForm.reset();
  if (extraWarning) extraWarning.textContent = "";

  if (extraIdInput) extraIdInput.value = existing ? existing.id : "";
  const titleEl = document.getElementById("extra-dialog-title");
  if (titleEl) titleEl.textContent = existing ? "Edit Extra Order" : "Add Extra Order";

  if (existing) {
    if (extraItemSelect) extraItemSelect.value = existing.itemId;
    if (extraQtyInput) extraQtyInput.value = existing.quantity;
    if (extraPaymentSelect) extraPaymentSelect.value = existing.paymentMethod;
    updateExtraCost();
  } else if (extraCostLabel) {
    extraCostLabel.textContent = "R 0.00";
  }

  if (typeof extraDialog.showModal === "function") {
    extraDialog.showModal();
  } else {
    alert("Your browser does not support dialogs.");
  }
}

function updateExtraCost() {
  if (!extraItemSelect || !extraQtyInput || !extraCostLabel) return;
  const item = findItemById(extraItemSelect.value);
  const qty = parseInt(extraQtyInput.value || "0", 10);

  if (!item || !qty) {
    extraCostLabel.textContent = "R 0.00";
    if (extraWarning) extraWarning.textContent = "";
    return;
  }

  const { extraUsage } = calcUsageByItem();
  let usedExtra = extraUsage[item.id] || 0;
  const editingId = extraIdInput ? extraIdInput.value : "";

  if (editingId) {
    const existing = extraOrders.find((o) => o.id === editingId);
    if (existing && existing.itemId === item.id) {
      usedExtra -= existing.quantity;
    }
  }

  const remainingBefore = item.extraStock - usedExtra;
  const remainingAfter = remainingBefore - qty;

  extraCostLabel.textContent = formatCurrency(item.price * qty);

  if (extraWarning) {
    if (remainingBefore <= 0) {
      extraWarning.textContent = `No extra stock left for ${item.name}.`;
    } else if (remainingAfter < 0) {
      extraWarning.textContent = `Only ${remainingBefore} left. Reduce quantity.`;
    } else {
      extraWarning.textContent = `Stock before: ${remainingBefore}, after this order: ${remainingAfter}.`;
    }
  }
}

if (extraItemSelect) extraItemSelect.addEventListener("change", updateExtraCost);
if (extraQtyInput) extraQtyInput.addEventListener("input", updateExtraCost);

if (extraForm) {
  extraForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!extraCol) return alert("Database not ready yet.");
    if (!extraItemSelect || !extraQtyInput || !extraPaymentSelect) return;

    const id = extraIdInput ? extraIdInput.value || null : null;
    const itemId = extraItemSelect.value;
    const qty = parseInt(extraQtyInput.value || "0", 10);
    const payment = extraPaymentSelect.value;
    const item = findItemById(itemId);
    if (!item) return alert("Please select an item.");

    const { extraUsage } = calcUsageByItem();
    let usedExtra = extraUsage[item.id] || 0;

    if (id) {
      const existing = extraOrders.find((o) => o.id === id);
      if (existing && existing.itemId === item.id) {
        usedExtra -= existing.quantity;
      }
    }

    const remainingBefore = item.extraStock - usedExtra;
    if (qty > remainingBefore) {
      return alert(`Not enough extra stock. Only ${remainingBefore} left.`);
    }

    const data = {
      itemId,
      quantity: qty,
      paymentMethod: payment,
      cost: item.price * qty,
      createdAt: window.firebase
        ? firebase.firestore.FieldValue.serverTimestamp()
        : null,
    };

    try {
      if (id) {
        await extraCol.doc(id).set(data, { merge: true });
      } else {
        data.paid = false;
        await extraCol.add(data);
      }
      extraDialog.close();
    } catch (err) {
      alert("Error saving extra order: " + err.message);
    }
  });
}

function renderExtraTable() {
  const tbody = document.getElementById("extra-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  let totalValue = 0;

  extraOrders.forEach((order, index) => {
    totalValue += order.cost || 0;
    const item = findItemById(order.itemId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${item ? item.name : "?"}</td>
      <td>${order.quantity}</td>
      <td>${(order.cost || 0).toFixed(2)}</td>
      <td>${order.paymentMethod}</td>
      <td>
        <span class="badge-toggle ${order.paid ? "on" : "off"}"
              data-action="toggle-paid" data-id="${order.id}">
          ${order.paid ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <button class="secondary-btn btn-small" data-action="edit" data-id="${order.id}">Edit</button>
        <button class="secondary-btn btn-small" data-action="delete" data-id="${order.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const extraCount = document.getElementById("extra-count");
  const extraValue = document.getElementById("extra-value");
  if (extraCount) extraCount.textContent = extraOrders.length;
  if (extraValue) extraValue.textContent = formatCurrency(totalValue);

  tbody.querySelectorAll(".badge-toggle").forEach((badge) => {
    badge.addEventListener("click", async () => {
      if (!extraCol) return;
      const id = badge.dataset.id;
      const order = extraOrders.find((o) => o.id === id);
      if (!order) return;
      await extraCol.doc(id).set({ paid: !order.paid }, { merge: true });
    });
  });

  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!extraCol) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const order = extraOrders.find((o) => o.id === id);
      if (!order) return;

      if (action === "edit") {
        openExtraDialog(order);
      } else if (action === "delete") {
        if (confirm("Delete this extra order?")) {
          await extraCol.doc(id).delete();
        }
      }
    });
  });
}

/* ============================================================
   DROPDOWNS + DASHBOARD STATS
   ============================================================ */

function populateItemSelects() {
  const selects = [preorderItemSelect, extraItemSelect];
  selects.forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Select item --";
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);

    items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = `${item.name} (R${item.price.toFixed(2)})`;
      sel.appendChild(opt);
    });
  });
}

function updateDashboardStats() {
  if (
    !statTotalItems ||
    !statTotalPreorders ||
    !statTotalExtra ||
    !statPreRemaining ||
    !statExtraRemaining ||
    !statCouponsGiven ||
    !statCouponsRedeemed ||
    !statTotalRevenue
  ) {
    return;
  }

  const { preorderUsage, extraUsage } = calcUsageByItem();
  let preorderRemaining = 0;
  let extraRemaining = 0;
  let totalRevenue = 0;
  let couponsGiven = 0;
  let couponsRedeemed = 0;

  items.forEach((item) => {
    preorderRemaining += Math.max(item.preorderStock - (preorderUsage[item.id] || 0), 0);
    extraRemaining += Math.max(item.extraStock - (extraUsage[item.id] || 0), 0);
  });

  preorders.forEach((p) => {
    totalRevenue += p.cost || 0;
    if (p.couponGiven) couponsGiven++;
    if (p.couponRedeemed) couponsRedeemed++;
  });

  extraOrders.forEach((o) => {
    totalRevenue += o.cost || 0;
  });

  statTotalItems.textContent = items.length;
  statTotalPreorders.textContent = preorders.length;
  statTotalExtra.textContent = extraOrders.length;
  statPreRemaining.textContent = preorderRemaining;
  statExtraRemaining.textContent = extraRemaining;
  statCouponsGiven.textContent = couponsGiven;
  statCouponsRedeemed.textContent = couponsRedeemed;
  statTotalRevenue.textContent = formatCurrency(totalRevenue);
}
