/**
 * cases.js — Moderation Cases dashboard section
 */

let _casesData = { cases: [], total: 0, page: 1, pages: 1 };
let _casesInitDone = false;
let _casesFilters = { type: 'all', userId: '', moderatorId: '' };

async function initCases(guildId) {
  if (_casesInitDone) return;
  _casesInitDone = true;
  await loadCases(guildId, 1);
}

async function loadCases(guildId, page) {
  const container = document.getElementById('casesContent');
  if (!container) return;
  const f = _casesFilters;
  const params = new URLSearchParams({ page });
  if (f.type && f.type !== 'all') params.set('type', f.type);
  if (f.userId) params.set('userId', f.userId);
  if (f.moderatorId) params.set('moderatorId', f.moderatorId);
  try {
    const res = await fetch(`/api/guild/${guildId}/cases?${params}`);
    if (!res.ok) throw new Error('Failed to load cases');
    _casesData = await res.json();
    renderCases(container, guildId);
  } catch (e) {
    container.innerHTML = `<div class="error-message">❌ ${escCase(e.message)}</div>`;
  }
}

function renderCases(container, guildId) {
  const { cases, total, page, pages } = _casesData;
  container.innerHTML = `
    <div id="casesSaveStatus" class="save-status" style="display:none"></div>

    <!-- Filters + Add Warning -->
    <div class="ec-card">
      <div class="ec-card-header">
        <h3>Cases (${total})</h3>
        <button class="btn btn-sm btn-primary" id="caseAddBtn">+ Issue Warning</button>
      </div>
      <div class="ec-card-body">
        <div class="ec-grid-2" style="margin-bottom:0.75rem">
          <label class="ec-field"><span>Filter by type</span>
            <select id="casesFilterType" class="ec-input" data-cs>
              <option value="all" ${_casesFilters.type === 'all' ? 'selected' : ''}>All</option>
              <option value="warn" ${_casesFilters.type === 'warn' ? 'selected' : ''}>Warn</option>
              <option value="mute" ${_casesFilters.type === 'mute' ? 'selected' : ''}>Mute</option>
              <option value="kick" ${_casesFilters.type === 'kick' ? 'selected' : ''}>Kick</option>
              <option value="ban" ${_casesFilters.type === 'ban' ? 'selected' : ''}>Ban</option>
              <option value="unban" ${_casesFilters.type === 'unban' ? 'selected' : ''}>Unban</option>
              <option value="unmute" ${_casesFilters.type === 'unmute' ? 'selected' : ''}>Unmute</option>
            </select>
          </label>
          <label class="ec-field"><span>User ID</span>
            <input type="text" id="casesFilterUser" class="ec-input" value="${escCase(_casesFilters.userId)}" placeholder="Filter by user ID" />
          </label>
        </div>
        <button class="btn btn-sm" id="casesFilterApply">Apply Filters</button>
      </div>
    </div>

    <!-- Table -->
    <div class="ec-card" style="margin-top:1rem">
      <div class="ec-card-body">
        ${renderCasesTable(cases, guildId)}
        ${pages > 1 ? renderCasesPagination(page, pages, guildId) : ''}
      </div>
    </div>

    <!-- Warning Modal -->
    <div id="caseModal" class="ec-modal-backdrop" style="display:none">
      <div class="ec-modal" style="max-width:520px">
        <h3 id="caseModalTitle">Issue Warning</h3>
        <label class="ec-field"><span>User ID <span class="required">*</span></span><input type="text" id="caseTargetId" class="ec-input" placeholder="Discord user ID" /></label>
        <label class="ec-field" style="margin-top:0.75rem"><span>Username (optional)</span><input type="text" id="caseTargetTag" class="ec-input" placeholder="e.g. username#0001" /></label>
        <label class="ec-field" style="margin-top:0.75rem"><span>Reason</span><textarea id="caseReason" class="ec-input" rows="3" maxlength="1000" placeholder="Reason for the warning…"></textarea></label>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem">
          <button class="btn btn-secondary" id="caseModalCancel">Cancel</button>
          <button class="btn btn-primary" id="caseModalConfirm">Issue Warning</button>
        </div>
      </div>
    </div>

    <!-- Edit Reason Modal -->
    <div id="caseEditModal" class="ec-modal-backdrop" style="display:none">
      <div class="ec-modal" style="max-width:520px">
        <h3>Edit Case</h3>
        <input type="hidden" id="caseEditId" />
        <label class="ec-field"><span>Reason</span><textarea id="caseEditReason" class="ec-input" rows="3" maxlength="1000"></textarea></label>
        <label class="ec-field" style="margin-top:0.75rem"><span>Notes</span><textarea id="caseEditNotes" class="ec-input" rows="3" maxlength="1000" placeholder="Internal notes (not sent to user)"></textarea></label>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem">
          <button class="btn btn-secondary" id="caseEditCancel">Cancel</button>
          <button class="btn btn-primary" id="caseEditConfirm">Save</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('caseAddBtn')?.addEventListener('click', () => openCaseModal(guildId));
  if (typeof initAllCustomSelects === 'function') initAllCustomSelects(container);
  document.getElementById('caseModalCancel')?.addEventListener('click', () => document.getElementById('caseModal').style.display = 'none');
  document.getElementById('caseModalConfirm')?.addEventListener('click', () => submitCaseModal(guildId));
  document.getElementById('caseEditCancel')?.addEventListener('click', () => document.getElementById('caseEditModal').style.display = 'none');
  document.getElementById('caseEditConfirm')?.addEventListener('click', () => submitCaseEdit(guildId));
  document.getElementById('casesFilterApply')?.addEventListener('click', () => {
    _casesFilters.type = document.getElementById('casesFilterType').value;
    _casesFilters.userId = document.getElementById('casesFilterUser').value.trim();
    loadCases(guildId, 1);
  });
  document.querySelectorAll('[data-case-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.caseId;
      const action = btn.dataset.caseAction;
      if (action === 'delete') {
        if (!confirm('Delete this case? This cannot be undone.')) return;
        const res = await fetch(`/api/guild/${guildId}/cases/${id}`, { method: 'DELETE' });
        if (res.ok) loadCases(guildId, _casesData.page);
      } else if (action === 'edit') {
        const c = _casesData.cases.find(x => x._id === id);
        if (!c) return;
        document.getElementById('caseEditId').value = id;
        document.getElementById('caseEditReason').value = c.reason || '';
        document.getElementById('caseEditNotes').value = c.notes || '';
        document.getElementById('caseEditModal').style.display = 'flex';
      }
    });
  });
  document.querySelectorAll('[data-cases-page]').forEach(btn => {
    btn.addEventListener('click', () => loadCases(guildId, parseInt(btn.dataset.casesPage)));
  });
}

function renderCasesTable(cases) {
  if (!cases.length) return '<p class="ec-empty">No cases found.</p>';
  return `<table class="ec-table">
    <thead><tr><th>#</th><th>Type</th><th>User</th><th>Moderator</th><th>Reason</th><th>Date</th><th>Actions</th></tr></thead>
    <tbody>${cases.map(c => `
      <tr>
        <td><strong>${escCase(c.caseNumber)}</strong></td>
        <td><span class="cc-badge ${caseTypeBadge(c.type)}">${escCase(c.type)}</span></td>
        <td><code>${escCase(c.targetTag || c.targetUserId)}</code></td>
        <td><code>${escCase(c.moderatorTag || c.moderatorId)}</code></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escCase(c.reason)}">${escCase(c.reason)}</td>
        <td><small>${new Date(c.createdAt).toLocaleDateString()}</small></td>
        <td style="display:flex;gap:0.4rem">
          <button class="btn btn-sm" data-case-action="edit" data-case-id="${escCase(c._id)}">Edit</button>
          <button class="btn btn-sm btn-danger" data-case-action="delete" data-case-id="${escCase(c._id)}">Delete</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

function caseTypeBadge(type) {
  const map = { warn: 'cc-badge-off', mute: 'cc-badge-off', kick: 'cc-badge-off', ban: 'cc-badge-off', unban: 'cc-badge-on', unmute: 'cc-badge-on' };
  return map[type] || '';
}

function renderCasesPagination(page, pages, guildId) {
  let html = '<div style="display:flex;gap:0.5rem;justify-content:center;margin-top:1rem;flex-wrap:wrap">';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="btn btn-sm${i === page ? ' btn-primary' : ''}" data-cases-page="${i}">${i}</button>`;
  }
  return html + '</div>';
}

function openCaseModal(guildId) {
  document.getElementById('caseTargetId').value = '';
  document.getElementById('caseTargetTag').value = '';
  document.getElementById('caseReason').value = '';
  document.getElementById('caseModal').style.display = 'flex';
}

async function submitCaseModal(guildId) {
  const targetUserId = document.getElementById('caseTargetId').value.trim();
  if (!targetUserId) { alert('User ID is required.'); return; }
  const btn = document.getElementById('caseModalConfirm');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/guild/${guildId}/cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId,
        targetTag: document.getElementById('caseTargetTag').value.trim() || undefined,
        reason: document.getElementById('caseReason').value.trim() || 'No reason provided.',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    document.getElementById('caseModal').style.display = 'none';
    loadCases(guildId, 1);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function submitCaseEdit(guildId) {
  const id = document.getElementById('caseEditId').value;
  const btn = document.getElementById('caseEditConfirm');
  btn.disabled = true;
  try {
    const res = await fetch(`/api/guild/${guildId}/cases/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: document.getElementById('caseEditReason').value.trim(),
        notes: document.getElementById('caseEditNotes').value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    document.getElementById('caseEditModal').style.display = 'none';
    loadCases(guildId, _casesData.page);
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function escCase(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'cases') return;
    if (!_casesInitDone) initCases(gId);
  });
});

window.initCases = initCases;
