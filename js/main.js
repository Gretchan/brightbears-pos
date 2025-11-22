/**********************************************************************
 *  BRIGHT BEARS TUCKSHOP POS – MAIN LOGIC (FULL VERSION)
 *  - Menu navigation fixed
 *  - Firestore defensive load (prevents app freeze)
 *  - Modals: Cancel working
 *  - Edit buttons working
 *  - Text buttons instead of icons
 *  - Sidebar toggle working
 **********************************************************************/

/* ============================================================
   FIRESTORE COLLECTIONS – Defensive so JS doesn't crash
   ============================================================ */

let itemsCol, preordersCol, extraCol;

try {
  itemsCol = db.collection("items");
  preordersCol = db.collection("preorders");
  extraCol = db.collection("extraOrders");
} catch (e) {
  console.error("❌ Firestore not initialised. Check firebase-config.js.", e);
}

/* In-memory state */
let items = [];
let preorders = [];
let extraOrders = [];

/* ============================================================
   SIDEBAR + NAVIGATION
   ============================================================ */

const sections = document.querySelectorAll(".section");
const navButtons = document.querySelectorAll(".nav-btn");

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");

/* Navigation click handler */
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.section;

    sections.forEach((s) => s.classList.remove("visible"));
    document.getElementById(target).classList.add("visible");

    navButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    if (window.innerWidth <= 900) sidebar.classList.remove("open");
  });
});

/* Sidebar toggle (mobile) */
if (sidebarToggle) {
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

function formatCurrency(amount) {
  return "R " + (amount ? amount.toFixed(2) : "0.00");
}

function findItemById(id) {
  return items.find((i) => i.id === id);
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
   FIRESTORE LIVE LISTENERS (defensive)
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
   SETTINGS PAGE – Add/Edit/Delete Items
   ============================================================ */

const itemForm = document.getElementById("item-form");
const itemFormReset = document.getElementById("item-form-reset");
const itemsTable = document.getElementById("items-table-body");

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("item-id").value || null;

  const itemData = {
    name: document.getElementById("item-name").value.trim(),
    price: parseFloat(document.getElementById("item-price").value),
    preorderStock: parseInt(document.getElementById("item-preorder-stock").value),
    extraStock: parseInt(document.getElementById("item-extra-stock").value),
  };

  try {
    if (id) {
      await itemsCol.doc(id).set(itemData, { merge: true });
    } else {
      await itemsCol.add(itemData);
    }
    itemForm.reset();
    document.getElementById("item-id").value = "";
  } catch (err) {
    alert("Error saving item: " + err.message);
  }
});

itemFormReset.addEventListener("click", () => {
  itemForm.reset();
  document.getElementById("item-id").value = "";
});

