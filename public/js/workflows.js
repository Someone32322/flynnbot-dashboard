/**
 * workflows.js — Workflow list management for the server dashboard.
 *
 * Reads guild ID from #pageData data-guild-id (CSP-safe; no inline scripts).
 * Lazy-loads when the "workflows" section is activated via sectionActivated event.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _loaded  = false;
  let _workflows = [];

  // ── Trigger type labels ───────────────────────────────────────
  const TRIGGER_LABELS = {
    slash:       'Slash Command',
    prefix:      'Prefix Command',
    contains:    'Message Contains',
    exact:       'Exact Match',
    regex:       'Regex Match',
    button:      'Button Click',
    select_menu: 'Select Menu',
    reaction:    'Reaction Add',
    member_join: 'Member Join',
    member_leave:'Member Leave',
    scheduled:   'Scheduled',
  };

  // ── Bootstrap ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const pageData = document.getElementById('pageData');
    _guildId = pageData?.dataset?.guildId;
    if (!_guildId) return;

    // Handle section activation (lazy load)
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section !== 'custom-commands') return;
      if (!_loaded) loadWorkflows();
    });

    // If already on custom-commands section (e.g. navigated here via hash)
    const sec = document.getElementById('section-custom-commands');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) loadWorkflows();
    }

    // New Workflow button
    document.getElementById('wfNewBtn')?.addEventListener('click', () => {
      window.location.href = `/dashboard/${_guildId}/workflows/editor`;
    });
  });

  // ── API helpers ───────────────────────────────────────────────
  async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ── Load & render ─────────────────────────────────────────────
  async function loadWorkflows() {
    _loaded = true;
    const container = document.getElementById('wfList');
    if (!container) return;
    container.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading workflows…</div>';
    try {
      _workflows = await apiFetch(`/guild/${_guildId}/workflows`);
      render(container);
    } catch (err) {
      container.innerHTML = `<div class="commands-loading" style="color:#f87171">Failed to load workflows: ${escHtml(err.message)}</div>`;
    }
  }

  function render(container) {
    if (!_workflows.length) {
      container.innerHTML = `
        <div class="wf-empty">
          <div class="wf-empty-icon">⚡</div>
          <div class="wf-empty-title">No workflows yet</div>
          <div class="wf-empty-sub">Create your first workflow to automate interactions, responses, and moderation actions.</div>
          <button class="btn btn-primary wf-empty-cta" id="wfEmptyNewBtn">+ Create Workflow</button>
        </div>`;
      document.getElementById('wfEmptyNewBtn')?.addEventListener('click', () => {
        window.location.href = `/dashboard/${_guildId}/workflows/editor`;
      });
      return;
    }

    container.innerHTML = '';
    _workflows.forEach((wf) => {
      container.appendChild(buildRow(wf));
    });
  }

  function buildRow(wf) {
    const row = document.createElement('div');
    row.className = 'wf-row';
    row.dataset.id = wf._id;

    const triggerLabel = TRIGGER_LABELS[wf.trigger?.type] || wf.trigger?.type || 'Unknown';
    const triggerVal   = wf.trigger?.value ? ` · ${escHtml(wf.trigger.value)}` : '';
    const execCount    = wf.metadata?.executionCount ?? 0;
    const statusClass  = wf.enabled ? 'wf-status--on' : 'wf-status--off';
    const statusText   = wf.enabled ? 'Enabled' : 'Disabled';

    row.innerHTML = `
      <div class="wf-row-left">
        <div class="wf-row-name">${escHtml(wf.name)}</div>
        <div class="wf-row-meta">
          <span class="wf-trigger-badge">${escHtml(triggerLabel)}${triggerVal}</span>
          <span class="wf-exec-count">${execCount} run${execCount !== 1 ? 's' : ''}</span>
        </div>
        ${wf.description ? `<div class="wf-row-desc">${escHtml(wf.description)}</div>` : ''}
      </div>
      <div class="wf-row-actions">
        <span class="wf-status-badge ${statusClass}">${statusText}</span>
        <label class="toggle-switch" title="${wf.enabled ? 'Disable workflow' : 'Enable workflow'}">
          <input type="checkbox" class="wf-toggle" ${wf.enabled ? 'checked' : ''} aria-label="Toggle ${escHtml(wf.name)}">
          <span class="toggle-slider"></span>
        </label>
        <button class="btn btn-ghost btn-sm wf-edit-btn" data-id="${escHtml(wf._id)}">Edit</button>
        <button class="btn btn-ghost btn-sm wf-delete-btn" data-id="${escHtml(wf._id)}" data-name="${escHtml(wf.name)}" style="color:#f87171">Delete</button>
      </div>`;

    // Toggle enabled
    row.querySelector('.wf-toggle').addEventListener('change', (e) => handleToggle(wf, e.target, row));

    // Edit
    row.querySelector('.wf-edit-btn').addEventListener('click', () => {
      window.location.href = `/dashboard/${_guildId}/workflows/editor/${wf._id}`;
    });

    // Delete
    row.querySelector('.wf-delete-btn').addEventListener('click', () => handleDelete(wf, row));

    return row;
  }

  // ── Toggle ────────────────────────────────────────────────────
  async function handleToggle(wf, toggleEl, row) {
    toggleEl.disabled = true;
    try {
      const updated = await apiFetch(`/guild/${_guildId}/workflows/${wf._id}/toggle`, { method: 'PATCH' });
      wf.enabled = updated.enabled;
      const badge = row.querySelector('.wf-status-badge');
      if (badge) {
        badge.className = `wf-status-badge ${wf.enabled ? 'wf-status--on' : 'wf-status--off'}`;
        badge.textContent = wf.enabled ? 'Enabled' : 'Disabled';
      }
      toggleEl.checked = wf.enabled;
      showToast(`${escHtml(wf.name)} ${wf.enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      toggleEl.checked = !toggleEl.checked; // revert
      showToast(`Failed: ${err.message}`, 'error');
    } finally {
      toggleEl.disabled = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(wf, row) {
    const confirmed = await (window.showConfirm
      ? window.showConfirm(`Delete workflow "${wf.name}"? This cannot be undone.`, { title: 'Delete Workflow', confirmText: 'Delete' })
      : Promise.resolve(window.confirm(`Delete workflow "${wf.name}"? This cannot be undone.`)));
    if (!confirmed) return;

    row.style.opacity = '0.5';
    row.style.pointerEvents = 'none';
    try {
      await apiFetch(`/guild/${_guildId}/workflows/${wf._id}`, { method: 'DELETE' });
      _workflows = _workflows.filter((w) => w._id !== wf._id);
      row.remove();
      if (!_workflows.length) {
        const container = document.getElementById('wfList');
        if (container) render(container);
      }
      showToast(`"${wf.name}" deleted`, 'success');
    } catch (err) {
      row.style.opacity = '';
      row.style.pointerEvents = '';
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // ── Toast ─────────────────────────────────────────────────────
  function showToast(msg, type) {
    // Use global toast if available (from app.js)
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    // Fallback: simple in-page toast
    let el = document.getElementById('wfToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wfToast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.className = `toast ${type}`;
    el.textContent = type === 'success' ? `✓  ${msg}` : `✕  ${msg}`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ── Utility ───────────────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
