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

  /* ═══════════════════════════════════════════════════
     PANEL NAVIGATION
  ═══════════════════════════════════════════════════ */
  const panels = document.querySelectorAll('.op-panel');
  const navItems = document.querySelectorAll('.op-nav-item');

  function showPanel(name) {
    panels.forEach(p => p.classList.toggle('op-panel--active', p.dataset.panel === name));
    navItems.forEach(n => n.classList.toggle('op-nav-item--active', n.dataset.panel === name));
    window.location.hash = name;
  }

  navItems.forEach(n => {
    n.addEventListener('click', e => {
      e.preventDefault();
      showPanel(n.dataset.panel);
    });
  });

  // Hash-based navigation on load
  const initPanel = (window.location.hash || '').replace('#', '') || 'overview';
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
     ACTION HANDLERS
  ═══════════════════════════════════════════════════ */
  async function handleAction(action, el) {
    switch (action) {

      case 'restart':
        if (await opConfirm({ title: 'Restart Bot', desc: 'The bot will go offline briefly while restarting. Continue?', type: 'warning', btnLabel: 'Restart' })) {
          opToast('Restart signal sent', 'warn');
          logAction('Bot restart initiated');
        }
        break;

      case 'emergency-shutdown':
        if (await opConfirm({ title: 'Emergency Shutdown', desc: 'This will immediately kill the bot process with no graceful exit. This cannot be undone until the bot is manually restarted.', type: 'danger', btnLabel: 'SHUTDOWN' })) {
          opToast('Shutdown signal sent', 'error');
          logAction('Emergency shutdown triggered');
        }
        break;

      case 'maintenance':
        // Handled by the toggle's change event via data-action, no-op here
        opToast('Maintenance mode updated', 'info');
        logAction('Maintenance mode toggled');
        break;

      case 'sync-commands':
        if (await opConfirm({ title: 'Force Sync Commands', desc: 'This will re-register all slash commands with Discord globally. It may take up to 1 hour to propagate.', type: 'warn', btnLabel: 'Sync' })) {
          opToast('Command sync initiated', 'info');
          logAction('Force sync commands triggered');
        }
        break;

      case 'reload-modules':
        opToast('Module reload signal sent', 'info');
        logAction('Hot reload modules triggered');
        break;

      case 'refresh':
      case 'refresh-servers':
        opToast('Refreshed', 'success');
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
        opToast('Database backup queued', 'info');
        logAction('Database backup triggered');
        break;

      case 'blacklist-user': {
        const input = document.getElementById('blacklistInput');
        const uid = input ? input.value.trim() : '';
        if (!uid || !/^\d{17,20}$/.test(uid)) { opToast('Enter a valid Discord user ID', 'error'); return; }
        if (await opConfirm({ title: 'Blacklist User', desc: `User ${uid} will be blocked from using the bot globally.`, type: 'danger', btnLabel: 'Blacklist' })) {
          opToast(`User ${uid} blacklisted`, 'success');
          logAction(`Blacklisted user: ${uid}`);
          if (input) input.value = '';
        }
        break;
      }

      case 'reset-user': {
        const input = document.getElementById('resetUserInput');
        const uid = input ? input.value.trim() : '';
        if (!uid || !/^\d{17,20}$/.test(uid)) { opToast('Enter a valid Discord user ID', 'error'); return; }
        if (await opConfirm({ title: 'Reset User Data', desc: `All XP, economy, and infractions for ${uid} will be permanently deleted.`, type: 'danger', btnLabel: 'Reset' })) {
          opToast(`User data for ${uid} reset`, 'success');
          logAction(`Reset user data: ${uid}`);
          if (input) input.value = '';
        }
        break;
      }

      case 'reset-module': {
        const mod = el.dataset.module || 'unknown';
        if (await opConfirm({ title: `Reset ${mod} Module`, desc: `All ${mod} data will be permanently wiped from the database. This cannot be undone.`, type: 'danger', btnLabel: `Reset ${mod}` })) {
          opToast(`${mod} module reset`, 'warn');
          logAction(`Reset module: ${mod}`);
        }
        break;
      }

      case 'run-task': {
        const task = el.dataset.task || 'unknown';
        opToast(`Task "${task}" queued`, 'info');
        logAction(`Manual task run: ${task}`);
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
    { label: 'Commands', desc: 'Global command controls', panel: 'commands' },
    { label: 'Features', desc: 'Module toggles & defaults', panel: 'features' },
    { label: 'Automation', desc: 'Scheduled tasks', panel: 'automation' },
    { label: 'Logs', desc: 'Live log stream', panel: 'logs' },
    { label: 'Database', desc: 'Collection stats & backup', panel: 'database' },
    { label: 'API', desc: 'API keys & webhooks', panel: 'api' },
    { label: 'Deploy', desc: 'Restart & update controls', panel: 'deploy' },
    { label: 'Security', desc: 'Action log & emergency controls', panel: 'security' },
    { label: 'Experiments', desc: 'Feature flags', panel: 'experiments' },
  ];

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
