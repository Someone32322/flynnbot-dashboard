/**
 * Moderation Escalation dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _config = {};
  let _loaded = false;

  const ACTIONS = [
    { value: 'mute', label: 'Mute' },
    { value: 'tempmute', label: 'Temp Mute' },
    { value: 'kick', label: 'Kick' },
    { value: 'ban', label: 'Ban' },
  ];

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'escalation') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    const sec = document.getElementById('section-escalation');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
      window.SaveBar?.setHandlers(save, reset);
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const res = await fetch(`/api/guild/${_guildId}/escalation`);
      const data = await res.json();
      _config = data.config || {};
      render();
    } catch (err) {
      console.error('[Escalation] load error', err);
      const el = document.getElementById('escalation-loading');
      if (el) el.textContent = 'Failed to load escalation config.';
    }
  }

  function actionOptions(selected) {
    return ACTIONS.map((a) => `<option value="${a.value}" ${a.value === selected ? 'selected' : ''}>${a.label}</option>`).join('');
  }

  function renderRule(rule, idx) {
    return `
      <div class="escalation-rule-card" data-idx="${idx}">
        <div class="escalation-rule-row">
          <div>
            <label class="escalation-label">Warn Count</label>
            <input type="number" class="escalation-input esc-warn" data-idx="${idx}" value="${rule.warnCount || 1}" min="1" max="100">
          </div>
          <div>
            <label class="escalation-label">Action</label>
            <select class="escalation-select esc-action" data-idx="${idx}">
              ${actionOptions(rule.action)}
            </select>
          </div>
          <div>
            <label class="escalation-label">Duration (min, for temp mute)</label>
            <input type="number" class="escalation-input esc-duration" data-idx="${idx}" value="${rule.duration || 0}" min="0">
          </div>
          <button class="escalation-rule-remove" data-remove="${idx}" title="Remove rule">✕</button>
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById('escalation-root');
    if (!root) return;
    const rules = _config.rules || [];

    root.innerHTML = `
      <div class="escalation-enable-row">
        <div>
          <div class="escalation-enable-label">Enable Auto-Escalation</div>
          <div class="escalation-enable-sub">When a user's warn count reaches a threshold, automatically apply the configured action.</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="esc-enabled" ${_config.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="escalation-rules-list" id="esc-rules-list">
        ${rules.length === 0
          ? '<div class="escalation-empty">No escalation rules yet. Add one below.</div>'
          : rules.map((r, i) => renderRule(r, i)).join('')}
      </div>
      <button class="btn btn-sm btn-ghost" id="esc-add-btn">+ Add Rule</button>
    `;
    root.style.display = '';
    document.getElementById('escalation-loading').style.display = 'none';
    attachEvents(root);
  }

  function attachEvents(root) {
    document.getElementById('esc-enabled')?.addEventListener('change', () => window.SaveBar?.markDirty());
    root.querySelectorAll('.esc-warn, .esc-action, .esc-duration').forEach((el) => {
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
    document.getElementById('esc-add-btn')?.addEventListener('click', () => {
      _config.rules = [...(_config.rules || []), { warnCount: 3, action: 'mute', duration: 0 }];
      render();
      window.SaveBar?.markDirty();
    });
  }

  function collectConfig() {
    const rules = [];
    document.querySelectorAll('#esc-rules-list [data-idx]').forEach((card) => {
      const idx = card.dataset.idx;
      const warnCount = parseInt(card.querySelector(`.esc-warn[data-idx="${idx}"]`)?.value) || 1;
      const action = card.querySelector(`.esc-action[data-idx="${idx}"]`)?.value || 'mute';
      const duration = parseInt(card.querySelector(`.esc-duration[data-idx="${idx}"]`)?.value) || 0;
      rules.push({ warnCount, action, duration });
    });
    return {
      enabled: document.getElementById('esc-enabled')?.checked || false,
      rules,
    };
  }

  async function save() {
    const payload = collectConfig();
    try {
      const res = await fetch(`/api/guild/${_guildId}/escalation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      _config = data.config || payload;
      window.SaveBar?.markClean();
    } catch (err) {
      window.showToast?.('Failed to save escalation config: ' + err.message, 'error');
    }
  }

  function reset() {
    _loaded = false;
    load();
    window.SaveBar?.markClean();
  }

  window.EscalationModule = { init, load, save, reset };

  const pageData = document.getElementById('pageData');
  if (pageData?.dataset.guildId) init(pageData.dataset.guildId);
})();

