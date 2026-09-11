/* TENGBA GARDEN — Activities Portal front end
 * Talks to the Apps Script Web App via POST requests using
 * Content-Type: text/plain to avoid CORS preflight (Apps Script
 * web apps can't respond to OPTIONS requests).
 *
 * Reads its backend URL from config.js (CONFIG.API_URL) — see that
 * file for setup instructions.
 *
 * There is no self-registration. Only the Director can create, edit, or
 * remove a user account, or change any password (their own included).
 */

const LS_TOKEN = 'tengba_token';
const LS_USER = 'tengba_user';

const state = {
  token: localStorage.getItem(LS_TOKEN) || '',
  user: JSON.parse(localStorage.getItem(LS_USER) || 'null'),
  roles: [],
  zones: [],
  users: []
};

const MANAGEMENT_ROLES = ['Director', 'Manager'];
const DIRECTOR_ROLES = ['Director'];

// ---------------------------------------------------------------
// Config check
// ---------------------------------------------------------------
function apiConfigured() {
  return typeof CONFIG !== 'undefined' && CONFIG.API_URL && CONFIG.API_URL.indexOf('PASTE_YOUR') === -1;
}
if (!apiConfigured()) {
  document.getElementById('configWarning').classList.remove('hidden');
}

// ---------------------------------------------------------------
// API helper
// ---------------------------------------------------------------
async function api(action, payload) {
  if (!apiConfigured()) {
    throw new Error('Backend not configured yet — edit config.js with your Apps Script Web App URL.');
  }
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action, token: state.token }, payload || {}))
  });
  if (!res.ok) throw new Error('Network error (' + res.status + ')');
  return res.json();
}

function showMessage(el, text, kind) {
  el.textContent = text || '';
  el.className = 'msg ' + (kind || '');
}

// ---------------------------------------------------------------
// Generic "+ (Title)" form toggles — every add-form is collapsed by
// default; clicking the button at the top of the panel reveals it.
// ---------------------------------------------------------------
document.querySelectorAll('[data-toggle]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const form = document.getElementById(btn.getAttribute('data-toggle'));
    if (!form) return;
    const willShow = form.classList.contains('hidden');
    form.classList.toggle('hidden');
    btn.textContent = willShow ? '✕ Close' : (btn.getAttribute('data-label') || '+ Add');
    btn.classList.toggle('btn-add-open', willShow);
  });
});

function closeForm(formId, btnSelector) {
  const form = document.getElementById(formId);
  form.classList.add('hidden');
  const btn = document.querySelector(btnSelector);
  if (btn) {
    btn.textContent = btn.getAttribute('data-label') || '+ Add';
    btn.classList.remove('btn-add-open');
  }
}

