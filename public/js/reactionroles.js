/**
 * reactionroles.js — Sapphire-style Reaction Roles dashboard
 * Step-by-step wizard: choose mode → link/channel → emoji → role → options → message editor
 */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────
  let GID = null;
  let allRR = [];
  let guildRoles = [];
  let guildChannels = [];
  let guildEmojis = [];
  let initialized = false;

  // Wizard state
  let wiz = null;

  function resetWiz() {
    return {
      mode: null,
      rrId: null,
      channelId: null,
      channelName: null,
      messageUrl: null,
      messageId: null,
      messageChannelId: null,
      pairs: [],
      options: { reversed: false, maxReactions: 0, listMode: 'whitelist', listedRoles: [] },
      embed: { content: '', title: 'React to this message to assign yourself roles', description: '${reactionroles}', color: '#0f52ba' },
      step: 0,
    };
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Boot ──────────────────────────────────────────────────────
  function initRR() {
    if (initialized) return;
    initialized = true;
    const pd = document.getElementById('pageData');
    GID = pd?.dataset?.guildId;
    if (!GID) return;
    loadAll();
    bindStaticUI();
  }

  function bindStaticUI() {
    document.getElementById('rrAddBtn')?.addEventListener('click', () => openWizard(null));
  }

  // ── Data loading ──────────────────────────────────────────────
  async function loadAll() {
    const list = document.getElementById('rrList');
    if (!list) return;
    list.innerHTML = '<div class="commands-loading"><div class="spinner"></div>Loading…</div>';
    try {
      const [rrR, rolesR, chR] = await Promise.allSettled([
        fetch(`/api/guild/${GID}/reaction-roles`),
        fetch(`/api/guild/${GID}/roles`),
        fetch(`/api/guild/${GID}/channels`),
      ]);
      allRR = (rrR.status === 'fulfilled' && rrR.value.ok) ? await rrR.value.json() : [];
      guildRoles = (rolesR.status === 'fulfilled' && rolesR.value.ok) ? await rolesR.value.json() : [];
      const chAll = (chR.status === 'fulfilled' && chR.value.ok) ? await chR.value.json() : [];
      guildChannels = chAll.filter(c => [0, 5].includes(c.type));
      renderList();
    } catch (e) {
      list.innerHTML = `<p class="error-text">Failed to load: ${esc(e.message)}</p>`;
    }
  }

  function renderList() {
    const list = document.getElementById('rrList');
    if (!list) return;
    const headerHtml = `
      <div class="rr-list-header">
        <span class="rr-count-badge">${allRR.length}/16 messages</span>
        <button class="btn btn-primary btn-sm" id="rrAddBtn2">+ Add message</button>
      </div>`;

    if (!allRR.length) {
      list.innerHTML = headerHtml + `
        <div class="rr-empty-box">
          <p>Allow users to assign themselves roles through message reactions.<br>
          <span style="opacity:.5;font-size:.8rem">No reaction role groups yet.</span></p>
        </div>`;
      document.getElementById('rrAddBtn2')?.addEventListener('click', () => openWizard(null));
      return;
    }

    list.innerHTML = headerHtml + `
      <div class="rr-messages-list">
        ${allRR.map(rr => renderRRCard(rr)).join('')}
      </div>`;

    document.getElementById('rrAddBtn2')?.addEventListener('click', () => openWizard(null));
    list.querySelectorAll('[data-rr-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const rr = allRR.find(r => String(r._id) === btn.dataset.rrOpen);
        if (rr) openWizard(rr);
      });
    });
    list.querySelectorAll('[data-rr-delete]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await window.showConfirm('Delete this reaction role group?', { title: 'Delete Group', confirmText: 'Delete' })) return;
        await fetch(`/api/guild/${GID}/reaction-roles/${btn.dataset.rrDelete}`, { method: 'DELETE' });
        loadAll();
      });
    });
  }

  function renderRRCard(rr) {
    const ch = guildChannels.find(c => c.id === (rr.channelId || rr.externalChannelId));
    const emojis = (rr.options || []).slice(0, 8).map(o =>
      `<span class="rr-emoji-chip">${esc(o.label || o.emoji || '?')}</span>`
    ).join('');
    const isLive = !!(rr.messageId || rr.externalMessageId);
    return `
      <div class="rr-msg-card" data-rr-open="${esc(rr._id)}" tabindex="0" role="button" aria-label="Edit reaction role group in #${esc(ch?.name || rr.channelId || 'unknown')}">
        <div class="rr-msg-card-left">
          <div class="rr-msg-channel"># ${esc(ch?.name || rr.channelId || 'unknown')}</div>
          <div class="rr-msg-emojis">${emojis || '<span class="rr-no-emojis">No emojis configured</span>'}</div>
        </div>
        <div class="rr-msg-card-right">
          ${isLive
            ? '<span class="rr-live-badge">● Live</span>'
            : '<span class="rr-draft-badge">○ Draft</span>'}
          <button class="btn btn-xs btn-danger rr-delete-btn" data-rr-delete="${esc(rr._id)}" title="Delete" aria-label="Delete this reaction role group">✕</button>
        </div>
      </div>`;
  }

  // ── Wizard ────────────────────────────────────────────────────
  function openWizard(existingRR) {
    wiz = resetWiz();
    if (existingRR) {
      wiz.rrId = existingRR._id;
      wiz.mode = existingRR.messageUrl ? 'existing' : 'new';
      wiz.channelId = existingRR.channelId || null;
      wiz.channelName = guildChannels.find(c => c.id === existingRR.channelId)?.name || null;
      wiz.messageUrl = existingRR.messageUrl || null;
      wiz.pairs = (existingRR.options || []).map(o => ({
        emoji: o.label,
        emojiDisplay: o.label,
        roleId: o.roleId,
        roleName: guildRoles.find(r => r.id === o.roleId)?.name || o.roleId,
        toggleRole: o.toggleRole !== false,
        action: o.action || 'role',
        content: o.content || '',
      }));
      wiz.options = {
        reversed: existingRR.reversed || false,
        maxReactions: existingRR.maxReactions || 0,
        listMode: existingRR.listMode || 'whitelist',
        listedRoles: existingRR.listedRoles || [],
      };
      wiz.embed = {
        content: existingRR.content || '',
        title: existingRR.embedTitle || 'React to this message to assign yourself roles',
        description: existingRR.embedDescription || '${reactionroles}',
        color: '#' + Math.abs(existingRR.embedColor || 0x0f52ba).toString(16).padStart(6, '0'),
      };
      showModal(buildWizardPairs());
    } else {
      showModal(buildWizardStep0());
    }
  }

  // ── Wizard step builders ─────────────────────────────────────

  function buildWizardStep0() {
    return `
      <div class="rr-wizard-header">
        <h3>New Reaction Roles</h3>
        <button class="modal-close" id="rrWizClose" aria-label="Close">✕</button>
      </div>
      <p class="rr-wiz-subtitle">Let&#39;s get started by selecting a message.</p>
      <p class="rr-wiz-hint">Did you already send a message to apply reaction roles on or<br>should FlynnBot create a new one for you?</p>
      <div class="rr-choice-grid">
        <button class="btn-rr-choice btn-rr-existing" id="rrChoiceExisting">
          <span class="rr-choice-icon">💬</span>
          <span class="rr-choice-label">Use existing<br>message</span>
        </button>
        <button class="btn-rr-choice btn-rr-new" id="rrChoiceNew">
          <span class="rr-choice-icon">✨</span>
          <span class="rr-choice-label">Create new<br>message</span>
        </button>
      </div>`;
  }

  function buildWizardStep1Existing() {
    return `
      <div class="rr-wizard-header">
        <button class="btn btn-ghost btn-sm" id="rrWizBack" aria-label="Back">←</button>
        <h3>New Reaction Roles</h3>
        <button class="modal-close" id="rrWizClose" aria-label="Close">✕</button>
      </div>
      <p class="rr-wiz-subtitle">Copy the message link of your message and paste it here.</p>
      <p class="rr-wiz-hint">Right click the message → <em>Copy Message Link</em></p>
      <div class="rr-link-input-wrap">
        <input type="text" id="rrMsgLink" class="ec-input" placeholder="https://discord.com/channels/..." value="${esc(wiz.messageUrl || '')}" aria-label="Discord message link" />
        <button class="btn btn-primary rr-link-confirm" id="rrMsgLinkConfirm" aria-label="Confirm link">→</button>
      </div>
      <p id="rrMsgLinkError" class="rr-error" style="display:none" role="alert"></p>`;
  }

  function buildWizardStep1New() {
    const chOptions = guildChannels.map(c =>
      `<div class="rr-channel-option${wiz.channelId === c.id ? ' selected' : ''}" data-ch-id="${esc(c.id)}" data-ch-name="${esc(c.name)}" tabindex="0" role="option" aria-selected="${wiz.channelId === c.id}"># ${esc(c.name)}</div>`
    ).join('');
    return `
      <div class="rr-wizard-header">
        <button class="btn btn-ghost btn-sm" id="rrWizBack" aria-label="Back">←</button>
        <h3>New Reaction Roles</h3>
        <button class="modal-close" id="rrWizClose" aria-label="Close">✕</button>
      </div>
      <p class="rr-wiz-subtitle">Select the channel to post the reaction role message in:</p>
      <div class="rr-channel-list" role="listbox" aria-label="Text channels">
        ${chOptions || '<p class="rr-empty-hint">No text channels available.</p>'}
      </div>
      <div class="rr-wiz-footer">
        <button class="btn btn-primary" id="rrChannelConfirm" ${!wiz.channelId ? 'disabled' : ''}>Continue →</button>
      </div>`;
  }

  function buildWizardPairs() {
    const chLabel = wiz.channelName || (wiz.messageUrl ? 'existing message' : '');
    return `
      <div class="rr-wizard-header">
        <button class="btn btn-ghost btn-sm" id="rrWizBack" aria-label="Back">←</button>
        <h3>${wiz.rrId ? 'Update' : 'New'} Reaction Roles</h3>
        <button class="modal-close" id="rrWizClose" aria-label="Close">✕</button>
      </div>
      ${chLabel ? `<div class="rr-channel-badge">in <span class="rr-ch-chip"># ${esc(chLabel)}</span></div>` : ''}
      <div class="rr-wizard-tabs" role="tablist">
        <button class="rr-tab active" data-tab="pairs" role="tab" aria-selected="true">Options</button>
        <button class="rr-tab" data-tab="edit-message" role="tab" aria-selected="false">Edit message</button>
      </div>
      <div id="rrTabPairs" class="rr-tab-panel" role="tabpanel">
        ${buildPairsUI()}
        <button class="btn btn-ghost btn-sm rr-add-pair" id="rrAddPairBtn">
          <span class="rr-plus">+</span> Add emoji
        </button>
      </div>
      <div id="rrTabEditMessage" class="rr-tab-panel" style="display:none" role="tabpanel">
        ${buildEditMessageUI()}
      </div>
      <div class="rr-wizard-footer">
        <button class="btn btn-ghost btn-sm" id="rrOptionsBtn">⚙ Options</button>
        <button class="btn btn-primary" id="rrWizSave">Save changes</button>
      </div>`;
  }

  function buildPairsUI() {
    if (!wiz.pairs.length) {
      return `<div class="rr-pairs-empty">
        <div class="rr-pair-placeholder">
          <div class="rr-pair-emoji-slot">?</div>
          <span class="rr-pair-no-role">+ No roles added</span>
        </div>
        <p class="rr-pair-hint">Click <strong>+</strong> to add an emoji → role mapping</p>
      </div>`;
    }
    return `<div class="rr-pairs-list">
      ${wiz.pairs.map((p, i) => `
        <div class="rr-pair-row" data-pair-idx="${i}">
          <div class="rr-pair-emoji-display">${esc(p.emojiDisplay || p.emoji || '?')}</div>
          <div class="rr-pair-role-name">${esc(p.roleName || p.roleId || 'No role')}</div>
          <button class="btn btn-xs btn-danger rr-pair-remove" data-remove-idx="${i}" title="Remove pair" aria-label="Remove pair ${i + 1}">✕</button>
        </div>`).join('')}
    </div>`;
  }

  function buildEditMessageUI() {
    return `
      <div class="rr-edit-msg-tabs" role="tablist">
        <button class="rr-sub-tab active" data-sub="visual" role="tab" aria-selected="true">Visual</button>
        <button class="rr-sub-tab" data-sub="raw" role="tab" aria-selected="false">Raw</button>
        <button class="rr-sub-tab" data-sub="preview" role="tab" aria-selected="false">Preview</button>
      </div>
      <div id="rrSubVisual" class="rr-sub-panel" role="tabpanel">${buildVisualEmbedEditor()}</div>
      <div id="rrSubRaw" class="rr-sub-panel" style="display:none" role="tabpanel">
        <textarea id="rrRawJson" class="ec-input" rows="10" style="width:100%;font-family:monospace;font-size:.8rem;resize:vertical" aria-label="Raw JSON editor"></textarea>
        <button class="btn btn-sm btn-secondary" id="rrRawApply" style="margin-top:.5rem">Apply JSON</button>
      </div>
      <div id="rrSubPreview" class="rr-sub-panel" style="display:none" role="tabpanel">
        <div class="rr-discord-preview" id="rrDiscordPreview">${buildDiscordPreview()}</div>
      </div>`;
  }

  function buildVisualEmbedEditor() {
    return `
      <div class="rr-bot-row">
        <div class="rr-bot-avatar" aria-hidden="true">🤖</div>
        <div class="rr-bot-tag"><strong>FlynnBot</strong> <span class="rr-app-badge">APP</span></div>
      </div>
      <input type="text" id="rrEmbedContent" class="ec-input rr-embed-field" placeholder="Message content (optional)" value="${esc(wiz.embed.content)}" style="margin-bottom:.5rem" />
      <div class="rr-embed-block">
        <div class="rr-embed-color-bar">
          <input type="color" id="rrEmbedColorInput" value="${esc(wiz.embed.color)}" title="Embed color" aria-label="Embed color" style="width:14px;height:100%;border:none;background:none;cursor:pointer;padding:0" />
        </div>
        <div class="rr-embed-fields">
          <input type="text" id="rrEmbedTitle" class="rr-embed-input" placeholder="Title" value="${esc(wiz.embed.title)}" aria-label="Embed title" />
          <textarea id="rrEmbedDesc" class="rr-embed-input" rows="3" placeholder="Description" aria-label="Embed description">${esc(wiz.embed.description)}</textarea>
          <div class="rr-embed-vars-hint">\${reactionroles}</div>
        </div>
      </div>
      <div class="rr-embed-actions">
        <button class="btn btn-xs btn-primary" id="rrEmbedLoad" title="Load saved template">Load</button>
        <button class="btn btn-xs btn-danger" id="rrEmbedClear" title="Clear embed">Clear</button>
      </div>`;
  }

  function buildDiscordPreview() {
    const color = wiz.embed.color || '#0f52ba';
    const title = wiz.embed.title || 'React to this message to assign yourself roles';
    const desc = wiz.embed.description || '${reactionroles}';
    const pairsHtml = (wiz.pairs || []).map(p =>
      `<div class="rr-preview-pair">${esc(p.emojiDisplay || p.emoji)} <span>@${esc(p.roleName || '?')}</span></div>`
    ).join('');
    return `
      <div class="rr-preview-msg">
        <div class="rr-preview-avatar" aria-hidden="true">🤖</div>
        <div class="rr-preview-body">
          <div class="rr-preview-username">FlynnBot <span class="rr-app-badge">APP</span></div>
          ${wiz.embed.content ? `<div class="rr-preview-content">${esc(wiz.embed.content)}</div>` : ''}
          <div class="rr-preview-embed" style="border-left:4px solid ${esc(color)}">
            ${title ? `<div class="rr-preview-embed-title">${esc(title)}</div>` : ''}
            ${desc ? `<div class="rr-preview-embed-desc">${esc(desc)}</div>` : ''}
            ${pairsHtml ? `<div class="rr-preview-pairs">${pairsHtml}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  function buildOptionsPanel() {
    const o = wiz.options;
    const rolesHtml = guildRoles.map(r =>
      `<div class="rr-listed-role-option${o.listedRoles.includes(r.id) ? ' selected' : ''}" data-role-id="${esc(r.id)}" data-role-name="${esc(r.name)}" tabindex="0" role="checkbox" aria-checked="${o.listedRoles.includes(r.id)}">
        <span class="rr-role-dot" style="background:${r.color ? '#' + r.color.toString(16).padStart(6,'0') : '#99aab5'}"></span>
        ${esc(r.name)}
      </div>`
    ).join('');
    return `
      <div class="rr-wizard-header">
        <button class="btn btn-ghost btn-sm" id="rrOptBack" aria-label="Back">←</button>
        <h3>${wiz.rrId ? 'Update' : 'New'} Reaction Roles — Options</h3>
        <button class="modal-close" id="rrWizClose" aria-label="Close">✕</button>
      </div>
      <div class="rr-opt-row">
        <div class="rr-opt-label-wrap">
          <span class="rr-opt-label">Reversed</span>
          <span class="rr-opt-hint" title="Adding a reaction removes the role; removing a reaction assigns the role">?</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="rrOptReversed" ${o.reversed ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="rr-opt-row">
        <div class="rr-opt-label-wrap">
          <span class="rr-opt-label">Maximum reactions per user</span>
          <span class="rr-opt-hint" title="0 = unlimited">?</span>
        </div>
        <input type="number" id="rrOptMaxReact" class="ec-input" value="${o.maxReactions}" min="0" max="25" style="width:64px;text-align:center" aria-label="Maximum reactions" />
      </div>
      <div class="rr-opt-row">
        <div class="rr-opt-label-wrap">
          <span class="rr-opt-label">List mode</span>
        </div>
        <select id="rrOptListMode" class="ec-input" data-cs data-cs-placeholder="None" style="max-width:140px" aria-label="List mode">
          <option value="whitelist"${o.listMode === 'whitelist' ? ' selected' : ''}>Whitelist</option>
          <option value="blacklist"${o.listMode === 'blacklist' ? ' selected' : ''}>Blacklist</option>
          <option value="none"${o.listMode === 'none' ? ' selected' : ''}>None</option>
        </select>
      </div>
      <div id="rrOptListedRolesWrap"${o.listMode === 'none' ? ' style="display:none"' : ''}>
        <div class="rr-opt-section-label">${o.listMode === 'whitelist' ? 'Whitelisted' : 'Blacklisted'} roles</div>
        <div class="rr-roles-picker" role="group" aria-label="Listed roles">
          ${rolesHtml || '<span class="rr-no-roles">No roles available</span>'}
        </div>
        ${o.listedRoles.length === 0 ? '<div class="rr-no-roles-selected">+ No roles added</div>' : ''}
      </div>`;
  }

  function buildEmojiPicker() {
    const commonEmoji = ['👍','👎','❤️','⭐','🎮','🎵','🖥️','💼','📚','🏆','✅','❌','🔥','💎','🌟','👑','🛡️','⚔️','🎯','🎲','🔮','🌙','☀️','🌈','🐱','🐶','🦊','🐺','🦁','🐯','🌸','🌊','⚡','💀'];
    const custHtml = guildEmojis.length
      ? `<div class="rr-emoji-section-label">SERVER EMOJIS</div>` +
        guildEmojis.slice(0, 50).map(e => {
          const id = e.id;
          const display = id ? (e.animated ? `<a:${e.name}:${id}>` : `<:${e.name}:${id}>`) : e.name;
          const imgSrc = id ? `https://cdn.discordapp.com/emojis/${id}.${e.animated ? 'gif' : 'webp'}?size=32` : null;
          return `<div class="rr-emoji-item" data-emoji="${esc(display)}" data-display="${esc(display)}" title="${esc(e.name)}" tabindex="0" role="button" aria-label="Emoji ${esc(e.name)}">
            ${imgSrc ? `<img src="${esc(imgSrc)}" alt="${esc(e.name)}" loading="lazy" />` : esc(e.name)}
          </div>`;
        }).join('')
      : '';
    const uniHtml = `<div class="rr-emoji-section-label">COMMON EMOJIS</div>` +
      commonEmoji.map(em =>
        `<div class="rr-emoji-item" data-emoji="${esc(em)}" data-display="${esc(em)}" tabindex="0" role="button" aria-label="Emoji ${esc(em)}">${em}</div>`
      ).join('');
    return `
      <div class="rr-wizard-header">
        <button class="btn btn-ghost btn-sm" id="rrEmojiBack" aria-label="Back">←</button>
        <h3>Pick an Emoji</h3>
        <button class="modal-close" id="rrWizClose" aria-label="Close">✕</button>
      </div>
      <input type="text" id="rrEmojiSearch" class="ec-input" placeholder="Search emojis…" style="margin-bottom:.75rem" aria-label="Search emojis" />
      <div class="rr-emoji-grid" id="rrEmojiGrid" role="listbox" aria-label="Emoji list">
        ${custHtml}${uniHtml}
        <div class="rr-emoji-section-label">CUSTOM EMOJI ID</div>
        <div class="rr-emoji-custom-input">
          <input type="text" id="rrEmojiCustom" class="ec-input" placeholder='&lt;:name:id&gt; or unicode' aria-label="Custom emoji input" />
          <button class="btn btn-sm btn-primary" id="rrEmojiCustomConfirm">Use</button>
        </div>
      </div>`;
  }

  function buildRolePicker(emoji, emojiDisplay) {
    const roles = guildRoles.map(r =>
      `<div class="rr-role-pick-option" data-role-id="${esc(r.id)}" data-role-name="${esc(r.name)}" tabindex="0" role="option">
        <span class="rr-role-dot" style="background:${r.color ? '#' + r.color.toString(16).padStart(6,'0') : '#99aab5'}"></span>
        ${esc(r.name)}
      </div>`
    ).join('');
    return `
      <div class="rr-wizard-header">
        <button class="btn btn-ghost btn-sm" id="rrRolePickBack" data-emoji="${esc(emoji)}" data-display="${esc(emojiDisplay)}" aria-label="Back">←</button>
        <div class="rr-wizard-header-inner">
          <span class="rr-header-emoji" aria-hidden="true">${esc(emojiDisplay)}</span>
          <h3>Select Role</h3>
        </div>
        <button class="modal-close" id="rrWizClose" aria-label="Close">✕</button>
      </div>
      <input type="text" id="rrRoleSearch" class="ec-input" placeholder="Search roles…" style="margin-bottom:.75rem" aria-label="Search roles" />
      <div class="rr-role-list" id="rrRoleList" role="listbox" aria-label="Server roles">
        ${roles || '<p class="rr-empty-hint">No roles available.</p>'}
      </div>`;
  }

  // ── Modal engine ─────────────────────────────────────────────
  function showModal(html) {
    let backdrop = document.getElementById('rr-modal-wizard');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'rr-modal-wizard';
      backdrop.className = 'modal-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.innerHTML = `<div class="modal rr-wizard-modal" role="dialog" aria-modal="true" aria-label="Reaction Roles Wizard">${html}</div>`;
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    bindWizardEvents(backdrop);
    if (window.refreshCustomSelects) window.refreshCustomSelects(backdrop);
    // Focus first focusable element
    backdrop.querySelector('button, input, select, [tabindex="0"]')?.focus();
  }

  function closeModal() {
    const backdrop = document.getElementById('rr-modal-wizard');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
    wiz = null;
  }

  function bindWizardEvents(backdrop) {
    // Close
    backdrop.querySelector('#rrWizClose')?.addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
    backdrop.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // Step 0: choice
    backdrop.querySelector('#rrChoiceExisting')?.addEventListener('click', () => {
      wiz.mode = 'existing';
      showModal(buildWizardStep1Existing());
    });
    backdrop.querySelector('#rrChoiceNew')?.addEventListener('click', async () => {
      wiz.mode = 'new';
      if (!guildChannels.length) {
        const r = await fetch(`/api/guild/${GID}/channels`);
        if (r.ok) guildChannels = (await r.json()).filter(c => [0, 5].includes(c.type));
      }
      showModal(buildWizardStep1New());
    });

    // Back from any step
    backdrop.querySelector('#rrWizBack')?.addEventListener('click', () => {
      if (wiz.mode === 'existing') showModal(buildWizardStep1Existing());
      else if (wiz.mode === 'new') showModal(buildWizardStep1New());
      else showModal(buildWizardStep0());
    });

    // Step 1a: verify message link
    backdrop.querySelector('#rrMsgLinkConfirm')?.addEventListener('click', async () => {
      const url = document.getElementById('rrMsgLink')?.value?.trim();
      const errEl = document.getElementById('rrMsgLinkError');
      if (errEl) errEl.style.display = 'none';
      const match = url?.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (!match) {
        if (errEl) { errEl.textContent = 'Invalid message link. Expected: https://discord.com/channels/GuildID/ChannelID/MessageID'; errEl.style.display = ''; }
        return;
      }
      const [, urlGuildId, chanId, msgId] = match;
      if (urlGuildId !== GID) {
        if (errEl) { errEl.textContent = 'This message is not from this server.'; errEl.style.display = ''; }
        return;
      }
      wiz.messageUrl = url;
      wiz.messageChannelId = chanId;
      wiz.messageId = msgId;
      wiz.channelId = chanId;
      wiz.channelName = guildChannels.find(c => c.id === chanId)?.name || chanId;
      if (!guildEmojis.length) await loadGuildEmojis();
      showModal(buildWizardPairs());
    });

    // Step 1b: channel selection
    backdrop.querySelectorAll('[data-ch-id]').forEach(opt => {
      const selectChannel = () => {
        backdrop.querySelectorAll('[data-ch-id]').forEach(o => { o.classList.remove('selected'); o.setAttribute('aria-selected', 'false'); });
        opt.classList.add('selected');
        opt.setAttribute('aria-selected', 'true');
        wiz.channelId = opt.dataset.chId;
        wiz.channelName = opt.dataset.chName;
        const confirmBtn = backdrop.querySelector('#rrChannelConfirm');
        if (confirmBtn) confirmBtn.removeAttribute('disabled');
      };
      opt.addEventListener('click', selectChannel);
      opt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectChannel(); } });
    });
    backdrop.querySelector('#rrChannelConfirm')?.addEventListener('click', async () => {
      if (!guildEmojis.length) await loadGuildEmojis();
      showModal(buildWizardPairs());
    });

    // Tabs in pairs screen
    backdrop.querySelectorAll('.rr-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        backdrop.querySelectorAll('.rr-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        if (tab.dataset.tab === 'pairs') {
          document.getElementById('rrTabPairs').style.display = '';
          document.getElementById('rrTabEditMessage').style.display = 'none';
        } else {
          document.getElementById('rrTabPairs').style.display = 'none';
          document.getElementById('rrTabEditMessage').style.display = '';
        }
      });
    });

    // Sub-tabs (visual/raw/preview)
    backdrop.querySelectorAll('.rr-sub-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        backdrop.querySelectorAll('.rr-sub-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const panels = { visual: 'rrSubVisual', raw: 'rrSubRaw', preview: 'rrSubPreview' };
        Object.entries(panels).forEach(([k, id]) => {
          const el = document.getElementById(id);
          if (el) el.style.display = k === tab.dataset.sub ? '' : 'none';
        });
        if (tab.dataset.sub === 'raw') syncToRaw();
        if (tab.dataset.sub === 'preview') refreshPreview();
      });
    });

    // Raw apply
    backdrop.querySelector('#rrRawApply')?.addEventListener('click', () => applyRaw());

    // Embed live editing
    backdrop.querySelector('#rrEmbedTitle')?.addEventListener('input', e => { wiz.embed.title = e.target.value; });
    backdrop.querySelector('#rrEmbedDesc')?.addEventListener('input', e => { wiz.embed.description = e.target.value; });
    backdrop.querySelector('#rrEmbedContent')?.addEventListener('input', e => { wiz.embed.content = e.target.value; });
    backdrop.querySelector('#rrEmbedColorInput')?.addEventListener('input', e => { wiz.embed.color = e.target.value; });
    backdrop.querySelector('#rrEmbedClear')?.addEventListener('click', () => {
      wiz.embed = { content: '', title: '', description: '', color: '#0f52ba' };
      const t = backdrop.querySelector('#rrEmbedTitle'); if (t) t.value = '';
      const d = backdrop.querySelector('#rrEmbedDesc'); if (d) d.value = '';
      const c = backdrop.querySelector('#rrEmbedContent'); if (c) c.value = '';
    });

    // Add pair → emoji picker
    backdrop.querySelector('#rrAddPairBtn')?.addEventListener('click', () => showModal(buildEmojiPicker()));

    // Remove pair
    backdrop.querySelectorAll('.rr-pair-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.removeIdx);
        if (!isNaN(idx)) wiz.pairs.splice(idx, 1);
        showModal(buildWizardPairs());
      });
    });

    // Emoji grid items
    const selectEmoji = (emoji, display) => showModal(buildRolePicker(emoji, display));
    backdrop.querySelectorAll('.rr-emoji-item').forEach(item => {
      item.addEventListener('click', () => selectEmoji(item.dataset.emoji, item.dataset.display));
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEmoji(item.dataset.emoji, item.dataset.display); } });
    });

    // Emoji search
    backdrop.querySelector('#rrEmojiSearch')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      backdrop.querySelectorAll('.rr-emoji-item').forEach(item => {
        const name = (item.dataset.emoji || '') + (item.title || '');
        item.style.display = (!q || name.toLowerCase().includes(q)) ? '' : 'none';
      });
    });

    // Custom emoji
    backdrop.querySelector('#rrEmojiCustomConfirm')?.addEventListener('click', () => {
      const val = document.getElementById('rrEmojiCustom')?.value?.trim();
      if (!val) return;
      showModal(buildRolePicker(val, val));
    });
    document.getElementById('rrEmojiCustom')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') backdrop.querySelector('#rrEmojiCustomConfirm')?.click();
    });

    // Emoji back
    backdrop.querySelector('#rrEmojiBack')?.addEventListener('click', () => showModal(buildWizardPairs()));

    // Role picker back
    const rpBack = backdrop.querySelector('#rrRolePickBack');
    if (rpBack) {
      rpBack.addEventListener('click', () => showModal(buildEmojiPicker()));
    }

    // Role search
    backdrop.querySelector('#rrRoleSearch')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      backdrop.querySelectorAll('.rr-role-pick-option').forEach(opt => {
        opt.style.display = (!q || (opt.dataset.roleName || '').toLowerCase().includes(q)) ? '' : 'none';
      });
    });

    // Role selection
    const selectRole = (opt) => {
      const rpBtn = backdrop.querySelector('#rrRolePickBack');
      const emoji = rpBtn?.dataset?.emoji || '';
      const display = rpBtn?.dataset?.display || emoji;
      // Prevent duplicate emoji+role pairs
      const exists = wiz.pairs.some(p => p.emoji === emoji && p.roleId === opt.dataset.roleId);
      if (!exists) {
        wiz.pairs.push({ emoji, emojiDisplay: display, roleId: opt.dataset.roleId, roleName: opt.dataset.roleName, toggleRole: true, action: 'role' });
      }
      showModal(buildWizardPairs());
    };
    backdrop.querySelectorAll('.rr-role-pick-option').forEach(opt => {
      opt.addEventListener('click', () => selectRole(opt));
      opt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRole(opt); } });
    });

    // Options button
    backdrop.querySelector('#rrOptionsBtn')?.addEventListener('click', () => showModal(buildOptionsPanel()));

    // Options back
    backdrop.querySelector('#rrOptBack')?.addEventListener('click', () => showModal(buildWizardPairs()));

    // Options: list mode change
    backdrop.querySelector('#rrOptListMode')?.addEventListener('change', e => {
      wiz.options.listMode = e.target.value;
      const wrap = document.getElementById('rrOptListedRolesWrap');
      if (wrap) wrap.style.display = e.target.value === 'none' ? 'none' : '';
      const label = document.querySelector('.rr-opt-section-label');
      if (label) label.textContent = e.target.value === 'whitelist' ? 'Whitelisted roles' : 'Blacklisted roles';
    });
    backdrop.querySelector('#rrOptReversed')?.addEventListener('change', e => { wiz.options.reversed = e.target.checked; });
    backdrop.querySelector('#rrOptMaxReact')?.addEventListener('input', e => { wiz.options.maxReactions = parseInt(e.target.value) || 0; });

    // Options: listed roles
    backdrop.querySelectorAll('.rr-listed-role-option').forEach(opt => {
      const toggle = () => {
        const rid = opt.dataset.roleId;
        const idx = wiz.options.listedRoles.indexOf(rid);
        if (idx >= 0) {
          wiz.options.listedRoles.splice(idx, 1);
          opt.classList.remove('selected');
          opt.setAttribute('aria-checked', 'false');
        } else {
          wiz.options.listedRoles.push(rid);
          opt.classList.add('selected');
          opt.setAttribute('aria-checked', 'true');
        }
      };
      opt.addEventListener('click', toggle);
      opt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    // Save
    backdrop.querySelector('#rrWizSave')?.addEventListener('click', () => saveWizard());
  }

  // ── Embed helpers ─────────────────────────────────────────────
  function syncToRaw() {
    const rawEl = document.getElementById('rrRawJson');
    if (!rawEl) return;
    const payload = {
      content: wiz.embed.content || '',
      embeds: [{
        title: wiz.embed.title || '',
        description: wiz.embed.description || '${reactionroles}',
        color: parseInt((wiz.embed.color || '#0f52ba').replace('#', ''), 16),
      }],
    };
    rawEl.value = JSON.stringify(payload, null, 2);
  }

  function applyRaw() {
    try {
      const raw = document.getElementById('rrRawJson')?.value;
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const emb = parsed.embeds?.[0] || {};
      wiz.embed.content = parsed.content || '';
      wiz.embed.title = emb.title || '';
      wiz.embed.description = emb.description || '';
      if (typeof emb.color === 'number') {
        wiz.embed.color = '#' + emb.color.toString(16).padStart(6, '0');
      }
      // Update visual fields if visible
      const t = document.getElementById('rrEmbedTitle'); if (t) t.value = wiz.embed.title;
      const d = document.getElementById('rrEmbedDesc'); if (d) d.value = wiz.embed.description;
      const c = document.getElementById('rrEmbedContent'); if (c) c.value = wiz.embed.content;
      const col = document.getElementById('rrEmbedColorInput'); if (col) col.value = wiz.embed.color;
      refreshPreview();
    } catch {
      window.showToast?.('Invalid JSON. Please check your syntax.', 'error');
    }
  }

  function refreshPreview() {
    const previewEl = document.getElementById('rrDiscordPreview');
    if (previewEl) previewEl.innerHTML = buildDiscordPreview();
  }

  async function loadGuildEmojis() {
    try {
      const r = await fetch(`/api/guild/${GID}/emojis`);
      if (r.ok) guildEmojis = await r.json();
    } catch { guildEmojis = []; }
  }

  // ── Save wizard ───────────────────────────────────────────────
  async function saveWizard() {
    const saveBtn = document.querySelector('#rrWizSave');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    // Collect live visual editor values
    const titleEl = document.getElementById('rrEmbedTitle');
    const descEl = document.getElementById('rrEmbedDesc');
    const contentEl = document.getElementById('rrEmbedContent');
    const colorEl = document.getElementById('rrEmbedColorInput');
    if (titleEl) wiz.embed.title = titleEl.value;
    if (descEl) wiz.embed.description = descEl.value;
    if (contentEl) wiz.embed.content = contentEl.value;
    if (colorEl) wiz.embed.color = colorEl.value;

    const options = wiz.pairs.map(p => ({
      optId: Math.random().toString(36).slice(2, 10).toUpperCase(),
      label: p.emoji,
      emoji: p.emoji,
      roleId: p.roleId,
      action: p.action || 'role',
      toggleRole: p.toggleRole !== false,
      content: p.content || null,
      contentType: 'message',
    }));

    const body = {
      type: 'emoji',
      channelId: wiz.channelId || null,
      messageUrl: wiz.messageUrl || null,
      embedTitle: wiz.embed.title || 'React to this message to assign yourself roles',
      embedDescription: wiz.embed.description || '${reactionroles}',
      embedColor: parseInt((wiz.embed.color || '#0f52ba').replace('#', ''), 16),
      content: wiz.embed.content || null,
      reversed: wiz.options.reversed,
      maxReactions: wiz.options.maxReactions,
      listMode: wiz.options.listMode,
      listedRoles: wiz.options.listedRoles,
      options,
    };

    try {
      let res;
      if (wiz.rrId) {
        res = await fetch(`/api/guild/${GID}/reaction-roles/${wiz.rrId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        body.name = `rr_${Date.now()}`;
        res = await fetch(`/api/guild/${GID}/reaction-roles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      const rrId = data._id || wiz.rrId;
      if (rrId) {
        const postRes = await fetch(`/api/guild/${GID}/reaction-roles/${rrId}/post`, { method: 'POST' });
        const postData = await postRes.json().catch(() => ({}));
        if (!postRes.ok) {
          throw new Error(postData.error || `Failed to post reaction role message (${postRes.status})`);
        }
      }

      closeModal();
      loadAll();
    } catch (e) {
      window.showToast?.('Failed to save: ' + e.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save changes'; }
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const pd = document.getElementById('pageData');
    if (!pd?.dataset?.guildId) return;
    document.addEventListener('sectionActivated', e => {
      if (e.detail?.section !== 'reaction-roles') return;
      if (!initialized) initRR();
    });
  });

  window.initRR = initRR;
})();