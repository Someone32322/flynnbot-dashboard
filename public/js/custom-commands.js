/**
 * custom-commands.js — Block-based Custom Commands builder
 * Supports slash commands, prefix commands, multiple response blocks,
 * conditions, role actions, and more.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _cmds = [];
  let _roles = [];
  let _channels = [];
  let _loaded = false;

  // Current command being edited
  let _editing = null; // null = new, string = existing _id

  // Response blocks for the builder
  let _blocks = [];
  let _blockIdCounter = 0;

  // ── Init ──────────────────────────────────────────────────────
  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'custom-commands') {
        if (!_loaded) load();
      }
    });
    const sec = document.getElementById('section-custom-commands');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    const container = document.getElementById('customCommandsContent');
    if (!container) return;
    container.innerHTML = '<div class="cc-loading"><div class="spinner"></div>Loading custom commands…</div>';
    try {
      const [cmds, roles, channels] = await Promise.all([
        fetch(`/api/guild/${_guildId}/custom-commands`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/roles`).then((r) => r.json()).catch(() => []),
        fetch(`/api/guild/${_guildId}/channels`).then((r) => r.json()).catch(() => []),
      ]);
      _cmds = Array.isArray(cmds) ? cmds : [];
      _roles = Array.isArray(roles) ? roles : [];
      _channels = Array.isArray(channels) ? channels : [];
      renderList();
    } catch (err) {
      console.error('[CC]', err);
      container.innerHTML = `<div class="cc-error"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Failed to load commands.</div>`;
    }
  }

  // ── List view ─────────────────────────────────────────────────
  function renderList() {
    const container = document.getElementById('customCommandsContent');
    if (!container) return;

    const TRIGGER_ICONS = {
      slash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
      prefix: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`,
      contains: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
      exact: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
      regex: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 9h6v6H9z"/><path d="M3 3h18v18H3z"/></svg>`,
    };
    const TRIGGER_LABELS = { slash: 'Slash', prefix: 'Prefix', contains: 'Contains', exact: 'Exact', regex: 'Regex' };

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

        ${_cmds.length === 0 ? `
          <div class="cc-empty">
            <div class="cc-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </div>
            <p class="cc-empty-title">No custom commands yet</p>
            <p class="cc-empty-sub">Create your first command to respond to messages or slash commands automatically.</p>
            <button class="btn btn-primary" id="ccEmptyNewBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create Command
            </button>
          </div>
        ` : `
          <div class="cc-list" id="ccList">
            ${_cmds.map((cmd) => {
              const ttype = cmd.triggerType || 'exact';
              return `
              <div class="cc-card ${cmd.enabled === false ? 'cc-card--disabled' : ''}" data-cmd-id="${esc(cmd._id)}">
                <div class="cc-card-left">
                  <div class="cc-trigger-badge cc-trigger-${ttype}">
                    ${TRIGGER_ICONS[ttype] || TRIGGER_ICONS.exact}
                    <span>${TRIGGER_LABELS[ttype] || ttype}</span>
                  </div>
                  <div class="cc-card-info">
                    <div class="cc-card-name">${esc(cmd.name)}</div>
                    <div class="cc-card-trigger"><code>${esc(cmd.trigger)}</code></div>
                  </div>
                </div>
                <div class="cc-card-right">
                  <span class="cc-status-dot ${cmd.enabled === false ? '' : 'cc-status-dot--on'}" title="${cmd.enabled === false ? 'Disabled' : 'Enabled'}"></span>
                  <button class="cc-icon-btn" data-action="edit" data-id="${esc(cmd._id)}" title="Edit command">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="cc-icon-btn cc-icon-btn--danger" data-action="delete" data-id="${esc(cmd._id)}" title="Delete command">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                  </button>
                </div>
              </div>
            `}).join('')}
          </div>
        `}

        <!-- ── Builder Drawer ── -->
        <div class="cc-drawer-overlay" id="ccDrawerOverlay" style="display:none"></div>
        <div class="cc-drawer" id="ccDrawer" style="display:none">
          ${builderHTML()}
        </div>
      </div>
    `;

    // Wire list buttons
    document.getElementById('ccNewBtn')?.addEventListener('click', () => openBuilder(null));
    document.getElementById('ccEmptyNewBtn')?.addEventListener('click', () => openBuilder(null));
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => btn.addEventListener('click', () => openBuilder(btn.dataset.id)));
    document.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.addEventListener('click', () => deleteCmd(btn.dataset.id)));

    wireDrawer();
  }

  // ── Builder HTML template ─────────────────────────────────────
  function builderHTML() {
    const roleOptions = _roles
      .filter((r) => !r.managed && r.name !== '@everyone')
      .map((r) => {
        const hex = r.color ? '#' + r.color.toString(16).padStart(6, '0') : '';
        return `<option value="${esc(r.id)}" style="${hex ? 'color:' + hex : ''}">${esc(r.name)}</option>`;
      }).join('');

    const channelOptions = _channels
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('');

    return `
      <div class="cc-drawer-inner">
        <div class="cc-drawer-head">
          <div>
            <div class="cc-drawer-title" id="ccDrawerTitle">New Command</div>
            <div class="cc-drawer-sub">Build your command step by step</div>
          </div>
          <button class="cc-drawer-close" id="ccDrawerClose" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="cc-builder-body" id="ccBuilderBody">

          <!-- TRIGGER BLOCK -->
          <div class="cc-block cc-block--trigger">
            <div class="cc-block-header">
              <div class="cc-block-icon cc-block-icon--trigger">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div>
                <div class="cc-block-title">Trigger</div>
                <div class="cc-block-desc">How this command is invoked</div>
              </div>
            </div>
            <div class="cc-block-body">
              <div class="cc-field">
                <label class="cc-label">Trigger Type</label>
                <div class="cc-trigger-type-grid" id="ccTriggerTypeGrid">
                  <button class="cc-trigger-type-btn cc-trigger-type-btn--active" data-type="slash">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    <span>Slash Command</span>
                  </button>
                  <button class="cc-trigger-type-btn" data-type="prefix">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    <span>Prefix Command</span>
                  </button>
                  <button class="cc-trigger-type-btn" data-type="contains">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <span>Message Contains</span>
                  </button>
                  <button class="cc-trigger-type-btn" data-type="exact">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                    <span>Exact Match</span>
                  </button>
                  <button class="cc-trigger-type-btn" data-type="regex">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 9h6v6H9z"/><path d="M3 3h18v18H3z"/></svg>
                    <span>Regex Pattern</span>
                  </button>
                </div>
              </div>
              <div class="cc-field-row">
                <div class="cc-field cc-field--grow">
                  <label class="cc-label" for="ccTriggerValue">Command / Trigger <span class="cc-required">*</span></label>
                  <input class="cc-input" type="text" id="ccTriggerValue" maxlength="100" placeholder="e.g. hello or !ping" autocomplete="off">
                  <div class="cc-hint" id="ccTriggerHint">The slash command name (no spaces, lowercase)</div>
                </div>
                <div class="cc-field" style="min-width:120px;max-width:150px">
                  <label class="cc-label" for="ccCooldownVal">Cooldown (s)</label>
                  <input class="cc-input" type="number" id="ccCooldownVal" min="0" max="86400" value="0">
                </div>
              </div>
              <div class="cc-field" id="ccDescField">
                <label class="cc-label" for="ccDescValue">Description <span class="cc-hint-inline">(shown in Discord)</span></label>
                <input class="cc-input" type="text" id="ccDescValue" maxlength="100" placeholder="What does this command do?">
              </div>
              <div class="cc-field">
                <label class="cc-label" for="ccCmdName">Internal Name <span class="cc-required">*</span></label>
                <input class="cc-input" type="text" id="ccCmdName" maxlength="50" placeholder="Unique identifier, e.g. my-greeting" autocomplete="off">
              </div>
            </div>
          </div>

          <!-- CONDITIONS BLOCK -->
          <div class="cc-block cc-block--conditions">
            <div class="cc-block-header cc-block-header--collapsible" id="ccConditionsToggle">
              <div class="cc-block-icon cc-block-icon--conditions">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
              </div>
              <div>
                <div class="cc-block-title">Conditions &amp; Settings <span class="cc-optional-tag">Optional</span></div>
                <div class="cc-block-desc">Restrict who can use this command</div>
              </div>
              <div class="cc-block-chevron" id="ccConditionsChevron">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
            <div class="cc-block-body" id="ccConditionsBody" style="display:none">
              <div class="cc-field-row">
                <div class="cc-field cc-field--grow">
                  <label class="cc-label">Required Role <span class="cc-hint-inline">(user must have)</span></label>
                  <select class="cc-input" id="ccReqRole">
                    <option value="">No role requirement</option>
                    ${roleOptions}
                  </select>
                </div>
                <div class="cc-field cc-field--grow">
                  <label class="cc-label">Allowed Channel <span class="cc-hint-inline">(blank = everywhere)</span></label>
                  <select class="cc-input" id="ccReqChannel">
                    <option value="">Any channel</option>
                    ${channelOptions}
                  </select>
                </div>
              </div>
              <div class="cc-toggles-row">
                <label class="cc-toggle-label">
                  <input type="checkbox" id="ccCaseSensitive" class="cc-checkbox">
                  <span class="cc-toggle-text">Case sensitive</span>
                </label>
                <label class="cc-toggle-label">
                  <input type="checkbox" id="ccDeleteMsg" class="cc-checkbox">
                  <span class="cc-toggle-text">Delete trigger message</span>
                </label>
                <label class="cc-toggle-label">
                  <input type="checkbox" id="ccEphemeral" class="cc-checkbox">
                  <span class="cc-toggle-text">Ephemeral <span class="cc-hint-inline">(only visible to user)</span></span>
                </label>
              </div>
            </div>
          </div>

          <!-- RESPONSE BLOCKS -->
          <div class="cc-block cc-block--responses">
            <div class="cc-block-header">
              <div class="cc-block-icon cc-block-icon--responses">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              </div>
              <div>
                <div class="cc-block-title">Actions</div>
                <div class="cc-block-desc">What happens when this command runs</div>
              </div>
            </div>
            <div class="cc-block-body">
              <div id="ccBlocksList"></div>
              <div class="cc-add-block-row">
                <div class="cc-add-block-label">Add Action Block</div>
                <div class="cc-add-block-btns">
                  <button class="cc-add-block-btn" data-block-type="message">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    Send Message
                  </button>
                  <button class="cc-add-block-btn" data-block-type="embed">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    Send Embed
                  </button>
                  <button class="cc-add-block-btn" data-block-type="add_role">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    Add Role
                  </button>
                  <button class="cc-add-block-btn" data-block-type="remove_role">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    Remove Role
                  </button>
                  <button class="cc-add-block-btn" data-block-type="dm">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    DM User
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div class="cc-drawer-footer">
          <label class="cc-toggle-label cc-footer-toggle">
            <input type="checkbox" id="ccEnabled" class="cc-checkbox" checked>
            <span class="cc-toggle-text">Command enabled</span>
          </label>
          <div class="cc-drawer-footer-btns">
            <button class="btn btn-ghost" id="ccDrawerCancel">Cancel</button>
            <button class="btn btn-primary" id="ccDrawerSave">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/></svg>
              Save Command
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Wire drawer interactions ──────────────────────────────────
  function wireDrawer() {
    const overlay = document.getElementById('ccDrawerOverlay');

    document.getElementById('ccDrawerClose')?.addEventListener('click', closeBuilder);
    document.getElementById('ccDrawerCancel')?.addEventListener('click', closeBuilder);
    overlay?.addEventListener('click', closeBuilder);
    document.getElementById('ccDrawerSave')?.addEventListener('click', saveBuilder);

    // Trigger type picker
    document.getElementById('ccTriggerTypeGrid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      document.querySelectorAll('.cc-trigger-type-btn').forEach((b) => b.classList.remove('cc-trigger-type-btn--active'));
      btn.classList.add('cc-trigger-type-btn--active');
      updateTriggerHints(btn.dataset.type);
    });

    // Conditions collapsible
    document.getElementById('ccConditionsToggle')?.addEventListener('click', () => {
      const body = document.getElementById('ccConditionsBody');
      const chevron = document.getElementById('ccConditionsChevron');
      if (!body) return;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
    });

    // Add block buttons
    document.querySelectorAll('.cc-add-block-btn').forEach((btn) => {
      btn.addEventListener('click', () => addBlock(btn.dataset.blockType));
    });

    renderBlocks();
  }

  function updateTriggerHints(type) {
    const hint = document.getElementById('ccTriggerHint');
    const descField = document.getElementById('ccDescField');
    const input = document.getElementById('ccTriggerValue');
    const hints = {
      slash: 'Slash command name — no spaces, lowercase, e.g. "greet"',
      prefix: 'Full prefix trigger including symbol, e.g. "!hello"',
      contains: 'Bot responds when a message contains this phrase',
      exact: 'Bot responds when a message matches this exactly',
      regex: 'JavaScript regex pattern (without surrounding slashes)',
    };
    const placeholders = {
      slash: 'e.g. greet',
      prefix: 'e.g. !hello',
      contains: 'e.g. good morning',
      exact: 'e.g. hello bot',
      regex: 'e.g. \\d{4}',
    };
    if (hint) hint.textContent = hints[type] || '';
    if (input) input.placeholder = placeholders[type] || '';
    if (descField) descField.style.display = type === 'slash' ? '' : 'none';
  }

  // ── Response blocks ───────────────────────────────────────────
  function addBlock(type, data) {
    const id = ++_blockIdCounter;
    _blocks.push({ id, type, data: data || {} });
    renderBlocks();
  }

  function removeBlock(id) {
    _blocks = _blocks.filter((b) => b.id !== id);
    renderBlocks();
  }

  function renderBlocks() {
    const list = document.getElementById('ccBlocksList');
    if (!list) return;

    if (_blocks.length === 0) {
      list.innerHTML = `<div class="cc-blocks-empty">No actions yet — add one below</div>`;
      return;
    }

    list.innerHTML = _blocks.map((b) => renderBlock(b)).join('');

    _blocks.forEach(({ id }) => {
      document.getElementById(`ccBlockRemove-${id}`)?.addEventListener('click', () => removeBlock(id));
    });
  }

  function renderBlock({ id, type, data }) {
    const LABELS = { message: 'Send Message', embed: 'Send Embed', add_role: 'Add Role', remove_role: 'Remove Role', dm: 'DM User' };
    const COLORS = { message: 'var(--accent)', embed: 'var(--green)', add_role: '#5865f2', remove_role: 'var(--red)', dm: 'var(--yellow)' };
    const ICONS = {
      message: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
      embed: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
      add_role: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
      remove_role: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
      dm: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    };

    let bodyHTML = '';
    if (type === 'message' || type === 'dm') {
      const lbl = type === 'dm' ? 'DM Message Content' : 'Message Content';
      bodyHTML = `
        <div class="cc-field">
          <label class="cc-label">${lbl} <span class="cc-required">*</span></label>
          <textarea class="cc-input cc-textarea" id="ccBlock-${id}-content" rows="3" maxlength="2000" placeholder="Use {user}, {username}, {server}, {channel}, {membercount}, {mention}">${esc(data.content || '')}</textarea>
        </div>
      `;
    } else if (type === 'embed') {
      bodyHTML = `
        <div class="cc-field-row">
          <div class="cc-field cc-field--grow">
            <label class="cc-label">Embed Title</label>
            <input class="cc-input" type="text" id="ccBlock-${id}-title" maxlength="256" value="${esc(data.title || '')}" placeholder="Embed title">
          </div>
          <div class="cc-field" style="min-width:90px;max-width:110px">
            <label class="cc-label">Color</label>
            <input class="cc-input cc-color-input" type="color" id="ccBlock-${id}-color" value="${esc(data.color || '#5865f2')}">
          </div>
        </div>
        <div class="cc-field">
          <label class="cc-label">Description <span class="cc-required">*</span></label>
          <textarea class="cc-input cc-textarea" id="ccBlock-${id}-description" rows="3" maxlength="4096" placeholder="Embed description. Use {user}, {server}, {channel}…">${esc(data.description || '')}</textarea>
        </div>
        <div class="cc-field-row">
          <div class="cc-field cc-field--grow">
            <label class="cc-label">Footer Text</label>
            <input class="cc-input" type="text" id="ccBlock-${id}-footer" maxlength="2048" value="${esc(data.footer || '')}" placeholder="Footer text">
          </div>
          <div class="cc-field cc-field--grow">
            <label class="cc-label">Thumbnail URL</label>
            <input class="cc-input" type="text" id="ccBlock-${id}-thumbnail" maxlength="2048" value="${esc(data.thumbnail || '')}" placeholder="https://…">
          </div>
        </div>
      `;
    } else if (type === 'add_role' || type === 'remove_role') {
      const roleOpts = _roles
        .filter((r) => !r.managed && r.name !== '@everyone')
        .map((r) => `<option value="${esc(r.id)}" ${data.roleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
      bodyHTML = `
        <div class="cc-field">
          <label class="cc-label">Role <span class="cc-required">*</span></label>
          <select class="cc-input" id="ccBlock-${id}-role">
            <option value="">— Select role —</option>
            ${roleOpts}
          </select>
        </div>
      `;
    }

    return `
      <div class="cc-response-block" id="ccBlock-${id}">
        <div class="cc-response-block-header" style="--block-color:${COLORS[type] || 'var(--accent)'}">
          <div class="cc-response-block-label">
            ${ICONS[type] || ''}
            <span>${LABELS[type] || type}</span>
          </div>
          <button class="cc-block-remove-btn" id="ccBlockRemove-${id}" title="Remove this action">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cc-response-block-body">${bodyHTML}</div>
      </div>
    `;
  }

  // ── Open builder (navigate to dedicated builder page) ─────────
  function openBuilder(id) {
    if (id) {
      window.location.href = `/dashboard/${_guildId}/custom-commands/builder/${id}`;
    } else {
      window.location.href = `/dashboard/${_guildId}/custom-commands/builder`;
    }
  }

  function _openBuilderLegacy(id) {
    const cmd = id ? _cmds.find((c) => c._id === id) : null;
    _editing = id || null;
    _blocks = [];
    _blockIdCounter = 0;

    const title = document.getElementById('ccDrawerTitle');
    if (title) title.textContent = cmd ? `Edit: ${cmd.name}` : 'New Command';

    // Trigger type
    const ttype = cmd?.triggerType || 'slash';
    document.querySelectorAll('.cc-trigger-type-btn').forEach((b) => {
      b.classList.toggle('cc-trigger-type-btn--active', b.dataset.type === ttype);
    });
    updateTriggerHints(ttype);

    // Populate fields
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    const setC = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

    setV('ccTriggerValue', cmd?.trigger || '');
    setV('ccCooldownVal', cmd?.cooldownSeconds ?? 0);
    setV('ccDescValue', cmd?.description || '');
    setV('ccCmdName', cmd?.name || '');
    setV('ccReqRole', cmd?.requiredRole || '');
    setV('ccReqChannel', cmd?.requiredChannel || '');
    setC('ccCaseSensitive', cmd?.caseSensitive);
    setC('ccDeleteMsg', cmd?.deleteUserMessage);
    setC('ccEphemeral', cmd?.ephemeral);
    setC('ccEnabled', cmd?.enabled !== false);

    // Load blocks
    if (cmd?.blocks?.length) {
      cmd.blocks.forEach((b) => addBlock(b.type, b.data || {}));
    } else if (cmd) {
      // Legacy fallback
      if (cmd.type === 'embed') {
        addBlock('embed', { title: cmd.embedTitle || '', description: cmd.embedDescription || cmd.response || '', color: cmd.embedColor || '#5865f2' });
      } else {
        addBlock('message', { content: cmd.response || '' });
      }
    } else {
      addBlock('message', {});
    }

    // Show drawer
    const drawer = document.getElementById('ccDrawer');
    const overlay = document.getElementById('ccDrawerOverlay');
    drawer.style.display = '';
    overlay.style.display = '';
    requestAnimationFrame(() => {
      drawer.classList.add('cc-drawer--open');
      overlay.classList.add('cc-drawer-overlay--visible');
    });
  }

  function closeBuilder() {
    const drawer = document.getElementById('ccDrawer');
    const overlay = document.getElementById('ccDrawerOverlay');
    drawer?.classList.remove('cc-drawer--open');
    overlay?.classList.remove('cc-drawer-overlay--visible');
    setTimeout(() => {
      if (drawer) drawer.style.display = 'none';
      if (overlay) overlay.style.display = 'none';
    }, 280);
  }

  // ── Collect block data ────────────────────────────────────────
  function collectBlocks() {
    return _blocks.map(({ id, type }) => {
      const v = (key) => document.getElementById(`ccBlock-${id}-${key}`)?.value?.trim() || '';
      let data = {};
      if (type === 'message' || type === 'dm') data = { content: v('content') };
      else if (type === 'embed') data = { title: v('title'), description: v('description'), color: v('color') || '#5865f2', footer: v('footer'), thumbnail: v('thumbnail') };
      else if (type === 'add_role' || type === 'remove_role') data = { roleId: v('role') };
      return { type, data };
    });
  }

  // ── Save builder ──────────────────────────────────────────────
  async function saveBuilder() {
    const ttype = document.querySelector('.cc-trigger-type-btn--active')?.dataset.type || 'slash';
    const trigger = document.getElementById('ccTriggerValue')?.value?.trim();
    const name = document.getElementById('ccCmdName')?.value?.trim();

    if (!name) { window.showToast('Internal name is required.', 'warning'); return; }
    if (!trigger) { window.showToast('Trigger / command name is required.', 'warning'); return; }
    if (_blocks.length === 0) { window.showToast('Add at least one action block.', 'warning'); return; }

    const blocks = collectBlocks();
    for (const b of blocks) {
      if ((b.type === 'message' || b.type === 'dm') && !b.data.content) {
        window.showToast('A message action is missing its content.', 'warning'); return;
      }
      if ((b.type === 'add_role' || b.type === 'remove_role') && !b.data.roleId) {
        window.showToast('A role action is missing a role selection.', 'warning'); return;
      }
      if (b.type === 'embed' && !b.data.description && !b.data.title) {
        window.showToast('An embed block needs at least a title or description.', 'warning'); return;
      }
    }

    const body = {
      name,
      trigger,
      triggerType: ttype,
      description: document.getElementById('ccDescValue')?.value?.trim() || '',
      cooldownSeconds: parseInt(document.getElementById('ccCooldownVal')?.value) || 0,
      requiredRole: document.getElementById('ccReqRole')?.value || '',
      requiredChannel: document.getElementById('ccReqChannel')?.value || '',
      caseSensitive: !!document.getElementById('ccCaseSensitive')?.checked,
      deleteUserMessage: !!document.getElementById('ccDeleteMsg')?.checked,
      ephemeral: !!document.getElementById('ccEphemeral')?.checked,
      enabled: document.getElementById('ccEnabled')?.checked !== false,
      blocks,
      // Legacy compatibility
      type: blocks.find((b) => b.type === 'embed') ? 'embed' : 'text',
      response: blocks.find((b) => b.type === 'message')?.data?.content || '',
      embedTitle: blocks.find((b) => b.type === 'embed')?.data?.title || '',
      embedDescription: blocks.find((b) => b.type === 'embed')?.data?.description || '',
      embedColor: blocks.find((b) => b.type === 'embed')?.data?.color || '#5865f2',
    };

    const saveBtn = document.getElementById('ccDrawerSave');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const url = _editing
        ? `/api/guild/${_guildId}/custom-commands/${_editing}`
        : `/api/guild/${_guildId}/custom-commands`;
      const res = await fetch(url, {
        method: _editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      if (_editing) {
        const idx = _cmds.findIndex((c) => c._id === _editing);
        if (idx >= 0) _cmds[idx] = data; else _cmds.push(data);
      } else {
        _cmds.push(data);
      }

      window.showToast(_editing ? 'Command updated.' : 'Command created.', 'success');
      closeBuilder();
      setTimeout(renderList, 300);
    } catch (err) {
      window.showToast('Error: ' + err.message, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/></svg> Save Command`;
      }
    }
  }

  // ── Delete command ────────────────────────────────────────────
  async function deleteCmd(id) {
    const cmd = _cmds.find((c) => c._id === id);
    const ok = await window.showConfirm(
      `Delete "${cmd?.name || 'this command'}"? This cannot be undone.`,
      { title: 'Delete Command', confirmText: 'Delete', type: 'danger' }
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/guild/${_guildId}/custom-commands/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      _cmds = _cmds.filter((c) => c._id !== id);
      window.showToast('Command deleted.', 'success');
      renderList();
    } catch {
      window.showToast('Failed to delete command.', 'error');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
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
})();

async function refreshCustomCommands(guildId) {
  const container = document.getElementById('customCommandsContent');
  if (!container) return;
  container.innerHTML = '<div class="commands-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const res = await fetch(`/api/guild/${guildId}/custom-commands`);
    if (!res.ok) throw new Error('Failed to load custom commands');
    _ccCmds = await res.json();
    renderCustomCommands(container, guildId);
  } catch (e) {
    container.innerHTML = `<div class="error-message">❌ ${escCC(e.message)}</div>`;
  }
}

function renderCustomCommands(container, guildId) {
  container.innerHTML = `
    <div class="ec-card">
      <div class="ec-card-header">
        <h3>Your Custom Commands (${_ccCmds.length})</h3>
        <button class="btn btn-sm btn-primary" id="ccAddBtn">+ New Command</button>
      </div>
      <div class="ec-card-body">
        <div id="ccList">${renderCCList()}</div>
      </div>
    </div>

    <!-- Modal -->
    <div id="ccModal" class="ec-modal-backdrop" style="display:none">
      <div class="ec-modal" style="max-width:640px">
        <h3 id="ccModalTitle">New Custom Command</h3>
        <div class="ec-grid-2">
          <label class="ec-field"><span>Name (unique) <span class="required">*</span></span><input type="text" id="ccName" class="ec-input" maxlength="50" /></label>
          <label class="ec-field"><span>Trigger Type</span>
            <select id="ccTriggerType" class="ec-input" data-cs>
              <option value="exact">Exact match</option>
              <option value="contains">Contains</option>
              <option value="startsWith">Starts with</option>
              <option value="regex">Regex</option>
            </select>
          </label>
          <label class="ec-field" style="grid-column:1/-1"><span>Trigger <span class="required">*</span></span><input type="text" id="ccTrigger" class="ec-input" maxlength="100" placeholder="e.g. !hello or trigger phrase" /></label>
          <label class="ec-field"><span>Response Type</span>
            <select id="ccType" class="ec-input" data-cs>
              <option value="text">Text</option>
              <option value="embed">Embed</option>
            </select>
          </label>
          <label class="ec-field"><span>Cooldown (seconds)</span><input type="number" id="ccCooldown" class="ec-input" value="0" min="0" max="86400" /></label>
        </div>
        <label class="ec-field" style="margin-top:0.75rem"><span>Response Text <span class="required">*</span></span>
          <textarea id="ccResponse" class="ec-input" rows="3" maxlength="2000" placeholder="Use {user}, {username}, {server}, {channel}, {membercount}"></textarea>
        </label>
        <div id="ccEmbedFields" style="display:none;margin-top:0.75rem">
          <div class="ec-grid-2">
            <label class="ec-field"><span>Embed Title</span><input type="text" id="ccEmbedTitle" class="ec-input" maxlength="256" /></label>
            <label class="ec-field"><span>Embed Color</span><input type="color" id="ccEmbedColor" class="ec-input" value="#0f52ba" style="height:38px;padding:0.25rem" /></label>
          </div>
          <label class="ec-field" style="margin-top:0.75rem"><span>Embed Description</span>
            <textarea id="ccEmbedDesc" class="ec-input" rows="3" maxlength="2000"></textarea>
          </label>
        </div>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.75rem">
          <label class="ec-toggle-row" style="gap:0.5rem"><input type="checkbox" id="ccCaseSensitive" /> <span style="font-size:0.85rem">Case sensitive</span></label>
          <label class="ec-toggle-row" style="gap:0.5rem"><input type="checkbox" id="ccDeleteMsg" /> <span style="font-size:0.85rem">Delete user's message</span></label>
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.25rem">
          <button class="btn btn-secondary" id="ccModalCancel">Cancel</button>
          <button class="btn btn-primary" id="ccModalConfirm">Save Command</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('ccAddBtn')?.addEventListener('click', () => openCCModal(guildId, null));
  document.getElementById('ccModalCancel')?.addEventListener('click', closeCCModal);
  document.getElementById('ccModalConfirm')?.addEventListener('click', () => submitCCModal(guildId));
  document.getElementById('ccType')?.addEventListener('change', toggleEmbedFields);
  wireCCListButtons(guildId);
}

function renderCCList() {
  if (!_ccCmds.length) return '<p class="ec-empty">No custom commands yet. Create one above.</p>';
  return `<table class="ec-table">
    <thead><tr><th>Name</th><th>Trigger</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${_ccCmds.map(cmd => `
      <tr>
        <td><strong>${escCC(cmd.name)}</strong></td>
        <td><code>${escCC(cmd.trigger)}</code> <small style="opacity:0.5">(${escCC(cmd.triggerType)})</small></td>
        <td>${escCC(cmd.type)}</td>
        <td><span class="cc-badge ${cmd.enabled ? 'cc-badge-on' : 'cc-badge-off'}">${cmd.enabled ? 'Enabled' : 'Disabled'}</span></td>
        <td style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn btn-sm" data-cc-action="edit" data-cc-id="${escCC(cmd._id)}">Edit</button>
          <button class="btn btn-sm" data-cc-action="toggle" data-cc-id="${escCC(cmd._id)}" data-cc-enabled="${cmd.enabled}">${cmd.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-sm btn-danger" data-cc-action="delete" data-cc-id="${escCC(cmd._id)}">Delete</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

function wireCCListButtons(guildId) {
  document.querySelectorAll('[data-cc-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.ccAction;
      const id = btn.dataset.ccId;
      if (action === 'edit') {
        openCCModal(guildId, id);
      } else if (action === 'toggle') {
        const enabled = btn.dataset.ccEnabled === 'true';
        try {
          const res = await fetch(`/api/guild/${guildId}/custom-commands/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !enabled }),
          });
          if (res.ok) {
            const updated = await res.json();
            const idx = _ccCmds.findIndex(c => c._id === id);
            if (idx >= 0) _ccCmds[idx] = updated;
            document.getElementById('ccList').innerHTML = renderCCList();
            wireCCListButtons(guildId);
          }
        } catch {}
      } else if (action === 'delete') {
        if (!await window.showConfirm('Delete this custom command?', { title: 'Delete Command', confirmText: 'Delete' })) return;
        try {
          const res = await fetch(`/api/guild/${guildId}/custom-commands/${id}`, { method: 'DELETE' });
          if (res.ok) {
            _ccCmds = _ccCmds.filter(c => c._id !== id);
            document.getElementById('ccList').innerHTML = renderCCList();
            wireCCListButtons(guildId);
          }
        } catch {}
      }
    });
  });
}

function openCCModal(guildId, id) {
  const cmd = id ? _ccCmds.find(c => c._id === id) : null;
  document.getElementById('ccModalTitle').textContent = cmd ? 'Edit Command' : 'New Custom Command';
  document.getElementById('ccName').value = cmd?.name || '';
  document.getElementById('ccTrigger').value = cmd?.trigger || '';
  document.getElementById('ccTriggerType').value = cmd?.triggerType || 'exact';
  document.getElementById('ccType').value = cmd?.type || 'text';
  document.getElementById('ccResponse').value = cmd?.response || '';
  document.getElementById('ccCooldown').value = cmd?.cooldownSeconds ?? 0;
  document.getElementById('ccCaseSensitive').checked = !!cmd?.caseSensitive;
  document.getElementById('ccDeleteMsg').checked = !!cmd?.deleteUserMessage;
  if (cmd?.type === 'embed') {
    document.getElementById('ccEmbedTitle').value = cmd.embedTitle || '';
    document.getElementById('ccEmbedColor').value = cmd.embedColor || '#0f52ba';
    document.getElementById('ccEmbedDesc').value = cmd.embedDescription || '';
  }
  toggleEmbedFields();
  document.getElementById('ccModal').dataset.editId = id || '';
  document.getElementById('ccModal').style.display = 'flex';
  const modal = document.getElementById('ccModal');
  if (typeof initAllCustomSelects === 'function') initAllCustomSelects(modal);
}

function closeCCModal() {
  document.getElementById('ccModal').style.display = 'none';
  document.getElementById('ccModal').dataset.editId = '';
}

function toggleEmbedFields() {
  const type = document.getElementById('ccType')?.value;
  const fields = document.getElementById('ccEmbedFields');
  if (fields) fields.style.display = type === 'embed' ? '' : 'none';
}

async function submitCCModal(guildId) {
  const modal = document.getElementById('ccModal');
  const editId = modal.dataset.editId;
  const name = document.getElementById('ccName').value.trim();
  const trigger = document.getElementById('ccTrigger').value.trim();
  const response = document.getElementById('ccResponse').value.trim();
  if (!name || !trigger || !response) { window.showToast?.('Name, trigger, and response are required.', 'warning'); return; }

  const body = {
    name,
    trigger,
    triggerType: document.getElementById('ccTriggerType').value,
    response,
    type: document.getElementById('ccType').value,
    embedTitle: document.getElementById('ccEmbedTitle').value.trim(),
    embedColor: document.getElementById('ccEmbedColor').value,
    embedDescription: document.getElementById('ccEmbedDesc').value.trim(),
    cooldownSeconds: parseInt(document.getElementById('ccCooldown').value) || 0,
    caseSensitive: document.getElementById('ccCaseSensitive').checked,
    deleteUserMessage: document.getElementById('ccDeleteMsg').checked,
  };

  const btn = document.getElementById('ccModalConfirm');
  btn.disabled = true;
  try {
    let res;
    if (editId) {
      res = await fetch(`/api/guild/${guildId}/custom-commands/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`/api/guild/${guildId}/custom-commands`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    if (editId) {
      const idx = _ccCmds.findIndex(c => c._id === editId);
      if (idx >= 0) _ccCmds[idx] = data;
    } else {
      _ccCmds.push(data);
    }
    document.getElementById('ccList').innerHTML = renderCCList();
    wireCCListButtons(guildId);
    closeCCModal();
  } catch (e) {
    window.showToast?.('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function escCC(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'custom-commands') return;
    if (!_ccInitDone) initCustomCommands(gId);
  });
});

window.initCustomCommands = initCustomCommands;

