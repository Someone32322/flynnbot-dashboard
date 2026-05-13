/**
 * ai.js — AI Chat dashboard section logic
 */

/* global guildId */

let _aiCfg = null;
let _aiInitDone = false;

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
            <option value="llama3-8b-8192" ${cfg.model === 'llama3-8b-8192' ? 'selected' : ''}>Llama 3 8B (fast, free)</option>
            <option value="llama3-70b-8192" ${cfg.model === 'llama3-70b-8192' ? 'selected' : ''}>Llama 3 70B (smart, free)</option>
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
