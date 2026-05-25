/**
 * custom-commands.js — Custom Commands list page
 *
 * Shows all commands for a guild with their trigger type, name, and status.
 * New Command → navigates to dedicated builder page
 * Edit button  → navigates to builder page with existing command pre-loaded
 * Delete button → confirmation + API call
 *
 * The block-based workflow builder lives at:
 *   New:  /dashboard/:guildId/commands/builder
 *   Edit: /dashboard/:guildId/commands/builder/:cmdId
 */
(function () {
  'use strict';

  let _guildId     = null;
  let _cmds        = [];
  let _loaded      = false;
  let _loading     = false;
  let _filterType  = '';
  let _filterQuery = '';

  // ── Init ──────────────────────────────────────────────────────
  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'custom-commands') {
        _loaded = false; // reset so re-activation always re-fetches
        load();
      }
    });
    const sec = document.getElementById('section-custom-commands');
    if (sec && sec.style.display !== 'none' && !_loaded) load();
  }

  async function load(force = false) {
    if (_loading || (_loaded && !force)) return;
    _loading = true;
    _loaded = true;
    const container = document.getElementById('customCommandsContent');
    if (!container) {
      _loading = false;
      return;
    }
    container.innerHTML = '<div class="cc-loading"><div class="spinner"></div>Loading custom commands…</div>';
    try {
      const res  = await fetch(`/api/guild/${_guildId}/guild-commands`);
      const json = await res.json();
      _cmds = Array.isArray(json.commands) ? json.commands : (Array.isArray(json) ? json : []);
      renderList();
    } catch (err) {
      console.error('[CC]', err);
      container.innerHTML = `
        <div class="cc-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Failed to load commands.
        </div>`;
    } finally {
      _loading = false;
    }
  }

  // ── List view ─────────────────────────────────────────────────
  function renderList() {
    const container = document.getElementById('customCommandsContent');
    if (!container) return;

    const TRIGGER_TYPES = ['slash','prefix','contains','exact','regex','startsWith','button','select_menu','reaction_add','reaction_remove','member_join','member_leave','voice_join','voice_leave','message_delete','scheduled'];

    const TRIGGER_ICONS = {
      slash:           `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
      prefix:          `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`,
      contains:        `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
      exact:           `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
      regex:           `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 9h6v6H9z"/><path d="M3 3h18v18H3z"/></svg>`,
      startsWith:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`,
      button:          `<span style="font-size:12px;line-height:1">\ud83d\udd18</span>`,
      select_menu:     `<span style="font-size:12px;line-height:1">\ud83d\udccb</span>`,
      reaction_add:    `<span style="font-size:12px;line-height:1">\ud83d\udc4d</span>`,
      reaction_remove: `<span style="font-size:12px;line-height:1">\ud83d\udc4e</span>`,
      member_join:     `<span style="font-size:12px;line-height:1">\u2705</span>`,
      member_leave:    `<span style="font-size:12px;line-height:1">\ud83d\udc4b</span>`,
      voice_join:      `<span style="font-size:12px;line-height:1">\ud83d\udd0a</span>`,
      voice_leave:     `<span style="font-size:12px;line-height:1">\ud83d\udd07</span>`,
      message_delete:  `<span style="font-size:12px;line-height:1">\ud83d\uddd1\ufe0f</span>`,
      scheduled:       `<span style="font-size:12px;line-height:1">\u23f0</span>`,
    };
    const TRIGGER_LABELS = {
      slash:           'Slash',
      prefix:          'Prefix',
      contains:        'Contains',
      exact:           'Exact',
      regex:           'Regex',
      startsWith:      'Starts With',
      button:          'Button',
      select_menu:     'Select Menu',
      reaction_add:    'Reaction',
      reaction_remove: 'Unreaction',
      member_join:     'Member Join',
      member_leave:    'Member Leave',
      voice_join:      'Voice Join',
      voice_leave:     'Voice Leave',
      message_delete:  'Msg Delete',
      scheduled:       'Scheduled',
    };

    const filtered = _cmds.filter(cmd => {
      if (_filterType && (cmd.trigger?.type || 'exact') !== _filterType) return false;
      if (_filterQuery) {
        const q = _filterQuery.toLowerCase();
        const name = (cmd.name || '').toLowerCase();
        const val = (cmd.trigger?.value || '').toLowerCase();
        if (!name.includes(q) && !val.includes(q)) return false;
      }
      return true;
    });

    const listHTML = filtered.length === 0 && !_filterType && !_filterQuery ? `
      <div class="cc-empty">
        <div class="cc-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </div>
        <p class="cc-empty-title">No custom commands yet</p>
        <p class="cc-empty-sub">Create your first command to respond to messages or slash commands with rich actions, embeds, role changes, and more.</p>
        <button class="btn btn-primary" id="ccEmptyNewBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create First Command
        </button>
      </div>
    ` : filtered.length === 0 ? `
      <div class="cc-empty" style="padding:32px 0">
        <p class="cc-empty-title" style="font-size:15px">No results</p>
        <p class="cc-empty-sub">Try adjusting your search or filter</p>
      </div>
    ` : `
      <div class="cc-list" id="ccList">
        ${filtered.map((cmd) => {
          const ttype = cmd.trigger?.type || cmd.triggerType || 'exact';
          const blockCount = Array.isArray(cmd.blocks) ? cmd.blocks.length : 0;
          return `
            <div class="cc-card ${cmd.enabled === false ? 'cc-card--disabled' : ''}" data-cmd-id="${esc(cmd._id)}">
              <div class="cc-card-left">
                <div class="cc-trigger-badge cc-trigger-${esc(ttype)}">
                  ${TRIGGER_ICONS[ttype] || TRIGGER_ICONS.exact}
                  <span>${TRIGGER_LABELS[ttype] || esc(ttype)}</span>
                </div>
                <div class="cc-card-info">
                  <div class="cc-card-name">${esc(cmd.name)}</div>
                  <div class="cc-card-trigger">
                    ${cmd.trigger ? `<code>${esc(cmd.trigger)}</code>` : ''}
                    ${blockCount > 0 ? `<span class="cc-card-blocks">${blockCount} block${blockCount !== 1 ? 's' : ''}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="cc-card-right">
                <span class="cc-status-dot ${cmd.enabled === false ? '' : 'cc-status-dot--on'}" title="${cmd.enabled === false ? 'Disabled' : 'Enabled'}"></span>
                <button class="cc-icon-btn" data-action="duplicate" data-id="${esc(cmd._id || cmd.id)}" title="Duplicate command">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                </button>
                <button class="cc-icon-btn" data-action="edit" data-id="${esc(cmd._id || cmd.id)}" title="Open in builder">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="cc-icon-btn cc-icon-btn--danger" data-action="delete" data-id="${esc(cmd._id || cmd.id)}" title="Delete command">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = `
      <div class="cc-page">
        <div class="cc-page-header">
          <div>
            <h3 class="cc-page-title">Custom Commands</h3>
            <p class="cc-page-sub">${_cmds.length} command${_cmds.length !== 1 ? 's' : ''} configured</p>
          </div>
          <button class="btn btn-primary cc-new-btn" id="ccNewBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Command
          </button>
        </div>
        <div class="cc-toolbar" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <div style="position:relative;flex:1;min-width:160px">
            <svg style="position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--text-4)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="ccSearchInput" class="cc-search-input" type="text" placeholder="Search commands..." style="padding-left:28px;width:100%" value="${esc(_filterQuery)}">
          </div>
          <select id="ccTypeFilter" class="cc-select" style="min-width:130px;width:auto;flex-shrink:0">
            <option value="">All Triggers</option>
            ${TRIGGER_TYPES.map(t => `<option value="${esc(t)}"${_filterType === t ? ' selected' : ''}>${esc(TRIGGER_LABELS[t] || t)}</option>`).join('')}
          </select>
        </div>
        ${listHTML}
      </div>
    `;

    document.getElementById('ccNewBtn')?.addEventListener('click', () => openBuilder(null));
    document.getElementById('ccEmptyNewBtn')?.addEventListener('click', () => openBuilder(null));
    document.getElementById('ccSearchInput')?.addEventListener('input', (e) => { _filterQuery = e.target.value; renderList(); });
    document.getElementById('ccTypeFilter')?.addEventListener('change', (e) => { _filterType = e.target.value; renderList(); });
    document.querySelectorAll('[data-action="edit"]').forEach(btn =>
      btn.addEventListener('click', () => openBuilder(btn.dataset.id))
    );
    document.querySelectorAll('[data-action="duplicate"]').forEach(btn =>
      btn.addEventListener('click', () => duplicateCmd(btn.dataset.id))
    );
    document.querySelectorAll('[data-action="delete"]').forEach(btn =>
      btn.addEventListener('click', () => deleteCmd(btn.dataset.id))
    );
  }

  // ── Navigate to dedicated builder page ───────────────────────
  function openBuilder(id) {
    if (id === 'undefined') id = null;
    const url = id
      ? `/dashboard/${_guildId}/commands/builder/${id}`
      : `/dashboard/${_guildId}/commands/builder`;
    window.location.href = url;
  }

  // ── Duplicate command ─────────────────────────────────────────
  async function duplicateCmd(id) {
    try {
      const res = await fetch(`/api/guild/${_guildId}/guild-commands/${id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Duplicate failed');
      const data = await res.json();
      _cmds.push(data.command);
      window.showToast?.('Command duplicated.', 'success');
      renderList();
    } catch {
      window.showToast?.('Failed to duplicate command.', 'error');
    }
  }

  // ── Delete command ────────────────────────────────────────────
  async function deleteCmd(id) {
    const cmd = _cmds.find(c => (c._id || c.id) === id);
    const ok  = await window.showConfirm?.(
      `Delete "${cmd?.name || 'this command'}"? This cannot be undone.`,
      { title: 'Delete Command', confirmText: 'Delete', type: 'danger' }
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/guild/${_guildId}/guild-commands/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      _cmds = _cmds.filter(c => (c._id || c.id) !== id);
      window.showToast?.('Command deleted.', 'success');
      renderList();
    } catch {
      window.showToast?.('Failed to delete command.', 'error');
    }
  }

  // ── Helper ────────────────────────────────────────────────────
  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Bootstrap ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const pageData = document.getElementById('pageData');
    const gId = pageData?.dataset?.guildId;
    if (!gId) return;
    init(gId);
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted && _guildId) {
      load(true);
    }
  });
})();


