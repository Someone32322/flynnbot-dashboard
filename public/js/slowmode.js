/**
 * Slowmode Automation dashboard module.
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
      if (e.detail?.section === 'slowmode') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    const sec = document.getElementById('section-slowmode');
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
        fetch(`/api/guild/${_guildId}/slowmode`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/channels`).then((r) => r.json()).catch(() => []),
      ]);
      _config = data.config || {};
      _channels = Array.isArray(channelData) ? channelData.filter((c) => c.type === 0) : [];
      render();
    } catch (err) {
      console.error('[Slowmode] load error', err);
      const el = document.getElementById('slowmode-loading');
      if (el) el.textContent = 'Failed to load slowmode config.';
    }
  }

  function channelOptions(selected) {
    return _channels.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>#${escHtml(c.name)}</option>`).join('');
  }

  function renderRule(rule, idx) {
    return `
      <div class="slowmode-rule-card" data-idx="${idx}">
        <div class="slowmode-rule-row">
          <div>
            <label class="slowmode-label">Channel</label>
            <select class="slowmode-select sm-chan" data-idx="${idx}">
              <option value="">— Select channel —</option>
              ${channelOptions(rule.channelId)}
            </select>
          </div>
          <div>
            <label class="slowmode-label">Msg/Minute Threshold</label>
            <input type="number" class="slowmode-input sm-threshold" data-idx="${idx}" value="${rule.threshold || 10}" min="1" max="200">
          </div>
          <div>
            <label class="slowmode-label">Slowmode (seconds)</label>
            <input type="number" class="slowmode-input sm-slowmode" data-idx="${idx}" value="${rule.slowmodeSeconds || 5}" min="0" max="21600">
          </div>
          <div>
            <label class="slowmode-label">Cooldown (minutes)</label>
            <input type="number" class="slowmode-input sm-cooldown" data-idx="${idx}" value="${rule.cooldownMinutes || 5}" min="1">
          </div>
          <button class="slowmode-rule-remove" data-remove="${idx}" title="Remove rule">✕</button>
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('slowmode-root');
    if (!root) return;
    const rules = _config.rules || [];

    root.innerHTML = `
      <div class="slowmode-enable-row">
        <div>
          <div class="slowmode-enable-label">Enable Slowmode Automation</div>
          <div class="slowmode-enable-sub">Automatically apply slowmode when a channel exceeds the configured message rate.</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="sm-enabled" ${_config.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="slowmode-rules-list" id="sm-rules-list">
        ${rules.length === 0
          ? '<div class="slowmode-empty">No rules configured. Add one below.</div>'
          : rules.map((r, i) => renderRule(r, i)).join('')}
      </div>
      <button class="btn btn-sm btn-ghost" id="sm-add-btn">+ Add Rule</button>
    `;
    root.style.display = '';
    document.getElementById('slowmode-loading').style.display = 'none';
    attachEvents(root);
  }

  function attachEvents(root) {
    document.getElementById('sm-enabled')?.addEventListener('change', () => window.SaveBar?.markDirty());
    root.querySelectorAll('.sm-chan, .sm-threshold, .sm-slowmode, .sm-cooldown').forEach((el) => {
      el.addEventListener('change', () => window.SaveBar?.markDirty());
    });
    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.remove);
        _config.rules = (_config.rules || []).filter((_, i) => i !== idx);
        render();
        window.SaveBar?.markDirty();
      });
    });
    document.getElementById('sm-add-btn')?.addEventListener('click', () => {
      _config.rules = [...(_config.rules || []), { channelId: '', threshold: 10, slowmodeSeconds: 5, cooldownMinutes: 5 }];
      render();
      window.SaveBar?.markDirty();
    });
  }

  function collectConfig() {
    const rules = [];
    document.querySelectorAll('#sm-rules-list [data-idx]').forEach((card) => {
      const idx = card.dataset.idx;
      const channelId = card.querySelector(`.sm-chan[data-idx="${idx}"]`)?.value || '';
      const threshold = parseInt(card.querySelector(`.sm-threshold[data-idx="${idx}"]`)?.value) || 10;
      const slowmodeSeconds = parseInt(card.querySelector(`.sm-slowmode[data-idx="${idx}"]`)?.value) || 5;
      const cooldownMinutes = parseInt(card.querySelector(`.sm-cooldown[data-idx="${idx}"]`)?.value) || 5;
      if (channelId) rules.push({ channelId, threshold, slowmodeSeconds, cooldownMinutes });
    });
    return {
      enabled: document.getElementById('sm-enabled')?.checked || false,
      rules,
    };
  }

  async function save() {
    const payload = collectConfig();
    try {
      const res = await fetch(`/api/guild/${_guildId}/slowmode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      _config = data.config || payload;
      window.SaveBar?.markClean();
    } catch (err) {
      window.showToast?.('Failed to save slowmode config: ' + err.message, 'error');
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

  window.SlowmodeModule = { init, load, save, reset };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();