// ---------------------------------------------------------------
// Modal dialog — a small, styled replacement for window.prompt /
// window.confirm / window.alert, so dialogs match the app's look
// instead of the browser's generic "This page says" chrome.
// ---------------------------------------------------------------
function showModal(opts) {
  const overlay = document.getElementById('modalOverlay');
  const titleEl = document.getElementById('modalTitle');
  const msgEl = document.getElementById('modalMessage');
  const inputField = document.getElementById('modalInputField');
  const input = document.getElementById('modalInput');
  const errorEl = document.getElementById('modalError');
  const okBtn = document.getElementById('modalOkBtn');
  const cancelBtn = document.getElementById('modalCancelBtn');

  titleEl.textContent = opts.title || '';
  msgEl.textContent = opts.message || '';
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
  okBtn.textContent = opts.okText || 'OK';
  cancelBtn.textContent = opts.cancelText || 'Cancel';
  cancelBtn.classList.toggle('hidden', opts.hideCancel === true);

  const showInput = !!opts.input;
  inputField.classList.toggle('hidden', !showInput);
  input.type = opts.inputType || 'text';
  input.value = opts.inputValue || '';
  input.placeholder = opts.inputPlaceholder || '';

  overlay.classList.remove('hidden');
  if (showInput) setTimeout(function () { input.focus(); }, 0);
  else okBtn.focus();

  return new Promise(function (resolve) {
    function cleanup(result) {
      overlay.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onOk() {
      if (showInput) {
        const val = input.value.trim();
        const err = opts.validate ? opts.validate(val) : null;
        if (err) { errorEl.textContent = err; errorEl.classList.remove('hidden'); return; }
        cleanup(val);
      } else {
        cleanup(true);
      }
    }
    function onCancel() { cleanup(showInput ? null : false); }
    function onKeydown(e) {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
  });
}

function showAlert(message, title) {
  return showModal({ title: title || 'Notice', message: message, hideCancel: true });
}

function showConfirm(message, title) {
  return showModal({ title: title || 'Please confirm', message: message, okText: 'Confirm' });
}

function showPrompt(message, opts) {
  return showModal(Object.assign({ title: 'Enter a value', message: message, input: true }, opts || {}));
}

// ---------------------------------------------------------------
// Sidebar (mobile hamburger + backdrop)
// ---------------------------------------------------------------
const sidebarEl = document.getElementById('sidebar');
const sidebarBackdropEl = document.getElementById('sidebarBackdrop');
const hamburgerBtn = document.getElementById('hamburgerBtn');

function openSidebar() {
  sidebarEl.classList.add('open');
  sidebarBackdropEl.classList.add('open');
}
function closeSidebar() {
  sidebarEl.classList.remove('open');
  sidebarBackdropEl.classList.remove('open');
}
hamburgerBtn.addEventListener('click', function () {
  if (sidebarEl.classList.contains('open')) closeSidebar(); else openSidebar();
});
sidebarBackdropEl.addEventListener('click', closeSidebar);

// ---------------------------------------------------------------
// Login / Logout
// ---------------------------------------------------------------
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('loginMessage');
  showMessage(msg, '');
  try {
    const res = await api('login', {
      username: document.getElementById('loginUsername').value.trim(),
      password: document.getElementById('loginPassword').value
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem(LS_TOKEN, res.token);
    localStorage.setItem(LS_USER, JSON.stringify(res.user));
    enterDashboard();
  } catch (err) {
    showMessage(msg, err.message, 'error');
  }
});

document.getElementById('logoutBtn').addEventListener('click', function () {
  state.token = '';
  state.user = null;
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  document.body.classList.remove('authed');
  closeSidebar();
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('userChip').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
});

// ---------------------------------------------------------------
// Dashboard tab switching
// ---------------------------------------------------------------
document.querySelectorAll('#dashTabs [data-tab]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('#dashTabs [data-tab]').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    const target = btn.getAttribute('data-tab');
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.add('hidden'); });
    document.getElementById('panel-' + target).classList.remove('hidden');
    loadPanel(target);
    closeSidebar();
  });
});

function loadPanel(name) {
  if (name === 'overview') loadOverview();
  if (name === 'activity') loadActivityLog();
  if (name === 'report') loadReports();
  if (name === 'attendance') loadAttendance();
  if (name === 'receipts') loadReceipts();
  if (name === 'plans') loadPlans();
  if (name === 'projects') loadProjects();
  if (name === 'zones') loadZones();
  if (name === 'inventory') loadInventory();
  if (name === 'team') { loadUsers(); loadRoles(); }
  if (name === 'profile') loadProfile();
}

// ---------------------------------------------------------------
// Table rendering helpers
// ---------------------------------------------------------------
function renderTable(tableId, headers, rows) {
  const table = document.getElementById(tableId);
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + headers.length + '">No entries yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function (row) {
    return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>';
  }).join('');
}

/** Like renderTable, but the last column of each row is raw HTML (for
 * action buttons) instead of plain text, and rows can carry a status
 * class for the Pending/Approved/Rejected pill styling. */
