/**
 * data-storage.js — Dashboard Data Storage section logic
 *
 * Manages CRUD for StoredVariable definitions and browsing of their stored values.
 * Loaded on server.ejs. Initializes lazily when the data-storage section is activated.
 *
 * Sections:
 *   Variables tab     — create / edit / delete variable definitions
 *   Predefined tab    — browsable reference of all built-in {variable} placeholders
 *   Side panel        — slide-in form for create / edit
 *   Values modal      — view and reset stored values for a variable
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────

  let guildId     = null;
  let variables   = [];        // StoredVariable definitions
  let editingId   = null;      // null = create mode, string = edit mode
  let propCounter = 0;         // for unique prop field IDs
  let valuesVarId = null;      // variable currently open in values modal
  let valuesPage  = 1;
  let initialized = false;
  let dataLoaded  = false;

  // ── Helpers ───────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  function showToastFallback(msg, type = 'success') {
    window.showToast?.(msg, type);
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Derive a safe refName from a display name
  function toRefName(name) {
    return name.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 64);
  }

  // ── Type labels / colors ──────────────────────────────────────────

  const TYPE_META = {
    text:       { label: 'Text',       color: 'var(--accent)',  icon: 'T' },
    number:     { label: 'Number',     color: '#f59e0b',        icon: '#' },
    user:       { label: 'User',       color: '#60a5fa',        icon: '👤' },
    channel:    { label: 'Channel',    color: '#34d399',        icon: '#' },
    collection: { label: 'Collection', color: '#a78bfa',        icon: '[]' },
    object:     { label: 'Object',     color: '#fb923c',        icon: '{}' },
  };

  const SCOPE_META = {
    guild:   { label: 'Guild',   title: 'One value shared across the entire server' },
    user:    { label: 'User',    title: 'One value per server member' },
    command: { label: 'Command', title: 'One value per command definition' },
  };

  // ── Predefined variable data ──────────────────────────────────────

  const PREDEFINED = [
    // user
    { category: 'User', key: 'user',             label: 'User Mention',        desc: 'Mentions the triggering user (@user)' },
    { category: 'User', key: 'user.id',           label: 'User ID',             desc: "The user's Discord ID" },
    { category: 'User', key: 'user.name',         label: 'Username',            desc: 'Discord username' },
    { category: 'User', key: 'user.tag',          label: 'User Tag',            desc: 'Username#discriminator (or username)' },
    { category: 'User', key: 'user.nickname',     label: 'Nickname',            desc: 'Server nickname, falls back to username' },
    { category: 'User', key: 'user.mention',      label: 'User Mention (same)', desc: '<@userId> mention' },
    { category: 'User', key: 'user.avatar',       label: 'Avatar URL',          desc: "User's avatar image URL" },
    { category: 'User', key: 'user.bot',          label: 'Is Bot',              desc: 'true/false — whether the user is a bot' },
    { category: 'User', key: 'user.createdate',   label: 'Account Created',     desc: 'Date the Discord account was created' },
    { category: 'User', key: 'user.joindate',     label: 'Server Join Date',    desc: 'Date the user joined this server' },
    { category: 'User', key: 'user.roles',        label: 'Roles',               desc: 'Comma-separated list of role names' },
    { category: 'User', key: 'user.rolecount',    label: 'Role Count',          desc: 'Number of roles the member has' },
    { category: 'User', key: 'userID',            label: 'User ID (alias)',     desc: 'Alias for {user.id}' },
    { category: 'User', key: 'executor',          label: 'Executor Mention',    desc: 'Alias for {user}' },
    { category: 'User', key: 'executor.id',       label: 'Executor ID',         desc: 'Alias for {user.id}' },
    // server
    { category: 'Server', key: 'server',             label: 'Server Name',         desc: 'The name of this Discord server' },
    { category: 'Server', key: 'server.id',           label: 'Server ID',           desc: 'The Discord guild ID' },
    { category: 'Server', key: 'server.name',         label: 'Server Name',         desc: 'Same as {server}' },
    { category: 'Server', key: 'server.count',        label: 'Member Count',        desc: 'Total member count of the server' },
    { category: 'Server', key: 'server.icon',         label: 'Server Icon URL',     desc: 'Server icon image URL' },
    { category: 'Server', key: 'server.owner',        label: 'Server Owner',        desc: 'Username of the server owner' },
    { category: 'Server', key: 'server.boost_level',  label: 'Boost Level',         desc: 'Server boost tier (0–3)' },
    { category: 'Server', key: 'server.boost_count',  label: 'Boost Count',         desc: 'Number of active server boosts' },
    { category: 'Server', key: 'membercount',         label: 'Member Count (alias)', desc: 'Alias for {server.count}' },
    { category: 'Server', key: 'serverID',            label: 'Server ID (alias)',   desc: 'Alias for {server.id}' },
    // channel
    { category: 'Channel', key: 'channel',            label: 'Channel Mention',     desc: 'Mentions the current channel (#channel)' },
    { category: 'Channel', key: 'channel.id',         label: 'Channel ID',          desc: 'The channel ID' },
    { category: 'Channel', key: 'channel.name',       label: 'Channel Name',        desc: 'Channel name without #' },
    { category: 'Channel', key: 'channel.topic',      label: 'Channel Topic',       desc: 'Channel topic/description' },
    // message
    { category: 'Message', key: 'message',            label: 'Message Content',     desc: 'Full message content' },
    { category: 'Message', key: 'message.id',         label: 'Message ID',          desc: 'The message ID' },
    { category: 'Message', key: 'message.content',    label: 'Message Content',     desc: 'Same as {message}' },
    { category: 'Message', key: 'message.url',        label: 'Message URL',         desc: 'Jump link to the message' },
    { category: 'Message', key: 'message.attachments',label: 'Attachment Count',    desc: 'Number of attachments' },
    { category: 'Message', key: 'args',               label: 'All Arguments',       desc: 'All arguments after the trigger word (prefix triggers)' },
    { category: 'Message', key: 'arg1',               label: 'Argument 1',          desc: 'First space-separated argument' },
    { category: 'Message', key: 'arg2',               label: 'Argument 2',          desc: 'Second space-separated argument' },
    { category: 'Message', key: 'arg3',               label: 'Argument 3',          desc: 'Third space-separated argument' },
    // slash
    { category: 'Slash Command', key: 'command',         label: 'Command Name',      desc: 'The name of the slash command' },
    { category: 'Slash Command', key: 'command.name',    label: 'Command Name',      desc: 'Same as {command}' },
    { category: 'Slash Command', key: 'option.NAME',     label: 'Option Value',      desc: 'Value of slash option named NAME — replace NAME with the actual option name' },
    // components
    { category: 'Component', key: 'component.id',     label: 'Component ID',        desc: 'Custom ID of the button/select/modal' },
    { category: 'Component', key: 'component.label',  label: 'Button Label',        desc: 'Label text of the button' },
    { category: 'Component', key: 'component.value',  label: 'Selected Value',      desc: 'First selected value from a select menu' },
    { category: 'Component', key: 'component.values', label: 'All Values',          desc: 'All selected values, comma-separated' },
    { category: 'Component', key: 'modal.FIELD',       label: 'Modal Field',         desc: 'Modal text input value — replace FIELD with the input custom ID' },
    // reaction
    { category: 'Reaction', key: 'emoji',              label: 'Emoji',               desc: 'The reaction emoji (⭐ or <:name:id>)' },
    { category: 'Reaction', key: 'emoji.name',         label: 'Emoji Name',          desc: 'Emoji name' },
    { category: 'Reaction', key: 'reaction.message',   label: 'Reacted Message ID',  desc: 'ID of the message that was reacted to' },
    // voice
    { category: 'Voice', key: 'voice.channel',         label: 'Voice Channel Name',  desc: 'Name of the voice channel joined/left' },
    { category: 'Voice', key: 'voice.channel.id',      label: 'Voice Channel ID',    desc: 'ID of the voice channel' },
    // time
    { category: 'Date & Time', key: 'date',            label: 'Current Date',        desc: 'Human-readable current date (Mon Jan 01 2025)' },
    { category: 'Date & Time', key: 'time',            label: 'Current Time',        desc: 'Current time in HH:MM:SS format' },
    { category: 'Date & Time', key: 'timestamp',       label: 'Unix Timestamp',      desc: 'Unix timestamp in seconds' },
    { category: 'Date & Time', key: 'timestamp.ms',    label: 'Unix Timestamp (ms)', desc: 'Unix timestamp in milliseconds' },
    { category: 'Date & Time', key: 'iso',             label: 'ISO Date String',     desc: 'ISO 8601 date/time string (2025-01-01T00:00:00.000Z)' },
    // execution
    { category: 'Execution', key: 'exec.id',           label: 'Execution ID',        desc: 'Unique UUID for this command run' },
    { category: 'Execution', key: 'exec.count',        label: 'Execution Count',     desc: 'Total times this command has ever run' },
  ];

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    const pageData = $('pageData');
    guildId = pageData?.dataset?.guildId;
    if (!guildId) return;

    // Button wiring
    $('dsNewVarBtn')?.addEventListener('click', openCreatePanel);
    $('dsEmptyNewBtn')?.addEventListener('click', openCreatePanel);
    $('dsPanelClose')?.addEventListener('click', closePanel);
    $('dsCancelBtn')?.addEventListener('click', closePanel);
    $('dsPanelBackdrop')?.addEventListener('click', closePanel);

    $('dsVarForm')?.addEventListener('submit', handleFormSubmit);

    // Tab switching
    document.querySelectorAll('#dsTabs .ds-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Type change
    $('dsVarType')?.addEventListener('change', () => updateTypeConfig(false));

    // Auto-generate refName from name (create mode only)
    $('dsVarName')?.addEventListener('input', () => {
      if (!editingId && $('dsVarRefName')) {
        $('dsVarRefName').value = toRefName($('dsVarName').value);
      }
    });

    // Add property button
    $('dsAddPropBtn')?.addEventListener('click', addObjectProperty);

    // Predefined search
    $('dsPredefinedSearch')?.addEventListener('input', () => {
      renderPredefined($('dsPredefinedSearch').value.trim().toLowerCase());
    });

    // Values modal
    $('dsValuesModalClose')?.addEventListener('click', closeValuesModal);
    $('dsValuesModalBackdrop')?.addEventListener('click', closeValuesModal);
    $('dsResetAllBtn')?.addEventListener('click', resetAllValues);

    // Observe section visibility
    const section = $('section-data-storage');
    if (!section) return;

    const observer = new MutationObserver(() => {
      if (section.style.display !== 'none' && !initialized) {
        initialized = true;
        observer.disconnect();
        loadVariables();
        renderPredefined();
      }
    });
    observer.observe(section, { attributes: true, attributeFilter: ['style'] });
    if (section.style.display !== 'none') {
      initialized = true;
      loadVariables();
      renderPredefined();
    }

    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section !== 'data-storage') return;
      if (!initialized) initialized = true;
      if (!dataLoaded) {
        loadVariables();
        renderPredefined();
      }
    });
  }

  // ── Tab switching ─────────────────────────────────────────────────

  function switchTab(tab) {
    document.querySelectorAll('#dsTabs .ds-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('dsTabVariables').style.display  = tab === 'variables'  ? '' : 'none';
    $('dsTabPredefined').style.display = tab === 'predefined' ? '' : 'none';
  }

  // ── Load & render variables ───────────────────────────────────────

  async function loadVariables() {
    setLoading(true);
    try {
      const res = await fetch(`/api/guild/${guildId}/stored-variables`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      variables = data.variables || [];
      dataLoaded = true;
      renderVariables();
    } catch (err) {
      console.error('[DataStorage] loadVariables', err);
      showToastFallback('Failed to load stored variables', 'error');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(on) {
    const loading = $('dsLoading');
    const table   = $('dsVarTable');
    const empty   = $('dsEmptyState');
    if (loading) loading.style.display = on ? 'flex' : 'none';
    if (!on) {
      if (variables.length === 0) {
        if (table)  table.style.display  = 'none';
        if (empty)  empty.style.display  = '';
      } else {
        if (table)  table.style.display  = '';
        if (empty)  empty.style.display  = 'none';
      }
    }
  }

  function renderVariables() {
    const tbody = $('dsVarTbody');
    const count = $('dsVarCount');
    if (count) count.textContent = variables.length;

    setLoading(false);
    if (!tbody) return;

    tbody.innerHTML = variables.map(v => {
      const tm = TYPE_META[v.type] || { label: v.type, color: '#888', icon: '?' };
      const sm = SCOPE_META[v.scope] || { label: v.scope, title: '' };
      return `<tr data-id="${escHtml(v._id)}">
        <td>
          <div class="ds-var-name">${escHtml(v.name)}</div>
          ${v.description ? `<div class="ds-var-desc">${escHtml(v.description)}</div>` : ''}
        </td>
        <td>
          <code class="ds-ref-pill" title="Use in commands as {stored.${escHtml(v.refName)}}">{stored.<strong>${escHtml(v.refName)}</strong>}</code>
        </td>
        <td>
          <span class="ds-type-badge" style="--badge-color:${tm.color}">${escHtml(tm.label)}</span>
        </td>
        <td>
          <span class="ds-scope-badge" title="${escHtml(sm.title)}">${escHtml(sm.label)}</span>
        </td>
        <td>
          <span class="ds-status-dot ${v.enabled ? 'enabled' : 'disabled'}">${v.enabled ? 'Enabled' : 'Disabled'}</span>
        </td>
        <td class="ds-actions-cell">
          <button class="ds-btn-icon ds-view-btn" data-id="${escHtml(v._id)}" title="View stored values">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="ds-btn-icon ds-edit-btn" data-id="${escHtml(v._id)}" title="Edit variable">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="ds-btn-icon ds-delete-btn" data-id="${escHtml(v._id)}" data-name="${escHtml(v.name)}" title="Delete variable">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');

    // Wire row buttons
    tbody.querySelectorAll('.ds-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditPanel(btn.dataset.id));
    });
    tbody.querySelectorAll('.ds-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteVariable(btn.dataset.id, btn.dataset.name));
    });
    tbody.querySelectorAll('.ds-view-btn').forEach(btn => {
      btn.addEventListener('click', () => openValuesModal(btn.dataset.id));
    });
  }

  // ── Panel: Create ─────────────────────────────────────────────────

  function openCreatePanel() {
    editingId = null;
    $('dsPanelTitle').textContent = 'New Variable';
    $('dsVarForm').reset();
    $('dsVarId').value = '';
    $('dsVarEnabled').checked = true;
    $('dsObjProps').innerHTML = '';
    propCounter = 0;
    updateTypeConfig(true);
    showPanel();
  }

  // ── Panel: Edit ───────────────────────────────────────────────────

  function openEditPanel(id) {
    const v = variables.find(x => String(x._id) === String(id));
    if (!v) return;
    editingId = id;
    $('dsPanelTitle').textContent = 'Edit Variable';
    $('dsVarId').value = id;
    $('dsVarName').value = v.name;
    $('dsVarRefName').value = v.refName;
    $('dsVarRefName').disabled = true; // refName is immutable after creation
    $('dsVarDescription').value = v.description || '';
    $('dsVarType').value = v.type;
    $('dsVarType').disabled = true; // type immutable after creation
    $('dsVarScope').value = v.scope;
    $('dsVarScope').disabled = true; // scope immutable after creation
    $('dsVarEnabled').checked = v.enabled !== false;

    // Populate type-specific config
    updateTypeConfig(false, v);
    showPanel();
  }

  function showPanel() {
    $('dsPanel').style.display = '';
    $('dsPanelBackdrop').style.display = '';
    document.body.classList.add('ds-panel-open');
  }

  function closePanel() {
    $('dsPanel').style.display = 'none';
    $('dsPanelBackdrop').style.display = 'none';
    document.body.classList.remove('ds-panel-open');
    // Re-enable locked fields
    ['dsVarRefName', 'dsVarType', 'dsVarScope'].forEach(id => {
      const el = $(id);
      if (el) el.disabled = false;
    });
  }

  // ── Type config ───────────────────────────────────────────────────

  function updateTypeConfig(reset, existing) {
    const type = $('dsVarType')?.value;
    const blocks = ['Text', 'Number', 'User', 'Channel', 'Collection', 'Object'];
    blocks.forEach(t => {
      const el = $(`dsConfig${t}`);
      if (el) el.style.display = type === t.toLowerCase() ? '' : 'none';
    });

    if (!reset && existing) {
      populateTypeConfig(type, existing.config || {});
    }
  }

  function populateTypeConfig(type, cfg) {
    switch (type) {
      case 'text':
        if ($('dsCfgTextDefault'))  $('dsCfgTextDefault').value  = cfg.defaultValue ?? '';
        if ($('dsCfgTextMax'))      $('dsCfgTextMax').value      = cfg.maxLength    ?? '';
        break;
      case 'number':
        if ($('dsCfgNumDefault'))   $('dsCfgNumDefault').value   = cfg.defaultValue ?? '';
        if ($('dsCfgNumMin'))       $('dsCfgNumMin').value       = cfg.min          ?? '';
        if ($('dsCfgNumMax'))       $('dsCfgNumMax').value       = cfg.max          ?? '';
        if ($('dsCfgNumFloat'))     $('dsCfgNumFloat').checked   = Boolean(cfg.isFloat);
        break;
      case 'user':
        if ($('dsCfgUserDataType')) $('dsCfgUserDataType').value = cfg.userDataType ?? 'id';
        if ($('dsCfgUserDefault'))  $('dsCfgUserDefault').value  = cfg.defaultValue ?? '';
        break;
      case 'channel':
        if ($('dsCfgChDataType'))   $('dsCfgChDataType').value   = cfg.channelDataType ?? 'id';
        if ($('dsCfgChDefault'))    $('dsCfgChDefault').value    = cfg.defaultValue ?? '';
        break;
      case 'collection':
        if ($('dsCfgColItemType'))  $('dsCfgColItemType').value  = cfg.itemType  ?? 'text';
        if ($('dsCfgColMaxSize'))   $('dsCfgColMaxSize').value   = cfg.maxSize   ?? 100;
        if ($('dsCfgColDefault'))   $('dsCfgColDefault').value   = cfg.defaultValue ? JSON.stringify(cfg.defaultValue) : '';
        break;
      case 'object': {
        $('dsObjProps').innerHTML = '';
        propCounter = 0;
        (cfg.properties || []).forEach(p => addObjectProperty(null, p));
        break;
      }
    }
  }

  function gatherTypeConfig(type) {
    const cfg = {};
    switch (type) {
      case 'text':
        cfg.defaultValue = $('dsCfgTextDefault')?.value ?? null;
        const maxL = parseInt($('dsCfgTextMax')?.value);
        if (!isNaN(maxL) && maxL > 0) cfg.maxLength = maxL;
        break;
      case 'number': {
        const dv = $('dsCfgNumDefault')?.value;
        cfg.defaultValue = dv !== '' && dv !== undefined ? Number(dv) : null;
        const min = $('dsCfgNumMin')?.value;
        const max = $('dsCfgNumMax')?.value;
        if (min !== '' && min !== undefined) cfg.min = Number(min);
        if (max !== '' && max !== undefined) cfg.max = Number(max);
        cfg.isFloat = $('dsCfgNumFloat')?.checked ?? false;
        break;
      }
      case 'user':
        cfg.userDataType = $('dsCfgUserDataType')?.value || 'id';
        cfg.defaultValue = $('dsCfgUserDefault')?.value || null;
        break;
      case 'channel':
        cfg.channelDataType = $('dsCfgChDataType')?.value || 'id';
        cfg.defaultValue = $('dsCfgChDefault')?.value || null;
        break;
      case 'collection': {
        cfg.itemType = $('dsCfgColItemType')?.value || 'text';
        cfg.maxSize  = parseInt($('dsCfgColMaxSize')?.value) || 100;
        const rawDef = $('dsCfgColDefault')?.value?.trim();
        if (rawDef) {
          try { cfg.defaultValue = JSON.parse(rawDef); } catch { /* leave null */ }
        }
        break;
      }
      case 'object':
        cfg.properties = gatherObjectProperties();
        break;
    }
    return cfg;
  }

  // ── Object properties editor ──────────────────────────────────────

  function addObjectProperty(e, existing = null) {
    if (e) e.preventDefault();
    const idx = ++propCounter;
    const name     = existing?.name     ?? '';
    const refName  = existing?.refName  ?? '';
    const type     = existing?.type     ?? 'text';
    const required = existing?.required ?? false;
    const defVal   = existing?.defaultValue ?? '';

    const row = document.createElement('div');
    row.className = 'ds-prop-row';
    row.dataset.idx = idx;
    row.innerHTML = `
      <div class="ds-prop-fields">
        <input type="text"   class="ds-input ds-prop-name"    placeholder="Property Name"   value="${escHtml(name)}"    maxlength="64" autocomplete="off">
        <input type="text"   class="ds-input ds-prop-ref"     placeholder="reference_name"  value="${escHtml(refName)}" maxlength="64" autocomplete="off" pattern="[a-z0-9_\\-]+">
        <select class="ds-input ds-prop-type ds-select">
          <option value="text"    ${type==='text'    ? 'selected':''}>Text</option>
          <option value="number"  ${type==='number'  ? 'selected':''}>Number</option>
          <option value="boolean" ${type==='boolean' ? 'selected':''}>Boolean</option>
        </select>
        <input type="text"   class="ds-input ds-prop-default" placeholder="Default value"   value="${escHtml(defVal)}"  maxlength="200" autocomplete="off">
        <label class="ds-prop-required">
          <input type="checkbox" class="ds-prop-req-chk" ${required ? 'checked':''}>
          Required
        </label>
        <button type="button" class="ds-btn-icon ds-remove-prop-btn" title="Remove property">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;

    // Auto-generate refName from property name
    row.querySelector('.ds-prop-name').addEventListener('input', (ev) => {
      const ref = row.querySelector('.ds-prop-ref');
      if (!ref.value || ref.value === toRefName(ev.target.defaultValue || '')) {
        ref.value = toRefName(ev.target.value);
      }
    });

    row.querySelector('.ds-remove-prop-btn').addEventListener('click', () => row.remove());
    $('dsObjProps').appendChild(row);
  }

  function gatherObjectProperties() {
    const rows = $('dsObjProps')?.querySelectorAll('.ds-prop-row') || [];
    return Array.from(rows).map(row => ({
      name:         row.querySelector('.ds-prop-name')?.value.trim() || '',
      refName:      row.querySelector('.ds-prop-ref')?.value.trim().toLowerCase() || '',
      type:         row.querySelector('.ds-prop-type')?.value || 'text',
      required:     row.querySelector('.ds-prop-req-chk')?.checked || false,
      defaultValue: row.querySelector('.ds-prop-default')?.value || null,
    })).filter(p => p.name && p.refName);
  }

  // ── Form submit ───────────────────────────────────────────────────

  async function handleFormSubmit(e) {
    e.preventDefault();
    const name     = $('dsVarName')?.value.trim();
    const refName  = $('dsVarRefName')?.value.trim();
    const type     = $('dsVarType')?.value;
    const scope    = $('dsVarScope')?.value;
    const desc     = $('dsVarDescription')?.value.trim();
    const enabled  = $('dsVarEnabled')?.checked ?? true;

    // Client-side validation
    if (!name)    return showToastFallback('Display name is required', 'error');
    if (!refName) return showToastFallback('Reference name is required', 'error');
    if (!/^[a-z0-9_-]{1,64}$/.test(refName)) {
      return showToastFallback('Reference name must be lowercase, letters/numbers/hyphens/underscores only', 'error');
    }

    const config = gatherTypeConfig(type);
    const btn = $('dsSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      const isEdit = Boolean(editingId);
      const url    = isEdit
        ? `/api/guild/${guildId}/stored-variables/${editingId}`
        : `/api/guild/${guildId}/stored-variables`;
      const method = isEdit ? 'PATCH' : 'POST';

      const payload = isEdit
        ? { name, description: desc, config, enabled }
        : { name, refName, description: desc, type, scope, config };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showToastFallback(data.error || 'Save failed', 'error');
        return;
      }

      showToastFallback(isEdit ? 'Variable updated' : 'Variable created', 'success');
      closePanel();
      await loadVariables();
    } catch (err) {
      console.error('[DataStorage] save', err);
      showToastFallback('Failed to save variable', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Variable';
    }
  }

  // ── Delete ────────────────────────────────────────────────────────

  async function deleteVariable(id, name) {
    if (!confirm(`Delete "${name}"?\n\nThis will also delete ALL stored values for this variable. This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/guild/${guildId}/stored-variables/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToastFallback(data.error || 'Delete failed', 'error'); return; }
      showToastFallback(`"${name}" deleted (${data.valuesDeleted} values removed)`, 'success');
      await loadVariables();
    } catch (err) {
      console.error('[DataStorage] delete', err);
      showToastFallback('Failed to delete variable', 'error');
    }
  }

  // ── Values modal ──────────────────────────────────────────────────

  async function openValuesModal(id) {
    valuesVarId = id;
    valuesPage  = 1;
    const v = variables.find(x => String(x._id) === String(id));
    if ($('dsValuesModalTitle') && v) {
      $('dsValuesModalTitle').textContent = `Values — ${v.name}`;
    }
    $('dsValuesModalBackdrop').style.display = '';
    $('dsValuesModal').style.display = '';
    await loadValues();
  }

  function closeValuesModal() {
    $('dsValuesModal').style.display = 'none';
    $('dsValuesModalBackdrop').style.display = 'none';
    valuesVarId = null;
  }

  async function loadValues(page = 1) {
    if (!valuesVarId) return;
    valuesPage = page;
    const userId = $('dsValuesSearch')?.value.trim();
    const params = new URLSearchParams({ page, limit: 50 });
    if (userId) params.set('userId', userId);
    try {
      const res  = await fetch(`/api/guild/${guildId}/stored-variables/${valuesVarId}/values?${params}`);
      const data = await res.json();
      renderValues(data);
    } catch (err) {
      console.error('[DataStorage] loadValues', err);
    }
  }

  function renderValues({ values = [], total = 0, page = 1, pages = 1 }) {
    const list  = $('dsValuesList');
    const pager = $('dsValuesPager');
    if (!list) return;

    if (values.length === 0) {
      list.innerHTML = '<div class="ds-values-empty">No values stored yet.</div>';
      if (pager) pager.innerHTML = '';
      return;
    }

    list.innerHTML = `<table class="ds-table ds-values-table">
      <thead><tr><th>Scope</th><th>User ID</th><th>Value</th><th>Updated</th></tr></thead>
      <tbody>${values.map(v => {
        const val = typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value ?? '');
        const date = v.updatedAt ? new Date(v.updatedAt).toLocaleString() : '—';
        return `<tr>
          <td><span class="ds-scope-badge">${escHtml(v.scope)}</span></td>
          <td><code>${escHtml(v.userId || '—')}</code></td>
          <td class="ds-val-cell"><span title="${escHtml(val)}">${escHtml(val.slice(0, 80))}${val.length > 80 ? '…' : ''}</span></td>
          <td class="ds-val-date">${escHtml(date)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

    if (pager) {
      pager.innerHTML = pages <= 1 ? '' : `
        <div class="ds-page-btns">
          ${page > 1     ? `<button class="ds-page-btn" data-page="${page - 1}">← Previous</button>` : ''}
          <span>Page ${page} / ${pages} (${total} total)</span>
          ${page < pages ? `<button class="ds-page-btn" data-page="${page + 1}">Next →</button>` : ''}
        </div>`;
      pager.querySelectorAll('.ds-page-btn').forEach(b => {
        b.addEventListener('click', () => loadValues(Number(b.dataset.page)));
      });
    }
  }

  async function resetAllValues() {
    if (!valuesVarId) return;
    const v = variables.find(x => String(x._id) === String(valuesVarId));
    if (!confirm(`Reset ALL stored values for "${v?.name}"?\n\nThis cannot be undone.`)) return;
    try {
      const res  = await fetch(`/api/guild/${guildId}/stored-variables/${valuesVarId}/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showToastFallback(data.error || 'Reset failed', 'error'); return; }
      showToastFallback(`Reset complete — ${data.deleted} values deleted`, 'success');
      await loadValues();
    } catch (err) {
      showToastFallback('Reset failed', 'error');
    }
  }

  // Filter values by user ID when pressing Enter
  $('dsValuesSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadValues(1);
  });

  // ── Predefined variables tab ──────────────────────────────────────

  function renderPredefined(search = '') {
    const container = $('dsPredefinedList');
    if (!container) return;

    const filtered = search
      ? PREDEFINED.filter(v => v.key.includes(search) || v.label.toLowerCase().includes(search) || v.desc.toLowerCase().includes(search))
      : PREDEFINED;

    // Group by category
    const groups = {};
    for (const v of filtered) {
      (groups[v.category] ??= []).push(v);
    }

    if (Object.keys(groups).length === 0) {
      container.innerHTML = '<div class="ds-values-empty">No variables match your search.</div>';
      return;
    }

    container.innerHTML = Object.entries(groups).map(([cat, items]) => `
      <div class="ds-pre-group">
        <div class="ds-pre-cat">${escHtml(cat)}</div>
        <div class="ds-pre-grid">
          ${items.map(v => `
            <button class="ds-pre-item" data-key="${escHtml(v.key)}" title="${escHtml(v.desc)}\n\nClick to copy placeholder">
              <code class="ds-pre-key">{${escHtml(v.key)}}</code>
              <span class="ds-pre-label">${escHtml(v.label)}</span>
              <span class="ds-pre-desc">${escHtml(v.desc)}</span>
            </button>`).join('')}
        </div>
      </div>`).join('');

    container.querySelectorAll('.ds-pre-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const placeholder = `{${btn.dataset.key}}`;
        navigator.clipboard?.writeText(placeholder).then(() => {
          showToastFallback(`Copied ${placeholder}`, 'success');
        }).catch(() => {
          showToastFallback(`Placeholder: ${placeholder}`, 'success');
        });
      });
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);

})();
