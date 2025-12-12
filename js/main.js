// js/main.js
console.log("Bright Bears POS main.js loaded");

/* ============================================================
   GLOBAL SECTION SWITCHER (used by sidebar buttons)
   ============================================================ */
function switchSection(sectionId, btnEl) {
  const sections = document.querySelectorAll(".section");
  sections.forEach((s) => s.classList.remove("visible"));
  const target = document.getElementById(sectionId);
  if (target) target.classList.add("visible");

  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
}

// Show dashboard by default
switchSection("dashboard");

/* ============================================================
   FIRESTORE COLLECTIONS
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

/* Draft line items for current dialogs */
let preorderDraftItems = []; // [{itemId, quantity, cost}]
let extraDraftItems = [];

// For stock checks while editing
let currentPreorderEditingId = null;
let currentExtraEditingId = null;

/* ============================================================
   HELPERS
   ============================================================ */
function formatCurrency(num) {
  return "R " + (num ? num.toFixed(2) : "0.00");
}

function findItemById(id) {
  return items.find((i) => i.id === id) || null;
}

// Support both new multi-item orders and old single-item shape
function getPreorderLines(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  if (order.itemId) {
    return [
      {
        itemId: order.itemId,
        quantity: order.quantity,
        cost: order.cost || 0,
      },
    ];
  }
  return [];
}

function getExtraLines(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  if (order.itemId) {
    return [
      {
        itemId: order.itemId,
        quantity: order.quantity,
        cost: order.cost || 0,
      },
    ];
  }
  return [];
}

function calcUsageByItem() {
  const preorderUsage = {};
  const extraUsage = {};

  preorders.forEach((p) => {
    getPreorderLines(p).forEach((li) => {
      preorderUsage[li.itemId] = (preorderUsage[li.itemId] || 0) + li.quantity;
    });
  });

  extraOrders.forEach((o) => {
    getExtraLines(o).forEach((li) => {
      extraUsage[li.itemId] = (extraUsage[li.itemId] || 0) + li.quantity;
    });
  });

  return { preorderUsage, extraUsage };
}

/* Stock check helpers for adding lines into draft orders */
function checkPreorderStock(itemId, qtyToAdd) {
  const item = findItemById(itemId);
  if (!item) return { ok: false, msg: "Item not found" };

  const { preorderUsage } = calcUsageByItem();
  let used = preorderUsage[itemId] || 0;

  // Remove current order's existing usage when editing
  if (currentPreorderEditingId) {
    const existing = preorders.find((p) => p.id === currentPreorderEditingId);
    if (existing) {
      getPreorderLines(existing).forEach((li) => {
        if (li.itemId === itemId) used -= li.quantity;
      });
    }
  }

  // Include items already in draft
  preorderDraftItems.forEach((li) => {
    if (li.itemId === itemId) used += li.quantity;
  });

  const before = item.preorderStock - used;
  const after = before - qtyToAdd;

  if (before <= 0)
    return { ok: false, msg: `No preorder stock left for ${item.name}.` };
  if (after < 0)
    return {
      ok: false,
      msg: `Only ${before} preorder stock left for ${item.name}.`,
    };

  return { ok: true, before, after };
}

function checkExtraStock(itemId, qtyToAdd) {
  const item = findItemById(itemId);
  if (!item) return { ok: false, msg: "Item not found" };

  const { extraUsage } = calcUsageByItem();
  let used = extraUsage[itemId] || 0;

  if (currentExtraEditingId) {
    const existing = extraOrders.find((o) => o.id === currentExtraEditingId);
    if (existing) {
      getExtraLines(existing).forEach((li) => {
        if (li.itemId === itemId) used -= li.quantity;
      });
    }
  }

  extraDraftItems.forEach((li) => {
    if (li.itemId === itemId) used += li.quantity;
  });

  const before = item.extraStock - used;
  const after = before - qtyToAdd;

  if (before <= 0)
    return { ok: false, msg: `No extra stock left for ${item.name}.` };
  if (after < 0)
    return {
      ok: false,
      msg: `Only ${before} extra stock left for ${item.name}.`,
    };

  return { ok: true, before, after };
}

/* ============================================================
   DOM REFERENCES
   ============================================================ */