function renderTableRich(tableId, headers, rowObjs) {
  const table = document.getElementById(tableId);
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';

  if (!rowObjs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="' + headers.length + '">No entries yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rowObjs.map(function (r) {
    return '<tr>' + r.cells.map(function (cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>';
  }).join('');
}

function fmt(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    const hasTime = d.getHours() || d.getMinutes();
    return escapeHtml(hasTime ? d.toLocaleString() : d.toLocaleDateString());
  }
  return escapeHtml(String(val));
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function statusPill(status) {
  const s = String(status || '').toLowerCase();
  const cls = s === 'approved' || s === 'active' ? 'pill-good'
    : s === 'rejected' || s === 'inactive' ? 'pill-bad'
    : 'pill-pending';
  return '<span class="pill ' + cls + '">' + escapeHtml(String(status || '')) + '</span>';
}

// ---------------------------------------------------------------
// Overview — a team-wide summary: name, role, and how much each
// person has logged across activities, attendance, plans, and projects.
// ---------------------------------------------------------------
async function loadOverview() {
  const table = document.getElementById('overviewTable');
  table.querySelector('tbody').innerHTML = '<tr class="empty-row"><td colspan="7">Loading…</td></tr>';

  const [usersRes, activityRes, reportsRes, attendanceRes, plansRes, projectsRes] = await Promise.all([
    api('getUsers', {}), api('getActivityLog', {}), api('getReports', {}), api('getAttendance', {}), api('getPlans', {}), api('getProjects', {})
  ]);
  if (!usersRes.success) return;

  function countFor(rows, key) {
    const counts = {};
    (rows || []).forEach(function (r) {
      const id = r[key];
      if (!id) return;
      counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }
  function pendingCountFor(rows, key) {
    const counts = {};
    (rows || []).forEach(function (r) {
      if (r[key] && String(r.Status) === 'Pending') counts[r[key]] = (counts[r[key]] || 0) + 1;
    });
    return counts;
  }

  const activityCounts = countFor(activityRes.success ? activityRes.log : [], 'UserId');
  const reportCounts = countFor(reportsRes.success ? reportsRes.reports : [], 'UserId');
  const attendanceCounts = countFor(attendanceRes.success ? attendanceRes.attendance : [], 'UserId');
  const planCounts = countFor(plansRes.success ? plansRes.plans : [], 'SubmittedByUserId');
  const planPending = pendingCountFor(plansRes.success ? plansRes.plans : [], 'SubmittedByUserId');
  const projectCounts = countFor(projectsRes.success ? projectsRes.projects : [], 'SubmittedByUserId');
  const projectPending = pendingCountFor(projectsRes.success ? projectsRes.projects : [], 'SubmittedByUserId');

  const rows = usersRes.users.map(function (u) {
    const plans = planCounts[u.UserId] || 0;
    const planPend = planPending[u.UserId] || 0;
    const projects = projectCounts[u.UserId] || 0;
    const projectPend = projectPending[u.UserId] || 0;
    return [
      fmt(u['Full Name']), fmt(u.Role),
      fmt(activityCounts[u.UserId] || 0),
      fmt(reportCounts[u.UserId] || 0),
      fmt(attendanceCounts[u.UserId] || 0),
      plans + (planPend ? ' (' + planPend + ' pending)' : ''),
      projects + (projectPend ? ' (' + projectPend + ' pending)' : '')
    ];
  });

  renderTable('overviewTable', ['Name', 'Role', 'Activities', 'Reports', 'Attendance', 'Plans', 'Projects'], rows);
}

// ---------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------
document.getElementById('activityForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('activityMessage');
  const zoneSel = document.getElementById('actZone');
  try {
    const res = await api('addActivityLog', {
      date: document.getElementById('actDate').value,
      zoneId: zoneSel.value,
      zone: zoneSel.options[zoneSel.selectedIndex] ? zoneSel.options[zoneSel.selectedIndex].dataset.code : '',
      activity: document.getElementById('actActivity').value.trim(),
      personnel: document.getElementById('actPersonnel').value.trim(),
      notes: document.getElementById('actNotes').value.trim()
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('activityForm').reset();
    closeForm('activityForm', '[data-toggle="activityForm"]');
    loadActivityLog();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadActivityLog() {
  const res = await api('getActivityLog', {});
  if (!res.success) return;
  const rows = res.log.slice().reverse().map(function (r) {
    return [fmt(r.Date), fmt(r.Activity), fmt(r.Zone), fmt(r.Personnel), fmt(r.Notes)];
  });
  renderTable('activityTable', ['Date', 'Activity', 'Zone', 'Personnel', 'Notes'], rows);
}

// ---------------------------------------------------------------
// Daily Report — a quick per-person log of what they worked on today
// ---------------------------------------------------------------
document.getElementById('reportForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('reportMessage');
  try {
    const res = await api('submitReport', {
      date: document.getElementById('repDate').value,
      workDone: document.getElementById('repWork').value.trim(),
      notes: document.getElementById('repNotes').value.trim()
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('reportForm').reset();
    closeForm('reportForm', '[data-toggle="reportForm"]');
    loadReports();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadReports() {
  const res = await api('getReports', {});
  if (!res.success) return;
  const rows = res.reports.slice().reverse().map(function (r) {
    return [fmt(r.Date), fmt(r.SubmittedBy), fmt(r.WorkDone), fmt(r.Notes)];
  });
  renderTable('reportsTable', ['Date', 'Submitted By', 'Work Done', 'Notes'], rows);
}

// ---------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------
document.getElementById('attendanceForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('attendanceMessage');
  try {
    const res = await api('markAttendance', {
      date: document.getElementById('attDate').value,
      name: document.getElementById('attName').value.trim(),
      role: document.getElementById('attRole').value.trim(),
      timeIn: document.getElementById('attTimeIn').value,
      timeOut: document.getElementById('attTimeOut').value,
      status: document.getElementById('attStatus').value,
      notes: document.getElementById('attNotes').value.trim()
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('attendanceForm').reset();
    closeForm('attendanceForm', '[data-toggle="attendanceForm"]');
    loadAttendance();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadAttendance() {
  const res = await api('getAttendance', {});
  if (!res.success) return;
  const rows = res.attendance.slice().reverse().map(function (r) {
    return [fmt(r.Date), fmt(r.Name), fmt(r.Role), fmt(r['Time In']), fmt(r['Time Out']), fmt(r.Status), fmt(r.Notes)];
  });
  renderTable('attendanceTable', ['Date', 'Name', 'Role', 'Time In', 'Time Out', 'Status', 'Notes'], rows);
}

// ---------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------
function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('receiptForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('receiptMessage');
  const fileInput = document.getElementById('rcFile');
  const file = fileInput.files[0];
  if (!file) { showMessage(msg, 'Choose a receipt file first.', 'error'); return; }

  showMessage(msg, 'Uploading…');
  try {
    const dataUrl = await fileToBase64(file);
    const res = await api('uploadReceipt', {
      date: document.getElementById('rcDate').value,
      category: document.getElementById('rcCategory').value,
      amount: document.getElementById('rcAmount').value,
      relatedType: document.getElementById('rcRelated').value.trim() ? 'Inventory' : '',
      relatedId: document.getElementById('rcRelated').value.trim(),
      notes: document.getElementById('rcNotes').value.trim(),
      fileName: file.name,
      mimeType: file.type,
      fileData: dataUrl
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('receiptForm').reset();
    closeForm('receiptForm', '[data-toggle="receiptForm"]');
    loadReceipts();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadReceipts() {
  const res = await api('getReceipts', {});
  if (!res.success) return;
  const rows = res.receipts.slice().reverse().map(function (r) {
    const link = r.DriveFileUrl ? '<a href="' + r.DriveFileUrl + '" target="_blank" rel="noopener">View</a>' : '';
    return [fmt(r.Date), fmt(r.Category), fmt(r.Amount), fmt(r.UploadedBy), fmt(r.RelatedId), link, fmt(r.Notes)];
  });
  renderTable('receiptsTable', ['Date', 'Category', 'Amount', 'Uploaded By', 'Related', 'File', 'Notes'], rows);
}

// ---------------------------------------------------------------
// Plans (submit → Director approves/rejects)
// ---------------------------------------------------------------
document.getElementById('planForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('planMessage');
  try {
    const res = await api('submitPlan', {
      title: document.getElementById('planTitle').value.trim(),
      description: document.getElementById('planDescription').value.trim()
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('planForm').reset();
    closeForm('planForm', '[data-toggle="planForm"]');
    loadPlans();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadPlans() {
  const res = await api('getPlans', {});
  if (!res.success) return;
  const isDirector = state.user && state.user.role === 'Director';
  const rowObjs = res.plans.slice().reverse().map(function (p) {
    const cells = [fmt(p.Title), fmt(p.Description), fmt(p.SubmittedBy), fmt(p.DateSubmitted), statusPill(p.Status), fmt(p.DecisionBy), fmt(p.DecisionDate)];
    if (isDirector) {
      cells.push(String(p.Status) === 'Pending'
        ? '<button class="btn btn-mini btn-good" data-plan-decide="' + p.PlanId + '" data-decision="Approved">Approve</button> ' +
          '<button class="btn btn-mini btn-bad" data-plan-decide="' + p.PlanId + '" data-decision="Rejected">Reject</button>'
        : '');
    }
    return { cells: cells };
  });
  const headers = ['Title', 'Description', 'Submitted By', 'Date', 'Status', 'Decision By', 'Decision Date'];
  if (isDirector) headers.push('Actions');
  renderTableRich('plansTable', headers, rowObjs);

  document.querySelectorAll('[data-plan-decide]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const msg = document.getElementById('planMessage');
      try {
        const res = await api('decidePlan', { planId: btn.getAttribute('data-plan-decide'), decision: btn.getAttribute('data-decision') });
        if (!res.success) { showMessage(msg, res.message, 'error'); return; }
        loadPlans();
      } catch (err) { showMessage(msg, err.message, 'error'); }
    });
  });
}

// ---------------------------------------------------------------
// Projects (submit → Director approves/rejects)
// ---------------------------------------------------------------
document.getElementById('projectForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('projectMessage');
  try {
    const res = await api('submitProject', {
      title: document.getElementById('projectTitle').value.trim(),
      description: document.getElementById('projectDescription').value.trim()
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('projectForm').reset();
    closeForm('projectForm', '[data-toggle="projectForm"]');
    loadProjects();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadProjects() {
  const res = await api('getProjects', {});
  if (!res.success) return;
  const isDirector = state.user && state.user.role === 'Director';
  const rowObjs = res.projects.slice().reverse().map(function (p) {
    const cells = [fmt(p.Title), fmt(p.Description), fmt(p.SubmittedBy), fmt(p.DateSubmitted), statusPill(p.Status), fmt(p.DecisionBy), fmt(p.DecisionDate)];
    if (isDirector) {
      cells.push(String(p.Status) === 'Pending'
        ? '<button class="btn btn-mini btn-good" data-project-decide="' + p.ProjectId + '" data-decision="Approved">Approve</button> ' +
          '<button class="btn btn-mini btn-bad" data-project-decide="' + p.ProjectId + '" data-decision="Rejected">Reject</button>'
        : '');
    }
    return { cells: cells };
  });
  const headers = ['Title', 'Description', 'Submitted By', 'Date', 'Status', 'Decision By', 'Decision Date'];
  if (isDirector) headers.push('Actions');
  renderTableRich('projectsTable', headers, rowObjs);

  document.querySelectorAll('[data-project-decide]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const msg = document.getElementById('projectMessage');
      try {
        const res = await api('decideProject', { projectId: btn.getAttribute('data-project-decide'), decision: btn.getAttribute('data-decision') });
        if (!res.success) { showMessage(msg, res.message, 'error'); return; }
        loadProjects();
      } catch (err) { showMessage(msg, err.message, 'error'); }
    });
  });
}

// ---------------------------------------------------------------
// Zones
// ---------------------------------------------------------------
document.getElementById('zoneForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('zoneMessage');
  try {
    const res = await api('createZone', {
      code: document.getElementById('zoneCode').value.trim(),
      zone: document.getElementById('zoneName').value.trim(),
      notes: document.getElementById('zoneNotes').value.trim()
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('zoneForm').reset();
    closeForm('zoneForm', '[data-toggle="zoneForm"]');
    await refreshReferenceData();
    loadZones();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadZones() {
  const res = await api('getZones', {});
  if (!res.success) return;
  state.zones = res.zones;
  const rows = res.zones.map(function (r) { return [fmt(r.Code), fmt(r.Zone), fmt(r.Notes)]; });
  renderTable('zonesTable', ['Code', 'Zone', 'Notes'], rows);
  populateZoneDropdown();
}

function populateZoneDropdown() {
  const sel = document.getElementById('actZone');
  const current = sel.value;
  sel.innerHTML = '<option value="">—</option>' + state.zones.map(function (z) {
    return '<option value="' + z.ZoneId + '" data-code="' + z.Code + '">' + z.Code + ' — ' + z.Zone + '</option>';
  }).join('');
  sel.value = current;
}

// ---------------------------------------------------------------
// Roles
// ---------------------------------------------------------------
document.getElementById('roleForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('roleMessage');
  try {
    const res = await api('createRole', {
      role: document.getElementById('roleName').value.trim(),
      count: Number(document.getElementById('roleCount').value || 0),
      coreFocus: document.getElementById('roleFocus').value.trim()
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('roleForm').reset();
    closeForm('roleForm', '[data-toggle="roleForm"]');
    await refreshReferenceData();
    loadRoles();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadRoles() {
  const res = await api('getRoles', {});
  if (!res.success) return;
  state.roles = res.roles;
  const rows = res.roles.map(function (r) { return [fmt(r['#']), fmt(r.Role), fmt(r.Count), fmt(r['Core Focus'])]; });
  renderTable('rolesTable', ['#', 'Role', 'Count', 'Core Focus'], rows);
  populateRoleDropdown();
}

function populateRoleDropdown() {
  const sel = document.getElementById('uRole');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="" disabled' + (current ? '' : ' selected') + '>Select a role…</option>' +
    state.roles.map(function (r) { return '<option value="' + r.Role + '">' + r.Role + '</option>'; }).join('');
  if (current) sel.value = current;
}

// ---------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------
document.getElementById('inventoryForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('inventoryMessage');
  try {
    const res = await api('addInventory', {
      item: document.getElementById('invItem').value.trim(),
      location: document.getElementById('invLocation').value.trim(),
      count: Number(document.getElementById('invCount').value || 0),
      status: document.getElementById('invStatus').value,
      expiryDate: document.getElementById('invExpiry').value
    });
    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    document.getElementById('inventoryForm').reset();
    closeForm('inventoryForm', '[data-toggle="inventoryForm"]');
    loadInventory();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadInventory() {
  const res = await api('getInventory', {});
  if (!res.success) return;
  const rows = res.inventory.map(function (r) {
    return [fmt(r.Item), fmt(r.Location), fmt(r.Count), fmt(r.Status), fmt(r['Expiry Date'])];
  });
  renderTable('inventoryTable', ['Item', 'Location', 'Count', 'Status', 'Expiry Date'], rows);
}

// ---------------------------------------------------------------
// Team (user profiles) — only the Director can register, edit,
// remove a user, or change any password.
// ---------------------------------------------------------------
let editingUserId = null;

function setUserFormMode(editing) {
  document.getElementById('userFormTitle').textContent = editing ? 'Edit team member' : 'Register a team member';
  document.getElementById('userFormHint').textContent = editing
    ? 'Update this person\'s profile or reassign their role. Username and password can\'t be changed here — use Set Password for that.'
    : 'Only the Director can create accounts. Review skills and qualifications first, then assign a role here — there is no self-registration.';
  document.getElementById('userFormSubmitBtn').textContent = editing ? 'Save changes' : 'Create account';
  document.getElementById('userFormCancelBtn').classList.toggle('hidden', !editing);
  document.getElementById('uUsernameField').classList.toggle('hidden', editing);
  document.getElementById('uPasswordField').classList.toggle('hidden', editing);
  document.getElementById('uUsername').required = !editing;
  document.getElementById('uPassword').required = !editing;
}

function startEditUser(user) {
  editingUserId = user.UserId;
  document.getElementById('uFullName').value = user['Full Name'] || '';
  document.getElementById('uUsername').value = user.Username || '';
  document.getElementById('uPassword').value = '';
  document.getElementById('uDob').value = user['Date Of Birth'] || '';
  document.getElementById('uGender').value = user.Gender || '';
  document.getElementById('uPhone').value = user.Phone || '';
  document.getElementById('uEmail').value = user.Email || '';
  document.getElementById('uAddress').value = user.Address || '';
  document.getElementById('uEmergencyName').value = user['Emergency Contact Name'] || '';
  document.getElementById('uEmergencyPhone').value = user['Emergency Contact Phone'] || '';
  document.getElementById('uEducation').value = user['Education History'] || '';
  document.getElementById('uEmployment').value = user['Employment History'] || '';
  document.getElementById('uSkills').value = user.Skills || '';
  document.getElementById('uLanguages').value = user.Languages || '';
  document.getElementById('uPositions').value = user['Positions Held & Responsibilities'] || '';
  populateRoleDropdown();
  document.getElementById('uRole').value = user.Role || '';

  setUserFormMode(true);
  const form = document.getElementById('userForm');
  form.classList.remove('hidden');
  const toggleBtn = document.getElementById('userFormToggleBtn');
  toggleBtn.textContent = '✕ Close';
  toggleBtn.classList.add('btn-add-open');
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function stopEditUser() {
  editingUserId = null;
  document.getElementById('userForm').reset();
  setUserFormMode(false);
}

document.getElementById('userFormCancelBtn').addEventListener('click', function () {
  stopEditUser();
  closeForm('userForm', '[data-toggle="userForm"]');
});

document.getElementById('userFormToggleBtn').addEventListener('click', function () {
  // Toggling the "+ Register User" button while an edit is in progress
  // should drop the edit and go back to a blank create form.
  if (editingUserId) stopEditUser();
});

document.getElementById('userForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msg = document.getElementById('userMessage');
  const profileFields = {
    name: document.getElementById('uFullName').value.trim(),
    role: document.getElementById('uRole').value,
    dob: document.getElementById('uDob').value,
    gender: document.getElementById('uGender').value.trim(),
    phone: document.getElementById('uPhone').value.trim(),
    email: document.getElementById('uEmail').value.trim(),
    address: document.getElementById('uAddress').value.trim(),
    emergencyName: document.getElementById('uEmergencyName').value.trim(),
    emergencyPhone: document.getElementById('uEmergencyPhone').value.trim(),
    education: document.getElementById('uEducation').value.trim(),
    employment: document.getElementById('uEmployment').value.trim(),
    skills: document.getElementById('uSkills').value.trim(),
    languages: document.getElementById('uLanguages').value.trim(),
    positions: document.getElementById('uPositions').value.trim()
  };

  try {
    const res = editingUserId
      ? await api('adminUpdateUser', Object.assign({ userId: editingUserId }, profileFields))
      : await api('adminCreateUser', Object.assign({
          username: document.getElementById('uUsername').value.trim(),
          password: document.getElementById('uPassword').value
        }, profileFields));

    if (!res.success) { showMessage(msg, res.message, 'error'); return; }
    showMessage(msg, res.message, 'success');
    const wasEditing = !!editingUserId;
    stopEditUser();
    if (!wasEditing) closeForm('userForm', '[data-toggle="userForm"]');
    loadUsers();
  } catch (err) { showMessage(msg, err.message, 'error'); }
});

async function loadUsers() {
  const res = await api('getUsers', {});
  if (!res.success) return;
  state.users = res.users;
  const isDirector = state.user && state.user.role === 'Director';

  const headers = ['Name', 'Role', 'Phone', 'Email', 'Skills', 'Languages', 'Positions & Responsibilities', 'Status'];
  if (isDirector) headers.push('Actions');

  const rowObjs = res.users.map(function (u) {
    const cells = [
      fmt(u['Full Name']), fmt(u.Role), fmt(u.Phone), fmt(u.Email),
      fmt(u.Skills), fmt(u.Languages), fmt(u['Positions Held & Responsibilities']),
      statusPill(u.Status)
    ];
    if (isDirector) {
      const isSelf = state.user && u.UserId === state.user.userId;
      cells.push(
        '<button class="btn btn-mini" data-edit-user="' + u.UserId + '">Edit</button> ' +
        '<button class="btn btn-mini" data-set-password="' + u.UserId + '">Set Password</button> ' +
        (isSelf ? '' : '<button class="btn btn-mini btn-bad" data-remove-user="' + u.UserId + '">Remove</button>')
      );
    }
    return { cells: cells };
  });

  renderTableRich('usersTable', headers, rowObjs);

  document.querySelectorAll('[data-edit-user]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const userId = btn.getAttribute('data-edit-user');
      const user = state.users.find(function (u) { return u.UserId === userId; });
      if (user) startEditUser(user);
    });
  });

  document.querySelectorAll('[data-set-password]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const userId = btn.getAttribute('data-set-password');
      const newPassword = await showPrompt('Enter a new password for this account.', {
        title: 'Set a new password',
        inputType: 'text',
        inputPlaceholder: 'Min 6 characters',
        okText: 'Save password',
        validate: function (val) {
          if (!val) return 'Enter a password.';
          if (val.length < 6) return 'Password should be at least 6 characters.';
          return null;
        }
      });
      if (newPassword === null) return;
      try {
        const res = await api('adminChangePassword', { userId: userId, newPassword: newPassword });
        await showAlert(res.message, res.success ? 'Password updated' : 'Could not update password');
      } catch (err) { await showAlert(err.message, 'Could not update password'); }
    });
  });

  document.querySelectorAll('[data-remove-user]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const userId = btn.getAttribute('data-remove-user');
      const confirmed = await showConfirm('Remove this user account? This cannot be undone.', 'Remove user');
      if (!confirmed) return;
      try {
        const res = await api('adminRemoveUser', { userId: userId });
        if (!res.success) { await showAlert(res.message, 'Could not remove user'); return; }
        loadUsers();
      } catch (err) { await showAlert(err.message, 'Could not remove user'); }
    });
  });
}

// ---------------------------------------------------------------
// Profile — the signed-in user's own read-only record. There is no
// edit form here on purpose: only the Director can change a profile,
// from the Team tab.
// ---------------------------------------------------------------
async function loadProfile() {
  const grid = document.getElementById('profileGrid');
  grid.innerHTML = '<div class="profile-item span2"><dd>Loading…</dd></div>';

  const res = await api('getUsers', {});
  if (!res.success) return;
  const me = res.users.find(function (u) { return u.UserId === state.user.userId; });
  if (!me) { grid.innerHTML = '<div class="profile-item span2"><dd>Profile not found.</dd></div>'; return; }

  const fields = [
    ['Full name', me['Full Name']], ['Username', me.Username], ['Role', me.Role], ['Status', me.Status],
    ['Date of birth', me['Date Of Birth']], ['Gender', me.Gender],
    ['Phone', me.Phone], ['Email', me.Email],
    ['Address', me.Address, true],
    ['Emergency contact name', me['Emergency Contact Name']], ['Emergency contact phone', me['Emergency Contact Phone']],
    ['Education history', me['Education History'], true],
    ['Employment history', me['Employment History'], true],
    ['Skills', me.Skills, true], ['Languages', me.Languages, true],
    ['Positions held & responsibilities', me['Positions Held & Responsibilities'], true]
  ];

  grid.innerHTML = fields.map(function (f) {
    const span = f[2] ? ' span2' : '';
    return '<div class="profile-item' + span + '"><dt>' + f[0] + '</dt><dd>' + (fmt(f[1]) || '—') + '</dd></div>';
  }).join('');
}

// ---------------------------------------------------------------
// Bootstrap / permission gating
// ---------------------------------------------------------------
async function refreshReferenceData() {
  const [rolesRes, zonesRes] = await Promise.all([api('getRoles', {}), api('getZones', {})]);
  if (rolesRes.success) { state.roles = rolesRes.roles; populateRoleDropdown(); }
  if (zonesRes.success) { state.zones = zonesRes.zones; populateZoneDropdown(); }
}

function applyPermissions() {
  const role = state.user ? state.user.role : null;
  const isMgmt = MANAGEMENT_ROLES.indexOf(role) !== -1;
  const isDirector = DIRECTOR_ROLES.indexOf(role) !== -1;
  document.querySelectorAll('.mgmt-only').forEach(function (el) { el.classList.toggle('hidden', !isMgmt); });
  document.querySelectorAll('.director-only').forEach(function (el) { el.classList.toggle('hidden', !isDirector); });
}

function enterDashboard() {
  document.body.classList.add('authed');
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  const initials = state.user.name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('');
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userLabel').textContent = state.user.name + ' · ' + state.user.role;
  document.getElementById('userChip').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');

  applyPermissions();
  refreshReferenceData();
  loadOverview();
}

async function bootstrap() {
  if (!apiConfigured()) {
    document.getElementById('authScreen').classList.remove('hidden');
    return;
  }
  await refreshReferenceData();

  if (state.token && state.user) {
    try {
      const res = await api('whoAmI', {});
      if (res.success) { enterDashboard(); return; }
    } catch (e) { /* fall through to login screen */ }
  }
  document.getElementById('authScreen').classList.remove('hidden');
}

bootstrap();
