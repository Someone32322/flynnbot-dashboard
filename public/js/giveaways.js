/**
 * Giveaways dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _data = { active: [], ended: [] };
  let _tab = 'active';
  let _loaded = false;

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'giveaways') {
        if (!_loaded) load();
      }
    });
    const sec = document.getElementById('section-giveaways');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const res = await fetch(`/api/guild/${_guildId}/giveaways`);
      _data = await res.json();
      render();
    } catch (err) {
      console.error('[Giveaways] load error', err);
      const el = document.getElementById('giveaways-loading');
      if (el) el.textContent = 'Failed to load giveaways.';
    }
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString();
  }

  function relTime(d) {
    if (!d) return '';
    const diff = new Date(d).getTime() - Date.now();
    if (diff < 0) return 'ended';
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `ends in ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `ends in ${h}h`;
    return `ends in ${Math.floor(h / 24)}d`;
  }

  function render() {
    const root = document.getElementById('giveaways-root');
    if (!root) return;
    const list = _tab === 'active' ? _data.active : _data.ended;

    root.innerHTML = `
      <div class="giveaways-tabs">
        <button class="giveaways-tab ${_tab === 'active' ? 'active' : ''}" data-tab="active">Active (${_data.active.length})</button>
        <button class="giveaways-tab ${_tab === 'ended' ? 'active' : ''}" data-tab="ended">Ended (${_data.ended.length})</button>
        <button class="btn btn-sm btn-ghost" id="gaw-refresh" style="margin-left:auto">↻ Refresh</button>
      </div>
      <div class="giveaways-list">
        ${list.length === 0
          ? `<div class="giveaway-empty">No ${_tab} giveaways. Use <code>/giveaway start</code> in Discord to create one.</div>`
          : list.map((g) => `
            <div class="giveaway-card">
              <div class="giveaway-card-icon">🎉</div>
              <div class="giveaway-card-body">
                <div class="giveaway-card-title">${escHtml(g.prize)}</div>
                <div class="giveaway-card-meta">
                  <span>${g.winnerCount} winner(s)</span>
                  <span>
                    <span class="giveaway-badge giveaway-badge--${g.status}">${g.status}</span>
                  </span>
                  <span>${_tab === 'active' ? relTime(g.endsAt) : `Ended ${formatDate(g.endedAt)}`}</span>
                  ${g.winners?.length ? `<span>Winners: ${g.winners.map((w) => `<@${w}>`).join(', ')}</span>` : ''}
                </div>
              </div>
              <button class="btn btn-sm btn-danger gaw-delete" data-id="${g._id}" title="Delete giveaway">🗑</button>
            </div>
          `).join('')}
      </div>
    `;
    root.style.display = '';
    document.getElementById('giveaways-loading').style.display = 'none';
    attachEvents(root);
  }

  function attachEvents(root) {
    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _tab = btn.dataset.tab;
        render();
      });
    });
    document.getElementById('gaw-refresh')?.addEventListener('click', () => {
      _loaded = false;
      load();
    });
    root.querySelectorAll('.gaw-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this giveaway?')) return;
        try {
          await fetch(`/api/guild/${_guildId}/giveaways/${btn.dataset.id}`, { method: 'DELETE' });
          _loaded = false;
          load();
        } catch {
          alert('Failed to delete giveaway.');
        }
      });
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.GiveawaysModule = { init, load };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();
