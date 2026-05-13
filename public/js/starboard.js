/**
 * Starboard dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _config = {};
  let _channels = [];
  let _loaded = false;

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'starboard') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    const sec = document.getElementById('section-starboard');
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
        fetch(`/api/guild/${_guildId}/starboard`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/channels`).then((r) => r.json()).catch(() => []),
      ]);
      _config = data.config || {};
      _channels = Array.isArray(channelData) ? channelData : [];
      render();
    } catch (err) {
      console.error('[Starboard] load error', err);
      const el = document.getElementById('starboard-loading');
      if (el) el.textContent = 'Failed to load starboard config.';
    }
  }

  function channelOptions(selected) {
    return _channels
      .filter((c) => c.type === 0)
      .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>#${c.name}</option>`)
      .join('');
  }

  function render() {
    const root = document.getElementById('starboard-root');
    if (!root) return;
    const cfg = _config;
    root.innerHTML = `
      <div class="starboard-toggle-row">
        <span class="starboard-toggle-label">Enable Starboard</span>
        <label class="toggle-switch">
          <input type="checkbox" id="sb-enabled" ${cfg.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="starboard-grid">
        <div class="starboard-card">
          <div class="starboard-card-title">Configuration</div>
          <div class="starboard-form-group">
            <label class="starboard-label" for="sb-channel">Starboard Channel</label>
            <select id="sb-channel" class="starboard-input">
              <option value="">— Select channel —</option>
              ${channelOptions(cfg.channelId)}
            </select>
          </div>
          <div class="starboard-form-group">
            <label class="starboard-label" for="sb-emoji">Star Emoji</label>
            <input type="text" id="sb-emoji" class="starboard-input" value="${cfg.emoji || '⭐'}" maxlength="64">
          </div>
          <div class="starboard-form-group">
            <label class="starboard-label" for="sb-threshold">Star Threshold</label>
            <input type="number" id="sb-threshold" class="starboard-input" value="${cfg.threshold || 3}" min="1" max="100">
          </div>
          <div style="display:flex;gap:1rem;margin-top:0.75rem">
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--text-2)">
              <input type="checkbox" id="sb-selfstar" ${cfg.ignoreSelfStars !== false ? 'checked' : ''}> Ignore self-stars
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--text-2)">
              <input type="checkbox" id="sb-nsfw" ${cfg.ignoreNsfw !== false ? 'checked' : ''}> Ignore NSFW channels
            </label>
          </div>
        </div>
        <div class="starboard-card">
          <div class="starboard-card-title">Ignored Channels</div>
          <p style="font-size:0.825rem;color:var(--text-3);margin-bottom:0.75rem">Messages from these channels will not appear on the starboard.</p>
          <div id="sb-ignored-list" class="starboard-ignored-list">
            ${(cfg.ignoredChannels || []).map((cid) => {
              const ch = _channels.find((c) => c.id === cid);
              return `<span class="starboard-ignored-tag">#${ch ? ch.name : cid}<button data-remove="${cid}" title="Remove">×</button></span>`;
            }).join('')}
          </div>
          <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
            <select id="sb-add-ignored-sel" class="starboard-input" style="flex:1">
              <option value="">— Add channel to ignore —</option>
              ${channelOptions('')}
            </select>
            <button class="btn btn-sm btn-ghost" id="sb-add-ignored-btn">Add</button>
          </div>
        </div>
      </div>
    `;
    root.style.display = '';
    document.getElementById('starboard-loading').style.display = 'none';
    attachEvents(root);
  }

  function attachEvents(root) {
    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.remove;
        _config.ignoredChannels = (_config.ignoredChannels || []).filter((c) => c !== cid);
        render();
        window.SaveBar?.markDirty();
      });
    });
    document.getElementById('sb-add-ignored-btn')?.addEventListener('click', () => {
      const sel = document.getElementById('sb-add-ignored-sel');
      const val = sel?.value;
      if (!val) return;
      if (!(_config.ignoredChannels || []).includes(val)) {
        _config.ignoredChannels = [...(_config.ignoredChannels || []), val];
      }
      render();
      window.SaveBar?.markDirty();
    });
    ['sb-enabled', 'sb-channel', 'sb-emoji', 'sb-threshold', 'sb-selfstar', 'sb-nsfw'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => window.SaveBar?.markDirty());
    });
  }

  function collectConfig() {
    return {
      enabled: document.getElementById('sb-enabled')?.checked || false,
      channelId: document.getElementById('sb-channel')?.value || null,
      emoji: document.getElementById('sb-emoji')?.value.trim() || '⭐',
      threshold: parseInt(document.getElementById('sb-threshold')?.value) || 3,
      ignoreSelfStars: document.getElementById('sb-selfstar')?.checked !== false,
      ignoreNsfw: document.getElementById('sb-nsfw')?.checked !== false,
      ignoredChannels: _config.ignoredChannels || [],
    };
  }

  async function save() {
    const payload = collectConfig();
    try {
      const res = await fetch(`/api/guild/${_guildId}/starboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      _config = data.config || payload;
      window.SaveBar?.markClean();
    } catch (err) {
      window.showToast?.('Failed to save starboard config: ' + err.message, 'error');
    }
  }

  function reset() {
    _loaded = false;
    load();
    window.SaveBar?.markClean();
  }

  window.StarboardModule = { init, load, save, reset };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();

