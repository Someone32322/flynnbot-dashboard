/**
 * ai.js — AI Chat dashboard section
 */
(function () {
  'use strict';

  let _guildId = null;
  let _cfg = null;
  let _channels = [];
  let _loaded = false;

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'ai') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    const sec = document.getElementById('section-ai');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
      window.SaveBar?.setHandlers(save, reset);
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    const container = document.getElementById('aiContent');
    if (!container) return;
    container.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading AI config…</div>';
    try {
      const [cfg, channels] = await Promise.all([
        fetch(`/api/guild/${_guildId}/ai`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/channels`).then((r) => r.json()).catch(() => []),
      ]);
      _cfg = cfg;
      _channels = Array.isArray(channels) ? channels : [];
      render();
    } catch (err) {
      container.innerHTML = `<div class="error-message">Failed to load AI config.</div>`;
    }
  }

  function render() {
    const container = document.getElementById('aiContent');
    if (!container) return;
    const cfg = _cfg || {};

    const channelOptions = _channels
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`)
      .join('');

    container.innerHTML = `
      <div class="ai-grid">

        <!-- Enable / API Key -->
        <div class="ai-card ai-card--full">
          <div class="ai-card-header">
            <div class="ai-card-icon ai-card-icon--blue">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div>
              <div class="ai-card-title">AI Chat</div>
              <div class="ai-card-sub">Configure FlynnBot's AI assistant</div>
            </div>
            <label class="ai-big-toggle">
              <input type="checkbox" id="aiEnabled" ${cfg.enabled ? 'checked' : ''}>
              <span class="ai-big-toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- API Key -->
        <div class="ai-card ai-card--full">
          <div class="ai-card-header">
            <div class="ai-card-icon ai-card-icon--purple">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <div>
              <div class="ai-card-title">API Key</div>
              <div class="ai-card-sub">Required to use the AI. Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener" class="ai-link">console.groq.com</a></div>
            </div>
          </div>
          <div class="ai-card-body">
            <div class="ai-field">
              <label class="ai-label">Groq API Key</label>
              <div class="ai-key-row">
                <input class="ai-input ai-input--key" type="password" id="aiApiKey" maxlength="200"
                  value="${cfg.apiKey ? '•'.repeat(20) : ''}"
                  placeholder="gsk_…  (leave blank to keep existing)" autocomplete="off">
                <button class="ai-key-toggle" id="aiKeyToggle" title="Show/hide key">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="btn btn-ghost btn-sm" id="aiValidateKey">Validate</button>
              </div>
              <div class="ai-key-status" id="aiKeyStatus"></div>
            </div>
          </div>
        </div>

        <!-- Model & Parameters -->
        <div class="ai-card">
          <div class="ai-card-header">
            <div class="ai-card-icon ai-card-icon--green">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <div>
              <div class="ai-card-title">Model</div>
              <div class="ai-card-sub">Which AI model to use</div>
            </div>
          </div>
          <div class="ai-card-body">
            <div class="ai-field">
              <label class="ai-label" for="aiModel">AI Model</label>
              <select class="ai-input" id="aiModel">
                <optgroup label="Groq (Fast, Free)">
                  <option value="llama-3.3-70b-versatile" ${cfg.model === 'llama-3.3-70b-versatile' ? 'selected' : ''}>Llama 3.3 70B Versatile (Recommended)</option>
                  <option value="llama-3.1-8b-instant" ${cfg.model === 'llama-3.1-8b-instant' ? 'selected' : ''}>Llama 3.1 8B Instant (Fastest)</option>
                  <option value="llama3-70b-8192" ${cfg.model === 'llama3-70b-8192' ? 'selected' : ''}>Llama 3 70B</option>
                  <option value="llama3-8b-8192" ${cfg.model === 'llama3-8b-8192' ? 'selected' : ''}>Llama 3 8B</option>
                  <option value="mixtral-8x7b-32768" ${cfg.model === 'mixtral-8x7b-32768' ? 'selected' : ''}>Mixtral 8x7B</option>
                  <option value="gemma2-9b-it" ${cfg.model === 'gemma2-9b-it' ? 'selected' : ''}>Gemma 2 9B</option>
                </optgroup>
              </select>
            </div>
            <div class="ai-row-2">
              <div class="ai-field">
                <label class="ai-label" for="aiTemperature">Temperature <span class="ai-hint">(0.0 – 2.0)</span></label>
                <input class="ai-input" type="number" id="aiTemperature" value="${cfg.temperature ?? 0.7}" min="0" max="2" step="0.1">
              </div>
              <div class="ai-field">
                <label class="ai-label" for="aiMaxTokens">Max Tokens <span class="ai-hint">(50 – 4096)</span></label>
                <input class="ai-input" type="number" id="aiMaxTokens" value="${cfg.maxTokens ?? 512}" min="50" max="4096">
              </div>
            </div>
          </div>
        </div>

        <!-- Behaviour -->
        <div class="ai-card">
          <div class="ai-card-header">
            <div class="ai-card-icon ai-card-icon--yellow">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <div>
              <div class="ai-card-title">Behaviour</div>
              <div class="ai-card-sub">How the AI interacts</div>
            </div>
          </div>
          <div class="ai-card-body">
            <label class="ai-toggle-row">
              <div>
                <div class="ai-toggle-label">Require @mention</div>
                <div class="ai-toggle-sub">Bot only responds when directly @mentioned</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="aiRequireMention" ${cfg.requireMention ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </label>
            <label class="ai-toggle-row">
              <div>
                <div class="ai-toggle-label">Remember context</div>
                <div class="ai-toggle-sub">Keep short conversation history per user (last 6 messages)</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="aiRememberContext" ${cfg.rememberContext !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </label>
          </div>
        </div>

        <!-- System Prompt -->
        <div class="ai-card ai-card--full">
          <div class="ai-card-header">
            <div class="ai-card-icon ai-card-icon--blue">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div>
              <div class="ai-card-title">System Prompt</div>
              <div class="ai-card-sub">AI personality and instructions (sent before every conversation)</div>
            </div>
          </div>
          <div class="ai-card-body">
            <div class="ai-field">
              <label class="ai-label" for="aiSystemPrompt">Instructions <span class="ai-hint">(max 2000 chars)</span></label>
              <textarea class="ai-input ai-textarea" id="aiSystemPrompt" rows="5" maxlength="2000" placeholder="e.g. You are a helpful and friendly assistant for this Discord server. Keep answers brief and on-topic.">${esc(cfg.systemPrompt || '')}</textarea>
              <div class="ai-char-count" id="aiPromptCount">${(cfg.systemPrompt || '').length}/2000</div>
            </div>
            <div class="ai-presets">
              <span class="ai-presets-label">Quick presets:</span>
              <button class="ai-preset-btn" data-preset="helpful">Helpful Assistant</button>
              <button class="ai-preset-btn" data-preset="fun">Fun &amp; Casual</button>
              <button class="ai-preset-btn" data-preset="support">Support Agent</button>
              <button class="ai-preset-btn" data-preset="roleplay">Roleplay Bot</button>
            </div>
          </div>
        </div>

        <!-- Allowed Channels -->
        <div class="ai-card ai-card--full">
          <div class="ai-card-header">
            <div class="ai-card-icon ai-card-icon--green">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div>
              <div class="ai-card-title">Allowed Channels</div>
              <div class="ai-card-sub">AI only responds in these channels. Leave empty to disable channel restriction.</div>
            </div>
          </div>
          <div class="ai-card-body">
            <div class="ai-channel-tags" id="aiChannelList">
              ${renderChannelTags(cfg.allowedChannels || [])}
            </div>
            <div class="ai-channel-add-row">
              <select class="ai-input ai-channel-select" id="aiChannelAdd">
                <option value="">— Add a channel —</option>
                ${channelOptions}
              </select>
              <button class="btn btn-primary btn-sm" id="aiAddChannelBtn">Add</button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Character counter for system prompt
    document.getElementById('aiSystemPrompt')?.addEventListener('input', () => {
      const len = document.getElementById('aiSystemPrompt')?.value?.length || 0;
      const el = document.getElementById('aiPromptCount');
      if (el) {
        el.textContent = `${len}/2000`;
        el.style.color = len > 1800 ? 'var(--red)' : '';
      }
      window.SaveBar?.markDirty();
    });

    // API key toggle visibility
    document.getElementById('aiKeyToggle')?.addEventListener('click', () => {
      const input = document.getElementById('aiApiKey');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Validate API key
    document.getElementById('aiValidateKey')?.addEventListener('click', validateKey);

    // Channel add
    document.getElementById('aiAddChannelBtn')?.addEventListener('click', () => {
      const sel = document.getElementById('aiChannelAdd');
      const id = sel?.value;
      if (!id) return;
      if (!_cfg.allowedChannels) _cfg.allowedChannels = [];
      if (_cfg.allowedChannels.includes(id)) return;
      _cfg.allowedChannels.push(id);
      document.getElementById('aiChannelList').innerHTML = renderChannelTags(_cfg.allowedChannels);
      wireChannelTags();
      sel.value = '';
      window.SaveBar?.markDirty();
    });

    // Preset buttons
    const PRESETS = {
      helpful: 'You are a helpful and knowledgeable assistant for this Discord server. Provide clear, accurate, and friendly responses. Keep answers concise.',
      fun: 'You are a fun, casual, and friendly assistant for this Discord server. Use a relaxed conversational tone and occasional humor. Keep responses brief.',
      support: 'You are a support agent for this Discord server. Help users with their questions and issues. Be patient, professional, and empathetic. Escalate complex issues to human moderators.',
      roleplay: 'You are an in-character AI assistant named Flynn. Stay in character at all times. You are witty, knowledgeable, and slightly playful. Never break character.',
    };
    document.querySelectorAll('.ai-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ta = document.getElementById('aiSystemPrompt');
        if (!ta) return;
        ta.value = PRESETS[btn.dataset.preset] || '';
        const len = ta.value.length;
        const cnt = document.getElementById('aiPromptCount');
        if (cnt) cnt.textContent = `${len}/2000`;
        window.SaveBar?.markDirty();
      });
    });

    // Mark dirty on any input change
    container.querySelectorAll('input, select, textarea').forEach((el) => {
      el.addEventListener('change', () => window.SaveBar?.markDirty());
    });

    wireChannelTags();
    window.SaveBar?.setHandlers(save, reset);
  }

  function renderChannelTags(channels) {
    if (!channels?.length) {
      return '<span class="ai-channel-empty">No channels selected — AI responds everywhere</span>';
    }
    return channels.map((id) => {
      const ch = _channels.find((c) => c.id === id);
      const name = ch ? ch.name : id;
      return `<span class="ai-channel-tag">#${esc(name)}<button class="ai-channel-remove" data-id="${esc(id)}" title="Remove">&times;</button></span>`;
    }).join('');
  }

  function wireChannelTags() {
    document.querySelectorAll('.ai-channel-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!_cfg?.allowedChannels) return;
        _cfg.allowedChannels = _cfg.allowedChannels.filter((c) => c !== id);
        const list = document.getElementById('aiChannelList');
        if (list) list.innerHTML = renderChannelTags(_cfg.allowedChannels);
        wireChannelTags();
        window.SaveBar?.markDirty();
      });
    });
  }

  async function validateKey() {
    const keyInput = document.getElementById('aiApiKey');
    const statusEl = document.getElementById('aiKeyStatus');
    const btn = document.getElementById('aiValidateKey');
    const key = keyInput?.value?.trim();
    if (!key || key.startsWith('•')) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--text-2)">Enter a new key to validate</span>`;
      return;
    }
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--text-2)">Validating…</span>`;
    try {
      const res = await fetch(`/api/guild/${_guildId}/ai/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (data.valid) {
        if (statusEl) statusEl.innerHTML = `<span style="color:var(--green)">✓ Valid API key</span>`;
      } else {
        if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">✗ Invalid key: ${esc(data.error || 'Authentication failed')}</span>`;
      }
    } catch {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--red)">✗ Validation failed</span>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function save() {
    const keyInput = document.getElementById('aiApiKey');
    const keyVal = keyInput?.value?.trim();
    const body = {
      enabled: !!document.getElementById('aiEnabled')?.checked,
      requireMention: !!document.getElementById('aiRequireMention')?.checked,
      rememberContext: !!document.getElementById('aiRememberContext')?.checked,
      model: document.getElementById('aiModel')?.value || 'llama-3.3-70b-versatile',
      temperature: parseFloat(document.getElementById('aiTemperature')?.value) || 0.7,
      maxTokens: parseInt(document.getElementById('aiMaxTokens')?.value) || 512,
      systemPrompt: document.getElementById('aiSystemPrompt')?.value?.trim() || '',
      allowedChannels: _cfg?.allowedChannels || [],
    };
    // Only include apiKey if user typed something new (not all bullets)
    if (keyVal && !keyVal.match(/^•+$/)) {
      body.apiKey = keyVal;
    }
    try {
      const res = await fetch(`/api/guild/${_guildId}/ai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      _cfg = data;
      window.showToast('AI settings saved.', 'success');
      window.SaveBar?.markClean();
    } catch (err) {
      window.showToast('Error: ' + err.message, 'error');
      throw err;
    }
  }

  function reset() {
    _loaded = false;
    load();
  }

  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const pageData = document.getElementById('pageData');
    const gId = pageData?.dataset?.guildId;
    if (!gId) return;
    init(gId);
  });
})();

async function initAI(guildId) {
  if (_aiInitDone) return;
  _aiInitDone = true;
  await refreshAI(guildId);
}

async function refreshAI(guildId) {
  const container = document.getElementById('aiContent');
  if (!container) return;
  container.innerHTML = '<div class="commands-loading"><div class="spinner"></div> Loading…</div>';
  try {
    const res = await fetch(`/api/guild/${guildId}/ai`);
    if (!res.ok) throw new Error('Failed to load AI config');
    _aiCfg = await res.json();
    renderAI(container, guildId);
  } catch (e) {
    container.innerHTML = `<div class="error-message">❌ ${escapeHtmlAI(e.message)}</div>`;
  }
}

function renderAI(container, guildId) {
  const cfg = _aiCfg;
  const channelOptions = window._channelList
    ? window._channelList.map(ch => `<option value="${escapeHtmlAI(ch.id)}">${escapeHtmlAI('#' + (ch.name || ch.id))}</option>`).join('')
    : '';

  const selectedChannels = (cfg.allowedChannels || []).map(id => escapeHtmlAI(id)).join(',');

  container.innerHTML = `
    <div class="ec-card">
      <div class="ec-card-header"><h3>System Status</h3></div>
      <div class="ec-card-body">
        <label class="ec-toggle-row">
          <span class="ec-toggle-label">Enable AI Chat</span>
          <label class="toggle-switch">
            <input type="checkbox" id="aiEnabled" ${cfg.enabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </label>
        <label class="ec-toggle-row" style="margin-top:0.75rem">
          <span class="ec-toggle-label">Require @mention to trigger AI</span>
          <label class="toggle-switch">
            <input type="checkbox" id="aiRequireMention" ${cfg.requireMention ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </label>
      </div>
    </div>

    <div class="ec-card">
      <div class="ec-card-header"><h3>Model & Parameters</h3></div>
      <div class="ec-card-body ec-grid-2">
        <label class="ec-field">
          <span>Model</span>
          <select id="aiModel" class="ec-input" data-cs>
            <option value="llama-3.1-8b-instant" ${(cfg.model === 'llama-3.1-8b-instant' || cfg.model === 'llama3-8b-8192') ? 'selected' : ''}>Llama 3.1 8B (fast, free)</option>
            <option value="llama-3.3-70b-versatile" ${(cfg.model === 'llama-3.3-70b-versatile' || cfg.model === 'llama3-70b-8192') ? 'selected' : ''}>Llama 3.3 70B (smart, free)</option>
            <option value="mixtral-8x7b-32768" ${cfg.model === 'mixtral-8x7b-32768' ? 'selected' : ''}>Mixtral 8x7B (balanced)</option>
            <option value="gemma2-9b-it" ${cfg.model === 'gemma2-9b-it' ? 'selected' : ''}>Gemma 2 9B</option>
          </select>
        </label>
        <label class="ec-field">
          <span>Temperature (0.0 – 2.0)</span>
          <input type="number" id="aiTemperature" class="ec-input" value="${cfg.temperature ?? 0.7}" min="0" max="2" step="0.1" />
        </label>
        <label class="ec-field">
          <span>Max Tokens (50 – 2048)</span>
          <input type="number" id="aiMaxTokens" class="ec-input" value="${cfg.maxTokens ?? 512}" min="50" max="2048" />
        </label>
      </div>
    </div>

    <div class="ec-card">
      <div class="ec-card-header"><h3>System Prompt</h3></div>
      <div class="ec-card-body">
        <label class="ec-field">
          <span>System Prompt (max 2000 chars)</span>
          <textarea id="aiSystemPrompt" class="ec-input" rows="5" maxlength="2000">${escapeHtmlAI(cfg.systemPrompt || '')}</textarea>
        </label>
        <p style="font-size:0.78rem;opacity:0.5;margin-top:0.4rem">
          This is the personality/instructions given to the AI before every conversation. Keep it concise.
        </p>
      </div>
    </div>

    <div class="ec-card">
      <div class="ec-card-header"><h3>Allowed Channels</h3></div>
      <div class="ec-card-body">
        <p style="font-size:0.85rem;opacity:0.7;margin-bottom:0.75rem">
          The AI will only respond in these channels. Leave empty to disable.
        </p>
        <div id="aiChannelList" class="ai-channel-list">
          ${renderAIChannelTags(cfg.allowedChannels || [])}
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
          <select id="aiChannelAdd" class="ec-input" data-cs style="max-width:260px">
            <option value="">Select a channel to add…</option>
            ${channelOptions}
          </select>
          <button class="btn btn-sm btn-primary" id="aiAddChannelBtn">Add</button>
        </div>
      </div>
    </div>

    <div class="ec-actions">
      <button class="btn btn-primary" id="aiSaveBtn">Save AI Settings</button>
    </div>
  `;

  document.getElementById('aiSaveBtn')?.addEventListener('click', () => saveAI(guildId));
  if (typeof initAllCustomSelects === 'function') initAllCustomSelects(container);
  document.getElementById('aiAddChannelBtn')?.addEventListener('click', () => {
    const sel = document.getElementById('aiChannelAdd');
    const id = sel?.value;
    if (!id || _aiCfg.allowedChannels?.includes(id)) return;
    if (!_aiCfg.allowedChannels) _aiCfg.allowedChannels = [];
    _aiCfg.allowedChannels.push(id);
    document.getElementById('aiChannelList').innerHTML = renderAIChannelTags(_aiCfg.allowedChannels);
    wireAIChannelTags(guildId);
    sel.value = '';
  });
  wireAIChannelTags(guildId);
}

function renderAIChannelTags(channels) {
  if (!channels?.length) return '<span style="opacity:0.4;font-size:0.85rem">No channels selected</span>';
  const list = window._channelList || [];
  return channels.map(id => {
    const ch = list.find(c => c.id === id);
    const name = ch ? '#' + ch.name : id;
    return `<span class="ai-channel-tag">#${escapeHtmlAI(name.replace(/^#/, ''))} <button class="ai-channel-remove" data-id="${escapeHtmlAI(id)}">✕</button></span>`;
  }).join('');
}

function wireAIChannelTags(guildId) {
  document.querySelectorAll('.ai-channel-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!_aiCfg.allowedChannels) return;
      _aiCfg.allowedChannels = _aiCfg.allowedChannels.filter(c => c !== id);
      document.getElementById('aiChannelList').innerHTML = renderAIChannelTags(_aiCfg.allowedChannels);
      wireAIChannelTags(guildId);
    });
  });
}