function renderItemsTable() {
  const { preorderUsage, extraUsage } = calcUsageByItem();
  itemsTable.innerHTML = "";

  items.forEach((item) => {
    const usedPre = preorderUsage[item.id] || 0;
    const usedExtra = extraUsage[item.id] || 0;

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.price.toFixed(2)}</td>
      <td>${item.preorderStock}</td>
      <td>${usedPre}</td>
      <td>${item.preorderStock - usedPre}</td>
      <td>${item.extraStock}</td>
      <td>${usedExtra}</td>
      <td>${item.extraStock - usedExtra}</td>
      <td>
        <button class="secondary-btn btn-small" data-action="edit" data-id="${item.id}">Edit</button>
        <button class="secondary-btn btn-small" data-action="delete" data-id="${item.id}">Delete</button>
      </td>
    `;

    itemsTable.appendChild(row);
  });

  /* Actions */
  itemsTable.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const item = findItemById(id);

      if (btn.dataset.action === "edit") {
        document.getElementById("item-id").value = id;
        document.getElementById("item-name").value = item.name;
        document.getElementById("item-price").value = item.price;
        document.getElementById("item-preorder-stock").value = item.preorderStock;
        document.getElementById("item-extra-stock").value = item.extraStock;
      }

      if (btn.dataset.action === "delete") {
        if (confirm(`Delete "${item.name}"?`)) await itemsCol.doc(id).delete();
      }
    });
  });
}

/* ============================================================
   PREORDERS PAGE – Modal + Table + Logic
   ============================================================ */

const preorderDialog = document.getElementById("preorder-dialog");
const preorderForm = document.getElementById("preorder-form");
const preorderCancel = document.getElementById("preorder-cancel-btn");

const preorderItem = document.getElementById("preorder-item");
const preorderQty = document.getElementById("preorder-qty");
const preorderName = document.getElementById("preorder-name");
const preorderCost = document.getElementById("preorder-cost");
const preorderWarning = document.getElementById("preorder-stock-warning");

document.getElementById("btn-add-preorder").addEventListener("click", () => {
  openPreorderDialog();
});

preorderCancel.addEventListener("click", () => {
  preorderForm.reset();
  preorderDialog.close();
});

function openPreorderDialog(existing = null) {
  preorderForm.reset();
  preorderWarning.textContent = "";

  document.getElementById("preorder-id").value = existing ? existing.id : "";

  document.getElementById("preorder-dialog-title").textContent =
    existing ? "Edit Preorder" : "Add Preorder";

  if (existing) {
    preorderName.value = existing.name;
    preorderItem.value = existing.itemId;
    preorderQty.value = existing.quantity;
    updatePreorderCost();
  } else {
    preorderCost.textContent = "R 0.00";
  }

  preorderDialog.showModal();
}

/* Cost + stock calculation */
function updatePreorderCost() {
  const item = findItemById(preorderItem.value);
  const qty = parseInt(preorderQty.value || 0);

  if (!item || !qty) {
    preorderCost.textContent = "R 0.00";
    preorderWarning.textContent = "";
    return;
  }

  const { preorderUsage } = calcUsageByItem();
  let used = preorderUsage[item.id] || 0;

  const editingId = document.getElementById("preorder-id").value;
  if (editingId) {
    const existing = preorders.find((p) => p.id === editingId);
    if (existing && existing.itemId === item.id) used -= existing.quantity;
  }

  const before = item.preorderStock - used;
  const after = before - qty;

  preorderCost.textContent = formatCurrency(item.price * qty);

  if (before <= 0) preorderWarning.textContent = "No preorder stock left.";
  else if (after < 0) preorderWarning.textContent = `Only ${before} left.`;
  else preorderWarning.textContent = `Stock after: ${after}`;
}

preorderItem.addEventListener("change", updatePreorderCost);
preorderQty.addEventListener("input", updatePreorderCost);

/* Save preorder */
preorderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("preorder-id").value || null;
  const item = findItemById(preorderItem.value);
  const qty = parseInt(preorderQty.value);

  const data = {
    name: preorderName.value.trim(),
    itemId: preorderItem.value,
    quantity: qty,
    cost: item.price * qty,
    couponGiven: id ? undefined : false,
    couponRedeemed: id ? undefined : false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (id) {
      delete data.createdAt;
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

/* Render table */
function renderPreordersTable() {
  const tbody = document.getElementById("preorders-table-body");
  tbody.innerHTML = "";

  let totalValue = 0;

  preorders.forEach((p, index) => {
    totalValue += p.cost || 0;
    const item = findItemById(p.itemId);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${p.name}</td>
      <td>${item ? item.name : "?"}</td>
      <td>${p.quantity}</td>
      <td>${p.cost.toFixed(2)}</td>
      <td>
        <span class="badge-toggle ${p.couponGiven ? "on" : "off"}"
          data-id="${p.id}"
          data-action="toggle-given">
          ${p.couponGiven ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <span class="badge-toggle ${p.couponRedeemed ? "on" : "off"}"
          data-id="${p.id}"
          data-action="toggle-redeemed">
          ${p.couponRedeemed ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <button class="secondary-btn btn-small" data-action="edit" data-id="${p.id}">Edit</button>
        <button class="secondary-btn btn-small" data-action="delete" data-id="${p.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  /* Update summary */
  document.getElementById("preorders-count").textContent = preorders.length;
  document.getElementById("preorders-value").textContent = formatCurrency(totalValue);

  /* Toggles */
  tbody.querySelectorAll(".badge-toggle").forEach((badge) => {
    badge.addEventListener("click", async () => {
      const id = badge.dataset.id;
      const order = preorders.find((o) => o.id === id);

      const update = {};
      update[badge.dataset.action === "toggle-given" ? "couponGiven" : "couponRedeemed"] =
        !order[badge.dataset.action === "toggle-given" ? "couponGiven" : "couponRedeemed"];

      await preordersCol.doc(id).set(update, { merge: true });
    });
  });

  /* Edit & delete buttons */
  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const order = preorders.find((o) => o.id === id);

      if (btn.dataset.action === "edit") {
        openPreorderDialog(order);
      } else if (btn.dataset.action === "delete") {
        if (confirm("Delete this preorder?")) await preordersCol.doc(id).delete();
      }
    });
  });
}

/* ============================================================
   EXTRA ORDERS – Modal + Table + Logic
   ============================================================ */

const extraDialog = document.getElementById("extra-dialog");
const extraForm = document.getElementById("extra-form");
const extraCancel = document.getElementById("extra-cancel-btn");

const extraItem = document.getElementById("extra-item");
const extraQty = document.getElementById("extra-qty");
const extraPayment = document.getElementById("extra-payment");
const extraCost = document.getElementById("extra-cost");
const extraWarning = document.getElementById("extra-stock-warning");

document.getElementById("btn-add-extra").addEventListener("click", () => {
  openExtraDialog();
});

extraCancel.addEventListener("click", () => {
  extraForm.reset();
  extraDialog.close();
});

function openExtraDialog(existing = null) {
  extraForm.reset();
  extraWarning.textContent = "";

  document.getElementById("extra-id").value = existing ? existing.id : "";

  document.getElementById("extra-dialog-title").textContent =
    existing ? "Edit Extra Order" : "Add Extra Order";

  if (existing) {
    extraItem.value = existing.itemId;
    extraQty.value = existing.quantity;
    extraPayment.value = existing.paymentMethod;
    updateExtraCost();
  } else {
    extraCost.textContent = "R 0.00";
  }

  extraDialog.showModal();
}

/* Cost calculation for extra orders */
function updateExtraCost() {
  const item = findItemById(extraItem.value);
  const qty = parseInt(extraQty.value || 0);

  if (!item || !qty) {
    extraCost.textContent = "R 0.00";
    extraWarning.textContent = "";
    return;
  }

  const { extraUsage } = calcUsageByItem();
  let used = extraUsage[item.id] || 0;

  const editingId = document.getElementById("extra-id").value;
  if (editingId) {
    const existing = extraOrders.find((o) => o.id === editingId);
    if (existing && existing.itemId === item.id) used -= existing.quantity;
  }

  const before = item.extraStock - used;
  const after = before - qty;

  extraCost.textContent = formatCurrency(item.price * qty);

  if (before <= 0) extraWarning.textContent = "No extra stock left.";
  else if (after < 0) extraWarning.textContent = `Only ${before} left.`;
  else extraWarning.textContent = `Stock after: ${after}`;
}

extraItem.addEventListener("change", updateExtraCost);
extraQty.addEventListener("input", updateExtraCost);

/* Save extra orders */
extraForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("extra-id").value || null;
  const item = findItemById(extraItem.value);
  const qty = parseInt(extraQty.value);

  const data = {
    itemId: extraItem.value,
    quantity: qty,
    paymentMethod: extraPayment.value,
    cost: item.price * qty,
    paid: id ? undefined : false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    if (id) {
      delete data.createdAt;
      await extraCol.doc(id).set(data, { merge: true });
    } else {
      data.paid = false;
      await extraCol.add(data);
    }
    extraDialog.close();
  } catch (err) {
    alert("Error saving order: " + err.message);
  }
});

/* Render extra orders table */
function renderExtraTable() {
  const tbody = document.getElementById("extra-table-body");
  tbody.innerHTML = "";

  let totalValue = 0;

  extraOrders.forEach((o, index) => {
    totalValue += o.cost || 0;
    const item = findItemById(o.itemId);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${item ? item.name : "?"}</td>
      <td>${o.quantity}</td>
      <td>${o.cost.toFixed(2)}</td>
      <td>${o.paymentMethod}</td>
      <td>
        <span class="badge-toggle ${o.paid ? "on" : "off"}"
          data-id="${o.id}"
          data-action="toggle-paid">
          ${o.paid ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <button class="secondary-btn btn-small" data-action="edit" data-id="${o.id}">Edit</button>
        <button class="secondary-btn btn-small" data-action="delete" data-id="${o.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById("extra-count").textContent = extraOrders.length;
  document.getElementById("extra-value").textContent = formatCurrency(totalValue);

  /* Toggle paid */
  tbody.querySelectorAll(".badge-toggle").forEach((badge) => {
    badge.addEventListener("click", async () => {
      const id = badge.dataset.id;
      const order = extraOrders.find((o) => o.id === id);
      await extraCol.doc(id).set({ paid: !order.paid }, { merge: true });
    });
  });

  /* Edit / Delete */
  tbody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const order = extraOrders.find((o) => o.id === id);

      if (btn.dataset.action === "edit") {
        openExtraDialog(order);
      } else if (btn.dataset.action === "delete") {
        if (confirm("Delete this order?")) {
          await extraCol.doc(id).delete();
        }
      }
    });
  });
}

/* ============================================================
   POPULATE ITEM SELECT DROPDOWNS
   ============================================================ */

function populateItemSelects() {
  const selects = [preorderItem, extraItem];

  selects.forEach((sel) => {
    sel.innerHTML = "<option value='' disabled selected>-- Select item --</option>";

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} (R${item.price.toFixed(2)})`;
      sel.appendChild(option);
    });
  });
}

/* ============================================================
   DASHBOARD STATS
   ============================================================ */

function updateDashboardStats() {
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

  document.getElementById("stat-total-items").textContent = items.length;
  document.getElementById("stat-total-preorders").textContent = preorders.length;
  document.getElementById("stat-total-extra-orders").textContent = extraOrders.length;
  document.getElementById("stat-preorder-remaining").textContent = preorderRemaining;
  document.getElementById("stat-extra-remaining").textContent = extraRemaining;
  document.getElementById("stat-coupons-given").textContent = couponsGiven;
  document.getElementById("stat-coupons-redeemed").textContent = couponsRedeemed;
  document.getElementById("stat-total-revenue").textContent = formatCurrency(totalRevenue);
}
