// js/main.js

// Firestore collections
const itemsCol = db.collection("items");
const preordersCol = db.collection("preorders");
const extraCol = db.collection("extraOrders");

// In-memory state
let items = [];
let preorders = [];
let extraOrders = [];

/* ---------------- SIDEBAR & NAVIGATION ---------------- */

const sections = document.querySelectorAll(".section");
const navButtons = document.querySelectorAll(".nav-btn");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const sectionId = btn.dataset.section;

    sections.forEach(s => s.classList.remove("visible"));
    document.getElementById(sectionId).classList.add("visible");

    navButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // Close sidebar on small screens after navigation
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

/* ---------------- UTILITIES ---------------- */

function formatCurrency(num) {
  if (!num) return "R 0";
  return "R " + num.toFixed(2);
}

function findItemById(id) {
  return items.find(i => i.id === id) || null;
}

function calcUsageByItem() {
  const preorderUsage = {};
  preorders.forEach(p => {
    preorderUsage[p.itemId] = (preorderUsage[p.itemId] || 0) + p.quantity;
  });

  const extraUsage = {};
  extraOrders.forEach(o => {
    extraUsage[o.itemId] = (extraUsage[o.itemId] || 0) + o.quantity;
  });

  return { preorderUsage, extraUsage };
}

/* ---------------- FIRESTORE LISTENERS ---------------- */

// Items
itemsCol.onSnapshot(snapshot => {
  items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderItemsTable();
  populateItemSelects();
  updateDashboardStats();
});

// Preorders
preordersCol.orderBy("createdAt").onSnapshot(snapshot => {
  preorders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderPreordersTable();
  updateDashboardStats();
});

// Extra orders
extraCol.orderBy("createdAt").onSnapshot(snapshot => {
  extraOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  renderExtraTable();
  updateDashboardStats();
});

/* ---------------- SETTINGS PAGE ---------------- */

const itemForm = document.getElementById("item-form");
const itemFormResetBtn = document.getElementById("item-form-reset");
const itemsTableBody = document.getElementById("items-table-body");

itemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
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

itemFormResetBtn.addEventListener("click", () => {
  itemForm.reset();
  document.getElementById("item-id").value = "";
});

