/**
 * cases.js — Moderation dashboard with Sapphire-style layout
 */

let _casesData = { cases: [], total: 0, page: 1, pages: 1 };
let _casesInitDone = false;
let _casesFilters = { type: 'all', userId: '', moderatorId: '' };
let _casesGuildId = null;

function escCase(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showView(viewId) {
  ['modDashboard', 'modCasesView', 'modCaseDetail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === viewId ? '' : 'none';
  });
  if (viewId !== 'modCaseDetail') {
    window.SaveBar?.markClean({ clearHandlers: true });
  }
}

async function initCases(guildId) {
  if (_casesInitDone) return;
  _casesInitDone = true;
  _casesGuildId = guildId;
  showView('modDashboard');

  document.getElementById('modViewCasesBtn')?.addEventListener('click', () => {
    showView('modCasesView');
    loadCases(guildId, 1);
  });

  document.getElementById('modCasesBack')?.addEventListener('click', () => {
    showView('modDashboard');
  });

  document.getElementById('modCaseDetailBack')?.addEventListener('click', () => {
    showView('modCasesView');
  });
}

async function loadCases(guildId, page) {
  const container = document.getElementById('casesContent');
  if (!container) return;
  container.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading cases…</div>';
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
    <!-- Filters -->
    <div class="mod-cases-toolbar">
      <div class="mod-cases-filters">
        <select id="casesFilterType" class="ec-input" data-cs data-cs-placeholder="All types" style="max-width:160px">
          <option value="all" ${_casesFilters.type === 'all' ? 'selected' : ''}>All types</option>
          <option value="warn" ${_casesFilters.type === 'warn' ? 'selected' : ''}>Warn</option>
          <option value="mute" ${_casesFilters.type === 'mute' ? 'selected' : ''}>Mute</option>
          <option value="kick" ${_casesFilters.type === 'kick' ? 'selected' : ''}>Kick</option>
          <option value="ban" ${_casesFilters.type === 'ban' ? 'selected' : ''}>Ban</option>
          <option value="unban" ${_casesFilters.type === 'unban' ? 'selected' : ''}>Unban</option>
          <option value="unmute" ${_casesFilters.type === 'unmute' ? 'selected' : ''}>Unmute</option>
        </select>
        <input type="text" id="casesFilterUser" class="ec-input" value="${escCase(_casesFilters.userId)}" placeholder="Filter by user ID" style="max-width:160px" />
        <button class="btn btn-sm" id="casesFilterApply">Filter</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <span style="font-size:0.78rem;color:var(--text-3)">${total} case${total !== 1 ? 's' : ''}</span>
        <button class="btn btn-sm btn-primary" id="casesIssueWarnBtn">+ Issue Action</button>
      </div>
    </div>

    <!-- Case cards -->
    <div class="mod-cases-list" id="modCasesList">
      ${cases.length
        ? cases.map(c => renderCaseCard(c)).join('')
        : '<p class="ec-empty">No cases found.</p>'}
    </div>

    ${pages > 1 ? renderCasesPagination(page, pages, guildId) : ''}

    <!-- Issue Action Modal -->
    <div id="caseModal" class="ec-modal-backdrop" style="display:none">
      <div class="ec-modal" style="max-width:520px">
        <h3 id="caseModalTitle">Issue Action</h3>
        <label class="ec-field">
          <span>Action Type <span class="required">*</span></span>
          <select id="caseType" class="ec-input" data-cs>
            <option value="warn">Warn</option>
            <option value="mute">Mute</option>
            <option value="kick">Kick</option>
            <option value="ban">Ban</option>
            <option value="unban">Unban</option>
            <option value="unmute">Unmute</option>
          </select>
        </label>
        <label class="ec-field" style="margin-top:.75rem"><span>User ID <span class="required">*</span></span><input type="text" id="caseTargetId" class="ec-input" placeholder="Discord user ID" /></label>
        <label class="ec-field" style="margin-top:.75rem"><span>Username (optional)</span><input type="text" id="caseTargetTag" class="ec-input" placeholder="e.g. username" /></label>
        <label class="ec-field" id="caseDurationField" style="margin-top:.75rem;display:none"><span>Duration (e.g. 7d, 1h, permanent)</span><input type="text" id="caseDuration" class="ec-input" placeholder="e.g. 7d, 1h, permanent" /></label>
        <label class="ec-field" style="margin-top:.75rem"><span>Reason</span><textarea id="caseReason" class="ec-input" rows="3" maxlength="1000" placeholder="Reason for this action…"></textarea></label>
        <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.25rem">
          <button class="btn btn-secondary" id="caseModalCancel">Cancel</button>
          <button class="btn btn-primary" id="caseModalConfirm">Issue Action</button>
        </div>
      </div>
    </div>`;

  if (window.refreshCustomSelects) window.refreshCustomSelects(container);

  document.getElementById('casesIssueWarnBtn')?.addEventListener('click', () => openCaseModal(guildId));
  document.getElementById('casesFilterApply')?.addEventListener('click', () => {
    _casesFilters.type = document.getElementById('casesFilterType').value;
    _casesFilters.userId = document.getElementById('casesFilterUser').value.trim();
    loadCases(guildId, 1);
  });
  document.getElementById('caseModalCancel')?.addEventListener('click', () => { document.getElementById('caseModal').style.display = 'none'; });
  document.getElementById('caseModalConfirm')?.addEventListener('click', () => submitCaseModal(guildId));

  // Dynamic type selector — show/hide duration field + update title
  document.getElementById('caseType')?.addEventListener('change', _updateCaseModalType);
  // Also listen for custom-select change event
  document.getElementById('caseType')?.addEventListener('cs-change', _updateCaseModalType);

  // Open case detail on card click
  document.querySelectorAll('[data-case-open]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const id = card.dataset.caseOpen;
      const c = _casesData.cases.find(x => x._id === id);
      if (c) openCaseDetail(c, guildId);
    });
  });

  // Delete buttons
  document.querySelectorAll('[data-case-delete]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this case? This cannot be undone.')) return;
      const res = await fetch(`/api/guild/${guildId}/cases/${btn.dataset.caseDelete}`, { method: 'DELETE' });
      if (res.ok) loadCases(guildId, _casesData.page);
    });
  });

  document.querySelectorAll('[data-cases-page]').forEach(btn => {
    btn.addEventListener('click', () => loadCases(guildId, parseInt(btn.dataset.casesPage)));
  });
}

function renderCaseCard(c) {
  const typeColors = { warn: '#f59e0b', mute: '#6366f1', kick: '#f97316', ban: '#ef4444', unban: '#22c55e', unmute: '#22c55e' };
  const color = typeColors[c.type?.toLowerCase()] || '#6366f1';
  const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '?';
  const reason = c.reason ? (c.reason.length > 80 ? c.reason.slice(0, 77) + '…' : c.reason) : 'No reason provided';
  return `
    <div class="mod-case-card" data-case-open="${escCase(c._id)}" tabindex="0" role="button" aria-label="View case #${escCase(c.caseNumber)}">
      <div class="mod-case-card-left">
        <div class="mod-case-num" style="color:${color}">#${escCase(c.caseNumber)}</div>
        <span class="mod-case-type-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${escCase((c.type || '?').toUpperCase())}</span>
      </div>
      <div class="mod-case-card-body">
        <div class="mod-case-user">${escCase(c.targetTag || c.targetUserId || 'Unknown user')}</div>
        <div class="mod-case-reason">${escCase(reason)}</div>
      </div>
      <div class="mod-case-card-right">
        <span class="mod-case-date">${escCase(date)}</span>
        <button class="btn btn-xs btn-danger mod-case-delete-btn" data-case-delete="${escCase(c._id)}" title="Delete case">✕</button>
      </div>
    </div>`;
}

function renderCasesPagination(page, pages) {
  let html = '<div class="mod-pagination">';
  for (let i = 1; i <= pages; i++) {
    html += `<button class="btn btn-sm${i === page ? ' btn-primary' : ''}" data-cases-page="${i}">${i}</button>`;
  }
  return html + '</div>';
}

function notifyCaseSave(msg, ok = true) {
  if (window.showToast) {
    window.showToast(msg, ok ? 'success' : 'error');
    return;
  }
  if (!ok) alert(msg);
}

function openCaseDetail(c, guildId) {
  showView('modCaseDetail');
  const content = document.getElementById('modCaseDetailContent');
  if (!content) return;
  const typeColors = { warn: '#f59e0b', mute: '#6366f1', kick: '#f97316', ban: '#ef4444', unban: '#22c55e', unmute: '#22c55e' };
  const color = typeColors[c.type?.toLowerCase()] || '#6366f1';
  const duration = c.durationMs ? formatDuration(c.durationMs) : 'Permanent';
  const created = c.createdAt ? new Date(c.createdAt).toLocaleString() : 'Unknown';
  content.innerHTML = `
    <div class="mod-case-detail-grid">
      <!-- General information -->
      <div class="mod-case-detail-card">
        <div class="mod-case-detail-card-title">General information</div>
        <div class="mod-case-detail-rows">
          <div class="mod-case-detail-row">
            <span class="mod-case-detail-key">ID</span>
            <span class="mod-case-detail-val">#${escCase(c.caseNumber)}</span>
          </div>
          <div class="mod-case-detail-row">
            <span class="mod-case-detail-key">State</span>
            <span class="mod-case-detail-val">
              <span class="mod-case-state-badge ${c.active ? 'active' : 'closed'}">${c.active ? 'Open' : 'Closed'}</span>
            </span>
          </div>
          <div class="mod-case-detail-row">
            <span class="mod-case-detail-key">Type</span>
            <span class="mod-case-detail-val">
              <span style="color:${color};font-weight:700">${escCase((c.type || '?').toUpperCase())}</span>
            </span>
          </div>
          <div class="mod-case-detail-row">
            <span class="mod-case-detail-key">User</span>
            <span class="mod-case-detail-val"><code>${escCase(c.targetTag || c.targetUserId)}</code></span>
          </div>
          <div class="mod-case-detail-row">
            <span class="mod-case-detail-key">Duration</span>
            <span class="mod-case-detail-val">${escCase(duration)}</span>
          </div>
          <div class="mod-case-detail-row">
            <span class="mod-case-detail-key">Created</span>
            <span class="mod-case-detail-val">${escCase(created)}</span>
          </div>
          <div class="mod-case-detail-row">
            <span class="mod-case-detail-key">Author</span>
            <span class="mod-case-detail-val"><code>${escCase(c.moderatorTag || c.moderatorId)}</code></span>
          </div>
          <div class="mod-case-detail-row" style="align-items:flex-start">
            <span class="mod-case-detail-key">Reason</span>
            <span class="mod-case-detail-val" style="flex:1">${escCase(c.reason || 'No reason provided')}</span>
          </div>
        </div>
      </div>

      <!-- Moderator notes -->
      <div class="mod-case-detail-card">
        <div class="mod-case-detail-card-title">Moderator notes</div>
        <textarea id="caseDetailNotes" class="ec-input" rows="4" placeholder="Internal notes (not sent to user)…" style="width:100%;box-sizing:border-box">${escCase(c.notes || '')}</textarea>
      </div>

      <!-- Edit reason -->
      <div class="mod-case-detail-card">
        <div class="mod-case-detail-card-title">Edit reason</div>
        <textarea id="caseDetailReason" class="ec-input" rows="3" style="width:100%;box-sizing:border-box">${escCase(c.reason || '')}</textarea>
        <div class="mod-case-detail-hint">If the original DM can be edited, it will be updated. Otherwise a new message will be sent to the user.</div>
        <div class="mod-case-detail-hint" style="margin-top:.75rem">Use the global save bar at the bottom to save or reset your edits.</div>
      </div>
    </div>`;

  const saveCaseDetail = async () => {
    const reason = document.getElementById('caseDetailReason').value.trim();
    const notes = document.getElementById('caseDetailNotes').value.trim();

    const res = await fetch(`/api/guild/${guildId}/cases/${c._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, notes }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save case');

    const caseInList = _casesData.cases.find(x => x._id === c._id);
    if (caseInList) {
      caseInList.reason = reason;
      caseInList.notes = notes;
    }
    c.reason = reason;
    c.notes = notes;

    notifyCaseSave(
      data.dmUpdated ? 'Saved and updated user DM.' : (data.dmSent ? 'Saved and sent a new user DM.' : 'Case changes saved.'),
      true
    );
  };

  window.SaveBar?.track(content, saveCaseDetail, () => openCaseDetail(c, guildId));
  window.SaveBar?.markClean();
}

