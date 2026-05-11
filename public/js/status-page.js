/* ============================================================
   STATUS-PAGE.JS — Live polling & timeline for FlynnBot status
   Data is read from data-* attributes on #status-page element.
   ============================================================ */
(function () {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────
  function formatUptime(sec) {
    if (sec === null || sec === undefined) return '—';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  const CSS_MAP   = { online: 'operational', degraded: 'degraded', offline: 'outage' };
  const LABEL_MAP = { online: 'All Systems Operational', degraded: 'Degraded Performance', offline: 'Service Disruption' };
  const SEG_MAP   = { online: 'seg-ok', degraded: 'seg-warn', offline: 'seg-bad', maintenance: 'seg-maintenance' };
  const SEG_LABEL = { online: 'Operational', degraded: 'Degraded Performance', offline: 'Outage', maintenance: 'Maintenance' };

  // ── Read initial server-side data from data attributes ──────
  const pageEl = document.getElementById('status-page');
  function attr(name, fallback) {
    var v = pageEl ? pageEl.dataset[name] : null;
    if (v === null || v === undefined || v === 'null' || v === '') return fallback !== undefined ? fallback : '';
    return v;
  }

  let lastSuccessfulPollAt = Date.now();
  let staleApplied = false;
  function numAttr(name) {
    var v = pageEl ? pageEl.dataset[name] : '';
    return (v && v !== '') ? Number(v) : null;
  }
  function strAttr(name, fallback) {
    var v = pageEl ? pageEl.dataset[name] : null;
    if (v === null || v === undefined || v === '') return fallback;
    try { return decodeURIComponent(v); } catch (e) { return v; }
  }

  let latestStatus = {
    status:        attr('status', 'offline'),
    statusMessage: strAttr('statusMessage', ''),
    latencyMs:     numAttr('latencyMs'),
    uptimeSeconds: numAttr('uptimeSeconds'),
    guildCount:    numAttr('guildCount'),
    memoryMB:      numAttr('memoryMb'),
    highLatency:   attr('highLatency') === 'true',
    updatedAt:     attr('updatedAt', null),
    lastHeartbeat: attr('lastHeartbeat', null),
  };

  // ── Daily history ─────────────────────────────────────────────
  const HISTORY_SIZE = 30;
  let dailyHistory  = []; // 30-slot array: { date, status, note, manual }
  let todayLiveStatus = latestStatus.status; // updated each poll

  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  // Build a blank 30-slot skeleton (today = slot 29)
  function buildBlankSlots() {
    const slots = [];
    const now = new Date();
    for (let i = HISTORY_SIZE - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      slots.push({ date: d.toISOString().split('T')[0], status: 'none', note: '', manual: false });
    }
    return slots;
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/status/history');
      if (!res.ok) return;
      const data = await res.json();
      dailyHistory = data.history || buildBlankSlots();
    } catch (_) {
      dailyHistory = buildBlankSlots();
    }
    renderHistory();
  }

  function renderHistory() {
    const bar = document.getElementById('status-history');
    if (!bar) return;
    bar.innerHTML = '';

    const today  = todayStr();
    const slots  = dailyHistory.length === HISTORY_SIZE ? dailyHistory : buildBlankSlots();

    // If loaded data doesn't cover all 30 slots, merge
    if (dailyHistory.length > 0 && dailyHistory.length < HISTORY_SIZE) {
      const map = {};
      dailyHistory.forEach(function (s) { map[s.date] = s; });
      slots.forEach(function (s, i) { if (map[s.date]) slots[i] = map[s.date]; });
    }

    slots.forEach(function (slot, idx) {
      const isToday  = slot.date === today;
      // Today: use live poll status unless an incident was manually set for today
      const status   = (isToday && !slot.manual) ? todayLiveStatus : (slot.status || 'none');
      const cssClass = SEG_MAP[status] || 'seg-empty';
      const label    = SEG_LABEL[status] || 'No data';

      const dateLabel = isToday
        ? 'Today'
        : new Date(slot.date + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      const seg = document.createElement('div');
      seg.className = 'uptime-seg ' + cssClass;
      seg.style.animationDelay = (idx * 8) + 'ms';

      const tip = document.createElement('div');
      tip.className = 'uptime-tooltip';
      tip.innerHTML = '<div class="tt-status">' + label + '</div>'
        + '<div class="tt-time">' + dateLabel + '</div>'
        + (slot.note ? '<div class="tt-time" style="margin-top:2px;font-style:italic">' + slot.note + '</div>' : '');
      seg.appendChild(tip);
      bar.appendChild(seg);
    });
  }

  // ── DOM update ───────────────────────────────────────────────
  function applyStatus(data) {
    const st     = data.status || 'offline';
    const cssCls = CSS_MAP[st]   || 'outage';
    const label  = LABEL_MAP[st] || 'Unknown';
    latestStatus = Object.assign({}, latestStatus, data, { status: st, statusMessage: data.statusMessage || '' });

    const badgeEl = document.getElementById('status-badge');
    if (badgeEl) badgeEl.className = 'overall-status-badge ' + cssCls;
    const labelEl = document.getElementById('status-label');
    if (labelEl) labelEl.textContent = label;

    const msgEl = document.getElementById('status-message');
    if (msgEl) msgEl.textContent = data.statusMessage || '';

    const isHigh = !!data.highLatency || (typeof data.latencyMs === 'number' && data.latencyMs >= 300);
    const latEl = document.getElementById('metric-latency');
    if (latEl) {
      latEl.innerHTML = data.latencyMs !== null
        ? data.latencyMs + '<span style="font-size:1rem;font-weight:600;color:var(--text-3)"> ms</span>'
        : '—';
      latEl.className = 'metric-value' + (isHigh ? ' warn' : '');
    }
    const uptEl = document.getElementById('metric-uptime');
    if (uptEl) uptEl.textContent = data.uptimeSeconds !== null ? formatUptime(data.uptimeSeconds) : '—';
    const gldEl = document.getElementById('metric-guilds');
    if (gldEl) gldEl.textContent = data.guildCount !== null ? Number(data.guildCount).toLocaleString() : '—';
    const memEl = document.getElementById('metric-memory');
    if (memEl) {
      memEl.innerHTML = data.memoryMB !== null
        ? data.memoryMB + '<span style="font-size:1rem;font-weight:600;color:var(--text-3)"> MB</span>'
        : '—';
    }

    const botDot = document.getElementById('comp-bot-dot');
    if (botDot) botDot.className = 'component-indicator ci-' + cssCls;
    const botComp = document.getElementById('comp-bot');
    if (botComp) { botComp.textContent = label; botComp.className = 'component-status cs-' + cssCls; }
    const botLat = document.getElementById('comp-bot-latency');
    if (botLat) botLat.textContent = data.latencyMs !== null ? data.latencyMs + ' ms' : '—';

    const updEl = document.getElementById('status-last-updated-time');
    if (updEl && data.updatedAt) updEl.textContent = new Date(data.updatedAt).toUTCString();
    const hbEl = document.getElementById('status-heartbeat');
    if (hbEl) hbEl.textContent = data.lastHeartbeat ? new Date(data.lastHeartbeat).toUTCString() : 'No heartbeat yet';

    if (pageEl) pageEl.dataset.status = st;

    todayLiveStatus = st;
    renderHistory();
  }

  // ── Init ────────────────────────────────────────────────────
  loadHistory();

  // ── Polling ──────────────────────────────────────────────────
  function poll() {
    fetch('/status/api')
      .then(function (res) { if (!res.ok) return; return res.json(); })
      .then(function (data) {
        if (!data) return;
        lastSuccessfulPollAt = Date.now();
        staleApplied = false;
        applyStatus(data);
      })
      .catch(function () {});
  }

  setInterval(poll, 15000);
  setInterval(function () {
    if (Date.now() - lastSuccessfulPollAt <= 90000 || staleApplied) return;
    staleApplied = true;
    applyStatus(Object.assign({}, latestStatus, {
      status: 'offline',
      statusMessage: 'Live telemetry is stale. Waiting for the next heartbeat.',
    }));
  }, 5000);

  // ── Nav scroll effect ────────────────────────────────────────
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

})();