// Sidebar toggle
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

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
const preorderAddLineBtn = document.getElementById("preorder-add-line-btn");
const preorderItemsBody = document.getElementById("preorder-items-body");
const preorderCostLabel = document.getElementById("preorder-cost");
const preorderWarning = document.getElementById("preorder-stock-warning");

// Extra orders
const extraDialog = document.getElementById("extra-dialog");
const extraForm = document.getElementById("extra-form");
const extraCancelBtn = document.getElementById("extra-cancel-btn");
const btnAddExtra = document.getElementById("btn-add-extra");
const extraIdInput = document.getElementById("extra-id");
const extraItemSelect = document.getElementById("extra-item");
const extraQtyInput = document.getElementById("extra-qty");
const extraAddLineBtn = document.getElementById("extra-add-line-btn");
const extraPaymentSelect = document.getElementById("extra-payment");
const extraItemsBody = document.getElementById("extra-items-body");
const extraCostLabel = document.getElementById("extra-cost");
const extraWarning = document.getElementById("extra-stock-warning");

// Dashboard stats
const statTotalItems = document.getElementById("stat-total-items");
const statTotalPreorders = document.getElementById("stat-total-preorders");
const statTotalExtra = document.getElementById("stat-total-extra-orders");
const statPreRemaining = document.getElementById("stat-preorder-remaining");
const statExtraRemaining = document.getElementById("stat-extra-remaining");
const statCouponsGiven = document.getElementById("stat-coupons-given");
const statCouponsRedeemed = document.getElementById(
  "stat-coupons-redeemed"
);
const statTotalRevenue = document.getElementById("stat-total-revenue");

/* ============================================================
   FIRESTORE LISTENERS
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
    const price = parseFloat(
      document.getElementById("item-price").value || "0"
    );
    const preorderStock = parseInt(
      document.getElementById("item-preorder-stock").value || "0",
      10
    );
    const extraStock = parseInt(
      document.getElementById("item-extra-stock").value || "0",
      10
    );

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
        document.getElementById("item-preorder-stock").value =
          item.preorderStock;
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
   POPULATE ITEM SELECTS (for dialogs)
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

/* ============================================================
   PREORDERS – MODAL & TABLE
   ============================================================ */
if (btnAddPreorder && preorderDialog && preorderForm) {
  btnAddPreorder.addEventListener("click", () => openPreorderDialog());
}

if (preorderCancelBtn) {
  preorderCancelBtn.addEventListener("click", () => {
    preorderForm.reset();
    preorderDraftItems = [];
    currentPreorderEditingId = null;
    if (preorderItemsBody) preorderItemsBody.innerHTML = "";
    if (preorderCostLabel) preorderCostLabel.textContent = "R 0.00";
    if (preorderWarning) preorderWarning.textContent = "";
    preorderDialog.close();
  });
}

if (preorderAddLineBtn) {
  preorderAddLineBtn.addEventListener("click", () => {
    if (!preorderItemSelect || !preorderQtyInput) return;
    const itemId = preorderItemSelect.value;
    const qty = parseInt(preorderQtyInput.value || "0", 10);
    if (!itemId || !qty || qty <= 0) {
      alert("Select an item and quantity.");
      return;
    }

    const check = checkPreorderStock(itemId, qty);
    if (!check.ok) {
      alert(check.msg);
      return;
    }

    const item = findItemById(itemId);
    const cost = (item ? item.price : 0) * qty;

    preorderDraftItems.push({ itemId, quantity: qty, cost });
    preorderQtyInput.value = "";
    renderPreorderDraftLines();

    if (preorderWarning && check.before !== undefined) {
      preorderWarning.textContent = `Stock before: ${check.before}, after this line: ${check.after}`;
    }
  });
}

