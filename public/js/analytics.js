/**
 * Analytics dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _data = null;
  let _range = 7;
  let _loaded = false;

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'analytics') {
        if (!_loaded) load();
      }
    });
    const sec = document.getElementById('section-analytics');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const res = await fetch(`/api/guild/${_guildId}/analytics?days=${_range}`);
      _data = await res.json();
      render();
    } catch (err) {
      console.error('[Analytics] load error', err);
      const el = document.getElementById('analytics-loading');
      if (el) el.textContent = 'Failed to load analytics.';
    }
  }

  function groupByType(events) {
    const map = {};
    for (const e of events || []) {
      map[e._id.type] = (map[e._id.type] || 0) + e.count;
    }
    return map;
  }

  function render() {
    const root = document.getElementById('analytics-root');
    if (!root) return;
    const totals = groupByType(_data.events);
    const totalAll = Object.values(totals).reduce((a, b) => a + b, 0);

    const summaryTypes = ['join', 'leave', 'message', 'command', 'ban', 'kick', 'warn', 'mute'];
    const summaryCards = summaryTypes.map((t) => `
      <div class="analytics-summary-card">
        <div class="analytics-summary-num">${totals[t] || 0}</div>
        <div class="analytics-summary-label">${t.charAt(0).toUpperCase() + t.slice(1)}s</div>
      </div>
    `).join('');

    const cmdRows = (_data.commands || []).map((c) => `
      <div class="analytics-stat-row">
        <span class="analytics-stat-label">/${c._id}</span>
        <span class="analytics-stat-value">${c.count}</span>
      </div>
    `).join('');

    root.innerHTML = `
      <div class="analytics-range-bar">
        ${[7, 14, 30, 90].map((d) => `
          <button class="analytics-range-btn ${_range === d ? 'active' : ''}" data-range="${d}">Last ${d}d</button>
        `).join('')}
        <button class="btn btn-sm btn-ghost" id="analytics-refresh" style="margin-left:auto">↻ Refresh</button>
      </div>
      <div class="analytics-summary-grid">
        ${summaryCards}
        <div class="analytics-summary-card">
          <div class="analytics-summary-num">${totalAll}</div>
          <div class="analytics-summary-label">Total Events</div>
        </div>
      </div>
      <div class="analytics-grid">
        <div class="analytics-card">
          <div class="analytics-card-title">Top Commands (last ${_range}d)</div>
          ${cmdRows || '<div class="analytics-empty">No command data yet.</div>'}
        </div>
        <div class="analytics-card">
          <div class="analytics-card-title">Event Breakdown</div>
          ${Object.keys(totals).length
            ? Object.entries(totals).map(([k, v]) => `
              <div class="analytics-stat-row">
                <span class="analytics-stat-label">${k}</span>
                <span class="analytics-stat-value">${v}</span>
              </div>
            `).join('')
            : '<div class="analytics-empty">No events recorded yet.</div>'}
        </div>
      </div>
    `;
    root.style.display = '';
    document.getElementById('analytics-loading').style.display = 'none';

    root.querySelectorAll('[data-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _range = parseInt(btn.dataset.range);
        _loaded = false;
        load();
      });
    });
    document.getElementById('analytics-refresh')?.addEventListener('click', () => {
      _loaded = false;
      load();
    });
  }

  window.AnalyticsModule = { init, load };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();
