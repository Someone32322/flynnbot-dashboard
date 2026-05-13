/**
 * AutoMod dashboard module.
 * Loaded on all server dashboard pages.
 */
(function () {
  'use strict';

  let _guildId = null;
  let _config = {};
  let _channels = [];
  let _roles = [];
  let _loaded = false;

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function init(guildId) {
    _guildId = guildId;
    document.addEventListener('sectionActivated', (e) => {
      if (e.detail?.section === 'automod') {
        if (!_loaded) load();
        window.SaveBar?.setHandlers(save, reset);
      }
    });
    // If section already visible on init (e.g. hash)
    const sec = document.getElementById('section-automod');
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
        fetch(`/api/guild/${_guildId}/automod`).then((r) => r.json()),
        fetch(`/api/guild/${_guildId}/channels`).then((r) => r.json()).catch(() => []),
        fetch(`/api/guild/${_guildId}/roles`).then((r) => r.json()).catch(() => []),
      ]);
      _config = cfg || {};
      _channels = Array.isArray(channelData) ? channelData : [];
      _roles = Array.isArray(roleData) ? roleData : [];
      render();
    } catch (err) {
      console.error('[AutoMod] load error', err);
      const container = document.getElementById('automod-loading');
      if (container) container.textContent = 'Failed to load AutoMod config.';
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const root = document.getElementById('automod-root');
    if (!root) return;
    root.innerHTML = buildHTML();
    root.style.display = '';
    const loading = document.getElementById('automod-loading');
    if (loading) loading.style.display = 'none';
    attachEvents(root);
  }

  function buildChannelOptions(selectedId) {
    const none = '<option value="">Not set</option>';
    return none + _channels
      .filter((c) => c.type === 0)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>#${escHtml(c.name)}</option>`)
      .join('');
  }

  function buildRoleOptions(selectedIds) {
    return _roles
      .filter((r) => r.id !== _guildId)
      .map((r) => `<option value="${r.id}" ${(selectedIds || []).includes(r.id) ? 'selected' : ''}>${escHtml(r.name)}</option>`)
      .join('');
  }

  function actionOptions(selected) {
    const opts = [
      ['block', 'Block message'],
      ['block_alert', 'Block + alert channel'],
      ['block_timeout', 'Block + timeout user'],
    ];
    return opts.map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');
  }

  function botActionOptions(selected) {
    const opts = [
      ['delete', 'Delete message'],
      ['warn', 'Delete + warn'],
      ['mute', 'Delete + mute (5 min)'],
    ];
    return opts.map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');
  }

  function ruleToggle(id, checked) {
    return `<label class="toggle-switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="toggle-slider"></span></label>`;
  }

  function buildKeywordTags(keywords) {
    return (keywords || [])
      .map((kw) => `<span class="automod-tag">${escHtml(kw)}<button class="automod-tag-remove" data-kw="${escAttr(kw)}" title="Remove">×</button></span>`)
      .join('');
  }

  function buildHTML() {
    const c = _config;
    const dr = c.discordRules || {};
    const br = c.botRules || {};

    return `
      <!-- Master toggle -->
      <div class="automod-master-toggle">
        <div>
          <div class="automod-master-label">AutoMod</div>
          <div class="automod-master-sub">Enable or disable all AutoMod rules for this server.</div>
        </div>
        ${ruleToggle('automod-enabled', c.enabled)}
      </div>

      <div class="automod-groups" id="automod-groups" ${!c.enabled ? 'style="opacity:.5;pointer-events:none"' : ''}>

        <!-- Alert channel / exempt config -->
        <div class="automod-group">
          <div class="automod-group-header">
            <div class="automod-group-title">General Settings</div>
          </div>
          <div class="automod-group-body">
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Alert channel</div>
                <div class="automod-rule-hint">Where to send AutoMod violation notifications</div>
              </div>
              <div class="automod-detail-control" style="min-width:200px">
                <select id="automod-alert-channel">${buildChannelOptions(c.alertChannelId)}</select>
              </div>
            </div>
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Exempt roles</div>
                <div class="automod-rule-hint">Users with these roles bypass all AutoMod rules</div>
              </div>
              <div class="automod-detail-control" style="min-width:200px">
                <select id="automod-exempt-roles" multiple style="min-height:80px">${buildRoleOptions(c.exemptRoles)}</select>
              </div>
            </div>
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Exempt channels</div>
                <div class="automod-rule-hint">AutoMod is disabled in these channels</div>
              </div>
              <div class="automod-detail-control" style="min-width:200px">
                <select id="automod-exempt-channels" multiple style="min-height:80px">
                  ${_channels.filter((c) => c.type === 0).map((ch) =>
    `<option value="${ch.id}" ${(c.exemptChannels || []).includes(ch.id) ? 'selected' : ''}>#${escHtml(ch.name)}</option>`
  ).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Discord native AutoMod rules -->
        <div class="automod-group">
          <div class="automod-group-header">
            <div class="automod-group-title">Discord AutoMod Rules</div>
            <span class="automod-group-badge">Discord Native</span>
          </div>
          <div class="automod-group-body">

            <!-- Keyword filter -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Keyword filter</div>
                <div class="automod-rule-hint">Block messages containing specific words or patterns</div>
              </div>
              ${ruleToggle('automod-keyword-enabled', dr.keyword?.enabled)}
            </div>
            <div class="automod-rule-detail ${dr.keyword?.enabled ? 'open' : ''}" id="automod-keyword-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Blocked words</span>
                <div class="automod-detail-control" style="flex:1">
                  <div class="automod-tags-wrap" id="automod-keyword-tags">
                    ${buildKeywordTags(dr.keyword?.keywords)}
                    <input class="automod-tag-input" id="automod-keyword-input" placeholder="Add word, press Enter…" />
                  </div>
                </div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-keyword-action">${actionOptions(dr.keyword?.action)}</select></div>
              </div>
              <div class="automod-detail-row" id="automod-keyword-timeout-row" style="${dr.keyword?.action === 'block_timeout' ? '' : 'display:none'}">
                <span class="automod-detail-label">Timeout (seconds)</span>
                <div class="automod-detail-control"><input type="number" id="automod-keyword-timeout" min="1" max="2419200" value="${dr.keyword?.timeoutSeconds || 60}" /></div>
              </div>
            </div>

            <!-- Mention spam -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Mention spam</div>
                <div class="automod-rule-hint">Block messages with too many @mentions</div>
              </div>
              ${ruleToggle('automod-mention-enabled', dr.mentionSpam?.enabled)}
            </div>
            <div class="automod-rule-detail ${dr.mentionSpam?.enabled ? 'open' : ''}" id="automod-mention-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Mention limit</span>
                <div class="automod-detail-control"><input type="number" id="automod-mention-limit" min="1" max="50" value="${dr.mentionSpam?.mentionLimit || 5}" /></div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-mention-action">${actionOptions(dr.mentionSpam?.action)}</select></div>
              </div>
            </div>

            <!-- Anti-spam -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Anti-spam</div>
                <div class="automod-rule-hint">Detect and block spam patterns (Discord built-in)</div>
              </div>
              ${ruleToggle('automod-spam-enabled', dr.spam?.enabled)}
            </div>
            <div class="automod-rule-detail ${dr.spam?.enabled ? 'open' : ''}" id="automod-spam-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-spam-action">${actionOptions(dr.spam?.action)}</select></div>
              </div>
            </div>

            <!-- Profanity presets -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Profanity filter</div>
                <div class="automod-rule-hint">Use Discord's built-in profanity/slur/sexual content presets</div>
              </div>
              ${ruleToggle('automod-profanity-enabled', dr.profanity?.enabled)}
            </div>
            <div class="automod-rule-detail ${dr.profanity?.enabled ? 'open' : ''}" id="automod-profanity-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Presets</span>
                <div class="automod-detail-control">
                  <label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--text-2)">
                    <input type="checkbox" id="automod-profanity-PROFANITY" ${(dr.profanity?.presets || []).includes('PROFANITY') ? 'checked' : ''} /> Profanity
                  </label>
                  <label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--text-2);margin-top:.4rem">
                    <input type="checkbox" id="automod-profanity-SEXUAL_CONTENT" ${(dr.profanity?.presets || []).includes('SEXUAL_CONTENT') ? 'checked' : ''} /> Sexual content
                  </label>
                  <label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--text-2);margin-top:.4rem">
                    <input type="checkbox" id="automod-profanity-SLURS" ${(dr.profanity?.presets || []).includes('SLURS') ? 'checked' : ''} /> Slurs
                  </label>
                </div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-profanity-action">${actionOptions(dr.profanity?.action)}</select></div>
              </div>
            </div>

          </div>
        </div>

        <!-- Bot-side rules -->
        <div class="automod-group">
          <div class="automod-group-header">
            <div class="automod-group-title">Bot AutoMod Rules</div>
            <span class="automod-group-badge badge-bot">Bot-side</span>
          </div>
          <div class="automod-group-body">

            <!-- Caps filter -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Caps filter</div>
                <div class="automod-rule-hint">Delete messages that are mostly uppercase</div>
              </div>
              ${ruleToggle('automod-caps-enabled', br.capsFilter?.enabled)}
            </div>
            <div class="automod-rule-detail ${br.capsFilter?.enabled ? 'open' : ''}" id="automod-caps-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Minimum length</span>
                <div class="automod-detail-control"><input type="number" id="automod-caps-minlen" min="1" max="100" value="${br.capsFilter?.minLength || 10}" /></div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Caps threshold (%)</span>
                <div class="automod-detail-control"><input type="number" id="automod-caps-threshold" min="50" max="100" value="${br.capsFilter?.threshold || 70}" /></div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-caps-action">${botActionOptions(br.capsFilter?.action)}</select></div>
              </div>
            </div>

            <!-- Duplicate messages -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Duplicate messages</div>
                <div class="automod-rule-hint">Block users from sending the same message repeatedly</div>
              </div>
              ${ruleToggle('automod-dup-enabled', br.duplicateMessages?.enabled)}
            </div>
            <div class="automod-rule-detail ${br.duplicateMessages?.enabled ? 'open' : ''}" id="automod-dup-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Max duplicates</span>
                <div class="automod-detail-control"><input type="number" id="automod-dup-count" min="2" max="20" value="${br.duplicateMessages?.count || 5}" /></div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Within (seconds)</span>
                <div class="automod-detail-control"><input type="number" id="automod-dup-interval" min="5" max="120" value="${br.duplicateMessages?.intervalSeconds || 10}" /></div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-dup-action">${botActionOptions(br.duplicateMessages?.action)}</select></div>
              </div>
            </div>

            <!-- Mass emoji -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Mass emoji</div>
                <div class="automod-rule-hint">Limit excessive emoji use in a single message</div>
              </div>
              ${ruleToggle('automod-emoji-enabled', br.massEmoji?.enabled)}
            </div>
            <div class="automod-rule-detail ${br.massEmoji?.enabled ? 'open' : ''}" id="automod-emoji-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Emoji limit</span>
                <div class="automod-detail-control"><input type="number" id="automod-emoji-limit" min="1" max="50" value="${br.massEmoji?.limit || 10}" /></div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-emoji-action">${botActionOptions(br.massEmoji?.action)}</select></div>
              </div>
            </div>

            <!-- Zalgo -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Anti-zalgo</div>
                <div class="automod-rule-hint">Delete messages with excessive combining Unicode characters</div>
              </div>
              ${ruleToggle('automod-zalgo-enabled', br.zalgo?.enabled)}
            </div>
            <div class="automod-rule-detail ${br.zalgo?.enabled ? 'open' : ''}" id="automod-zalgo-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-zalgo-action">${botActionOptions(br.zalgo?.action)}</select></div>
              </div>
            </div>

            <!-- Invite links -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Invite links</div>
                <div class="automod-rule-hint">Block Discord invite links sent in this server</div>
              </div>
              ${ruleToggle('automod-invite-enabled', br.inviteLinks?.enabled)}
            </div>
            <div class="automod-rule-detail ${br.inviteLinks?.enabled ? 'open' : ''}" id="automod-invite-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Allow own server invites</span>
                <div class="automod-detail-control">
                  <label class="toggle-switch"><input type="checkbox" id="automod-invite-allowown" ${br.inviteLinks?.allowOwnServer !== false ? 'checked' : ''}><span class="toggle-slider"></span></label>
                </div>
              </div>
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control"><select id="automod-invite-action">${botActionOptions(br.inviteLinks?.action)}</select></div>
              </div>
            </div>

            <!-- Phishing -->
            <div class="automod-rule-row">
              <div class="automod-rule-info">
                <div class="automod-rule-label">Anti-phishing</div>
                <div class="automod-rule-hint">Instantly ban/kick users who post known phishing links</div>
              </div>
              ${ruleToggle('automod-phishing-enabled', br.phishing?.enabled)}
            </div>
            <div class="automod-rule-detail ${br.phishing?.enabled ? 'open' : ''}" id="automod-phishing-detail">
              <div class="automod-detail-row">
                <span class="automod-detail-label">Action</span>
                <div class="automod-detail-control">
                  <select id="automod-phishing-action">
                    <option value="delete" ${br.phishing?.action === 'delete' ? 'selected' : ''}>Delete only</option>
                    <option value="warn" ${br.phishing?.action === 'warn' ? 'selected' : ''}>Delete + warn</option>
                    <option value="kick" ${br.phishing?.action === 'kick' ? 'selected' : ''}>Delete + kick</option>
                    <option value="ban" ${(!br.phishing?.action || br.phishing?.action === 'ban') ? 'selected' : ''}>Delete + ban</option>
                  </select>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>`;
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  function attachEvents(root) {
    // Master toggle
    root.querySelector('#automod-enabled')?.addEventListener('change', (e) => {
      _config.enabled = e.target.checked;
      const groups = document.getElementById('automod-groups');
      if (groups) {
        groups.style.opacity = e.target.checked ? '' : '0.5';
        groups.style.pointerEvents = e.target.checked ? '' : 'none';
      }
      window.SaveBar?.markDirty();
    });

    // Rule toggles → show/hide detail panels
    const toggleMap = {
      'automod-keyword-enabled': 'automod-keyword-detail',
      'automod-mention-enabled': 'automod-mention-detail',
      'automod-spam-enabled': 'automod-spam-detail',
      'automod-profanity-enabled': 'automod-profanity-detail',
      'automod-caps-enabled': 'automod-caps-detail',
      'automod-dup-enabled': 'automod-dup-detail',
      'automod-emoji-enabled': 'automod-emoji-detail',
      'automod-zalgo-enabled': 'automod-zalgo-detail',
      'automod-invite-enabled': 'automod-invite-detail',
      'automod-phishing-enabled': 'automod-phishing-detail',
    };

    for (const [cbId, detailId] of Object.entries(toggleMap)) {
      root.querySelector(`#${cbId}`)?.addEventListener('change', (e) => {
        const detail = document.getElementById(detailId);
        if (detail) detail.classList.toggle('open', e.target.checked);
        window.SaveBar?.markDirty();
      });
    }

    // Keyword action → show/hide timeout row
    root.querySelector('#automod-keyword-action')?.addEventListener('change', (e) => {
      const row = document.getElementById('automod-keyword-timeout-row');
      if (row) row.style.display = e.target.value === 'block_timeout' ? '' : 'none';
      window.SaveBar?.markDirty();
    });

    // Keyword tags input
    root.querySelector('#automod-keyword-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim().toLowerCase();
        if (!val) return;
        if (!_config.discordRules) _config.discordRules = {};
        if (!_config.discordRules.keyword) _config.discordRules.keyword = {};
        if (!_config.discordRules.keyword.keywords) _config.discordRules.keyword.keywords = [];
        if (!_config.discordRules.keyword.keywords.includes(val)) {
          _config.discordRules.keyword.keywords.push(val);
          const tags = document.getElementById('automod-keyword-tags');
          if (tags) {
            const span = document.createElement('span');
            span.className = 'automod-tag';
            span.innerHTML = `${escHtml(val)}<button class="automod-tag-remove" data-kw="${escAttr(val)}" title="Remove">×</button>`;
            tags.insertBefore(span, e.target);
          }
          window.SaveBar?.markDirty();
        }
        e.target.value = '';
      }
    });

    // Keyword tag removal (delegated)
    root.querySelector('#automod-keyword-tags')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.automod-tag-remove');
      if (!btn) return;
      const kw = btn.dataset.kw;
      if (_config.discordRules?.keyword?.keywords) {
        _config.discordRules.keyword.keywords = _config.discordRules.keyword.keywords.filter((k) => k !== kw);
      }
      btn.closest('.automod-tag')?.remove();
      window.SaveBar?.markDirty();
    });

    // Generic change → markDirty
    root.addEventListener('change', () => window.SaveBar?.markDirty());
  }

  // ── Collect state for save ─────────────────────────────────────────────────
  function collect() {
    const v = (id) => document.getElementById(id);
    const checked = (id) => document.getElementById(id)?.checked ?? false;
    const num = (id, def) => parseInt(v(id)?.value || def, 10) || def;
    const sel = (id, def) => v(id)?.value || def;
    const multiSel = (id) => [...(v(id)?.selectedOptions || [])].map((o) => o.value);

    return {
      enabled: checked('automod-enabled'),
      alertChannelId: sel('automod-alert-channel', null) || null,
      exemptRoles: multiSel('automod-exempt-roles'),
      exemptChannels: multiSel('automod-exempt-channels'),
      discordRules: {
        keyword: {
          enabled: checked('automod-keyword-enabled'),
          keywords: _config.discordRules?.keyword?.keywords || [],
          regex: _config.discordRules?.keyword?.regex || [],
          action: sel('automod-keyword-action', 'block'),
          timeoutSeconds: num('automod-keyword-timeout', 60),
          discordRuleId: _config.discordRules?.keyword?.discordRuleId || null,
        },
        mentionSpam: {
          enabled: checked('automod-mention-enabled'),
          mentionLimit: num('automod-mention-limit', 5),
          action: sel('automod-mention-action', 'block'),
          discordRuleId: _config.discordRules?.mentionSpam?.discordRuleId || null,
        },
        spam: {
          enabled: checked('automod-spam-enabled'),
          action: sel('automod-spam-action', 'block'),
          discordRuleId: _config.discordRules?.spam?.discordRuleId || null,
        },
        profanity: {
          enabled: checked('automod-profanity-enabled'),
          presets: [
            checked('automod-profanity-PROFANITY') ? 'PROFANITY' : null,
            checked('automod-profanity-SEXUAL_CONTENT') ? 'SEXUAL_CONTENT' : null,
            checked('automod-profanity-SLURS') ? 'SLURS' : null,
          ].filter(Boolean),
          allowList: _config.discordRules?.profanity?.allowList || [],
          action: sel('automod-profanity-action', 'block'),
          discordRuleId: _config.discordRules?.profanity?.discordRuleId || null,
        },
      },
      botRules: {
        capsFilter: {
          enabled: checked('automod-caps-enabled'),
          minLength: num('automod-caps-minlen', 10),
          threshold: num('automod-caps-threshold', 70),
          action: sel('automod-caps-action', 'delete'),
        },
        duplicateMessages: {
          enabled: checked('automod-dup-enabled'),
          count: num('automod-dup-count', 5),
          intervalSeconds: num('automod-dup-interval', 10),
          action: sel('automod-dup-action', 'delete'),
        },
        massEmoji: {
          enabled: checked('automod-emoji-enabled'),
          limit: num('automod-emoji-limit', 10),
          action: sel('automod-emoji-action', 'delete'),
        },
        zalgo: {
          enabled: checked('automod-zalgo-enabled'),
          action: sel('automod-zalgo-action', 'delete'),
        },
        inviteLinks: {
          enabled: checked('automod-invite-enabled'),
          allowOwnServer: checked('automod-invite-allowown'),
          action: sel('automod-invite-action', 'delete'),
        },
        phishing: {
          enabled: checked('automod-phishing-enabled'),
          action: sel('automod-phishing-action', 'ban'),
        },
      },
    };
  }

  async function save() {
    const body = collect();
    const res = await fetch(`/api/guild/${_guildId}/automod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to save AutoMod config');
    _config = body;
  }

  function reset() {
    _loaded = false;
    load();
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escAttr(s) { return escHtml(s); }

  // ── Expose ────────────────────────────────────────────────────────────────
  const pd = document.getElementById('pageData');
  if (pd?.dataset.guildId) init(pd.dataset.guildId);

  window.AutoModModule = { init, load, save, reset };
})();