function formatDuration(ms) {
  if (!ms) return 'Permanent';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function caseTypeBadge(type) {
  const map = { warn: 'cc-badge-off', mute: 'cc-badge-off', kick: 'cc-badge-off', ban: 'cc-badge-off', unban: 'cc-badge-on', unmute: 'cc-badge-on' };
  return map[type] || '';
}

function _updateCaseModalType() {
  const type = document.getElementById('caseType')?.value || 'warn';
  const durationField = document.getElementById('caseDurationField');
  const hasDuration = type === 'ban' || type === 'mute';
  if (durationField) durationField.style.display = hasDuration ? '' : 'none';
  const typeLabels = { warn: 'Warn', mute: 'Mute', kick: 'Kick', ban: 'Ban', unban: 'Unban', unmute: 'Unmute' };
  const title = document.getElementById('caseModalTitle');
  if (title) title.textContent = 'Issue ' + (typeLabels[type] || 'Action');
  const confirmBtn = document.getElementById('caseModalConfirm');
  if (confirmBtn) confirmBtn.textContent = 'Issue ' + (typeLabels[type] || 'Action');
}

function openCaseModal(guildId) {
  const typeEl = document.getElementById('caseType');
  if (typeEl) typeEl.value = 'warn';
  document.getElementById('caseTargetId').value = '';
  document.getElementById('caseTargetTag').value = '';
  document.getElementById('caseReason').value = '';
  const dur = document.getElementById('caseDuration');
  if (dur) dur.value = '';
  _updateCaseModalType();
  document.getElementById('caseModal').style.display = 'flex';
  // Re-init custom selects in the modal
  if (window.refreshCustomSelects) window.refreshCustomSelects(document.getElementById('caseModal'));
}

async function submitCaseModal(guildId) {
  const targetUserId = document.getElementById('caseTargetId')?.value.trim();
  if (!targetUserId) { alert('User ID is required.'); return; }
  const btn = document.getElementById('caseModalConfirm');
  btn.disabled = true;
  try {
    const type     = document.getElementById('caseType')?.value || 'warn';
    const duration = document.getElementById('caseDuration')?.value.trim() || undefined;
    const res = await fetch(`/api/guild/${guildId}/cases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId,
        type,
        targetTag: document.getElementById('caseTargetTag')?.value.trim() || undefined,
        reason: document.getElementById('caseReason')?.value.trim() || 'No reason provided.',
        duration,
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