function renderPreorderDraftLines() {
  if (!preorderItemsBody || !preorderCostLabel) return;

  preorderItemsBody.innerHTML = "";
  let total = 0;

  preorderDraftItems.forEach((li, idx) => {
    const item = findItemById(li.itemId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${item ? item.name : "?"}</td>
      <td>${li.quantity}</td>
      <td>${li.cost.toFixed(2)}</td>
      <td>
        <button type="button" class="secondary-btn btn-small" data-index="${idx}">
          Remove
        </button>
      </td>
    `;
    preorderItemsBody.appendChild(tr);
    total += li.cost;
  });

  preorderCostLabel.textContent = formatCurrency(total);

  preorderItemsBody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      preorderDraftItems.splice(idx, 1);
      renderPreorderDraftLines();
    });
  });
}

function openPreorderDialog(existing = null) {
  if (!preorderDialog || !preorderForm) return;
  preorderForm.reset();
  preorderDraftItems = [];
  currentPreorderEditingId = null;
  if (preorderWarning) preorderWarning.textContent = "";
  if (preorderItemsBody) preorderItemsBody.innerHTML = "";
  if (preorderCostLabel) preorderCostLabel.textContent = "R 0.00";

  if (existing) {
    currentPreorderEditingId = existing.id;
    if (preorderIdInput) preorderIdInput.value = existing.id;
    if (preorderNameInput) preorderNameInput.value = existing.name || "";

    preorderDraftItems = getPreorderLines(existing).map((li) => {
      const item = findItemById(li.itemId);
      const price = item ? item.price : 0;
      const cost = li.cost != null ? li.cost : price * li.quantity;
      return { itemId: li.itemId, quantity: li.quantity, cost };
    });

    renderPreorderDraftLines();
    const titleEl = document.getElementById("preorder-dialog-title");
    if (titleEl) titleEl.textContent = "Edit Preorder";
  } else {
    currentPreorderEditingId = null;
    if (preorderIdInput) preorderIdInput.value = "";
    const titleEl = document.getElementById("preorder-dialog-title");
    if (titleEl) titleEl.textContent = "Add Preorder";
  }

  if (typeof preorderDialog.showModal === "function") {
    preorderDialog.showModal();
  } else {
    alert("Your browser does not support dialogs.");
  }
}

if (preorderForm) {
  preorderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!preordersCol) return alert("Database not ready yet.");
    if (!preorderNameInput) return;

    if (!preorderDraftItems.length) {
      alert("Add at least one item to the order.");
      return;
    }

    const id = preorderIdInput ? preorderIdInput.value || null : null;

    const total = preorderDraftItems.reduce((sum, li) => sum + li.cost, 0);

    const data = {
      name: preorderNameInput.value.trim(),
      items: preorderDraftItems.map((li) => ({
        itemId: li.itemId,
        quantity: li.quantity,
        cost: li.cost,
      })),
      cost: total,
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
    const lines = getPreorderLines(order);
    let totalQty = 0;
    const parts = [];

    lines.forEach((li) => {
      const item = findItemById(li.itemId);
      const name = item ? item.name : "?";
      totalQty += li.quantity;
      parts.push(`${li.quantity}× ${name}`);
    });

    const summary = parts.join(", ");
    const cost =
      order.cost || lines.reduce((sum, li) => sum + (li.cost || 0), 0);
    totalValue += cost;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${order.name || ""}</td>
      <td>${summary}</td>
      <td>${totalQty}</td>
      <td>${cost.toFixed(2)}</td>
      <td>
        <span class="badge-toggle ${
          order.couponGiven ? "on" : "off"
        }" data-action="toggle-given" data-id="${order.id}">
          ${order.couponGiven ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <span class="badge-toggle ${
          order.couponRedeemed ? "on" : "off"
        }" data-action="toggle-redeemed" data-id="${order.id}">
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

  // toggles
  tbody.querySelectorAll(".badge-toggle").forEach((badge) => {
    badge.addEventListener("click", async () => {
      if (!preordersCol) return;
      const id = badge.dataset.id;
      const action = badge.dataset.action;
      const order = preorders.find((p) => p.id === id);
      if (!order) return;

      const updates = {};
      if (action === "toggle-given")
        updates.couponGiven = !order.couponGiven;
      if (action === "toggle-redeemed")
        updates.couponRedeemed = !order.couponRedeemed;

      await preordersCol.doc(id).set(updates, { merge: true });
    });
  });

  // edit/delete
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
   EXTRA ORDERS – MODAL & TABLE
   ============================================================ */
if (btnAddExtra && extraDialog && extraForm) {
  btnAddExtra.addEventListener("click", () => openExtraDialog());
}

if (extraCancelBtn) {
  extraCancelBtn.addEventListener("click", () => {
    extraForm.reset();
    extraDraftItems = [];
    currentExtraEditingId = null;
    if (extraItemsBody) extraItemsBody.innerHTML = "";
    if (extraCostLabel) extraCostLabel.textContent = "R 0.00";
    if (extraWarning) extraWarning.textContent = "";
    extraDialog.close();
  });
}

if (extraAddLineBtn) {
  extraAddLineBtn.addEventListener("click", () => {
    if (!extraItemSelect || !extraQtyInput) return;
    const itemId = extraItemSelect.value;
    const qty = parseInt(extraQtyInput.value || "0", 10);
    if (!itemId || !qty || qty <= 0) {
      alert("Select an item and quantity.");
      return;
    }

    const check = checkExtraStock(itemId, qty);
    if (!check.ok) {
      alert(check.msg);
      return;
    }

    const item = findItemById(itemId);
    const cost = (item ? item.price : 0) * qty;

    extraDraftItems.push({ itemId, quantity: qty, cost });
    extraQtyInput.value = "";
    renderExtraDraftLines();

    if (extraWarning && check.before !== undefined) {
      extraWarning.textContent = `Stock before: ${check.before}, after this line: ${check.after}`;
    }
  });
}

function renderExtraDraftLines() {
  if (!extraItemsBody || !extraCostLabel) return;

  extraItemsBody.innerHTML = "";
  let total = 0;

  extraDraftItems.forEach((li, idx) => {
    const item = findItemById(li.itemId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${item ? item.name : "?"}</td>
      <td>${li.quantity}</td>
      <td>${li.cost.toFixed(2)}</td>
      <td>
        <button type="button" class="secondary-btn btn-small" data-index="${idx}">
          Remove
        </button>
      </td>
    `;
    extraItemsBody.appendChild(tr);
    total += li.cost;
  });

  extraCostLabel.textContent = formatCurrency(total);

  extraItemsBody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      extraDraftItems.splice(idx, 1);
      renderExtraDraftLines();
    });
  });
}

