/**
 * Ticket System dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _config = {};
  let _channels = [];
  let _roles = [];
  let _tickets = [];
  let _loaded = false;
  let _activeTab = 'panels';

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'tickets') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    const sec = document.getElementById('section-tickets');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
      window.SaveBar?.setHandlers(save, reset);
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const [cfg, channelData, roleData, ticketData] = await Promise.all([
        fetch(`/api/guild/${_guildId}/tickets/config`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/channels`).then((r) => r.json()).catch(() => []),
        fetch(`/api/guild/${_guildId}/roles`).then((r) => r.json()).catch(() => []),
        fetch(`/api/guild/${_guildId}/tickets?status=open&limit=50`).then((r) => r.json()).catch(() => ({ tickets: [] })),
      ]);
      _config = cfg || {};
      _channels = Array.isArray(channelData) ? channelData : [];
      _roles = Array.isArray(roleData) ? roleData : [];
      _tickets = ticketData.tickets || [];
      render();
    } catch (err) {
      console.error('[Tickets] load error', err);
    }
  }

  function render() {
    const root = document.getElementById('tickets-root');
    if (!root) return;
    root.innerHTML = buildHTML();
    root.style.display = '';
    const loading = document.getElementById('tickets-loading');
    if (loading) loading.style.display = 'none';
    attachEvents(root);
  }

  function channelOptions(selectedId, includeCats) {
    const cats = includeCats
      ? _channels.filter((c) => c.type === 4).map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>[Category] ${esc(c.name)}</option>`).join('')
      : '';
    const chans = _channels
      .filter((c) => c.type === 0)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>#${esc(c.name)}</option>`)
      .join('');
    return '<option value="">Not set</option>' + cats + chans;
  }

  function toggle(id, checked) {
    return `<label class="toggle-switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="toggle-slider"></span></label>`;
  }

  function roleMultiSelect(id, selectedIds) {
    return `<select id="${id}" multiple style="min-height:70px;width:100%;padding:.4rem;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.82rem">
      ${_roles.filter((r) => r.id !== _guildId).map((r) =>
    `<option value="${r.id}" ${(selectedIds || []).includes(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`
  ).join('')}
    </select>`;
  }

  const BTN_COLORS = { primary: '#5865f2', secondary: '#4e5058', success: '#248046', danger: '#da373c' };

  function buildPanelPreview(panel) {
    const color = panel.embedColor || '#5865f2';
    const title = esc(panel.name || 'Panel Name');
    const desc = esc(panel.description || 'Click a button below to open a support ticket.');
    const btns = (panel.buttons || []).map((btn) => {
      const bg = BTN_COLORS[btn.style] || BTN_COLORS.primary;
      const emoji = btn.emoji ? `<span style="font-size:.85em;margin-right:4px">${btn.emoji}</span>` : '';
      return `<span class="dc-btn" style="background:${bg}">${emoji}${esc(btn.label || 'Open Ticket')}</span>`;
    }).join('');
    const ch = _channels.find((c) => c.id === panel.channelId);
    const chLabel = ch ? `#${esc(ch.name)}` : '<span style="color:#f87171">No channel selected</span>';
    const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `
      <div class="dc-preview-label">Discord Preview</div>
      <div style="font-size:.72rem;color:#b5bac1;margin-bottom:.7rem">Posts in: ${chLabel}</div>
      <div class="dc-msg">
        <div class="dc-avatar">F</div>
        <div class="dc-msg-content">
          <div class="dc-msg-header">
            <span class="dc-msg-name">FlynnBot</span>
            <span class="dc-msg-bot-badge">APP</span>
            <span class="dc-msg-time">${now}</span>
          </div>
          <div class="dc-embed" style="border-left-color:${color}">
            <div class="dc-embed-title">${title}</div>
            ${desc ? `<div class="dc-embed-desc">${desc}</div>` : ''}
          </div>
          ${btns ? `<div class="dc-btns">${btns}</div>` : ''}
        </div>
      </div>`;
  }

  function refreshPanelPreview(card, idx) {
    const get = (f) => card.querySelector(`[data-field="${f}"]`)?.value ?? '';
    const buttons = [];
    card.querySelectorAll('.button-row').forEach((row) => {
      buttons.push({
        label: row.querySelector('[data-btn-field="label"]')?.value || 'Open Ticket',
        emoji: row.querySelector('[data-btn-field="emoji"]')?.value || '',
        style: row.querySelector('[data-btn-field="style"]')?.value || 'primary',
      });
    });
    const panel = { name: get('name'), description: get('description'), channelId: get('channelId'), embedColor: get('embedColor'), buttons };
    const previewEl = document.getElementById(`panel-preview-${idx}`);
    if (!previewEl) return;
    const oldStatus = document.getElementById(`panel-deploy-status-${idx}`)?.outerHTML || `<div class="dc-deploy-status" id="panel-deploy-status-${idx}"></div>`;
    previewEl.innerHTML = buildPanelPreview(panel) + oldStatus;
    const colorVal = card.querySelector('.tickets-color-val');
    if (colorVal) colorVal.textContent = panel.embedColor;
  }

  function buildPanelCard(panel, idx) {
    const embedColor = panel.embedColor || '#5865f2';
    return `
      <div class="tickets-panel-card" data-panel-idx="${idx}" data-panelid="${panel.panelId}">
        <div class="tickets-panel-card-header">
          <div class="tickets-panel-card-name">${esc(panel.name || 'Unnamed Panel')}</div>
          <div class="tickets-panel-card-actions">
            <button class="btn btn-sm btn-outline" data-action="deploy-panel" data-panel-idx="${idx}" title="Save &amp; deploy panel to Discord">↑ Deploy to Discord</button>
            <button class="btn btn-sm btn-danger" data-action="delete-panel" data-panel-idx="${idx}" title="Delete panel">×</button>
          </div>
        </div>
        <div class="tickets-panel-builder">
          <div class="tickets-panel-form">
            <div class="tickets-panel-row">
              <div class="tickets-panel-row-label">Panel name</div>
              <div class="tickets-panel-row-value"><input type="text" data-field="name" value="${esc(panel.name)}" maxlength="80" /></div>
            </div>
            <div class="tickets-panel-row" style="align-items:flex-start">
              <div class="tickets-panel-row-label" style="padding-top:.4rem">Description</div>
              <div class="tickets-panel-row-value"><textarea data-field="description" rows="2">${esc(panel.description)}</textarea></div>
            </div>
            <div class="tickets-panel-row">
              <div class="tickets-panel-row-label">Panel channel</div>
              <div class="tickets-panel-row-value"><select data-field="channelId">${channelOptions(panel.channelId)}</select></div>
            </div>
            <div class="tickets-panel-row">
              <div class="tickets-panel-row-label">Embed color</div>
              <div class="tickets-panel-row-value" style="display:flex;align-items:center;gap:.6rem">
                <input type="color" data-field="embedColor" value="${embedColor}" style="width:42px;height:34px;padding:2px;border-radius:6px;cursor:pointer;background:var(--input-bg);border:1px solid var(--border)" />
                <span class="tickets-color-val">${embedColor}</span>
              </div>
            </div>
            <div class="tickets-panel-row" style="align-items:flex-start">
              <div class="tickets-panel-row-label" style="padding-top:.4rem">Buttons</div>
              <div class="tickets-panel-row-value" id="panel-buttons-${idx}">
                ${(panel.buttons || []).map((btn, bi) => buildButtonRow(btn, idx, bi)).join('')}
                <button class="btn btn-sm btn-outline" data-action="add-button" data-panel-idx="${idx}" style="margin-top:.4rem">+ Add button</button>
              </div>
            </div>
            <details class="tickets-advanced">
              <summary class="tickets-advanced-toggle">Advanced settings</summary>
              <div class="tickets-advanced-body">
                <div class="tickets-panel-row">
                  <div class="tickets-panel-row-label">Ticket category</div>
                  <div class="tickets-panel-row-value"><select data-field="categoryId">${channelOptions(panel.categoryId, true)}</select></div>
                </div>
                <div class="tickets-panel-row" style="align-items:flex-start">
                  <div class="tickets-panel-row-label" style="padding-top:.4rem">Support roles</div>
                  <div class="tickets-panel-row-value">${roleMultiSelect(`panel-support-${idx}`, panel.supportRoles)}</div>
                </div>
                <div class="tickets-panel-row">
                  <div class="tickets-panel-row-label">Channel name format</div>
                  <div class="tickets-panel-row-value">
                    <input type="text" data-field="ticketNameFormat" value="${esc(panel.ticketNameFormat || 'ticket-{username}')}" maxlength="80" />
                    <div class="tickets-panel-hint">Variables: {username}, {id}, {count}</div>
                  </div>
                </div>
                <div class="tickets-panel-row" style="align-items:flex-start">
                  <div class="tickets-panel-row-label" style="padding-top:.4rem">Welcome message</div>
                  <div class="tickets-panel-row-value">
                    <textarea data-field="welcomeMessage" rows="2">${esc(panel.welcomeMessage || '')}</textarea>
                    <div class="tickets-panel-hint">Sent in the new ticket channel. Supports {user}, {tag}</div>
                  </div>
                </div>
                <div class="tickets-panel-row">
                  <div class="tickets-panel-row-label">Close message</div>
                  <div class="tickets-panel-row-value">
                    <input type="text" data-field="closeMessage" value="${esc(panel.closeMessage || 'This ticket has been closed.')}" maxlength="200" />
                  </div>
                </div>
                <div class="tickets-panel-row">
                  <div class="tickets-panel-row-label">Max open per user</div>
                  <div class="tickets-panel-row-value"><input type="number" data-field="maxOpenPerUser" min="1" max="10" value="${panel.maxOpenPerUser || 1}" /></div>
                </div>
                <div class="tickets-panel-row">
                  <div class="tickets-panel-row-label">Auto-close (hours)</div>
                  <div class="tickets-panel-row-value">
                    <input type="number" data-field="autoCloseHours" min="0" max="168" value="${panel.autoCloseHours || 0}" />
                    <div class="tickets-panel-hint">0 = disabled. Max 168 h (7 days)</div>
                  </div>
                </div>
                <div class="tickets-panel-row" style="align-items:flex-start">
                  <div class="tickets-panel-row-label" style="padding-top:.4rem">Transcripts</div>
                  <div class="tickets-panel-row-value">
                    <label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--text-2);margin-bottom:.4rem">
                      <input type="checkbox" data-field="transcripts.enabled" ${panel.transcripts?.enabled ? 'checked' : ''} /> Save transcript on close
                    </label>
                    <select data-field="transcripts.channelId">${channelOptions(panel.transcripts?.channelId)}</select>
                  </div>
                </div>
              </div>
            </details>
          </div>
          <div class="dc-preview" id="panel-preview-${idx}">
            ${buildPanelPreview(panel)}
            <div class="dc-deploy-status" id="panel-deploy-status-${idx}"></div>
          </div>
        </div>
      </div>`;
  }

  function buildButtonRow(btn, panelIdx, btnIdx) {
    const styles = [
      ['primary', 'Primary (blue)'],
      ['secondary', 'Secondary (grey)'],
      ['success', 'Success (green)'],
      ['danger', 'Danger (red)'],
    ];
    return `
      <div class="button-row" style="display:flex;gap:.5rem;align-items:center;margin-bottom:.35rem" data-btn-idx="${btnIdx}">
        <input type="text" placeholder="Label" value="${esc(btn.label || 'Open Ticket')}" data-btn-field="label" style="flex:2;padding:.35rem .5rem;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.8rem" maxlength="80" />
        <input type="text" placeholder="Emoji (optional)" value="${esc(btn.emoji || '')}" data-btn-field="emoji" style="flex:1;padding:.35rem .5rem;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.8rem" maxlength="32" />
        <input type="text" placeholder="Category" value="${esc(btn.category || 'General')}" data-btn-field="category" style="flex:1;padding:.35rem .5rem;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.8rem" maxlength="50" />
        <select data-btn-field="style" style="flex:1;padding:.35rem .4rem;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:.8rem">
          ${styles.map(([v, l]) => `<option value="${v}" ${btn.style === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button data-action="remove-button" data-panel-idx="${panelIdx}" data-btn-idx="${btnIdx}" style="flex:0;padding:.35rem .5rem;background:none;border:1px solid var(--border);border-radius:5px;color:var(--text-2);cursor:pointer;font-size:.8rem">×</button>
      </div>`;
  }

  function buildTicketsTable() {
    if (!_tickets.length) {
      return '<div class="loading-state" style="padding:2rem">No open tickets</div>';
    }
    const rows = _tickets.map((t) => `
      <tr>
        <td>#${esc(t.ticketId)}</td>
        <td><@${esc(t.userId)}></td>
        <td>${esc(t.category)}</td>
        <td><span class="ticket-status-badge ${t.status}">${esc(t.status)}</span></td>
        <td><span class="ticket-priority-badge ${t.priority}">${esc(t.priority)}</span></td>
        <td>${t.claimedBy ? `<@${esc(t.claimedBy)}>` : '—'}</td>
        <td>${new Date(t.openedAt).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-danger" data-action="close-ticket" data-ticket-id="${t.ticketId}">Close</button>
        </td>
      </tr>`).join('');

    return `
      <div class="tickets-table-wrap">
        <table class="tickets-table">
          <thead>
            <tr>
              <th>Ticket ID</th><th>User</th><th>Category</th>
              <th>Status</th><th>Priority</th><th>Claimed by</th>
              <th>Opened</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function buildHTML() {
    const c = _config;
    const openCount = _tickets.filter((t) => t.status === 'open').length;

    return `
      <!-- Stats -->
      <div class="tickets-stats">
        <div class="tickets-stat-card">
          <div class="tickets-stat-num">${_tickets.length}</div>
          <div class="tickets-stat-label">Open tickets</div>
        </div>
        <div class="tickets-stat-card">
          <div class="tickets-stat-num">${(c.panels || []).length}</div>
          <div class="tickets-stat-label">Panels</div>
        </div>
        <div class="tickets-stat-card">
          <div class="tickets-stat-num">${_tickets.filter((t) => t.claimedBy).length}</div>
          <div class="tickets-stat-label">Claimed</div>
        </div>
        <div class="tickets-stat-card">
          <div class="tickets-stat-num">${c.enabled ? 'On' : 'Off'}</div>
          <div class="tickets-stat-label">System status</div>
        </div>
      </div>

      <!-- Master settings -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;background:var(--bg-1);border:1px solid var(--border);border-radius:10px;margin-bottom:1.5rem">
        <div>
          <div style="font-weight:600;font-size:.95rem;color:var(--text)">Ticket system</div>
          <div style="font-size:.8rem;color:var(--text-2);margin-top:2px">Enable or disable the entire ticket system</div>
        </div>
        ${toggle('tickets-enabled', c.enabled)}
      </div>

      <!-- General settings -->
      <div style="background:var(--bg-1);border:1px solid var(--border);border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem">
        <div class="tickets-panel-row">
          <div class="tickets-panel-row-label">Log channel</div>
          <div class="tickets-panel-row-value" style="max-width:280px">
            <select id="tickets-log-channel">${channelOptions(c.logChannelId)}</select>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tickets-main-tabs">
        <button class="tickets-main-tab ${_activeTab === 'panels' ? 'active' : ''}" data-tab="panels">Panels</button>
        <button class="tickets-main-tab ${_activeTab === 'open' ? 'active' : ''}" data-tab="open">Open Tickets (${openCount})</button>
      </div>

      <!-- Panels tab -->
      <div id="tickets-pane-panels" ${_activeTab !== 'panels' ? 'style="display:none"' : ''}>
        <div class="tickets-panel-list" id="tickets-panel-list">
          ${(c.panels || []).map((p, i) => buildPanelCard(p, i)).join('')}
        </div>
        <button class="tickets-add-panel-btn" id="tickets-add-panel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Panel
        </button>
      </div>

      <!-- Open tickets tab -->
      <div id="tickets-pane-open" ${_activeTab !== 'open' ? 'style="display:none"' : ''}>
        ${buildTicketsTable()}
      </div>`;
  }

  function attachEvents(root) {
    // Master toggle
    root.querySelector('#tickets-enabled')?.addEventListener('change', (e) => {
      _config.enabled = e.target.checked;
      window.SaveBar?.markDirty();
    });

    // Tab switching
    root.querySelectorAll('.tickets-main-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.tab;
        root.querySelectorAll('.tickets-main-tab').forEach((b) => b.classList.toggle('active', b === btn));
        document.getElementById('tickets-pane-panels').style.display = _activeTab === 'panels' ? '' : 'none';
        document.getElementById('tickets-pane-open').style.display = _activeTab === 'open' ? '' : 'none';
      });
    });

    // Add panel
    root.querySelector('#tickets-add-panel')?.addEventListener('click', () => {
      if (!_config.panels) _config.panels = [];
      const newPanel = {
        panelId: Math.random().toString(36).slice(2, 8),
        name: 'Support',
        description: 'Need help? Click a button below to open a support ticket.',
        channelId: '',
        embedColor: '#5865f2',
        categoryId: null,
        supportRoles: [],
        ticketNameFormat: 'ticket-{username}',
        welcomeMessage: 'Thanks for opening a ticket! Support will be with you shortly.',
        closeMessage: 'This ticket has been closed.',
        autoCloseHours: 0,
        maxOpenPerUser: 1,
        transcripts: { enabled: false, channelId: null },
        buttons: [{ label: 'Open Ticket', emoji: '🎫', style: 'primary', category: 'General' }],
      };
      _config.panels.push(newPanel);
      const list = document.getElementById('tickets-panel-list');
      if (list) {
        const div = document.createElement('div');
        div.innerHTML = buildPanelCard(newPanel, _config.panels.length - 1);
        list.appendChild(div.firstElementChild);
      }
      window.SaveBar?.markDirty();
    });

    // Delegated events
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'delete-panel') {
        const idx = parseInt(btn.dataset.panelIdx, 10);
        _config.panels?.splice(idx, 1);
        btn.closest('.tickets-panel-card')?.remove();
        window.SaveBar?.markDirty();
      }

      if (btn.dataset.action === 'deploy-panel') {
        deployPanel(parseInt(btn.dataset.panelIdx, 10), btn);
      }

      if (btn.dataset.action === 'add-button') {
        const idx = parseInt(btn.dataset.panelIdx, 10);
        if (!_config.panels[idx].buttons) _config.panels[idx].buttons = [];
        const newBtn = { label: 'Open Ticket', emoji: '🎫', style: 'primary', category: 'General' };
        _config.panels[idx].buttons.push(newBtn);
        const container = document.getElementById(`panel-buttons-${idx}`);
        if (container) {
          const bi = _config.panels[idx].buttons.length - 1;
          const div = document.createElement('div');
          div.innerHTML = buildButtonRow(newBtn, idx, bi);
          container.insertBefore(div.firstElementChild, btn);
        }
        const addCard = btn.closest('.tickets-panel-card');
        if (addCard) refreshPanelPreview(addCard, idx);
        window.SaveBar?.markDirty();
      }

      if (btn.dataset.action === 'remove-button') {
        const pi = parseInt(btn.dataset.panelIdx, 10);
        const bi = parseInt(btn.dataset.btnIdx, 10);
        _config.panels[pi]?.buttons?.splice(bi, 1);
        const removeCard = btn.closest('.tickets-panel-card');
        btn.closest('.button-row')?.remove();
        if (removeCard) refreshPanelPreview(removeCard, pi);
        window.SaveBar?.markDirty();
      }

      if (btn.dataset.action === 'close-ticket') {
        closeTicketFromDash(btn.dataset.ticketId, btn);
      }
    });

    // Generic change/input — also refreshes Discord preview
    root.addEventListener('change', (e) => {
      const card = e.target.closest('.tickets-panel-card');
      if (card && e.target.closest('.tickets-panel-form, .tickets-advanced-body')) {
        refreshPanelPreview(card, parseInt(card.dataset.panelIdx, 10));
      }
      window.SaveBar?.markDirty();
    });
    root.addEventListener('input', (e) => {
      const card = e.target.closest('.tickets-panel-card');
      if (card && e.target.closest('.tickets-panel-form, .tickets-advanced-body, .button-row')) {
        refreshPanelPreview(card, parseInt(card.dataset.panelIdx, 10));
      }
      window.SaveBar?.markDirty();
    });
  }

  function showDeployStatus(idx, type, msg) {
    const el = document.getElementById(`panel-deploy-status-${idx}`);
    if (!el) return;
    el.className = `dc-deploy-status ${type}`;
    el.textContent = msg;
  }

  async function deployPanel(idx, btn) {
    // Capture panelId from card data attribute (stable, not affected by array re-indexing)
    const card = btn.closest('.tickets-panel-card');
    const panelId = card?.dataset.panelid;
    if (!panelId) return;

    const panels = collectPanels();
    const panel = panels.find((p) => p.panelId === panelId);
    if (!panel) return;
    if (!panel.channelId) {
      showDeployStatus(idx, 'error', 'Set a Panel channel before deploying.');
      return;
    }
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      // 1. Save config
      const saveBody = collect();
      const saveRes = await fetch(`/api/guild/${_guildId}/tickets/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveBody),
      });
      if (!saveRes.ok) throw new Error('Config save failed');
      _config = saveBody;
      window.SaveBar?.markClean();

      // 2. Queue deploy
      btn.textContent = 'Deploying…';
      // panelId was captured above from card data attribute — safe after _config reassign
      const depRes = await fetch(`/api/guild/${_guildId}/tickets/panels/${panelId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await depRes.json();
      if (!depRes.ok) throw new Error(data.error || 'Deploy failed');
      showDeployStatus(idx, 'pending', data.message || 'Queued — panel will appear in Discord within 30 s.');
    } catch (err) {
      showDeployStatus(idx, 'error', err.message || 'Deploy failed — try again');
    } finally {
      btn.innerHTML = origHTML;
      btn.disabled = false;
    }
  }

  async function closeTicketFromDash(ticketId, btn) {
    btn.disabled = true;
    try {
      const res = await fetch(`/api/guild/${_guildId}/tickets/${ticketId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Closed from dashboard' }),
      });
      if (res.ok) {
        btn.closest('tr')?.remove();
        _tickets = _tickets.filter((t) => t.ticketId !== ticketId);
      } else {
        btn.disabled = false;
        btn.textContent = 'Error';
      }
    } catch {
      btn.disabled = false;
    }
  }

  function collectPanels() {
    const panels = [];
    const cards = document.querySelectorAll('#tickets-panel-list .tickets-panel-card');
    cards.forEach((card) => {
      const panelId = card.dataset.panelid;
      const base = _config.panels?.find((p) => p.panelId === panelId) || {};
      const field = (f) => card.querySelector(`[data-field="${f}"]`)?.value ?? '';
      const checkedF = (f) => card.querySelector(`[data-field="${f}"]`)?.checked ?? false;
      const supportRolesEl = card.querySelector(`#panel-support-${idx}`);
      const supportRoles = supportRolesEl ? [...supportRolesEl.selectedOptions].map((o) => o.value) : [];

      const buttons = [];
      card.querySelectorAll('.button-row').forEach((row) => {
        buttons.push({
          label: row.querySelector('[data-btn-field="label"]')?.value || 'Open Ticket',
          emoji: row.querySelector('[data-btn-field="emoji"]')?.value || '',
          style: row.querySelector('[data-btn-field="style"]')?.value || 'primary',
          category: row.querySelector('[data-btn-field="category"]')?.value || 'General',
        });
      });

      panels.push({
        panelId: base.panelId,
        messageId: base.messageId || null,
        name: field('name'),
        description: field('description'),
        channelId: field('channelId'),
        embedColor: field('embedColor') || '#5865f2',
        categoryId: field('categoryId') || null,
        supportRoles,
        ticketNameFormat: field('ticketNameFormat'),
        welcomeMessage: field('welcomeMessage'),
        closeMessage: field('closeMessage') || base.closeMessage || '',
        maxOpenPerUser: parseInt(field('maxOpenPerUser') || '1', 10) || 1,
        autoCloseHours: parseInt(field('autoCloseHours') || '0', 10) || 0,
        transcripts: {
          enabled: checkedF('transcripts.enabled'),
          channelId: field('transcripts.channelId') || null,
        },
        buttons,
      });
    });
    return panels;
  }

  function collect() {
    return {
      enabled: document.getElementById('tickets-enabled')?.checked ?? false,
      logChannelId: document.getElementById('tickets-log-channel')?.value || null,
      panels: collectPanels(),
    };
  }

  async function save() {
    const body = collect();
    const res = await fetch(`/api/guild/${_guildId}/tickets/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to save Ticket config');
    _config = body;
  }

  function reset() {
    _loaded = false;
    load();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const pd = document.getElementById('pageData');
  if (pd?.dataset.guildId) init(pd.dataset.guildId);

  window.TicketsModule = { init, load, save, reset };
})();