async function saveAI(guildId) {
  const btn = document.getElementById('aiSaveBtn');
  if (btn) btn.disabled = true;
  const body = {
    enabled: document.getElementById('aiEnabled')?.checked ?? false,
    requireMention: document.getElementById('aiRequireMention')?.checked ?? false,
    model: document.getElementById('aiModel')?.value || 'llama3-8b-8192',
    temperature: parseFloat(document.getElementById('aiTemperature')?.value) || 0.7,
    maxTokens: parseInt(document.getElementById('aiMaxTokens')?.value) || 512,
    systemPrompt: document.getElementById('aiSystemPrompt')?.value.trim() || '',
    allowedChannels: _aiCfg?.allowedChannels || [],
  };
  try {
    const res = await fetch(`/api/guild/${guildId}/ai`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      _aiCfg = data;
      window.showToast?.('AI settings saved.', 'success');
    } else {
      window.showToast?.('Failed to save: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch {
    window.showToast?.('Network error — changes not saved.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function escapeHtmlAI(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const pageData = document.getElementById('pageData');
  const gId = pageData?.dataset?.guildId;
  if (!gId) return;
  document.addEventListener('sectionActivated', (e) => {
    if (e.detail?.section !== 'ai') return;
    if (!_aiInitDone) initAI(gId);
  });
});

window.initAI = initAI;
