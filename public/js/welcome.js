/**
 * Welcome / Goodbye dashboard module.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _config = {};
  let _channels = [];
  let _roles = [];
  let _loaded = false;
  let _activeTab = 'welcome';

  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'welcome') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    const sec = document.getElementById('section-welcome');
    if (sec && sec.style.display !== 'none') {
      if (!_loaded) load();
      window.SaveBar?.setHandlers(save, reset);
    }
  }

  async function load() {
    if (_loaded) return;
    _loaded = true;
    try {
      const [cfg, channelData, roleData] = await Promise.all([
        fetch(`/api/guild/${_guildId}/welcome`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/channels`).then((r) => r.json()).catch(() => []),
        fetch(`/api/guild/${_guildId}/roles`).then((r) => r.json()).catch(() => []),
      ]);
      _config = cfg || {};
      _channels = Array.isArray(channelData) ? channelData : [];
      _roles = Array.isArray(roleData) ? roleData : [];
      render();
    } catch (err) {
      console.error('[Welcome] load error', err);
    }
  }

  function render() {
    const root = document.getElementById('welcome-root');
    if (!root) return;
    root.innerHTML = buildHTML();
    root.style.display = '';
    const loading = document.getElementById('welcome-loading');
    if (loading) loading.style.display = 'none';
    attachEvents(root);
  }

  function channelOptions(selectedId) {
    return '<option value="">Not set</option>' + _channels
      .filter((c) => c.type === 0)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>#${esc(c.name)}</option>`)
      .join('');
  }

  function toggle(id, checked) {
    return `<label class="toggle-switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="toggle-slider"></span></label>`;
  }

  const VARS = ['{user}', '{tag}', '{username}', '{server}', '{count}', '{id}', '{accountAge}'];
  const VARS_GOODBYE = ['{tag}', '{username}', '{server}', '{id}'];

  function varChips(list) {
    return list.map((v) => `<button class="welcome-var-chip" type="button" data-var="${v}">${v}</button>`).join('');
  }

  function roleChips(roleIds) {
    return (roleIds || []).map((id) => {
      const role = _roles.find((r) => r.id === id);
      const name = role ? role.name : id;
      return `<span class="welcome-role-chip">${esc(name)}<button class="welcome-role-chip-remove" data-role-id="${id}" title="Remove">×</button></span>`;
    }).join('');
  }

  const SAMPLE_VARS = { '{user}': '@Alex', '{tag}': 'Alex#0001', '{username}': 'Alex', '{server}': 'My Server', '{count}': '1,234', '{id}': '123456789012345678', '{accountAge}': '30 days' };

  function applyVars(text) {
    if (!text) return '';
    return String(text).replace(/\{user\}|\{tag\}|\{username\}|\{server\}|\{count\}|\{id\}|\{accountAge\}/g, (m) => SAMPLE_VARS[m] || m);
  }

  function buildWelcomePreview(cfg, type) {
    const isW = type === 'welcome';
    const label = isW ? 'Welcome Preview' : 'Goodbye Preview';
    if (!cfg.enabled) {
      return `<div class="welcome-preview-label">${label}</div><div style="font-size:.8rem;color:#b5bac1;text-align:center;padding:1.5rem 0">Enable ${isW ? 'welcome' : 'goodbye'} messages to see a preview</div>`;
    }
    const ch = _channels.find((c) => c.id === cfg.channelId);
    const chLabel = ch ? `#${esc(ch.name)}` : '<span style="color:#f87171">No channel set</span>';
    const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    let msgContent;
    if (cfg.embedEnabled) {
      const color = cfg.embed?.color || (isW ? '#5865f2' : '#ef4444');
      const title = esc(applyVars(cfg.embed?.title || (isW ? 'Welcome to {server}!' : '{tag} left')));
      const desc = esc(applyVars(cfg.embed?.description || (isW ? 'Hey {user}! You are member #{count}.' : '**{tag}** has left the server.')));
      const footer = cfg.embed?.footer ? esc(applyVars(cfg.embed.footer)) : '';
      msgContent = `<div class="dc-embed" style="border-left-color:${color}"><div class="dc-embed-title">${title}</div>${desc ? `<div class="dc-embed-desc">${desc}</div>` : ''}${footer ? `<div class="dc-embed-footer">${footer}</div>` : ''}</div>`;
    } else {
      const raw = applyVars(cfg.message || (isW ? 'Welcome @Alex to **My Server**!' : '**Alex#0001** has left the server.'));
      msgContent = `<div class="dc-text">${esc(raw)}</div>`;
    }
    return `<div class="welcome-preview-label">${label}</div><div style="font-size:.72rem;color:#b5bac1;margin-bottom:.7rem">Posts in: ${chLabel}</div><div class="dc-msg"><div class="dc-avatar">F</div><div class="dc-msg-content"><div class="dc-msg-header"><span class="dc-msg-name">FlynnBot</span><span class="dc-msg-bot-badge">APP</span><span class="dc-msg-time">${now}</span></div>${msgContent}</div></div>`;
  }

  function refreshWelcomePreview(type) {
    const mockEl = document.getElementById(type === 'welcome' ? 'welcome-preview-mock' : 'goodbye-preview-mock');
    if (!mockEl) return;
    const v = (id) => document.getElementById(id);
    const val = (id, def = '') => v(id)?.value ?? def;
    const chk = (id) => v(id)?.checked ?? false;
    const cfg = type === 'welcome' ? {
      enabled: chk('welcome-enabled'),
      channelId: val('welcome-channel') || null,
      embedEnabled: chk('welcome-embed-toggle'),
      message: val('welcome-message'),
      embed: { color: val('welcome-embed-color', '#5865f2'), title: val('welcome-embed-title'), description: val('welcome-embed-desc'), footer: val('welcome-embed-footer') },
    } : {
      enabled: chk('goodbye-enabled'),
      channelId: val('goodbye-channel') || null,
      embedEnabled: chk('goodbye-embed-toggle'),
      message: val('goodbye-message'),
      embed: { color: val('goodbye-embed-color', '#ef4444'), title: val('goodbye-embed-title'), description: val('goodbye-embed-desc'), footer: val('goodbye-embed-footer') },
    };
    mockEl.innerHTML = buildWelcomePreview(cfg, type);
  }

  async function sendWelcomeTest(type, btn) {
    const pfx = type === 'welcome' ? 'welcome' : 'goodbye';
    const channelId = document.getElementById(`${pfx}-test-channel`)?.value;
    const statusEl = document.getElementById(`${pfx}-test-status`);
    if (!channelId) {
      if (statusEl) { statusEl.className = 'welcome-test-status error'; statusEl.textContent = 'Select a channel first'; }
      return;
    }
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch(`/api/guild/${_guildId}/welcome/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, channelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      if (statusEl) { statusEl.className = 'welcome-test-status success'; statusEl.textContent = data.message || 'Queued — message will appear in Discord within 30 s.'; }
    } catch (err) {
      if (statusEl) { statusEl.className = 'welcome-test-status error'; statusEl.textContent = err.message || 'Send failed'; }
    } finally {
      btn.innerHTML = origHTML;
      btn.disabled = false;
    }
  }

  function buildHTML() {
    const w = _config.welcome || {};
    const g = _config.goodbye || {};
    const ar = _config.antiRaid || {};
    const vr = _config.verification || {};
    const roleOptions = _roles.filter((r) => r.id !== _guildId)
      .map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');

    return `
      <div class="welcome-tabs">
        <button class="welcome-tab ${_activeTab === 'welcome' ? 'active' : ''}" data-tab="welcome">Welcome</button>
        <button class="welcome-tab ${_activeTab === 'goodbye' ? 'active' : ''}" data-tab="goodbye">Goodbye</button>
        <button class="welcome-tab ${_activeTab === 'antiraid' ? 'active' : ''}" data-tab="antiraid">Anti-Raid</button>
        <button class="welcome-tab ${_activeTab === 'verification' ? 'active' : ''}" data-tab="verification">Verification</button>
      </div>

      <!-- WELCOME PANE -->
      <div class="welcome-pane ${_activeTab === 'welcome' ? 'active' : ''}" id="welcome-pane-welcome">
        <div class="welcome-pane-grid">
        <div>
        <div class="welcome-card">
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Enable welcome messages</div>
              <div class="welcome-row-hint">Post a message when new members join the server</div>
            </div>
            ${toggle('welcome-enabled', w.enabled)}
          </div>

          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Welcome channel</div>
            </div>
            <div class="welcome-row-control">
              <select id="welcome-channel">${channelOptions(w.channelId)}</select>
            </div>
          </div>

          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Use embed</div>
              <div class="welcome-row-hint">Send message as a rich embed instead of plain text</div>
            </div>
            ${toggle('welcome-embed-toggle', w.embedEnabled)}
          </div>
        </div>

        <!-- Plain message -->
        <div class="welcome-card" id="welcome-plain-section" ${w.embedEnabled ? 'style="display:none"' : ''}>
          <div class="welcome-row-label" style="margin-bottom:.5rem">Welcome message</div>
          <textarea class="welcome-textarea" id="welcome-message" rows="3">${esc(w.message || 'Welcome {user} to **{server}**!')}</textarea>
          <div class="welcome-vars">${varChips(VARS)}</div>
        </div>

        <!-- Embed message -->
        <div class="welcome-card" id="welcome-embed-section" ${!w.embedEnabled ? 'style="display:none"' : ''}>
          <div class="welcome-row">
            <div class="welcome-row-info"><div class="welcome-row-label">Embed color</div></div>
            <div class="welcome-row-control"><input type="color" id="welcome-embed-color" value="${esc(w.embed?.color || '#5865f2')}" /></div>
          </div>
          <div class="welcome-row">
            <div class="welcome-row-info"><div class="welcome-row-label">Embed title</div></div>
            <div class="welcome-row-control"><input type="text" id="welcome-embed-title" value="${esc(w.embed?.title || 'Welcome to {server}!')}" maxlength="256" /></div>
          </div>
          <div class="welcome-row-label" style="margin-bottom:.5rem">Description</div>
          <textarea class="welcome-textarea" id="welcome-embed-desc" rows="3">${esc(w.embed?.description || 'Hey {user}! You are member #{count}.')}</textarea>
          <div class="welcome-vars">${varChips(VARS)}</div>
          <div class="welcome-row" style="margin-top:.5rem">
            <div class="welcome-row-info"><div class="welcome-row-label">Footer text</div></div>
            <div class="welcome-row-control"><input type="text" id="welcome-embed-footer" value="${esc(w.embed?.footer || '')}" maxlength="2048" /></div>
          </div>
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Show user avatar as thumbnail</div>
            </div>
            ${toggle('welcome-embed-thumbnail', w.embed?.thumbnail !== false)}
          </div>
        </div>

        <!-- DM on join -->
        <div class="welcome-card">
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Send DM on join</div>
              <div class="welcome-row-hint">Direct message the user when they join</div>
            </div>
            ${toggle('welcome-dm-enabled', w.dmEnabled)}
          </div>
          <div id="welcome-dm-section" ${!w.dmEnabled ? 'style="display:none"' : ''}>
            <div class="welcome-row-label" style="margin:.5rem 0">DM message</div>
            <textarea class="welcome-textarea" id="welcome-dm-message" rows="3">${esc(w.dmMessage || 'Welcome to **{server}**!')}</textarea>
            <div class="welcome-vars">${varChips(['{server}', '{tag}', '{username}'])}</div>
          </div>
        </div>

        <!-- Auto-roles -->
        <div class="welcome-card">
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Auto-roles on join</div>
              <div class="welcome-row-hint">Automatically assign these roles when someone joins</div>
            </div>
          </div>
          <div class="welcome-role-list" id="welcome-auto-roles">
            ${roleChips(w.autoRoles)}
          </div>
          <div style="margin-top:.5rem">
            <select id="welcome-role-add" style="padding:.4rem .6rem;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.82rem">
              <option value="">— Add role —</option>
              ${_roles.filter((r) => r.id !== _guildId).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Account age check -->
        <div class="welcome-card">
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Account age check</div>
              <div class="welcome-row-hint">Warn staff when very new Discord accounts join</div>
            </div>
            ${toggle('welcome-agecheck-enabled', w.accountAgeCheck?.enabled)}
          </div>
          <div id="welcome-agecheck-section" ${!w.accountAgeCheck?.enabled ? 'style="display:none"' : ''}>
            <div class="welcome-row" style="margin-top:.75rem">
              <div class="welcome-row-info"><div class="welcome-row-label">Minimum account age (days)</div></div>
              <div class="welcome-row-control"><input type="number" id="welcome-agecheck-days" min="1" max="365" value="${w.accountAgeCheck?.minDays || 7}" /></div>
            </div>
            <div class="welcome-row">
              <div class="welcome-row-info"><div class="welcome-row-label">Warning channel</div></div>
              <div class="welcome-row-control"><select id="welcome-agecheck-channel">${channelOptions(w.accountAgeCheck?.warnChannelId)}</select></div>
            </div>
          </div>
        </div>
        </div><!-- /form column -->
        <div class="welcome-dc-preview">
          <div id="welcome-preview-mock">${buildWelcomePreview(w, 'welcome')}</div>
          <div style="margin-top:1rem;border-top:1px solid #3a3c43;padding-top:.75rem">
            <div class="welcome-preview-label" style="margin-bottom:.5rem">Test message</div>
            <div class="welcome-test-row">
              <select id="welcome-test-channel">${channelOptions(w.channelId)}</select>
              <button class="btn btn-sm btn-outline" id="welcome-test-send" data-type="welcome">Send test</button>
            </div>
            <div class="welcome-test-status" id="welcome-test-status"></div>
          </div>
        </div>
        </div><!-- /welcome-pane-grid -->
      </div>

      <!-- GOODBYE PANE -->
      <div class="welcome-pane ${_activeTab === 'goodbye' ? 'active' : ''}" id="welcome-pane-goodbye">
        <div class="welcome-pane-grid">
        <div>
        <div class="welcome-card">
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Enable goodbye messages</div>
              <div class="welcome-row-hint">Post a message when a member leaves or is removed</div>
            </div>
            ${toggle('goodbye-enabled', g.enabled)}
          </div>
          <div class="welcome-row">
            <div class="welcome-row-info"><div class="welcome-row-label">Goodbye channel</div></div>
            <div class="welcome-row-control"><select id="goodbye-channel">${channelOptions(g.channelId)}</select></div>
          </div>
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Use embed</div>
            </div>
            ${toggle('goodbye-embed-toggle', g.embedEnabled)}
          </div>
        </div>

        <div class="welcome-card" id="goodbye-plain-section" ${g.embedEnabled ? 'style="display:none"' : ''}>
          <div class="welcome-row-label" style="margin-bottom:.5rem">Goodbye message</div>
          <textarea class="welcome-textarea" id="goodbye-message" rows="3">${esc(g.message || '**{tag}** has left the server.')}</textarea>
          <div class="welcome-vars">${varChips(VARS_GOODBYE)}</div>
        </div>

        <div class="welcome-card" id="goodbye-embed-section" ${!g.embedEnabled ? 'style="display:none"' : ''}>
          <div class="welcome-row">
            <div class="welcome-row-info"><div class="welcome-row-label">Embed color</div></div>
            <div class="welcome-row-control"><input type="color" id="goodbye-embed-color" value="${esc(g.embed?.color || '#ef4444')}" /></div>
          </div>
          <div class="welcome-row">
            <div class="welcome-row-info"><div class="welcome-row-label">Embed title</div></div>
            <div class="welcome-row-control"><input type="text" id="goodbye-embed-title" value="${esc(g.embed?.title || '{tag} left')}" maxlength="256" /></div>
          </div>
          <div class="welcome-row-label" style="margin-bottom:.5rem">Description</div>
          <textarea class="welcome-textarea" id="goodbye-embed-desc" rows="3">${esc(g.embed?.description || '**{tag}** has left the server.')}</textarea>
          <div class="welcome-vars">${varChips(VARS_GOODBYE)}</div>
          <div class="welcome-row" style="margin-top:.5rem">
            <div class="welcome-row-info"><div class="welcome-row-label">Footer text</div></div>
            <div class="welcome-row-control"><input type="text" id="goodbye-embed-footer" value="${esc(g.embed?.footer || '')}" maxlength="2048" /></div>
          </div>
          <div class="welcome-row">
            <div class="welcome-row-info">
              <div class="welcome-row-label">Show user avatar as thumbnail</div>
            </div>
            ${toggle('goodbye-embed-thumbnail', g.embed?.thumbnail !== false)}
          </div>
        </div>
        </div><!-- /form column -->
        <div class="welcome-dc-preview">
          <div id="goodbye-preview-mock">${buildWelcomePreview(g, 'goodbye')}</div>
          <div style="margin-top:1rem;border-top:1px solid #3a3c43;padding-top:.75rem">
            <div class="welcome-preview-label" style="margin-bottom:.5rem">Test message</div>
            <div class="welcome-test-row">
              <select id="goodbye-test-channel">${channelOptions(g.channelId)}</select>
              <button class="btn btn-sm btn-outline" id="goodbye-test-send" data-type="goodbye">Send test</button>
            </div>
            <div class="welcome-test-status" id="goodbye-test-status"></div>
          </div>
        </div>
        </div><!-- /goodbye-pane-grid -->
      </div>

      <!-- ANTI-RAID PANE -->
      <div class="welcome-pane ${_activeTab === 'antiraid' ? 'active' : ''}" id="welcome-pane-antiraid">
        <div class="welcome-pane-single">

          <div class="welcome-card">
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Enable Anti-Raid</div>
                <div class="welcome-row-hint">Automatically detect and respond to raid attempts</div>
              </div>
              ${toggle('ar-enabled', ar.enabled)}
            </div>
          </div>

          <div class="welcome-card">
            <div class="welcome-row-label" style="margin-bottom:.75rem;font-size:.8rem;color:var(--text-2)">JOIN RATE DETECTION</div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Max joins per minute</div>
                <div class="welcome-row-hint">Trigger lockdown when this many users join within 60 seconds</div>
              </div>
              <div class="welcome-row-control"><input type="number" id="ar-max-joins" min="2" max="100" value="${ar.maxJoinsPerMinute || 10}" /></div>
            </div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Minimum account age (days)</div>
                <div class="welcome-row-hint">Auto-kick accounts newer than this during a raid</div>
              </div>
              <div class="welcome-row-control"><input type="number" id="ar-min-age" min="0" max="365" value="${ar.minAccountAgeDays ?? 7}" /></div>
            </div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Action on new joins during raid</div>
              </div>
              <div class="welcome-row-control">
                <select id="ar-action">
                  <option value="kick" ${ar.action === 'kick' ? 'selected' : ''}>Kick</option>
                  <option value="ban" ${ar.action === 'ban' ? 'selected' : ''}>Ban</option>
                  <option value="restrict" ${(!ar.action || ar.action === 'restrict') ? 'selected' : ''}>Restrict (remove roles)</option>
                </select>
              </div>
            </div>
          </div>

          <div class="welcome-card">
            <div class="welcome-row-label" style="margin-bottom:.75rem;font-size:.8rem;color:var(--text-2)">LOCKDOWN</div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Auto-unlock after (minutes)</div>
                <div class="welcome-row-hint">0 = stay locked until manually unlocked</div>
              </div>
              <div class="welcome-row-control"><input type="number" id="ar-auto-unlock" min="0" max="1440" value="${ar.autoUnlockMinutes ?? 30}" /></div>
            </div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Alert channel</div>
                <div class="welcome-row-hint">Notify staff when a raid is detected</div>
              </div>
              <div class="welcome-row-control"><select id="ar-alert-channel">${channelOptions(ar.alertChannelId)}</select></div>
            </div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">DM alert to server owner</div>
              </div>
              ${toggle('ar-dm-owner', ar.dmOwner !== false)}
            </div>
          </div>

        </div>
      </div>

      <!-- VERIFICATION PANE -->
      <div class="welcome-pane ${_activeTab === 'verification' ? 'active' : ''}" id="welcome-pane-verification">
        <div class="welcome-pane-single">

          <div class="welcome-card">
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Enable Verification</div>
                <div class="welcome-row-hint">Require new members to verify before accessing the server</div>
              </div>
              ${toggle('vr-enabled', vr.enabled)}
            </div>
            <div class="welcome-row" style="margin-top:.5rem">
              <div class="welcome-row-info"><div class="welcome-row-label">Verification type</div></div>
              <div class="welcome-row-control">
                <select id="vr-type">
                  <option value="button" ${(!vr.type || vr.type === 'button') ? 'selected' : ''}>Button click</option>
                  <option value="reaction" ${vr.type === 'reaction' ? 'selected' : ''}>Reaction</option>
                </select>
              </div>
            </div>
          </div>

          <div class="welcome-card">
            <div class="welcome-row-label" style="margin-bottom:.75rem;font-size:.8rem;color:var(--text-2)">ROLES</div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Unverified role</div>
                <div class="welcome-row-hint">Assigned on join — removed after verification</div>
              </div>
              <div class="welcome-row-control">
                <select id="vr-unverified-role">
                  <option value="">None</option>
                  ${roleOptions}
                </select>
              </div>
            </div>
            <div class="welcome-row">
              <div class="welcome-row-info">
                <div class="welcome-row-label">Verified role</div>
                <div class="welcome-row-hint">Assigned after user verifies</div>
              </div>
              <div class="welcome-row-control">
                <select id="vr-verified-role">
                  <option value="">None</option>
                  ${roleOptions}
                </select>
              </div>
            </div>
          </div>

          <div class="welcome-card">
            <div class="welcome-row-label" style="margin-bottom:.75rem;font-size:.8rem;color:var(--text-2)">VERIFICATION MESSAGE</div>
            <div class="welcome-row">
              <div class="welcome-row-info"><div class="welcome-row-label">Verification channel</div></div>
              <div class="welcome-row-control"><select id="vr-channel">${channelOptions(vr.channelId)}</select></div>
            </div>
            <div style="margin-top:.75rem">
              <div class="welcome-row-label" style="margin-bottom:.4rem">Button / reaction label</div>
              <input type="text" id="vr-button-label" class="welcome-input" maxlength="80"
                value="${esc(vr.buttonLabel || '✅  I agree to the rules')}" placeholder="Button label or emoji for reaction" />
            </div>
            <div style="margin-top:.75rem">
              <div class="welcome-row-label" style="margin-bottom:.4rem">Verification message text</div>
              <textarea class="welcome-textarea" id="vr-message" rows="3" maxlength="2000">${esc(vr.message || 'Welcome! Please click the button below to verify and gain access to the server.')}</textarea>
            </div>
          </div>

        </div>
      </div>`;
  }

  function attachEvents(root) {
    // Tab switching
    root.querySelectorAll('.welcome-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.tab;
        root.querySelectorAll('.welcome-tab').forEach((b) => b.classList.toggle('active', b === btn));
        root.querySelectorAll('.welcome-pane').forEach((p) => p.classList.toggle('active', p.id === `welcome-pane-${_activeTab}`));
      });
    });

    // Embed toggle — welcome
    root.querySelector('#welcome-embed-toggle')?.addEventListener('change', (e) => {
      document.getElementById('welcome-plain-section').style.display = e.target.checked ? 'none' : '';
      document.getElementById('welcome-embed-section').style.display = e.target.checked ? '' : 'none';
      window.SaveBar?.markDirty();
    });

    // Embed toggle — goodbye
    root.querySelector('#goodbye-embed-toggle')?.addEventListener('change', (e) => {
      document.getElementById('goodbye-plain-section').style.display = e.target.checked ? 'none' : '';
      document.getElementById('goodbye-embed-section').style.display = e.target.checked ? '' : 'none';
      window.SaveBar?.markDirty();
    });

    // DM toggle
    root.querySelector('#welcome-dm-enabled')?.addEventListener('change', (e) => {
      document.getElementById('welcome-dm-section').style.display = e.target.checked ? '' : 'none';
      window.SaveBar?.markDirty();
    });

    // Age check toggle
    root.querySelector('#welcome-agecheck-enabled')?.addEventListener('change', (e) => {
      document.getElementById('welcome-agecheck-section').style.display = e.target.checked ? '' : 'none';
      window.SaveBar?.markDirty();
    });

    // Variable chips (insert into focused textarea + refresh preview)
    root.addEventListener('click', (e) => {
      const chip = e.target.closest('.welcome-var-chip');
      const testBtn = e.target.closest('#welcome-test-send, #goodbye-test-send');
      if (testBtn) {
        sendWelcomeTest(testBtn.dataset.type, testBtn);
        return;
      }
      if (!chip) return;
      const active = document.activeElement;
      if (active && active.tagName === 'TEXTAREA') {
        const start = active.selectionStart;
        const end = active.selectionEnd;
        active.value = active.value.slice(0, start) + chip.dataset.var + active.value.slice(end);
        active.selectionStart = active.selectionEnd = start + chip.dataset.var.length;
        active.focus();
        refreshWelcomePreview(_activeTab);
        window.SaveBar?.markDirty();
      }
    });

    // Auto-role add
    root.querySelector('#welcome-role-add')?.addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) return;
      e.target.value = '';
      if (!_config.welcome) _config.welcome = {};
      if (!_config.welcome.autoRoles) _config.welcome.autoRoles = [];
      if (_config.welcome.autoRoles.includes(id)) return;
      _config.welcome.autoRoles.push(id);

      const list = document.getElementById('welcome-auto-roles');
      if (list) {
        const role = _roles.find((r) => r.id === id);
        const span = document.createElement('span');
        span.className = 'welcome-role-chip';
        span.innerHTML = `${esc(role?.name || id)}<button class="welcome-role-chip-remove" data-role-id="${id}" title="Remove">×</button>`;
        list.appendChild(span);
      }
      window.SaveBar?.markDirty();
    });

    // Auto-role remove (delegated)
    root.querySelector('#welcome-auto-roles')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.welcome-role-chip-remove');
      if (!btn) return;
      const id = btn.dataset.roleId;
      if (_config.welcome?.autoRoles) {
        _config.welcome.autoRoles = _config.welcome.autoRoles.filter((r) => r !== id);
      }
      btn.closest('.welcome-role-chip')?.remove();
      window.SaveBar?.markDirty();
    });

    // Generic changes + live preview
    root.addEventListener('change', () => {
      refreshWelcomePreview(_activeTab);
      window.SaveBar?.markDirty();
    });
    root.addEventListener('input', () => {
      refreshWelcomePreview(_activeTab);
      window.SaveBar?.markDirty();
    });
  }

  function v(id) { return document.getElementById(id); }
  function val(id, def = '') { return v(id)?.value ?? def; }
  function checked(id) { return v(id)?.checked ?? false; }

  function collect() {
    return {
      welcome: {
        enabled: checked('welcome-enabled'),
        channelId: val('welcome-channel') || null,
        message: val('welcome-message'),
        embedEnabled: checked('welcome-embed-toggle'),
        embed: {
          color: val('welcome-embed-color', '#5865f2'),
          title: val('welcome-embed-title'),
          description: val('welcome-embed-desc'),
          footer: val('welcome-embed-footer'),
          thumbnail: checked('welcome-embed-thumbnail'),
        },
        dmEnabled: checked('welcome-dm-enabled'),
        dmMessage: val('welcome-dm-message'),
        autoRoles: _config.welcome?.autoRoles || [],
        accountAgeCheck: {
          enabled: checked('welcome-agecheck-enabled'),
          minDays: parseInt(val('welcome-agecheck-days', '7'), 10) || 7,
          warnChannelId: val('welcome-agecheck-channel') || null,
        },
      },
      goodbye: {
        enabled: checked('goodbye-enabled'),
        channelId: val('goodbye-channel') || null,
        message: val('goodbye-message'),
        embedEnabled: checked('goodbye-embed-toggle'),
        embed: {
          color: val('goodbye-embed-color', '#ef4444'),
          title: val('goodbye-embed-title'),
          description: val('goodbye-embed-desc'),
          footer: val('goodbye-embed-footer'),
          thumbnail: checked('goodbye-embed-thumbnail'),
        },
      },
      antiRaid: {
        enabled: checked('ar-enabled'),
        maxJoinsPerMinute: parseInt(val('ar-max-joins', '10'), 10) || 10,
        minAccountAgeDays: parseInt(val('ar-min-age', '7'), 10) || 0,
        action: val('ar-action', 'restrict'),
        autoUnlockMinutes: parseInt(val('ar-auto-unlock', '30'), 10) || 0,
        alertChannelId: val('ar-alert-channel') || null,
        dmOwner: checked('ar-dm-owner'),
      },
      verification: {
        enabled: checked('vr-enabled'),
        type: val('vr-type', 'button'),
        channelId: val('vr-channel') || null,
        unverifiedRoleId: val('vr-unverified-role') || null,
        verifiedRoleId: val('vr-verified-role') || null,
        buttonLabel: val('vr-button-label'),
        message: val('vr-message'),
      },
    };
  }

  async function save() {
    const body = collect();
    const res = await fetch(`/api/guild/${_guildId}/welcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to save Welcome config');
    _config = body;
  }

  function reset() {
    _loaded = false;
    load();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const pd = document.getElementById('pageData');
  if (pd?.dataset.guildId) init(pd.dataset.guildId);

  window.WelcomeModule = { init, load, save, reset };
})();
