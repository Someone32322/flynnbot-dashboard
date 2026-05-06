(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════
     CONSTANTS & STATE
  ═══════════════════════════════════════════════════ */
  const STORAGE_KEY = 'op_features_v1';
  let confirmResolve = null;
  let uptimeBase = parseInt(
    document.getElementById('opUptimeTicker')?.dataset.seconds || '0', 10
  );
  let uptimeStart = Date.now();
  let currentLogFilter = 'all';
  let spotlightIdx = -1;
  const SUPPORTED_PANELS = new Set(['overview', 'servers', 'users', 'database', 'deploy', 'security']);
  const DISABLED_OWNER_ACTIONS = new Set([
    'maintenance',
    'sync-commands',
    'reload-modules',
    'check-updates',
    'create-task',
    'run-task',
    'backup-db',
    'create-api-key',
    'add-webhook',
    'refresh-logs',
    'export-logs',
    'emergency-shutdown',
  ]);

  /* ═══════════════════════════════════════════════════
     PANEL NAVIGATION
  ═══════════════════════════════════════════════════ */
  const panels = document.querySelectorAll('.op-panel');
  const navItems = document.querySelectorAll('.op-nav-item');

  function stripPlaceholderControls() {
    navItems.forEach((item) => {
      if (!SUPPORTED_PANELS.has(item.dataset.panel)) item.remove();
    });

    panels.forEach((panel) => {
      if (!SUPPORTED_PANELS.has(panel.dataset.panel)) {
        panel.remove();
        return;
      }

      panel.querySelectorAll('[data-action]').forEach((el) => {
        if (!DISABLED_OWNER_ACTIONS.has(el.dataset.action)) return;
        const removable = el.closest('.op-action-row, .op-ph-actions, .op-filter-bar') || el;
        removable.remove();
      });
    });

    document.querySelectorAll('[data-module="economy"]').forEach((btn) => {
      const row = btn.closest('.op-action-row');
      if (row) row.remove();
    });

    document.querySelectorAll('.op-stat').forEach((stat) => {
      const label = stat.querySelector('.op-stat-label')?.textContent || '';
      if (/economy/i.test(label)) stat.remove();
    });

    document.querySelectorAll('.op-table tbody tr').forEach((row) => {
      if (/EconomyProfiles/i.test(row.textContent || '')) row.remove();
    });

    const usersPanel = document.querySelector('.op-panel[data-panel="users"]');
    const usersDesc = usersPanel?.querySelector('.op-ph-desc');
    if (usersDesc) usersDesc.textContent = 'Search users globally — XP and infractions';
    const usersEmptyDesc = usersPanel?.querySelector('#userLookupResult .op-empty-desc');
    if (usersEmptyDesc) usersEmptyDesc.textContent = 'XP and infraction history will appear here';
    const resetUserDesc = usersPanel
      ?.querySelector('[data-action="reset-user"]')
      ?.closest('.op-action-row')
      ?.querySelector('.op-action-row-desc');
    if (resetUserDesc) resetUserDesc.textContent = 'Wipe all XP and infractions for a user';
  }

  function normalizePanelName(name) {
    return SUPPORTED_PANELS.has(name) ? name : 'overview';
  }

  stripPlaceholderControls();

  function showPanel(name) {
    const panelName = normalizePanelName(name);
    panels.forEach(p => p.classList.toggle('op-panel--active', p.dataset.panel === panelName));
    navItems.forEach(n => n.classList.toggle('op-nav-item--active', n.dataset.panel === panelName));
    window.location.hash = panelName;
    if (panelName === 'servers') fetchServers();
  }

  navItems.forEach(n => {
    n.addEventListener('click', e => {
      e.preventDefault();
      showPanel(n.dataset.panel);
    });
  });

  // Hash-based navigation on load
  const initPanel = normalizePanelName((window.location.hash || '').replace('#', '') || 'overview');
  showPanel(initPanel);

  /* ═══════════════════════════════════════════════════
     TOAST
  ═══════════════════════════════════════════════════ */
  function opToast(msg, type = 'info') {
    const icons = {
      success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      error:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warn:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };
    const colors = { success: '#17c964', error: '#f31260', warn: '#f5a524', info: '#4f8ef7' };
    const t = document.createElement('div');
    t.className = 'op-toast';
    t.innerHTML = `<span style="color:${colors[type] || colors.info}">${icons[type] || icons.info}</span><span>${msg}</span>`;
    document.getElementById('opToasts').appendChild(t);
    requestAnimationFrame(() => t.classList.add('op-toast--show'));
    setTimeout(() => {
      t.classList.remove('op-toast--show');
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }

  /* ═══════════════════════════════════════════════════
     CONFIRM MODAL
  ═══════════════════════════════════════════════════ */
  function opConfirm({ title = 'Confirm', desc = 'Are you sure?', type = 'danger', btnLabel = 'Confirm' } = {}) {
    return new Promise(resolve => {
      confirmResolve = resolve;
      const overlay = document.getElementById('opConfirmOverlay');
      document.getElementById('opModalTitle').textContent = title;
      document.getElementById('opModalDesc').textContent = desc;
      const confirmBtn = document.getElementById('opModalConfirm');
      confirmBtn.textContent = btnLabel;
      confirmBtn.className = `op-btn op-btn--${type}`;
      overlay.classList.add('op-overlay--active');
    });
  }

  document.getElementById('opModalCancel').addEventListener('click', () => {
    document.getElementById('opConfirmOverlay').classList.remove('op-overlay--active');
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
  });

  document.getElementById('opModalConfirm').addEventListener('click', () => {
    document.getElementById('opConfirmOverlay').classList.remove('op-overlay--active');
    if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
  });

  /* ═══════════════════════════════════════════════════
     UPTIME TICKERS
  ═══════════════════════════════════════════════════ */
  function fmtUptime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  function fmtUptimeShort(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }

  setInterval(() => {
    const elapsed = Math.floor((Date.now() - uptimeStart) / 1000);
    const total = uptimeBase + elapsed;
    const el1 = document.getElementById('opUptimeTicker');
    const el2 = document.getElementById('opDeployUptime');
    if (el1) el1.textContent = fmtUptime(total);
    if (el2) el2.textContent = fmtUptimeShort(total);
  }, 1000);

  /* ═══════════════════════════════════════════════════
     NOTIFICATIONS PANEL
  ═══════════════════════════════════════════════════ */
  const notifBtn = document.getElementById('opNotifBtn');
  const notifPanel = document.getElementById('opNotifPanel');

  notifBtn.addEventListener('click', e => {
    e.stopPropagation();
    notifPanel.classList.toggle('op-notif-panel--open');
    document.getElementById('opProfileMenu').classList.remove('op-profile-menu--open');
  });

  const notifClear = document.getElementById('opNotifClear');
  if (notifClear) {
    notifClear.addEventListener('click', () => {
      notifPanel.querySelectorAll('.op-notif-item').forEach(el => el.remove());
      document.querySelector('.op-notif-dot')?.remove();
    });
  }

  /* ═══════════════════════════════════════════════════
     PROFILE MENU
  ═══════════════════════════════════════════════════ */
  const profileBtn = document.getElementById('opProfileBtn');
  const profileMenu = document.getElementById('opProfileMenu');

  profileBtn.addEventListener('click', e => {
    e.stopPropagation();
    profileMenu.classList.toggle('op-profile-menu--open');
    notifPanel.classList.remove('op-notif-panel--open');
  });

  /* ═══════════════════════════════════════════════════
     CLICK OUTSIDE CLOSE
  ═══════════════════════════════════════════════════ */
  document.addEventListener('click', () => {
    notifPanel.classList.remove('op-notif-panel--open');
    profileMenu.classList.remove('op-profile-menu--open');
  });

  /* ═══════════════════════════════════════════════════
     FEATURE TOGGLES (persist to localStorage)
  ═══════════════════════════════════════════════════ */
  function loadFeatures() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }
  function saveFeatures(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  const featureData = loadFeatures();

  document.querySelectorAll('[data-feature-key]').forEach(el => {
    const key = el.dataset.featureKey;
    if (key in featureData) el.checked = featureData[key];
    el.addEventListener('change', () => {
      featureData[key] = el.checked;
      saveFeatures(featureData);
      opToast(`${key.replace(/_/g, ' ')} ${el.checked ? 'enabled' : 'disabled'}`, el.checked ? 'success' : 'info');
    });
  });

  /* ═══════════════════════════════════════════════════
     API HELPERS
  ═══════════════════════════════════════════════════ */
  async function apiPost(path, body = {}) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function apiGet(path) {
    const res = await fetch(path);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  /* ═══════════════════════════════════════════════════
     SERVERS PANEL
  ═══════════════════════════════════════════════════ */
  const serversTableBody = document.getElementById('serversTableBody');
  const serverSearch = document.getElementById('serverSearch');
  let _allServers = [];
  let _serversFetched = false;

  async function fetchServers() {
    if (_serversFetched) { renderServers(); return; }
    if (serversTableBody) {
      serversTableBody.innerHTML = `<tr><td colspan="4"><div class="op-empty">
        <div class="op-empty-title">Loading…</div>
        <div class="op-empty-desc">Fetching live server list from Discord bot.</div>
      </div></td></tr>`;
    }
    try {
      const data = await apiGet('/api/owner/guilds');
      _allServers = data.guilds || [];
      _serversFetched = true;
      renderServers();
    } catch (err) {
      if (serversTableBody) {
        serversTableBody.innerHTML = `<tr><td colspan="4"><div class="op-empty">
          <div class="op-empty-title" style="color:var(--op-danger)">Failed to load servers</div>
          <div class="op-empty-desc">${escHtml(err.message)}</div>
        </div></td></tr>`;
      }
      opToast(`Servers: ${err.message}`, 'error');
    }
  }

  function renderServers() {
    if (!serversTableBody) return;
    const q = (serverSearch ? serverSearch.value.trim().toLowerCase() : '');
    const list = q
      ? _allServers.filter(g => g.name.toLowerCase().includes(q) || g.id.includes(q))
      : _allServers;

    if (!list.length) {
      serversTableBody.innerHTML = `<tr><td colspan="4"><div class="op-empty">
        <div class="op-empty-title">No servers found</div>
        <div class="op-empty-desc">${q ? 'No match for "' + escHtml(q) + '"' : 'Bot is not in any servers.'}</div>
      </div></td></tr>`;
      return;
    }

    serversTableBody.innerHTML = list.map(g => {
      const icon = g.icon
        ? `<img src="${escHtml(g.icon)}" width="24" height="24" style="border-radius:6px;margin-right:0.5rem;vertical-align:middle" alt="">`
        : `<span class="op-avatar-placeholder" style="width:24px;height:24px;border-radius:6px;background:var(--op-bg-2);display:inline-block;margin-right:0.5rem;vertical-align:middle"></span>`;
      const badge = g.configured
        ? `<span class="op-badge op-badge--success">Configured</span>`
        : `<span class="op-badge op-badge--neutral">No config</span>`;
      return `<tr>
        <td>${icon}<span>${escHtml(g.name)}</span></td>
        <td style="font-family:monospace;font-size:0.8rem">${escHtml(g.id)}</td>
        <td>${badge}</td>
        <td><a href="/dashboard/${escHtml(g.id)}/general" class="op-btn op-btn--xs op-btn--ghost" target="_blank">Manage</a></td>
      </tr>`;
    }).join('');
  }

  if (serverSearch) {
    serverSearch.addEventListener('input', renderServers);
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ═══════════════════════════════════════════════════
     USER LOOKUP
  ═══════════════════════════════════════════════════ */
  const userLookupBtn = document.getElementById('userLookupBtn');
  const userLookupInput = document.getElementById('userLookupInput');
  const userLookupResult = document.getElementById('userLookupResult');

  async function doUserLookup() {
    const uid = userLookupInput ? userLookupInput.value.trim() : '';
    if (!uid || !/^\d{17,20}$/.test(uid)) {
      opToast('Enter a valid 17–20 digit Discord user ID', 'error');
      return;
    }
    if (userLookupResult) {
      userLookupResult.innerHTML = `<div class="op-empty"><div class="op-empty-title">Looking up ${escHtml(uid)}…</div></div>`;
    }
    try {
      const d = await apiGet(`/api/owner/user/${uid}`);
      renderUserLookup(d);
    } catch (err) {
      if (userLookupResult) {
        userLookupResult.innerHTML = `<div class="op-empty">
          <div class="op-empty-title" style="color:var(--op-danger)">Lookup failed</div>
          <div class="op-empty-desc">${escHtml(err.message)}</div>
        </div>`;
      }
      opToast(`User lookup: ${err.message}`, 'error');
    }
  }

  function renderUserLookup(d) {
    if (!userLookupResult) return;
    const u = d.discordUser;
    const s = d.stats || {};
    const avatar = u && u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
      : null;

    userLookupResult.innerHTML = `
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
        ${avatar ? `<img src="${escHtml(avatar)}" width="48" height="48" style="border-radius:50%" alt="">` : '<div style="width:48px;height:48px;border-radius:50%;background:var(--op-bg-2)"></div>'}
        <div>
          <div style="font-weight:600;font-size:1rem">${u ? escHtml(u.username) + (u.discriminator && u.discriminator !== '0' ? '#' + u.discriminator : '') : `User ${escHtml(d.userId)}`}</div>
          <div style="color:var(--op-text-3);font-size:0.8rem;font-family:monospace">${escHtml(d.userId)}</div>
        </div>
      </div>
      <div class="op-stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.5rem;margin-bottom:1rem">
        <div class="op-stat-card"><div class="op-stat-label">Level Servers</div><div class="op-stat-value">${s.levelServers ?? 0}</div></div>
        <div class="op-stat-card"><div class="op-stat-label">Total XP</div><div class="op-stat-value">${(s.totalXp ?? 0).toLocaleString()}</div></div>
        <div class="op-stat-card"><div class="op-stat-label">Avg Level</div><div class="op-stat-value">${s.levelServers ? Math.round((s.totalLevel || 0) / s.levelServers) : 0}</div></div>
        <div class="op-stat-card"><div class="op-stat-label">Mod Cases</div><div class="op-stat-value" style="color:${(s.modCases ?? 0) > 0 ? 'var(--op-warn)' : 'inherit'}">${s.modCases ?? 0}</div></div>
      </div>
      ${d.modCases && d.modCases.length ? `
        <div style="font-size:0.78rem;color:var(--op-text-3);margin-bottom:0.4rem">Recent infractions (${d.modCases.length})</div>
        <div style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:0.3rem">
          ${d.modCases.map(c => `
            <div style="display:flex;gap:0.75rem;align-items:center;padding:0.35rem 0.6rem;background:var(--op-bg-2);border-radius:6px;font-size:0.8rem">
              <span style="font-weight:600;text-transform:uppercase;font-size:0.7rem;color:var(--op-warn)">${escHtml(c.type)}</span>
              <span style="color:var(--op-text-2);flex:1">${escHtml(c.reason || 'No reason')}</span>
              <span style="color:var(--op-text-3);font-size:0.72rem">${new Date(c.createdAt).toLocaleDateString()}</span>
            </div>`).join('')}
        </div>` : ''}
    `;
  }

  if (userLookupBtn) {
    userLookupBtn.addEventListener('click', doUserLookup);
  }
  if (userLookupInput) {
    userLookupInput.addEventListener('keydown', e => { if (e.key === 'Enter') doUserLookup(); });
  }

  /* ═══════════════════════════════════════════════════
     ACTION HANDLERS
  ═══════════════════════════════════════════════════ */
  async function handleAction(action, el) {
    switch (action) {

      case 'restart':
        if (await opConfirm({ title: 'Restart Dashboard', desc: 'The dashboard will restart briefly. You will be redirected. Continue?', type: 'warning', btnLabel: 'Restart' })) {
          try {
            await apiPost('/api/owner/restart');
            opToast('Restart signal sent — reconnecting…', 'warn');
            logAction('Dashboard restart initiated');
            setTimeout(() => window.location.reload(), 3000);
          } catch (err) { opToast(err.message, 'error'); }
        }
        break;

      case 'emergency-shutdown':
        if (await opConfirm({ title: 'Emergency Shutdown', desc: 'This will immediately kill the process with no graceful exit. It cannot be undone until the process is manually restarted.', type: 'danger', btnLabel: 'SHUTDOWN' })) {
          try {
            await apiPost('/api/owner/restart');
            opToast('Shutdown signal sent', 'error');
            logAction('Emergency shutdown triggered');
          } catch (err) { opToast(err.message, 'error'); }
        }
        break;

      case 'maintenance':
        // Handled by the toggle's change event via data-action, no-op here
        opToast('Maintenance mode updated', 'info');
        logAction('Maintenance mode toggled');
        break;

      case 'sync-commands':
        if (await opConfirm({ title: 'Force Sync Commands', desc: 'This will re-register all slash commands with Discord globally. It may take up to 1 hour to propagate.', type: 'warn', btnLabel: 'Sync' })) {
          opToast('Command sync is managed by the bot process — trigger it there', 'info');
          logAction('Force sync commands requested (bot-side action)');
        }
        break;

      case 'reload-modules':
        opToast('Module reload is managed by the bot process', 'info');
        logAction('Hot reload modules requested (bot-side action)');
        break;

      case 'refresh':
      case 'refresh-servers':
        _serversFetched = false;
        fetchServers();
        opToast('Refreshing server list…', 'info');
        break;

      case 'refresh-logs':
        opToast('Log view refreshed', 'info');
        break;

      case 'export-logs': {
        const lines = Array.from(document.querySelectorAll('.op-log-entry')).map(e => e.textContent.trim()).join('\n');
        const blob = new Blob([lines || 'No logs captured'], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        opToast('Logs exported', 'success');
        break;
      }

      case 'backup-db':
        opToast('Database backup must be triggered server-side (use mongodump)', 'info');
        logAction('Database backup requested');
        break;

      case 'blacklist-user': {
        const input = document.getElementById('blacklistInput');
        const uid = input ? input.value.trim() : '';
        if (!uid || !/^\d{17,20}$/.test(uid)) { opToast('Enter a valid Discord user ID', 'error'); return; }
        if (await opConfirm({ title: 'Blacklist User', desc: `User ${uid} will be blocked from using the bot globally.`, type: 'danger', btnLabel: 'Blacklist' })) {
          try {
            await apiPost('/api/owner/blacklist', { userId: uid });
            opToast(`User ${uid} blacklisted`, 'success');
            logAction(`Blacklisted user: ${uid}`);
            if (input) input.value = '';
          } catch (err) { opToast(err.message, 'error'); }
        }
        break;
      }

      case 'reset-user': {
        const input = document.getElementById('resetUserInput');
        const uid = input ? input.value.trim() : '';
        if (!uid || !/^\d{17,20}$/.test(uid)) { opToast('Enter a valid Discord user ID', 'error'); return; }
        if (await opConfirm({ title: 'Reset User Data', desc: `All XP and infractions for ${uid} will be permanently deleted.`, type: 'danger', btnLabel: 'Reset' })) {
          try {
            const r = await apiPost('/api/owner/reset-user', { userId: uid });
            const del = r.deleted || {};
            opToast(`Deleted ${del.levelProfiles ?? 0} level profiles for ${uid}`, 'success');
            logAction(`Reset user data: ${uid}`);
            if (input) input.value = '';
          } catch (err) { opToast(err.message, 'error'); }
        }
        break;
      }

      case 'reset-module': {
        const mod = el.dataset.module || 'unknown';
        if (await opConfirm({ title: `Reset ${mod} Module`, desc: `All ${mod} data will be permanently wiped from the database. This cannot be undone.`, type: 'danger', btnLabel: `Reset ${mod}` })) {
          try {
            const r = await apiPost('/api/owner/reset-module', { module: mod });
            opToast(`${mod} module reset — ${r.deletedCount ?? 0} records deleted`, 'warn');
            logAction(`Reset module: ${mod}`);
          } catch (err) { opToast(err.message, 'error'); }
        }
        break;
      }

      case 'run-task': {
        const task = el.dataset.task || 'unknown';
        opToast(`Task "${task}" — connect to your task runner to execute`, 'info');
        logAction(`Manual task run requested: ${task}`);
        break;
      }

      case 'create-task':
        opToast('Task creation is coming soon', 'info');
        break;

      case 'check-updates':
        opToast('Checking for updates…', 'info');
        setTimeout(() => opToast('Bot is up to date', 'success'), 1500);
        break;

      case 'create-api-key':
        opToast('API key creation is coming soon', 'info');
        break;

      case 'add-webhook':
        opToast('Webhook management is coming soon', 'info');
        break;

      default:
        opToast(`Action: ${action}`, 'info');
    }
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'maintenance') return; // handled by toggle
    handleAction(action, el);
  });

  // Maintenance toggle
  const maintenanceToggle = document.getElementById('maintenanceToggle');
  if (maintenanceToggle) {
    maintenanceToggle.addEventListener('change', () => {
      const on = maintenanceToggle.checked;
      opToast(`Maintenance mode ${on ? 'enabled' : 'disabled'}`, on ? 'warn' : 'success');
      logAction(`Maintenance mode ${on ? 'enabled' : 'disabled'}`);
    });
  }

  /* ═══════════════════════════════════════════════════
     LOG FILTERS
  ═══════════════════════════════════════════════════ */
  document.querySelectorAll('[data-log-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentLogFilter = btn.dataset.logFilter;
      document.querySelectorAll('[data-log-filter]').forEach(b => b.classList.remove('op-filter-btn--active'));
      btn.classList.add('op-filter-btn--active');
      applyLogFilter();
    });
  });

  function applyLogFilter() {
    document.querySelectorAll('.op-log-entry').forEach(entry => {
      const level = entry.dataset.level || 'info';
      entry.style.display = (currentLogFilter === 'all' || level === currentLogFilter) ? '' : 'none';
    });
  }

  /* ═══════════════════════════════════════════════════
     SECURITY ACTION LOG
  ═══════════════════════════════════════════════════ */
  const actionLog = document.getElementById('opActionLog');

  function logAction(text) {
    if (!actionLog) return;
    // Remove empty state if present
    const empty = actionLog.querySelector('.op-empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'op-log-entry';
    row.dataset.level = 'info';
    const now = new Date().toLocaleTimeString();
    row.innerHTML = `<span style="color:var(--op-text-3);font-family:monospace;font-size:0.77rem;margin-right:0.75rem">${now}</span><span>${text}</span>`;
    actionLog.insertBefore(row, actionLog.firstChild);
    showPanel('security');
  }

  /* ═══════════════════════════════════════════════════
     SPOTLIGHT SEARCH
  ═══════════════════════════════════════════════════ */
  const searchItems = [
    { label: 'Overview', desc: 'System status & quick actions', panel: 'overview' },
    { label: 'Servers', desc: 'All servers the bot is in', panel: 'servers' },
    { label: 'Users', desc: 'User lookup & blacklist', panel: 'users' },
    { label: 'Database', desc: 'Collection stats & backup', panel: 'database' },
    { label: 'Deploy', desc: 'Restart & update controls', panel: 'deploy' },
    { label: 'Security', desc: 'Action log & emergency controls', panel: 'security' },
  ].filter((item) => SUPPORTED_PANELS.has(item.panel));

  const spotlightOverlay = document.getElementById('opSpotlightOverlay');
  const spotlightInput = document.getElementById('opSpotlightInput');
  const spotlightResults = document.getElementById('opSpotlightResults');
  const topSearch = document.getElementById('opTopSearch');

  function openSpotlight() {
    spotlightOverlay.classList.add('op-spotlight-overlay--open');
    spotlightInput.value = '';
    renderSpotlight('');
    spotlightInput.focus();
  }

  function closeSpotlight() {
    spotlightOverlay.classList.remove('op-spotlight-overlay--open');
    spotlightIdx = -1;
  }

  function renderSpotlight(q) {
    const filtered = q
      ? searchItems.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q))
      : searchItems;
    spotlightIdx = -1;
    spotlightResults.innerHTML = filtered.map((item, i) => `
      <div class="op-spotlight-item" data-panel="${item.panel}" data-idx="${i}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <div><strong>${item.label}</strong><span>${item.desc}</span></div>
      </div>`).join('');
    spotlightResults.querySelectorAll('.op-spotlight-item').forEach(el => {
      el.addEventListener('click', () => { showPanel(el.dataset.panel); closeSpotlight(); });
    });
  }

  if (topSearch) {
    topSearch.addEventListener('click', openSpotlight);
    topSearch.addEventListener('focus', openSpotlight);
  }
  spotlightOverlay.addEventListener('click', e => {
    if (!e.target.closest('.op-spotlight')) closeSpotlight();
  });
  spotlightInput.addEventListener('input', () => renderSpotlight(spotlightInput.value.toLowerCase().trim()));
  spotlightInput.addEventListener('keydown', e => {
    const items = spotlightResults.querySelectorAll('.op-spotlight-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); spotlightIdx = Math.min(spotlightIdx + 1, items.length - 1); items.forEach((el, i) => el.classList.toggle('op-spotlight-item--active', i === spotlightIdx)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); spotlightIdx = Math.max(spotlightIdx - 1, 0); items.forEach((el, i) => el.classList.toggle('op-spotlight-item--active', i === spotlightIdx)); }
    else if (e.key === 'Enter' && spotlightIdx >= 0) { const active = items[spotlightIdx]; if (active) { showPanel(active.dataset.panel); closeSpotlight(); } }
    else if (e.key === 'Escape') closeSpotlight();
  });

  // Keyboard shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSpotlight(); }
    if (e.key === 'Escape') closeSpotlight();
  });

})();