function renderItemsTable() {
  const { preorderUsage, extraUsage } = calcUsageByItem();
  itemsTableBody.innerHTML = "";

  items.forEach(item => {
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

  itemsTableBody.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async () => {
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

/* ---------------- PREORDER MODAL & LOGIC ---------------- */

const preorderDialog = document.getElementById("preorder-dialog");
const preorderForm = document.getElementById("preorder-form");
const preorderItemSelect = document.getElementById("preorder-item");
const preorderQtyInput = document.getElementById("preorder-qty");
const preorderNameInput = document.getElementById("preorder-name");
const preorderCostLabel = document.getElementById("preorder-cost");
const preorderWarning = document.getElementById("preorder-stock-warning");
const btnAddPreorder = document.getElementById("btn-add-preorder");
const preorderCancelBtn = document.getElementById("preorder-cancel-btn");

btnAddPreorder.addEventListener("click", () => openPreorderDialog());

if (preorderCancelBtn) {
  preorderCancelBtn.addEventListener("click", () => {
    preorderForm.reset();
    preorderWarning.textContent = "";
    preorderDialog.close();
  });
}

function openPreorderDialog(existing = null) {
  preorderForm.reset();
  preorderWarning.textContent = "";
  document.getElementById("preorder-id").value = existing ? existing.id : "";
  document.getElementById("preorder-dialog-title").textContent = existing ? "Edit Preorder" : "Add Preorder";

  if (existing) {
    preorderNameInput.value = existing.name;
    preorderItemSelect.value = existing.itemId;
    preorderQtyInput.value = existing.quantity;
    updatePreorderCost();
  } else {
    preorderCostLabel.textContent = "R 0";
  }

  if (typeof preorderDialog.showModal === "function") {
    preorderDialog.showModal();
  } else {
    alert("Your browser does not support pop-up dialogs. Please use a modern browser.");
  }
}

function updatePreorderCost() {
  const item = findItemById(preorderItemSelect.value);
  const qty = parseInt(preorderQtyInput.value || "0", 10);
  if (!item || !qty) {
    preorderCostLabel.textContent = "R 0";
    preorderWarning.textContent = "";
    return;
  }

  const { preorderUsage } = calcUsageByItem();
  let usedPre = preorderUsage[item.id] || 0;

  const editingId = document.getElementById("preorder-id").value;
  if (editingId) {
    const existing = preorders.find(p => p.id === editingId);
    if (existing && existing.itemId === item.id) {
      usedPre -= existing.quantity;
    }
  }

  const remainingBefore = item.preorderStock - usedPre;
  const remainingAfter = remainingBefore - qty;

  preorderCostLabel.textContent = formatCurrency(item.price * qty);

  if (remainingBefore <= 0) {
    preorderWarning.textContent = `No preorder stock left for ${item.name}.`;
  } else if (remainingAfter < 0) {
    preorderWarning.textContent = `Only ${remainingBefore} left. Reduce quantity.`;
  } else {
    preorderWarning.textContent = `Stock before: ${remainingBefore}, after this order: ${remainingAfter}.`;
  }
}

preorderItemSelect.addEventListener("change", updatePreorderCost);
preorderQtyInput.addEventListener("input", updatePreorderCost);

preorderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("preorder-id").value || null;
  const name = preorderNameInput.value.trim();
  const itemId = preorderItemSelect.value;
  const qty = parseInt(preorderQtyInput.value || "0", 10);

  const item = findItemById(itemId);
  if (!item) {
    alert("Please select an item.");
    return;
  }

  const { preorderUsage } = calcUsageByItem();
  let usedPre = preorderUsage[item.id] || 0;

  if (id) {
    const existing = preorders.find(p => p.id === id);
    if (existing && existing.itemId === item.id) {
      usedPre -= existing.quantity;
    }
  }

  const remainingBefore = item.preorderStock - usedPre;
  if (qty > remainingBefore) {
    alert(`Not enough preorder stock. Only ${remainingBefore} left.`);
    return;
  }

  const data = {
    name,
    itemId,
    quantity: qty,
    cost: item.price * qty,
    // keep coupon states when editing
    couponGiven: id ? undefined : false,
    couponRedeemed: id ? undefined : false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      delete data.createdAt;
      if (data.couponGiven === undefined) delete data.couponGiven;
      if (data.couponRedeemed === undefined) delete data.couponRedeemed;
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

function renderPreordersTable() {
  const tbody = document.getElementById("preorders-table-body");
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
        <span class="badge-toggle ${order.couponGiven ? "on" : "off"}" data-action="toggle-given" data-id="${order.id}">
          ${order.couponGiven ? "Yes" : "No"}
        </span>
      </td>
      <td>
        <span class="badge-toggle ${order.couponRedeemed ? "on" : "off"}" data-action="toggle-redeemed" data-id="${order.id}">
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

  document.getElementById("preorders-count").textContent = preorders.length;
  document.getElementById("preorders-value").textContent = formatCurrency(totalValue);

  // Toggle coupon states
  tbody.querySelectorAll(".badge-toggle").forEach(badge => {
    badge.addEventListener("click", async () => {
      const id = badge.dataset.id;
      const action = badge.dataset.action;
      const order = preorders.find(p => p.id === id);
      if (!order) return;

      const updates = {};
      if (action === "toggle-given") {
        updates.couponGiven = !order.couponGiven;
      } else if (action === "toggle-redeemed") {
        updates.couponRedeemed = !order.couponRedeemed;
      }
      await preordersCol.doc(id).set(updates, { merge: true });
    });
  });

  // Edit / delete
  tbody.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const order = preorders.find(p => p.id === id);
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

/* ---------------- EXTRA ORDER MODAL & LOGIC ---------------- */

const extraDialog = document.getElementById("extra-dialog");
const extraForm = document.getElementById("extra-form");
const extraItemSelect = document.getElementById("extra-item");
const extraQtyInput = document.getElementById("extra-qty");
const extraPaymentSelect = document.getElementById("extra-payment");
const extraCostLabel = document.getElementById("extra-cost");
const extraWarning = document.getElementById("extra-stock-warning");
const btnAddExtra = document.getElementById("btn-add-extra");
const extraCancelBtn = document.getElementById("extra-cancel-btn");

btnAddExtra.addEventListener("click", () => openExtraDialog());

if (extraCancelBtn) {
  extraCancelBtn.addEventListener("click", () => {
    extraForm.reset();
    extraWarning.textContent = "";
    extraDialog.close();
  });
}

function openExtraDialog(existing = null) {
  extraForm.reset();
  extraWarning.textContent = "";
  document.getElementById("extra-id").value = existing ? existing.id : "";
  document.getElementById("extra-dialog-title").textContent = existing ? "Edit Extra Order" : "Add Extra Order";

  if (existing) {
    extraItemSelect.value = existing.itemId;
    extraQtyInput.value = existing.quantity;
    extraPaymentSelect.value = existing.paymentMethod;
    updateExtraCost();
  } else {
    extraCostLabel.textContent = "R 0";
  }

  if (typeof extraDialog.showModal === "function") {
    extraDialog.showModal();
  } else {
    alert("Your browser does not support pop-up dialogs.");
  }
}

function updateExtraCost() {
  const item = findItemById(extraItemSelect.value);
  const qty = parseInt(extraQtyInput.value || "0", 10);
  if (!item || !qty) {
    extraCostLabel.textContent = "R 0";
    extraWarning.textContent = "";
    return;
  }

  const { extraUsage } = calcUsageByItem();
  let usedExtra = extraUsage[item.id] || 0;

  const editingId = document.getElementById("extra-id").value;
  if (editingId) {
    const existing = extraOrders.find(o => o.id === editingId);
    if (existing && existing.itemId === item.id) {
      usedExtra -= existing.quantity;
    }
  }

  const remainingBefore = item.extraStock - usedExtra;
  const remainingAfter = remainingBefore - qty;

  extraCostLabel.textContent = formatCurrency(item.price * qty);

  if (remainingBefore <= 0) {
    extraWarning.textContent = `No extra stock left for ${item.name}.`;
  } else if (remainingAfter < 0) {
    extraWarning.textContent = `Only ${remainingBefore} left. Reduce quantity.`;
  } else {
    extraWarning.textContent = `Stock before: ${remainingBefore}, after this order: ${remainingAfter}.`;
  }
}

extraItemSelect.addEventListener("change", updateExtraCost);
extraQtyInput.addEventListener("input", updateExtraCost);

extraForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("extra-id").value || null;
  const itemId = extraItemSelect.value;
  const qty = parseInt(extraQtyInput.value || "0", 10);
  const payment = extraPaymentSelect.value;

  const item = findItemById(itemId);
  if (!item) {
    alert("Please select an item.");
    return;
  }

  const { extraUsage } = calcUsageByItem();
  let usedExtra = extraUsage[item.id] || 0;

  if (id) {
    const existing = extraOrders.find(o => o.id === id);
    if (existing && existing.itemId === item.id) {
      usedExtra -= existing.quantity;
    }
  }

  const remainingBefore = item.extraStock - usedExtra;
  if (qty > remainingBefore) {
    alert(`Not enough extra stock. Only ${remainingBefore} left.`);
    return;
  }

  const data = {
    itemId,
    quantity: qty,
    paymentMethod: payment,
    cost: item.price * qty,
    paid: id ? undefined : false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      delete data.createdAt;
      if (data.paid === undefined) delete data.paid;
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

function renderExtraTable() {
  const tbody = document.getElementById("extra-table-body");
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
        <span class="badge-toggle ${order.paid ? "on" : "off"}" data-action="toggle-paid" data-id="${order.id}">
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

  document.getElementById("extra-count").textContent = extraOrders.length;
  document.getElementById("extra-value").textContent = formatCurrency(totalValue);

  // Toggle paid
  tbody.querySelectorAll(".badge-toggle").forEach(badge => {
    badge.addEventListener("click", async () => {
      const id = badge.dataset.id;
      const order = extraOrders.find(o => o.id === id);
      if (!order) return;
      await extraCol.doc(id).set({ paid: !order.paid }, { merge: true });
    });
  });

  // Edit / delete
  tbody.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const order = extraOrders.find(o => o.id === id);
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

/* ---------------- POPULATE ITEM SELECTS ---------------- */

function populateItemSelects() {
  const selects = [preorderItemSelect, extraItemSelect];
  selects.forEach(sel => {
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Select item --";
    placeholder.disabled = true;
    placeholder.selected = true;
    sel.appendChild(placeholder);

    items.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = `${item.name} (R${item.price.toFixed(2)})`;
      sel.appendChild(opt);
    });
  });
}

/* ---------------- DASHBOARD STATS ---------------- */

function updateDashboardStats() {
  const { preorderUsage, extraUsage } = calcUsageByItem();

  let preorderRemaining = 0;
  let extraRemaining = 0;
  let totalRevenue = 0;
  let couponsGiven = 0;
  let couponsRedeemed = 0;

  items.forEach(item => {
    const usedPre = preorderUsage[item.id] || 0;
    const usedExtra = extraUsage[item.id] || 0;
    preorderRemaining += Math.max(item.preorderStock - usedPre, 0);
    extraRemaining += Math.max(item.extraStock - usedExtra, 0);
  });

  preorders.forEach(p => {
    totalRevenue += p.cost || 0;
    if (p.couponGiven) couponsGiven++;
    if (p.couponRedeemed) couponsRedeemed++;
  });

  extraOrders.forEach(o => {
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
