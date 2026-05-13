/**
 * Stats Channels dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _config = {};
  let _channels = [];
  let _loaded = false;

  const STAT_TYPES = [
    { value: 'members', label: 'Total Members' },
    { value: 'online', label: 'Online Members' },
    { value: 'bots', label: 'Bot Count' },
    { value: 'boosts', label: 'Server Boosts' },
    { value: 'channels', label: 'Total Channels' },
    { value: 'roles', label: 'Total Roles' },
    { value: 'custom', label: 'Custom Template' },
  ];

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'stats') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    const sec = document.getElementById('section-stats');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
      window.SaveBar?.setHandlers(save, reset);
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const [data, channelData] = await Promise.all([
        fetch(`/api/guild/${_guildId}/stats`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/channels?voice=1`).then((r) => r.json()).catch(() => []),
      ]);
      _config = data.config || {};
      _channels = Array.isArray(channelData) ? channelData.filter((c) => c.type === 2 || c.type === 13) : []; // voice + stage channels
      render();
    } catch (err) {
      console.error('[Stats] load error', err);
      const el = document.getElementById('stats-loading');
      if (el) el.textContent = 'Failed to load stats config.';
    }
  }

  function voiceChannelOptions(selected) {
    return _channels.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');
  }

  function typeOptions(selected) {
    return STAT_TYPES.map((t) => `<option value="${t.value}" ${t.value === selected ? 'selected' : ''}>${t.label}</option>`).join('');
  }

  function renderRuleCard(ch, idx) {
    return `
      <div class="stats-channel-card" data-idx="${idx}">
        <div class="stats-channel-row">
          <div>
            <label class="stats-label">Voice Channel</label>
            <select class="stats-select stats-ch-chan" data-idx="${idx}">
              <option value="">— Select voice channel —</option>
              ${voiceChannelOptions(ch.channelId)}
            </select>
          </div>
          <div>
            <label class="stats-label">Stat Type</label>
            <select class="stats-select stats-ch-type" data-idx="${idx}">
              ${typeOptions(ch.type)}
            </select>
          </div>
          <div>
            <label class="stats-label">Template (optional)</label>
            <input type="text" class="stats-input stats-ch-tmpl" data-idx="${idx}" value="${escHtml(ch.template || '')}" placeholder="e.g. Members: {members}">
          </div>
          <button class="stats-channel-remove" data-remove="${idx}" title="Remove">✕</button>
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('stats-root');
    if (!root) return;
    const cfg = _config;
    const chans = cfg.channels || [];

    root.innerHTML = `
      <div class="stats-enable-row">
        <div>
          <div class="stats-enable-label">Enable Stats Channels</div>
          <div class="stats-enable-sub">Bot updates voice channel names with live statistics every ${cfg.updateInterval || 10} minutes.</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="stats-enabled" ${cfg.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div style="margin-bottom:1rem;display:flex;align-items:center;gap:1rem">
        <label class="stats-label" style="margin-bottom:0" for="stats-interval">Update Interval (minutes)</label>
        <input type="number" id="stats-interval" class="stats-input" style="width:100px" value="${cfg.updateInterval || 10}" min="5" max="1440">
      </div>
      <div class="stats-channels-list" id="stats-rules-list">
        ${chans.map((ch, i) => renderRuleCard(ch, i)).join('')}
        ${chans.length === 0 ? '<p class="stats-empty" style="text-align:center;padding:1.5rem;color:var(--text-3)">No stat channels configured. Add one below.</p>' : ''}
      </div>
      <button class="btn btn-sm btn-ghost stats-add-btn" id="stats-add-btn">+ Add Stat Channel</button>
    `;
    root.style.display = '';
    document.getElementById('stats-loading').style.display = 'none';
    attachEvents(root);
  }

  function attachEvents(root) {
    document.getElementById('stats-enabled')?.addEventListener('change', () => window.SaveBar?.markDirty());
    document.getElementById('stats-interval')?.addEventListener('change', () => window.SaveBar?.markDirty());
    root.querySelectorAll('.stats-ch-chan, .stats-ch-type, .stats-ch-tmpl').forEach((el) => {
      el.addEventListener('change', () => window.SaveBar?.markDirty());
    });
    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove);
        _config.channels = (_config.channels || []).filter((_, i) => i !== idx);
        render();
        window.SaveBar?.markDirty();
      });
    });
    document.getElementById('stats-add-btn')?.addEventListener('click', () => {
      _config.channels = [...(_config.channels || []), { channelId: '', type: 'members', template: '' }];
      render();
      window.SaveBar?.markDirty();
    });
  }

  function collectConfig() {
    const channels = [];
    document.querySelectorAll('#stats-rules-list [data-idx]').forEach((card) => {
      const idx = card.dataset.idx;
      const channelId = card.querySelector(`.stats-ch-chan[data-idx="${idx}"]`)?.value || '';
      const type = card.querySelector(`.stats-ch-type[data-idx="${idx}"]`)?.value || 'members';
      const template = card.querySelector(`.stats-ch-tmpl[data-idx="${idx}"]`)?.value || '';
      if (channelId) channels.push({ channelId, type, template });
    });
    return {
      enabled: document.getElementById('stats-enabled')?.checked || false,
      updateInterval: parseInt(document.getElementById('stats-interval')?.value) || 10,
      channels,
    };
  }

  async function save() {
    const payload = collectConfig();
    try {
      const res = await fetch(`/api/guild/${_guildId}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      _config = data.config || payload;
      window.SaveBar?.markClean();
    } catch (err) {
      window.showToast?.('Failed to save stats config: ' + err.message, 'error');
    }
  }

  function reset() {
    _loaded = false;
    load();
    window.SaveBar?.markClean();
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.StatsModule = { init, load, save, reset };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();
