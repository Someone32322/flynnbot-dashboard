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
    return `<select id="${id}" multiple style="min-height:70px;width:100%;padding:.4rem;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.82rem">
      ${_roles.filter((r) => r.id !== _guildId).map((r) =>
    `<option value="${r.id}" ${(selectedIds || []).includes(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`
  ).join('')}
    </select>`;
  }

  function buildPanelCard(panel, idx) {
    return `
      <div class="tickets-panel-card" data-panel-idx="${idx}">
        <div class="tickets-panel-card-header">
          <div class="tickets-panel-card-name">${esc(panel.name || 'Unnamed Panel')}</div>
          <div class="tickets-panel-card-actions">
            <button class="btn btn-sm btn-outline" data-action="deploy-panel" data-panel-id="${panel.panelId}" title="Deploy panel to Discord">↑ Deploy</button>
            <button class="btn btn-sm btn-danger" data-action="delete-panel" data-panel-idx="${idx}" title="Delete panel">×</button>
          </div>
        </div>
        <div class="tickets-panel-card-body">
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Panel name</div>
            <div class="tickets-panel-row-value"><input type="text" data-field="name" value="${esc(panel.name)}" maxlength="80" /></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Description</div>
            <div class="tickets-panel-row-value"><textarea data-field="description" rows="2">${esc(panel.description)}</textarea></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Panel channel</div>
            <div class="tickets-panel-row-value"><select data-field="channelId">${channelOptions(panel.channelId)}</select></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Ticket category</div>
            <div class="tickets-panel-row-value"><select data-field="categoryId">${channelOptions(panel.categoryId, true)}</select></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Support roles</div>
            <div class="tickets-panel-row-value">${roleMultiSelect(`panel-support-${idx}`, panel.supportRoles)}</div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Channel name format</div>
            <div class="tickets-panel-row-value"><input type="text" data-field="ticketNameFormat" value="${esc(panel.ticketNameFormat || 'ticket-{username}')}" maxlength="80" /></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Welcome message</div>
            <div class="tickets-panel-row-value"><textarea data-field="welcomeMessage" rows="2">${esc(panel.welcomeMessage || '')}</textarea></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Max open per user</div>
            <div class="tickets-panel-row-value"><input type="number" data-field="maxOpenPerUser" min="1" max="10" value="${panel.maxOpenPerUser || 1}" /></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Auto-close (hours)</div>
            <div class="tickets-panel-row-value"><input type="number" data-field="autoCloseHours" min="0" max="168" value="${panel.autoCloseHours || 0}" placeholder="0 = disabled" /></div>
          </div>
          <div class="tickets-panel-row">
            <div class="tickets-panel-row-label">Transcripts</div>
            <div class="tickets-panel-row-value">
              <label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--text-secondary);margin-bottom:.4rem">
                <input type="checkbox" data-field="transcripts.enabled" ${panel.transcripts?.enabled ? 'checked' : ''} /> Save transcripts
              </label>
              <select data-field="transcripts.channelId">${channelOptions(panel.transcripts?.channelId)}</select>
            </div>
          </div>

          <!-- Buttons -->
          <div class="tickets-panel-row" style="align-items:flex-start">
            <div class="tickets-panel-row-label">Buttons</div>
            <div class="tickets-panel-row-value" id="panel-buttons-${idx}">
              ${(panel.buttons || []).map((btn, bi) => buildButtonRow(btn, idx, bi)).join('')}
              <button class="btn btn-sm btn-outline" data-action="add-button" data-panel-idx="${idx}" style="margin-top:.5rem">+ Add button</button>
            </div>
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
        <input type="text" placeholder="Label" value="${esc(btn.label || 'Open Ticket')}" data-btn-field="label" style="flex:2;padding:.35rem .5rem;background:var(--surface-1);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.8rem" maxlength="80" />
        <input type="text" placeholder="Emoji (optional)" value="${esc(btn.emoji || '')}" data-btn-field="emoji" style="flex:1;padding:.35rem .5rem;background:var(--surface-1);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.8rem" maxlength="32" />
        <input type="text" placeholder="Category" value="${esc(btn.category || 'General')}" data-btn-field="category" style="flex:1;padding:.35rem .5rem;background:var(--surface-1);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.8rem" maxlength="50" />
        <select data-btn-field="style" style="flex:1;padding:.35rem .4rem;background:var(--surface-1);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.8rem">
          ${styles.map(([v, l]) => `<option value="${v}" ${btn.style === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button data-action="remove-button" data-panel-idx="${panelIdx}" data-btn-idx="${btnIdx}" style="flex:0;padding:.35rem .5rem;background:none;border:1px solid var(--border);border-radius:5px;color:var(--text-muted);cursor:pointer;font-size:.8rem">×</button>
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
      <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;margin-bottom:1.5rem">
        <div>
          <div style="font-weight:600;font-size:.95rem;color:var(--text-primary)">Ticket system</div>
          <div style="font-size:.8rem;color:var(--text-muted);margin-top:2px">Enable or disable the entire ticket system</div>
        </div>
        ${toggle('tickets-enabled', c.enabled)}
      </div>

      <!-- General settings -->
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem">
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
        description: '',
        channelId: '',
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
        deployPanel(btn.dataset.panelId, btn);
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
        window.SaveBar?.markDirty();
      }

      if (btn.dataset.action === 'remove-button') {
        const pi = parseInt(btn.dataset.panelIdx, 10);
        const bi = parseInt(btn.dataset.btnIdx, 10);
        _config.panels[pi]?.buttons?.splice(bi, 1);
        btn.closest('.button-row')?.remove();
        window.SaveBar?.markDirty();
      }

      if (btn.dataset.action === 'close-ticket') {
        closeTicketFromDash(btn.dataset.ticketId, btn);
      }
    });

    // Generic change listener
    root.addEventListener('change', () => window.SaveBar?.markDirty());
    root.addEventListener('input', () => window.SaveBar?.markDirty());
  }

  async function deployPanel(panelId, btn) {
    btn.disabled = true;
    btn.textContent = 'Deploying…';
    try {
      const res = await fetch(`/api/guild/${_guildId}/tickets/config`);
      btn.textContent = 'Saved first — deploying via bot on next start';
      btn.disabled = false;
    } catch (err) {
      btn.textContent = 'Failed';
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
      const idx = parseInt(card.dataset.panelIdx, 10);
      const base = _config.panels?.[idx] || {};
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
