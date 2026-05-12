/**
 * Invite Tracker dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _data = { invites: [], joins: [] };
  let _loaded = false;

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'invites') {
        if (!_loaded) load();
      }
    });
    const sec = document.getElementById('section-invites');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const res = await fetch(`/api/guild/${_guildId}/invites`);
      _data = await res.json();
      render();
    } catch (err) {
      console.error('[Invites] load error', err);
      const el = document.getElementById('invites-loading');
      if (el) el.textContent = 'Failed to load invite data.';
    }
  }

  function fmt(d) { return d ? new Date(d).toLocaleDateString() : '—'; }

  function render() {
    const root = document.getElementById('invites-root');
    if (!root) return;

    const inviteRows = (_data.invites || []).map((inv) => `
      <tr>
        <td><code>${escHtml(inv.inviteCode)}</code></td>
        <td><@${inv.inviterId || '?'}></td>
        <td>${inv.uses}</td>
        <td>${fmt(inv.lastUsedAt)}</td>
      </tr>
    `).join('');

    const joinRows = (_data.joins || []).map((j) => `
      <tr>
        <td>${escHtml(j.userId)}</td>
        <td>${j.inviteCode ? `<code>${escHtml(j.inviteCode)}</code>` : '—'}</td>
        <td>${j.inviterId ? escHtml(j.inviterId) : '—'}</td>
        <td>${fmt(j.joinedAt)}</td>
      </tr>
    `).join('');

    root.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
        <button class="btn btn-sm btn-ghost" id="invites-refresh">↻ Refresh</button>
      </div>
      <div class="invites-grid">
        <div class="invites-card">
          <div class="invites-card-title">Active Invites</div>
          ${_data.invites.length === 0
            ? '<div class="invites-empty">No invite data yet.</div>'
            : `<table class="invites-table">
                <thead><tr><th>Code</th><th>Inviter</th><th>Uses</th><th>Last Used</th></tr></thead>
                <tbody>${inviteRows}</tbody>
              </table>`}
        </div>
        <div class="invites-card">
          <div class="invites-card-title">Recent Joins</div>
          ${_data.joins.length === 0
            ? '<div class="invites-empty">No join data yet.</div>'
            : `<table class="invites-table">
                <thead><tr><th>User ID</th><th>Invite Code</th><th>Invited By</th><th>Joined</th></tr></thead>
                <tbody>${joinRows}</tbody>
              </table>`}
        </div>
      </div>
    `;
    root.style.display = '';
    document.getElementById('invites-loading').style.display = 'none';
    document.getElementById('invites-refresh')?.addEventListener('click', () => {
      _loaded = false;
      load();
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.InvitesModule = { init, load };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();
