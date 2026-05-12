/**
 * AFK Manager dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _afkList = [];
  let _loaded = false;

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'afk') {
        if (!_loaded) load();
      }
    });
    const sec = document.getElementById('section-afk');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const res = await fetch(`/api/guild/${_guildId}/afk`);
      const data = await res.json();
      _afkList = data.afkList || [];
      render();
    } catch (err) {
      console.error('[AFK] load error', err);
      const el = document.getElementById('afk-loading');
      if (el) el.textContent = 'Failed to load AFK list.';
    }
  }

  function fmt(d) { return d ? new Date(d).toLocaleString() : '—'; }

  function render() {
    const root = document.getElementById('afk-root');
    if (!root) return;

    root.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
        <button class="btn btn-sm btn-ghost" id="afk-refresh">↻ Refresh</button>
      </div>
      <div class="afk-table-wrap">
        ${_afkList.length === 0
          ? '<div class="afk-empty">No members are currently AFK.</div>'
          : `<table class="afk-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Reason</th>
                  <th>Set At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${_afkList.map((entry) => `
                  <tr>
                    <td><span class="afk-user-tag">${escHtml(entry.userId)}</span></td>
                    <td>${escHtml(entry.reason)}</td>
                    <td>${fmt(entry.setAt)}</td>
                    <td>
                      <button class="afk-clear-btn" data-user="${escHtml(entry.userId)}">Clear AFK</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`}
      </div>
    `;
    root.style.display = '';
    document.getElementById('afk-loading').style.display = 'none';
    attachEvents(root);
  }

  function attachEvents(root) {
    document.getElementById('afk-refresh')?.addEventListener('click', () => {
      _loaded = false;
      load();
    });
    root.querySelectorAll('.afk-clear-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.user;
        if (!confirm(`Clear AFK for user ${userId}?`)) return;
        try {
          const res = await fetch(`/api/guild/${_guildId}/afk/${userId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Request failed');
          _loaded = false;
          load();
        } catch {
          alert('Failed to clear AFK status.');
        }
      });
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.AFKModule = { init, load };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();