function openExtraDialog(existing = null) {
  if (!extraDialog || !extraForm) return;
  extraForm.reset();
  extraDraftItems = [];
  currentExtraEditingId = null;
  if (extraWarning) extraWarning.textContent = "";
  if (extraItemsBody) extraItemsBody.innerHTML = "";
  if (extraCostLabel) extraCostLabel.textContent = "R 0.00";

  if (existing) {
    currentExtraEditingId = existing.id;
    if (extraIdInput) extraIdInput.value = existing.id;
    if (extraPaymentSelect)
      extraPaymentSelect.value = existing.paymentMethod || "Cash";

    extraDraftItems = getExtraLines(existing).map((li) => {
      const item = findItemById(li.itemId);
      const price = item ? item.price : 0;
      const cost = li.cost != null ? li.cost : price * li.quantity;
      return { itemId: li.itemId, quantity: li.quantity, cost };
    });

    renderExtraDraftLines();
    const titleEl = document.getElementById("extra-dialog-title");
    if (titleEl) titleEl.textContent = "Edit Extra Order";
  } else {
    currentExtraEditingId = null;
    if (extraIdInput) extraIdInput.value = "";
    const titleEl = document.getElementById("extra-dialog-title");
    if (titleEl) titleEl.textContent = "Add Extra Order";
  }

  if (typeof extraDialog.showModal === "function") {
    extraDialog.showModal();
  } else {
    alert("Your browser does not support dialogs.");
  }
}

