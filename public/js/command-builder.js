/**
 * command-builder.js — Advanced Command Builder
 * Dedicated full-page builder for custom Discord commands.
 * Security: All inputs are plain text/data — no eval, no code execution.
 * Block types are whitelisted. All IDs validated client-side against loaded guild data.
 */
(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────
  let _guildId = '';
  let _cmdId = '';
  let _roles = [];
  let _channels = [];
  let _blocks = [];
  let _idCounter = 0;
  let _dirty = false;
  let _saving = false;
  let _pendingNavUrl = null;

  // Role/channel selections stored as arrays of IDs
  let _selectedRoles = [];
  let _selectedChannels = [];

  // ── Block metadata ────────────────────────────────────────────
  const BLOCK_META = {
    reply:       { label: 'Send Reply',    iconKey: 'reply',       color: 'var(--green)' },
    message:     { label: 'Send Message',  iconKey: 'message',     color: '#60a5fa' },
    embed:       { label: 'Send Embed',    iconKey: 'embed',       color: '#7289da' },
    dm:          { label: 'DM User',       iconKey: 'dm',          color: 'var(--yellow)' },
    add_role:    { label: 'Add Role',      iconKey: 'add_role',    color: 'var(--green)' },
    remove_role: { label: 'Remove Role',   iconKey: 'remove_role', color: 'var(--red)' },
    react:       { label: 'Add Reaction',  iconKey: 'react',       color: 'var(--yellow)' },
  };

  const BLOCK_ICONS = {
    reply:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
    message:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,
    embed:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
    dm:          `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    add_role:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    remove_role: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    react:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  };

  // ── Helpers ───────────────────────────────────────────────────
  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function el(id) { return document.getElementById(id); }

  function markDirty() {
    if (_dirty) return;
    _dirty = true;
    const btn = el('cbSaveBtn');
    if (btn && !btn.querySelector('.cb-unsaved-dot')) {
      const dot = document.createElement('span');
      dot.className = 'cb-unsaved-dot';
      btn.insertBefore(dot, btn.firstChild);
    }
  }

  function markClean() {
    _dirty = false;
    const dot = el('cbSaveBtn')?.querySelector('.cb-unsaved-dot');
    if (dot) dot.remove();
  }

  function showToast(msg, type = 'info') {
    window.showToast?.(msg, type);
  }

  // ── Init ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    const pageData = el('cbPageData');
    if (!pageData) return;

    _guildId = pageData.dataset.guildId || '';
    _cmdId   = pageData.dataset.cmdId   || '';

    if (!_guildId) return;

    // Wire top-level events
    wireStaticEvents();

    // Load roles + channels, then load cmd if editing
    try {
      const [roles, channels] = await Promise.all([
        fetch(`/api/guild/${_guildId}/roles`).then(r => r.json()).catch(() => []),
        fetch(`/api/guild/${_guildId}/channels`).then(r => r.json()).catch(() => []),
      ]);
      _roles    = Array.isArray(roles) ? roles.filter(r => !r.managed && r.name !== '@everyone') : [];
      _channels = Array.isArray(channels) ? channels.filter(c => c.type === 0 || c.type === 5 || c.type === 11) : [];

      populateRoleSelect();
      populateChannelSelect();

      // Load existing command if editing
      let cmd = null;
      const rawJson = pageData.dataset.cmdJson;
      if (rawJson) {
        try { cmd = JSON.parse(rawJson.replace(/&quot;/g, '"')); } catch {}
      }

      if (cmd) {
        loadCommand(cmd);
      } else {
        // Default: one reply block
        addBlock('reply', {});
      }
    } catch (err) {
      console.error('[Builder] init error', err);
    }

    // Show the flow
    el('cbCanvasLoading').style.display = 'none';
    el('cbFlow').style.display = '';

    // Wire collapse toggles on fixed blocks
    wireCollapseToggle('cbBlockTrigger');
    wireCollapseToggle('cbBlockRestrictions');
  });

  // ── Wire static (non-block) events ───────────────────────────
  function wireStaticEvents() {
    // Save button
    el('cbSaveBtn')?.addEventListener('click', handleSave);

    // Enabled label update
    el('cbEnabled')?.addEventListener('change', () => {
      const checked = el('cbEnabled').checked;
      el('cbEnabledLabel').textContent = checked ? 'Enabled' : 'Disabled';
      markDirty();
    });

    // Command name
    el('cbCmdName')?.addEventListener('input', markDirty);

    // Trigger type tabs
    el('cbTriggerTypeTabs')?.addEventListener('click', e => {
      const tab = e.target.closest('[data-ttype]');
      if (!tab) return;
      document.querySelectorAll('.cb-tab').forEach(t => t.classList.remove('cb-tab--active'));
      tab.classList.add('cb-tab--active');
      updateTriggerHints(tab.dataset.ttype);
      markDirty();
    });

    // Trigger input + desc + cooldown
    el('cbTrigger')?.addEventListener('input', () => { updateTriggerSummary(); markDirty(); });
    el('cbDescription')?.addEventListener('input', markDirty);
    el('cbCooldown')?.addEventListener('input', markDirty);
    el('cbCaseSensitive')?.addEventListener('change', () => { updateRestrictionSummary(); markDirty(); });
    el('cbDeleteTrigger')?.addEventListener('change', () => { updateRestrictionSummary(); markDirty(); });

    // Add block button/menu
    el('cbAddBlockBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      const menu = el('cbAddBlockMenu');
      if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
    });
    document.addEventListener('click', () => {
      const menu = el('cbAddBlockMenu');
      if (menu) menu.style.display = 'none';
    });
    el('cbAddBlockMenu')?.addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.target.closest('[data-add-block]');
      if (!btn) return;
      addBlock(btn.dataset.addBlock, {});
      const menu = el('cbAddBlockMenu');
      if (menu) menu.style.display = 'none';
    });

    // Palette items in side panel
    document.querySelectorAll('.cb-panel [data-add-block]').forEach(btn => {
      btn.addEventListener('click', () => addBlock(btn.dataset.addBlock, {}));
    });

    // Variables copy-to-clipboard
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => showToast(`Copied ${text}`, 'success')).catch(() => {});
      });
    });

    // Back button — check unsaved
    el('cbBackBtn')?.addEventListener('click', e => {
      if (_dirty) {
        e.preventDefault();
        _pendingNavUrl = el('cbBackBtn').href;
        showUnsavedModal();
      }
    });

    // Unsaved modal buttons
    el('cbUnsavedStay')?.addEventListener('click', hideUnsavedModal);
    el('cbUnsavedLeave')?.addEventListener('click', () => {
      _dirty = false;
      if (_pendingNavUrl) window.location.href = _pendingNavUrl;
    });

    // Browser back/close
    window.addEventListener('beforeunload', e => {
      if (_dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    // Role select
    el('cbReqRolesSelect')?.addEventListener('change', () => {
      const val = el('cbReqRolesSelect').value;
      if (!val || _selectedRoles.includes(val)) {
        el('cbReqRolesSelect').value = '';
        return;
      }
      _selectedRoles.push(val);
      el('cbReqRolesSelect').value = '';
      renderMultiTags('cbReqRolesTags', _selectedRoles, _roles, removeRole);
      updateRestrictionSummary();
      markDirty();
    });

    // Channel select
    el('cbAllowedChannelsSelect')?.addEventListener('change', () => {
      const val = el('cbAllowedChannelsSelect').value;
      if (!val || _selectedChannels.includes(val)) {
        el('cbAllowedChannelsSelect').value = '';
        return;
      }
      _selectedChannels.push(val);
      el('cbAllowedChannelsSelect').value = '';
      renderMultiTags('cbAllowedChannelsTags', _selectedChannels, _channels, removeChannel);
      updateRestrictionSummary();
      markDirty();
    });
  }

  function removeRole(id) {
    _selectedRoles = _selectedRoles.filter(r => r !== id);
    renderMultiTags('cbReqRolesTags', _selectedRoles, _roles, removeRole);
    updateRestrictionSummary();
    markDirty();
  }

  function removeChannel(id) {
    _selectedChannels = _selectedChannels.filter(c => c !== id);
    renderMultiTags('cbAllowedChannelsTags', _selectedChannels, _channels, removeChannel);
    updateRestrictionSummary();
    markDirty();
  }

  function renderMultiTags(containerId, selectedIds, allItems, onRemove) {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = selectedIds.map(id => {
      const item = allItems.find(r => r.id === id);
      const name = item ? item.name : id;
      return `<span class="cb-tag">${esc(name)}<button class="cb-tag-remove" data-remove-id="${esc(id)}" aria-label="Remove">&times;</button></span>`;
    }).join('');
    container.querySelectorAll('[data-remove-id]').forEach(btn => {
      btn.addEventListener('click', () => onRemove(btn.dataset.removeId));
    });
  }

  function populateRoleSelect() {
    const sel = el('cbReqRolesSelect');
    if (!sel) return;
    sel.innerHTML = `<option value="">Add a required role…</option>` +
      _roles.map(r => {
        const hex = r.color ? '#' + r.color.toString(16).padStart(6, '0') : '';
        return `<option value="${esc(r.id)}" style="${hex ? 'color:' + hex : ''}">${esc(r.name)}</option>`;
      }).join('');
  }

  function populateChannelSelect() {
    const sel = el('cbAllowedChannelsSelect');
    if (!sel) return;
    sel.innerHTML = `<option value="">Add an allowed channel…</option>` +
      _channels.map(c => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('');
  }

  // ── Trigger hints ─────────────────────────────────────────────
  function updateTriggerHints(type) {
    const hint = el('cbTriggerHint');
    const triggerInput = el('cbTrigger');
    const descField = el('cbDescField');
    const hints = {
      slash:    'Slash command name — lowercase, no spaces or special chars. e.g. "greet"',
      prefix:   'Full prefix trigger including symbol. e.g. "!hello"',
      contains: 'Bot replies when a message contains this text',
      exact:    'Bot replies when a message exactly matches this text',
      regex:    'JavaScript-compatible regex pattern (no surrounding slashes)',
    };
    const placeholders = {
      slash: 'e.g. greet', prefix: 'e.g. !hello',
      contains: 'e.g. good morning', exact: 'e.g. hello bot', regex: 'e.g. \\bhello\\b',
    };
    if (hint) hint.textContent = hints[type] || '';
    if (triggerInput) triggerInput.placeholder = placeholders[type] || '';
    if (descField) descField.style.display = type === 'slash' ? '' : 'none';
    updateTriggerSummary();
  }

  function updateTriggerSummary() {
    const ttype = document.querySelector('.cb-tab--active')?.dataset.ttype || 'slash';
    const trigger = el('cbTrigger')?.value?.trim() || '';
    const labels = { slash: 'Slash', prefix: 'Prefix', contains: 'Contains', exact: 'Exact', regex: 'Regex' };
    const s = el('cbTriggerSummary');
    if (s) s.textContent = trigger ? `${labels[ttype] || ttype}: ${trigger}` : `${labels[ttype] || 'Slash'} command`;
  }

  function updateRestrictionSummary() {
    const s = el('cbRestrictionsSummary');
    if (!s) return;
    const parts = [];
    if (_selectedRoles.length) parts.push(`${_selectedRoles.length} role${_selectedRoles.length !== 1 ? 's' : ''} required`);
    if (_selectedChannels.length) parts.push(`${_selectedChannels.length} channel${_selectedChannels.length !== 1 ? 's' : ''} allowed`);
    if (el('cbCaseSensitive')?.checked) parts.push('case sensitive');
    if (el('cbDeleteTrigger')?.checked) parts.push('delete trigger');
    s.textContent = parts.length ? parts.join(' · ') : 'No restrictions';
  }

  // ── Collapse toggles ──────────────────────────────────────────
  function wireCollapseToggle(blockId) {
    const block = el(blockId);
    if (!block) return;
    const btn = block.querySelector('.cb-block-collapse-btn');
    if (!btn) return;
    const targetId = btn.dataset.collapseTarget;
    const body = el(targetId);
    if (!body) return;
    btn.addEventListener('click', () => {
      const isCollapsed = body.classList.contains('cb-block-body--collapsed');
      body.classList.toggle('cb-block-body--collapsed', !isCollapsed);
      const chevron = btn.querySelector('.cb-chevron');
      if (chevron) chevron.classList.toggle('cb-chevron--up', !isCollapsed);
    });
  }

  // ── Load existing command ─────────────────────────────────────
  function loadCommand(cmd) {
    // Name
    const nameInput = el('cbCmdName');
    if (nameInput) nameInput.value = cmd.name || '';

    // Enabled
    const enabledCb = el('cbEnabled');
    if (enabledCb) {
      enabledCb.checked = cmd.enabled !== false;
      el('cbEnabledLabel').textContent = enabledCb.checked ? 'Enabled' : 'Disabled';
    }

    // Trigger type
    const ttype = cmd.triggerType || 'slash';
    document.querySelectorAll('.cb-tab').forEach(t => {
      t.classList.toggle('cb-tab--active', t.dataset.ttype === ttype);
    });
    updateTriggerHints(ttype);

    // Trigger/desc/cooldown
    if (el('cbTrigger')) el('cbTrigger').value = cmd.trigger || '';
    if (el('cbDescription')) el('cbDescription').value = cmd.description || '';
    if (el('cbCooldown')) el('cbCooldown').value = cmd.cooldownSeconds ?? 0;

    // Restrictions
    if (el('cbCaseSensitive')) el('cbCaseSensitive').checked = !!cmd.caseSensitive;
    if (el('cbDeleteTrigger')) el('cbDeleteTrigger').checked = !!cmd.deleteUserMessage;

    // Multi-selects
    _selectedRoles = Array.isArray(cmd.allowedRoles) ? [...cmd.allowedRoles] : [];
    _selectedChannels = Array.isArray(cmd.allowedChannels) ? [...cmd.allowedChannels] : [];
    renderMultiTags('cbReqRolesTags', _selectedRoles, _roles, removeRole);
    renderMultiTags('cbAllowedChannelsTags', _selectedChannels, _channels, removeChannel);
    updateRestrictionSummary();
    updateTriggerSummary();

    // Blocks
    _blocks = [];
    _idCounter = 0;
    if (Array.isArray(cmd.blocks) && cmd.blocks.length) {
      cmd.blocks.forEach(b => addBlock(b.type, b.data || {}));
    } else {
      // Legacy fallback
      if (cmd.type === 'embed') {
        addBlock('embed', {
          title: cmd.embedTitle || '',
          description: cmd.embedDescription || cmd.response || '',
          color: cmd.embedColor || '#5865f2',
        });
      } else if (cmd.response) {
        addBlock('reply', { content: cmd.response });
      } else {
        addBlock('reply', {});
      }
    }
  }

  // ── Block management ──────────────────────────────────────────
  function addBlock(type, data) {
    if (!BLOCK_META[type]) return;
    const id = ++_idCounter;
    _blocks.push({ id, type, data: data || {} });
    renderAllBlocks();
    markDirty();
    // Scroll to new block
    requestAnimationFrame(() => {
      el(`cb-b-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function removeBlock(id) {
    _blocks = _blocks.filter(b => b.id !== id);
    renderAllBlocks();
    markDirty();
  }

  function moveBlock(id, direction) {
    const idx = _blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= _blocks.length) return;
    const arr = [..._blocks];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    _blocks = arr;
    renderAllBlocks();
    markDirty();
    requestAnimationFrame(() => el(`cb-b-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  // ── Render blocks ─────────────────────────────────────────────
  function renderAllBlocks() {
    const container = el('cbActionBlocks');
    if (!container) return;

    container.innerHTML = _blocks.map((b, i) => renderBlockHTML(b, i)).join('');

    // Wire events for each block
    _blocks.forEach((b, i) => {
      // Remove
      el(`cb-b-remove-${b.id}`)?.addEventListener('click', () => removeBlock(b.id));
      // Move up
      el(`cb-b-up-${b.id}`)?.addEventListener('click', () => moveBlock(b.id, -1));
      // Move down
      el(`cb-b-down-${b.id}`)?.addEventListener('click', () => moveBlock(b.id, 1));
      // Collapse
      wireCollapseToggle(`cb-b-${b.id}`);

      // Block-specific input events
      wireBlockInputs(b.id, b.type);
    });
  }

  function renderBlockHTML(b, idx) {
    const meta = BLOCK_META[b.type];
    const icon = BLOCK_ICONS[b.type] || '';
    const isFirst = idx === 0;
    const isLast = idx === _blocks.length - 1;
    const connector = idx > 0 ? '<div class="cb-connector"></div>' : '';

    const body = buildBlockBody(b);
    const summary = buildBlockSummary(b);

    return `${connector}<div class="cb-block cb-block--${esc(b.type)}" id="cb-b-${b.id}">
      <div class="cb-block-header">
        <div class="cb-block-header-left">
          <div class="cb-block-drag-handle" title="Drag to reorder">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </div>
          <div class="cb-block-type-icon cb-icon--${esc(b.type)}">${icon}</div>
          <div class="cb-block-type-label">${esc(meta.label)}</div>
          <div class="cb-block-summary" id="cb-b-summary-${b.id}">${esc(summary)}</div>
        </div>
        <div class="cb-block-header-right">
          <button class="cb-block-action-btn" id="cb-b-up-${b.id}" title="Move up" ${isFirst ? 'disabled style="opacity:0.3"' : ''}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="cb-block-action-btn" id="cb-b-down-${b.id}" title="Move down" ${isLast ? 'disabled style="opacity:0.3"' : ''}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="cb-block-action-btn cb-block-action-btn--danger" id="cb-b-remove-${b.id}" title="Remove block">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button class="cb-block-collapse-btn" data-collapse-target="cb-b-body-${b.id}" aria-label="Toggle">
            <svg class="cb-chevron cb-chevron--up" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>
      <div class="cb-block-body" id="cb-b-body-${b.id}">${body}</div>
    </div>`;
  }

  function buildBlockBody(b) {
    const id = b.id;
    const d = b.data || {};

    if (b.type === 'reply') {
      return `<div class="cb-field">
        <label class="cb-label" for="cb-f-${id}-content">Message Content <span class="cb-req">*</span></label>
        <textarea class="cb-input cb-textarea cb-textarea--tall" id="cb-f-${id}-content" maxlength="2000" placeholder="Your reply… Use {user}, {username}, {server}, {channel}, {membercount}">${esc(d.content || '')}</textarea>
        <div class="cb-hint">Replies to the user's message. Max 2000 characters.</div>
      </div>
      <div class="cb-toggles-row">
        <label class="cb-toggle-label">
          <input type="checkbox" class="cb-checkbox" id="cb-f-${id}-ephemeral" ${d.ephemeral ? 'checked' : ''}>
          <span>Ephemeral <span class="cb-hint-inline">(only visible to user, slash commands only)</span></span>
        </label>
      </div>`;
    }

    if (b.type === 'message') {
      return `<div class="cb-field">
        <label class="cb-label" for="cb-f-${id}-content">Message Content <span class="cb-req">*</span></label>
        <textarea class="cb-input cb-textarea cb-textarea--tall" id="cb-f-${id}-content" maxlength="2000" placeholder="Message text… Use {user}, {username}, {server}, {channel}">${esc(d.content || '')}</textarea>
        <div class="cb-hint">Sends a new message to the channel (not a reply). Max 2000 characters.</div>
      </div>`;
    }

    if (b.type === 'embed') {
      return buildEmbedBody(id, d);
    }

    if (b.type === 'dm') {
      return `<div class="cb-field">
        <label class="cb-label" for="cb-f-${id}-content">DM Content <span class="cb-req">*</span></label>
        <textarea class="cb-input cb-textarea" id="cb-f-${id}-content" maxlength="2000" placeholder="Message to send privately to the user… Use {user}, {server}">${esc(d.content || '')}</textarea>
        <div class="cb-hint">Sends a direct message to the triggering user. Will silently fail if they have DMs disabled.</div>
      </div>`;
    }

    if (b.type === 'add_role' || b.type === 'remove_role') {
      const roleOpts = _roles.map(r => {
        const hex = r.color ? '#' + r.color.toString(16).padStart(6, '0') : '';
        const sel = d.roleId === r.id ? 'selected' : '';
        return `<option value="${esc(r.id)}" ${sel} style="${hex ? 'color:'+hex : ''}">${esc(r.name)}</option>`;
      }).join('');
      const verb = b.type === 'add_role' ? 'Add' : 'Remove';
      const hint = b.type === 'add_role'
        ? 'Assigns this role to the user who triggered the command.'
        : 'Removes this role from the user who triggered the command.';
      return `<div class="cb-field">
        <label class="cb-label" for="cb-f-${id}-role">Role to ${verb} <span class="cb-req">*</span></label>
        <select class="cb-input" id="cb-f-${id}-role">
          <option value="">— Select a role —</option>
          ${roleOpts}
        </select>
        <div class="cb-hint">${hint}</div>
      </div>`;
    }

    if (b.type === 'react') {
      return `<div class="cb-field">
        <label class="cb-label" for="cb-f-${id}-emoji">Emoji <span class="cb-req">*</span></label>
        <input class="cb-input" type="text" id="cb-f-${id}-emoji" maxlength="50" placeholder="e.g. 👍 or :thumbsup: or custom emoji ID" value="${esc(d.emoji || '')}">
        <div class="cb-hint cb-emoji-hint">Use a standard emoji (👍), a Discord emoji name (:thumbsup:), or a custom emoji (&lt;:name:id&gt;).</div>
      </div>`;
    }

    return '';
  }

  function buildEmbedBody(id, d) {
    const fields = Array.isArray(d.fields) ? d.fields : [];
    const fieldsHTML = fields.map((f, fi) => `
      <div class="cb-embed-field-row" id="cb-f-${id}-fieldrow-${fi}">
        <div class="cb-field cb-field--grow">
          <label class="cb-label">Field Name</label>
          <input class="cb-input" type="text" id="cb-f-${id}-fn-${fi}" maxlength="256" value="${esc(f.name || '')}" placeholder="Field title">
        </div>
        <div class="cb-field cb-field--grow">
          <label class="cb-label">Field Value</label>
          <input class="cb-input" type="text" id="cb-f-${id}-fv-${fi}" maxlength="1024" value="${esc(f.value || '')}" placeholder="Field content">
        </div>
        <div class="cb-embed-field-inline">
          <label class="cb-toggle-label">
            <input type="checkbox" class="cb-checkbox" id="cb-f-${id}-fi-${fi}" ${f.inline ? 'checked' : ''}>
            <span>Inline</span>
          </label>
        </div>
        <div class="cb-embed-field-inline">
          <button class="cb-block-action-btn cb-block-action-btn--danger cb-embed-field-remove" data-field-idx="${fi}" data-block-id="${id}" title="Remove field">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    return `<div class="cb-field-row">
        <div class="cb-field cb-field--grow">
          <label class="cb-label" for="cb-f-${id}-title">Title</label>
          <input class="cb-input" type="text" id="cb-f-${id}-title" maxlength="256" value="${esc(d.title || '')}" placeholder="Embed title">
        </div>
        <div class="cb-field" style="min-width:100px;max-width:120px">
          <label class="cb-label" for="cb-f-${id}-color">Color</label>
          <input class="cb-input cb-color-input" type="color" id="cb-f-${id}-color" value="${esc(d.color || '#5865f2')}">
        </div>
      </div>
      <div class="cb-field">
        <label class="cb-label" for="cb-f-${id}-desc">Description <span class="cb-req">*</span></label>
        <textarea class="cb-input cb-textarea cb-textarea--tall" id="cb-f-${id}-desc" maxlength="4096" placeholder="Embed description… Use {user}, {username}, {server}, {channel}">${esc(d.description || '')}</textarea>
      </div>
      <div class="cb-field-row">
        <div class="cb-field cb-field--grow">
          <label class="cb-label" for="cb-f-${id}-footer">Footer Text</label>
          <input class="cb-input" type="text" id="cb-f-${id}-footer" maxlength="2048" value="${esc(d.footer || '')}" placeholder="Footer text">
        </div>
        <div class="cb-field cb-field--grow">
          <label class="cb-label" for="cb-f-${id}-thumbnail">Thumbnail URL</label>
          <input class="cb-input" type="text" id="cb-f-${id}-thumbnail" maxlength="512" value="${esc(d.thumbnail || '')}" placeholder="https://…">
        </div>
      </div>
      <div class="cb-field cb-field--grow">
        <label class="cb-label" for="cb-f-${id}-image">Image URL</label>
        <input class="cb-input" type="text" id="cb-f-${id}-image" maxlength="512" value="${esc(d.image || '')}" placeholder="https://… (large image below embed)">
      </div>
      <div class="cb-field">
        <label class="cb-label">Fields <span class="cb-hint-inline">up to 25</span></label>
        <div class="cb-embed-fields" id="cb-f-${id}-fields">${fieldsHTML}</div>
        <button class="cb-add-field-btn" id="cb-f-${id}-addfield">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Field
        </button>
      </div>
      <div class="cb-toggles-row">
        <label class="cb-toggle-label">
          <input type="checkbox" class="cb-checkbox" id="cb-f-${id}-timestamp" ${d.timestamp ? 'checked' : ''}>
          <span>Show Timestamp</span>
        </label>
        <label class="cb-toggle-label">
          <input type="checkbox" class="cb-checkbox" id="cb-f-${id}-author" ${d.showAuthor ? 'checked' : ''}>
          <span>Show Author (command user)</span>
        </label>
      </div>`;
  }

  function buildBlockSummary(b) {
    const d = b.data || {};
    switch (b.type) {
      case 'reply':
      case 'message':
      case 'dm':
        return d.content ? d.content.slice(0, 40) + (d.content.length > 40 ? '…' : '') : 'No content';
      case 'embed':
        return d.title || d.description ? (d.title || d.description || '').slice(0, 40) : 'Empty embed';
      case 'add_role': {
        const r = _roles.find(x => x.id === d.roleId);
        return r ? `Add @${r.name}` : 'Select a role';
      }
      case 'remove_role': {
        const r = _roles.find(x => x.id === d.roleId);
        return r ? `Remove @${r.name}` : 'Select a role';
      }
      case 'react':
        return d.emoji || 'Select emoji';
      default:
        return '';
    }
  }

  // ── Wire per-block input events ───────────────────────────────
  function wireBlockInputs(id, type) {
    const listen = (elId, ev = 'input') => {
      const e = el(elId);
      if (e) e.addEventListener(ev, () => { updateBlockSummary(id); markDirty(); });
    };

    if (type === 'reply' || type === 'message' || type === 'dm') {
      listen(`cb-f-${id}-content`);
    } else if (type === 'embed') {
      listen(`cb-f-${id}-title`);
      listen(`cb-f-${id}-desc`);
      listen(`cb-f-${id}-color`, 'input');
      listen(`cb-f-${id}-footer`);
      listen(`cb-f-${id}-thumbnail`);
      listen(`cb-f-${id}-image`);

      // Add embed field button
      el(`cb-f-${id}-addfield`)?.addEventListener('click', () => {
        const b = _blocks.find(x => x.id === id);
        if (!b) return;
        if (!Array.isArray(b.data.fields)) b.data.fields = [];
        if (b.data.fields.length >= 25) { showToast('Maximum 25 fields per embed.', 'warning'); return; }
        b.data.fields.push({ name: '', value: '', inline: false });
        renderAllBlocks();
        markDirty();
      });

      // Remove embed field buttons (delegated)
      el(`cb-f-${id}-fields`)?.addEventListener('click', e => {
        const btn = e.target.closest('.cb-embed-field-remove');
        if (!btn) return;
        const fi = parseInt(btn.dataset.fieldIdx);
        const b = _blocks.find(x => x.id === id);
        if (!b || !Array.isArray(b.data.fields)) return;
        b.data.fields.splice(fi, 1);
        renderAllBlocks();
        markDirty();
      });
    } else if (type === 'add_role' || type === 'remove_role') {
      listen(`cb-f-${id}-role`, 'change');
    } else if (type === 'react') {
      listen(`cb-f-${id}-emoji`);
    }
  }

  function updateBlockSummary(id) {
    const b = _blocks.find(x => x.id === id);
    if (!b) return;
    const s = el(`cb-b-summary-${id}`);
    if (s) s.textContent = buildBlockSummary(b);
  }

  // ── Collect block data from DOM ───────────────────────────────
  function collectBlocks() {
    return _blocks.map(b => {
      const id = b.id;
      const val = k => el(`cb-f-${id}-${k}`)?.value?.trim() ?? '';
      const chk = k => !!el(`cb-f-${id}-${k}`)?.checked;

      let data = {};
      switch (b.type) {
        case 'reply':
          data = { content: val('content'), ephemeral: chk('ephemeral') };
          break;
        case 'message':
          data = { content: val('content') };
          break;
        case 'dm':
          data = { content: val('content') };
          break;
        case 'embed': {
          // Collect fields
          const fieldContainer = el(`cb-f-${id}-fields`);
          const fieldRows = fieldContainer ? fieldContainer.querySelectorAll('.cb-embed-field-row') : [];
          const fields = [];
          fieldRows.forEach((_, fi) => {
            const name = el(`cb-f-${id}-fn-${fi}`)?.value?.trim() || '';
            const value = el(`cb-f-${id}-fv-${fi}`)?.value?.trim() || '';
            const inline = !!el(`cb-f-${id}-fi-${fi}`)?.checked;
            if (name || value) fields.push({ name, value, inline });
          });
          data = {
            title:       val('title'),
            description: val('desc'),
            color:       val('color') || '#5865f2',
            footer:      val('footer'),
            thumbnail:   val('thumbnail'),
            image:       val('image'),
            timestamp:   chk('timestamp'),
            showAuthor:  chk('author'),
            fields,
          };
          break;
        }
        case 'add_role':
        case 'remove_role':
          data = { roleId: val('role') };
          break;
        case 'react':
          data = { emoji: val('emoji') };
          break;
      }
      return { type: b.type, data };
    });
  }

  // ── Validation ────────────────────────────────────────────────
  function validate(name, trigger, ttype, blocks) {
    if (!name) { showToast('Command name is required.', 'warning'); return false; }
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
      showToast('Command name must be 1-32 chars: lowercase letters, digits, hyphens, underscores only.', 'warning');
      return false;
    }
    if (!trigger) { showToast('Trigger / command text is required.', 'warning'); return false; }
    if (ttype === 'slash' && !/^[a-z0-9_-]{1,32}$/.test(trigger)) {
      showToast('Slash command names must be lowercase with no spaces or special chars.', 'warning');
      return false;
    }
    if (ttype === 'regex') {
      try { new RegExp(trigger); } catch {
        showToast('Invalid regex pattern. Please check the syntax.', 'warning');
        return false;
      }
    }
    if (blocks.length === 0) { showToast('Add at least one action block.', 'warning'); return false; }
    if (blocks.length > 20) { showToast('Maximum 20 action blocks per command.', 'warning'); return false; }

    for (const b of blocks) {
      if (!BLOCK_META[b.type]) { showToast('Invalid block type detected.', 'error'); return false; }
      if ((b.type === 'reply' || b.type === 'message' || b.type === 'dm') && !b.data.content) {
        showToast(`A "${BLOCK_META[b.type].label}" block is missing its content.`, 'warning'); return false;
      }
      if ((b.type === 'add_role' || b.type === 'remove_role') && !b.data.roleId) {
        showToast(`A "${BLOCK_META[b.type].label}" block has no role selected.`, 'warning'); return false;
      }
      if (b.type === 'embed' && !b.data.description && !b.data.title) {
        showToast('An embed block needs at least a title or description.', 'warning'); return false;
      }
      if (b.type === 'react' && !b.data.emoji) {
        showToast('A Reaction block is missing the emoji.', 'warning'); return false;
      }
      // URL safety for embed thumbnails/images
      if (b.type === 'embed') {
        for (const urlField of ['thumbnail', 'image']) {
          const url = b.data[urlField];
          if (url && !/^https?:\/\//i.test(url)) {
            showToast(`Embed ${urlField} must be a valid https:// URL.`, 'warning'); return false;
          }
        }
      }
    }
    return true;
  }

  // ── Save ──────────────────────────────────────────────────────
  async function handleSave() {
    if (_saving) return;

    const name    = el('cbCmdName')?.value?.trim().toLowerCase().replace(/\s+/g, '-') || '';
    const ttype   = document.querySelector('.cb-tab--active')?.dataset.ttype || 'slash';
    const trigger = el('cbTrigger')?.value?.trim() || '';
    const blocks  = collectBlocks();

    if (!validate(name, trigger, ttype, blocks)) return;

    _saving = true;
    const saveBtn = el('cbSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; }

    const body = {
      name,
      trigger,
      triggerType:     ttype,
      description:     el('cbDescription')?.value?.trim() || '',
      cooldownSeconds: Math.max(0, Math.min(86400, parseInt(el('cbCooldown')?.value) || 0)),
      allowedRoles:    [..._selectedRoles],
      allowedChannels: [..._selectedChannels],
      caseSensitive:   !!el('cbCaseSensitive')?.checked,
      deleteUserMessage: !!el('cbDeleteTrigger')?.checked,
      enabled:         el('cbEnabled')?.checked !== false,
      blocks,
    };

    try {
      const url = _cmdId
        ? `/api/guild/${_guildId}/custom-commands/${_cmdId}`
        : `/api/guild/${_guildId}/custom-commands`;
      const res = await fetch(url, {
        method: _cmdId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      // Update _cmdId if newly created
      if (!_cmdId && data._id) _cmdId = data._id;

      markClean();
      showToast(_cmdId ? 'Command saved!' : 'Command created!', 'success');

      // Update URL without reload
      const newUrl = `/dashboard/${_guildId}/custom-commands/builder/${data._id}`;
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', newUrl);
      }
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      _saving = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // ── Unsaved modal ─────────────────────────────────────────────
  function showUnsavedModal() { el('cbUnsavedModal').style.display = ''; }
  function hideUnsavedModal() { el('cbUnsavedModal').style.display = 'none'; }

})();
