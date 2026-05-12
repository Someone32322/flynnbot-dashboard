/**
 * Polls dashboard module.
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
      if (e.detail?.section === 'polls') {
        if (!_loaded) load();
      }
    });
    const sec = document.getElementById('section-polls');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const res = await fetch(`/api/guild/${_guildId}/polls`);
      _data = await res.json();
      render();
    } catch (err) {
      console.error('[Polls] load error', err);
      const el = document.getElementById('polls-loading');
      if (el) el.textContent = 'Failed to load polls.';
    }
  }

  function totalVotes(poll) {
    return (poll.options || []).reduce((s, o) => s + (o.votes?.length || 0), 0);
  }

  function renderPollCard(poll) {
    const total = totalVotes(poll);
    const options = (poll.options || []).map((o) => {
      const votes = o.votes?.length || 0;
      const pct = total > 0 ? Math.round(votes / total * 100) : 0;
      return `
        <div class="poll-bar-row">
          <span class="poll-bar-label">${escHtml(o.text)}</span>
          <div class="poll-bar-track"><div class="poll-bar-fill" style="width:${pct}%"></div></div>
          <span class="poll-bar-count">${votes} (${pct}%)</span>
        </div>
      `;
    }).join('');

    return `
      <div class="poll-card">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
          <div class="poll-card-question" style="flex:1">${escHtml(poll.question)}</div>
          <span class="poll-badge poll-badge--${poll.status}">${poll.status}</span>
          <button class="btn btn-sm btn-danger poll-delete" data-id="${poll._id}" title="Delete poll">🗑</button>
        </div>
        ${options}
        <div class="poll-card-meta">${total} total votes • ${poll.type}</div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('polls-root');
    if (!root) return;
    const list = _tab === 'active' ? _data.active : _data.ended;

    root.innerHTML = `
      <div class="polls-tabs">
        <button class="polls-tab ${_tab === 'active' ? 'active' : ''}" data-tab="active">Active (${_data.active.length})</button>
        <button class="polls-tab ${_tab === 'ended' ? 'active' : ''}" data-tab="ended">Ended (${_data.ended.length})</button>
        <button class="btn btn-sm btn-ghost" id="polls-refresh" style="margin-left:auto">↻ Refresh</button>
      </div>
      <div class="polls-list">
        ${list.length === 0
          ? `<div class="poll-empty">No ${_tab} polls. Use <code>/poll yesno</code> or <code>/poll choice</code> in Discord to create one.</div>`
          : list.map(renderPollCard).join('')}
      </div>
    `;
    root.style.display = '';
    document.getElementById('polls-loading').style.display = 'none';
    attachEvents(root);
  }

  function attachEvents(root) {
    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        _tab = btn.dataset.tab;
        render();
      });
    });
    document.getElementById('polls-refresh')?.addEventListener('click', () => {
      _loaded = false;
      load();
    });
    root.querySelectorAll('.poll-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this poll?')) return;
        try {
          await fetch(`/api/guild/${_guildId}/polls/${btn.dataset.id}`, { method: 'DELETE' });
          _loaded = false;
          load();
        } catch {
          alert('Failed to delete poll.');
        }
      });
    });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.PollsModule = { init, load };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();
