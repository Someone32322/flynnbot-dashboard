'use strict';
/* ── audit.js — Audit Log Viewer ──────────────────────────── */

window.AuditModule = (() => {
  let guildId = null;
  let lastId = null;
  let isLoading = false;

  // Discord action type → human label + badge class
  const ACTION_TYPES = {
    1:  ['Guild update', 'update'],
    10: ['Channel create', 'create'],
    11: ['Channel update', 'update'],
    12: ['Channel delete', 'delete'],
    13: ['Channel overwrite create', 'create'],
    14: ['Channel overwrite update', 'update'],
    15: ['Channel overwrite delete', 'delete'],
    20: ['Member kick', 'kick'],
    21: ['Member prune', 'kick'],
    22: ['Member ban', 'ban'],
    23: ['Member unban', 'other'],
    24: ['Member update', 'update'],
    25: ['Member roles update', 'update'],
    26: ['Member move', 'other'],
    27: ['Member disconnect', 'other'],
    28: ['Bot add', 'create'],
    30: ['Role create', 'create'],
    31: ['Role update', 'update'],
    32: ['Role delete', 'delete'],
    40: ['Invite create', 'create'],
    41: ['Invite update', 'update'],
    42: ['Invite delete', 'delete'],
    50: ['Webhook create', 'create'],
    51: ['Webhook update', 'update'],
    52: ['Webhook delete', 'delete'],
    60: ['Emoji create', 'create'],
    61: ['Emoji update', 'update'],
    62: ['Emoji delete', 'delete'],
    72: ['Message delete', 'delete'],
    73: ['Message bulk delete', 'delete'],
    74: ['Message pin', 'update'],
    75: ['Message unpin', 'update'],
    80: ['Integration create', 'create'],
    81: ['Integration update', 'update'],
    82: ['Integration delete', 'delete'],
    83: ['Stage instance create', 'create'],
    84: ['Stage instance update', 'update'],
    85: ['Stage instance delete', 'delete'],
    90: ['Sticker create', 'create'],
    91: ['Sticker update', 'update'],
    92: ['Sticker delete', 'delete'],
    100: ['Thread create', 'create'],
    101: ['Thread update', 'update'],
    102: ['Thread delete', 'delete'],
    110: ['Application command permission update', 'update'],
  };

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(snowflake) {
    if (!snowflake) return '—';
    try {
      const ts = Number(BigInt(snowflake) >> 22n) + 1420070400000;
      return new Date(ts).toLocaleString();
    } catch { return '—'; }
  }

  function renderEntry(entry, users) {
    const user = users.find(u => u.id === entry.user_id);
    const [label, badgeClass] = ACTION_TYPES[entry.action_type] || [`Action ${entry.action_type}`, 'other'];
    const avatarUrl = user?.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;
    const username = user ? escHtml(user.username || user.global_name || user.id) : escHtml(entry.user_id || '—');
    const target = entry.target_id ? `<code class="audit-timestamp">${entry.target_id}</code>` : '—';
    const reason = entry.reason ? `<br><small style="color:var(--text-3)">${escHtml(entry.reason)}</small>` : '';

    return `
      <tr>
        <td class="audit-user-cell">
          <img class="audit-avatar" src="${avatarUrl}" alt="" loading="lazy">
          <span>${username}</span>
        </td>
        <td><span class="audit-action-badge audit-action-badge--${badgeClass}">${label}</span>${reason}</td>
        <td>${target}</td>
        <td class="audit-timestamp">${fmtDate(entry.id)}</td>
      </tr>`;
  }

  async function load(reset = true) {
    if (isLoading) return;
    isLoading = true;
    const tbody = document.getElementById('auditTableBody');
    const emptyEl = document.getElementById('auditEmpty');
    const loadMoreBtn = document.getElementById('auditLoadMore');

    if (reset) {
      lastId = null;
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-3)">Loading…</td></tr>';
    }

    const userId = document.getElementById('auditUserFilter')?.value?.trim() || '';
    const actionType = document.getElementById('auditActionFilter')?.value || '';

    const params = new URLSearchParams({ limit: 50 });
    if (lastId) params.set('before', lastId);
    if (userId && /^\d+$/.test(userId)) params.set('user_id', userId);
    if (actionType) params.set('action_type', actionType);

    try {
      const res = await fetch(`/api/guild/${guildId}/audit-log?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load audit log');

      const entries = data.audit_log?.audit_log_entries || [];
      const users   = data.audit_log?.users || [];

      if (reset && tbody) tbody.innerHTML = '';
      if (emptyEl) emptyEl.style.display = entries.length === 0 ? 'block' : 'none';
      if (tbody) {
        entries.forEach(entry => { tbody.insertAdjacentHTML('beforeend', renderEntry(entry, users)); });
      }
      lastId = entries.length > 0 ? entries[entries.length - 1].id : null;
      if (loadMoreBtn) loadMoreBtn.style.display = entries.length < 50 ? 'none' : '';
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="audit-empty" style="color:#ed4245">Error: ${escHtml(err.message)}</td></tr>`;
    } finally {
      isLoading = false;
    }
  }

  function loadMore() {
    load(false);
  }

  function init(id) {
    guildId = id;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'audit-log') load(true);
    });

    const filterBtn = document.getElementById('auditFilterBtn');
    if (filterBtn) filterBtn.addEventListener('click', () => load(true));

    const loadMoreBtn = document.getElementById('auditLoadMore');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMore);
  }

  return { init, load };
})();

document.addEventListener('DOMContentLoaded', () => {
  const pd = document.getElementById('pageData');
  if (pd?.dataset?.guildId) AuditModule.init(pd.dataset.guildId);
});