if (extraForm) {
  extraForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!extraCol) return alert("Database not ready yet.");
    if (!extraPaymentSelect) return;

    if (!extraDraftItems.length) {
      alert("Add at least one item to the order.");
      return;
    }

    const id = extraIdInput ? extraIdInput.value || null : null;
    const total = extraDraftItems.reduce((sum, li) => sum + li.cost, 0);
    const payment = extraPaymentSelect.value;

    const data = {
      items: extraDraftItems.map((li) => ({
        itemId: li.itemId,
        quantity: li.quantity,
        cost: li.cost,
      })),
      cost: total,
      paymentMethod: payment,
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
    const lines = getExtraLines(order);
    let totalQty = 0;
    const parts = [];

    lines.forEach((li) => {
      const item = findItemById(li.itemId);
      const name = item ? item.name : "?";
      totalQty += li.quantity;
      parts.push(`${li.quantity}× ${name}`);
    });

    const summary = parts.join(", ");
    const cost =
      order.cost || lines.reduce((sum, li) => sum + (li.cost || 0), 0);
    totalValue += cost;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${summary}</td>
      <td>${totalQty}</td>
      <td>${cost.toFixed(2)}</td>
      <td>${order.paymentMethod || ""}</td>
      <td>
        <span class="badge-toggle ${
          order.paid ? "on" : "off"
        }" data-action="toggle-paid" data-id="${order.id}">
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

  // toggle paid
  tbody.querySelectorAll(".badge-toggle").forEach((badge) => {
    badge.addEventListener("click", async () => {
      if (!extraCol) return;
      const id = badge.dataset.id;
      const order = extraOrders.find((o) => o.id === id);
      if (!order) return;
      await extraCol.doc(id).set({ paid: !order.paid }, { merge: true });
    });
  });

  // edit / delete
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
   DASHBOARD STATS + CHARTS
   ============================================================ */
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
    preorderRemaining += Math.max(
      item.preorderStock - (preorderUsage[item.id] || 0),
      0
    );
    extraRemaining += Math.max(
      item.extraStock - (extraUsage[item.id] || 0),
      0
    );
  });

  preorders.forEach((p) => {
    const cost =
      p.cost ||
      getPreorderLines(p).reduce((sum, li) => sum + (li.cost || 0), 0);
    totalRevenue += cost;
    if (p.couponGiven) couponsGiven++;
    if (p.couponRedeemed) couponsRedeemed++;
  });

  extraOrders.forEach((o) => {
    const cost =
      o.cost || getExtraLines(o).reduce((sum, li) => sum + (li.cost || 0), 0);
    totalRevenue += cost;
  });

  statTotalItems.textContent = items.length;
  statTotalPreorders.textContent = preorders.length;
  statTotalExtra.textContent = extraOrders.length;
  statPreRemaining.textContent = preorderRemaining;
  statExtraRemaining.textContent = extraRemaining;
  statCouponsGiven.textContent = couponsGiven;
  statCouponsRedeemed.textContent = couponsRedeemed;
  statTotalRevenue.textContent = formatCurrency(totalRevenue);

  updateDashboardCharts();
}

function updateDashboardCharts() {
  // Preorders by item (qty)
  const preByItem = {};
  preorders.forEach((p) => {
    getPreorderLines(p).forEach((li) => {
      preByItem[li.itemId] = (preByItem[li.itemId] || 0) + li.quantity;
    });
  });
  const preData = Object.entries(preByItem).map(([itemId, qty]) => ({
    label: (findItemById(itemId) || { name: "Item" }).name,
    value: qty,
  }));
  renderBarChart("chart-preorders-items", preData);

  // Extra orders by item (qty)
  const extraByItem = {};
  extraOrders.forEach((o) => {
    getExtraLines(o).forEach((li) => {
      extraByItem[li.itemId] = (extraByItem[li.itemId] || 0) + li.quantity;
    });
  });
  const extraData = Object.entries(extraByItem).map(([itemId, qty]) => ({
    label: (findItemById(itemId) || { name: "Item" }).name,
    value: qty,
  }));
  renderBarChart("chart-extra-items", extraData);

  // Revenue split: preorders vs extra orders
  let preRevenue = 0;
  let extraRevenue = 0;

  preorders.forEach((p) => {
    const cost =
      p.cost ||
      getPreorderLines(p).reduce((sum, li) => sum + (li.cost || 0), 0);
    preRevenue += cost;
  });

  extraOrders.forEach((o) => {
    const cost =
      o.cost ||
      getExtraLines(o).reduce((sum, li) => sum + (li.cost || 0), 0);
    extraRevenue += cost;
  });

  renderBarChart("chart-revenue-split", [
    { label: "Preorders", value: preRevenue },
    { label: "Extra Orders", value: extraRevenue },
  ]);
}

function renderBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";
  if (!data.length) {
    container.innerHTML = '<p class="chart-empty">No data yet</p>';
    return;
  }

  const max = Math.max(...data.map((d) => d.value)) || 1;

  data.forEach((d) => {
    const row = document.createElement("div");
    row.className = "bar-chart-row";

    const label = document.createElement("span");
    label.className = "bar-chart-label";
    label.textContent = d.label;

    const wrap = document.createElement("div");
    wrap.className = "bar-chart-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "bar-chart-bar";
    bar.style.width = `${(d.value / max) * 100}%`;

    wrap.appendChild(bar);

    const value = document.createElement("span");
    value.className = "bar-chart-value";
    value.textContent = d.value;

    row.appendChild(label);
    row.appendChild(wrap);
    row.appendChild(value);

    container.appendChild(row);
  });
}
