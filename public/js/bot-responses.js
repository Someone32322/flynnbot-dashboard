/* ============================================================
   BOT-RESPONSES.JS  -  Bot Message Template Manager v2
   API:
     GET  /api/guild/:id/bot-messages  ->  { types, templates }
     PATCH /api/guild/:id/bot-messages/:type  ->  saved doc
   Features:
     . Collapsed preview shows current response content
     . Split layout: form (left) + live Discord preview (right)
     . Auto-expands items that already have saved content
     . Full embed builder with real-time preview
     . Variable chip insertion with category grouping
   ============================================================ */
(function () {
  'use strict';

  var state = { guildId: null, types: [], templates: {}, theme: {}, loaded: false };

  var GROUP_ICON = {
    'Punishment Responses': '🔨', 'Logging': '📋',
    'Community': '👋', 'Economy': '💰', 'Leveling': '⭐',
  };

  var GROUP_VARS = {
    'Punishment Responses': {
      'User':   ['{user}', '{user.mention}', '{user.tag}', '{user.id}'],
      'Action': ['{moderator}', '{reason}', '{duration}', '{case}'],
      'Server': ['{guild}', '{guild.memberCount}'],
    },
    'Logging':   { 'User': ['{user}', '{moderator}'], 'Action': ['{reason}', '{channel}'], 'Server': ['{guild}'] },
    'Community': { 'User': ['{user}', '{user.mention}'], 'Server': ['{guild}', '{memberCount}'] },
    'Economy':   { 'User': ['{user}'], 'Economy': ['{amount}', '{balance}'], 'Server': ['{guild}'] },
    'Leveling':  { 'User': ['{user}', '{user.mention}'], 'Levels': ['{level}', '{xp}'], 'Server': ['{guild}'] },
  };

  var GROUP_VARS_FLAT = {};
  Object.keys(GROUP_VARS).forEach(function(g) {
    var flat = [];
    Object.keys(GROUP_VARS[g]).forEach(function(c) { flat = flat.concat(GROUP_VARS[g][c]); });
    GROUP_VARS_FLAT[g] = flat;
  });

  /* --- init --- */
  function init() {
    var pd = document.getElementById('pageData');
    if (!pd) return;
    state.guildId = pd.dataset.guildId;
    if (!state.guildId) return;
    document.addEventListener('sectionActivated', function(e) {
      if (e.detail && e.detail.section === 'responses' && !state.loaded) loadTemplates();
    });
    var sec = document.getElementById('section-responses');
    if (sec && sec.style.display !== 'none' && !state.loaded) loadTemplates();
  }

  /* --- load --- */
  function loadTemplates() {
    var container = document.getElementById('botResponsesContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading response templates...</div>';
    Promise.all([
      fetch('/api/guild/' + state.guildId + '/bot-messages').then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch('/api/guild/' + state.guildId + '/theme').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }),
    ])
      .then(function(results) {
        var data = results[0];
        var theme = results[1];
        state.types     = Array.isArray(data.types) ? data.types : [];
        state.templates = (data.templates && typeof data.templates === 'object') ? data.templates : {};
        state.theme     = theme || {};
        state.loaded    = true;
        render(container);
      })
      .catch(function(err) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">warning</div><p>Failed to load templates.<br><small style="color:var(--text-4)">' + esc(err.message) + '</small></p></div>';
      });
  }

  /* --- render all groups --- */
  function render(container) {
    if (!state.types.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">chat</div><p>No response types configured.</p></div>';
      return;
    }
    var groups = {};
    state.types.forEach(function(t) {
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group].push({ key: t.key, label: t.label, tpl: state.templates[t.key] || null });
    });
    var html = buildThemeCardHtml();
    Object.keys(groups).forEach(function(groupName) {
      var icon = GROUP_ICON[groupName] || 'note';
      var vars = GROUP_VARS[groupName] || {};
      var flat = GROUP_VARS_FLAT[groupName] || [];
      html += '<div class="responses-group"><div class="responses-group-title">' + icon + ' ' + esc(groupName) + '</div>';
      groups[groupName].forEach(function(item) { html += buildItemHtml(item, flat, vars); });
      html += '</div>';
    });
    container.innerHTML = html;
    attachListeners(container);
  }

  /* --- embed theme card --- */
  function buildThemeCardHtml() {
    var t = state.theme || {};
    var color = t.embedColor || '#0f52ba';
    return '<div class="responses-group" id="resp-theme-card">' +
      '<div class="responses-group-title">🎨 Global Embed Theme</div>' +
      '<div class="response-item" style="border:none;background:transparent;padding:0">' +
        '<div class="resp-form-col" style="max-width:100%;width:100%">' +
          '<p style="font-size:0.82rem;color:var(--text-2);margin:0 0 1rem">These defaults apply to all bot embeds (moderation, logging, etc.) when no per-message override is set.</p>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">' +
            '<div class="resp-field-group">' +
              '<label class="resp-field-label">Accent Color</label>' +
              '<div style="display:flex;align-items:center;gap:10px">' +
                '<input type="color" id="theme-embedColor" class="resp-color-input" value="' + esc(color) + '">' +
                '<span id="theme-color-val">' + esc(color) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="resp-field-group">' +
              '<label class="resp-field-label">Show Timestamp</label>' +
              '<label class="toggle-switch">' +
                '<input type="checkbox" id="theme-showTimestamp" ' + (t.showTimestamp !== false ? 'checked' : '') + '>' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
            '</div>' +
            '<div class="resp-field-group">' +
              '<label class="resp-field-label">Author Name</label>' +
              '<input type="text" id="theme-embedAuthorName" class="resp-input" maxlength="200" placeholder="e.g. FlynnBot" value="' + esc(t.embedAuthorName || '') + '">' +
            '</div>' +
            '<div class="resp-field-group">' +
              '<label class="resp-field-label">Author Icon URL</label>' +
              '<input type="url" id="theme-embedAuthorIconUrl" class="resp-input" maxlength="400" placeholder="https://…" value="' + esc(t.embedAuthorIconUrl || '') + '">' +
            '</div>' +
            '<div class="resp-field-group">' +
              '<label class="resp-field-label">Footer Text</label>' +
              '<input type="text" id="theme-embedFooterText" class="resp-input" maxlength="200" placeholder="e.g. FlynnBot • {guild}" value="' + esc(t.embedFooterText || '') + '">' +
            '</div>' +
            '<div class="resp-field-group">' +
              '<label class="resp-field-label">Footer Icon URL</label>' +
              '<input type="url" id="theme-embedFooterIconUrl" class="resp-input" maxlength="400" placeholder="https://…" value="' + esc(t.embedFooterIconUrl || '') + '">' +
            '</div>' +
            '<div class="resp-field-group">' +
              '<label class="resp-field-label">Use Server Icon <span class="resp-field-hint">as thumbnail</span></label>' +
              '<label class="toggle-switch">' +
                '<input type="checkbox" id="theme-useServerIcon" ' + (t.useServerIcon ? 'checked' : '') + '>' +
                '<span class="toggle-slider"></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="resp-actions" style="margin-top:1rem">' +
            '<button class="btn btn-primary btn-sm" id="theme-save-btn">Save Theme</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* --- save theme --- */
  function saveTheme() {
    var btn = document.getElementById('theme-save-btn');
    if (btn) btn.disabled = true;
    var body = {
      embedColor: document.getElementById('theme-embedColor')?.value || '#0f52ba',
      embedAuthorName: document.getElementById('theme-embedAuthorName')?.value?.trim() || '',
      embedAuthorIconUrl: document.getElementById('theme-embedAuthorIconUrl')?.value?.trim() || '',
      embedFooterText: document.getElementById('theme-embedFooterText')?.value?.trim() || '',
      embedFooterIconUrl: document.getElementById('theme-embedFooterIconUrl')?.value?.trim() || '',
      useServerIcon: !!document.getElementById('theme-useServerIcon')?.checked,
      showTimestamp: !!document.getElementById('theme-showTimestamp')?.checked,
    };
    fetch('/api/guild/' + state.guildId + '/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data && data.embedColor) {
        state.theme = data;
        window.showToast?.('Embed theme saved.', 'success');
      } else {
        window.showToast?.('Failed to save theme.', 'error');
      }
    }).catch(function() {
      window.showToast?.('Network error — theme not saved.', 'error');
    }).finally(function() {
      if (btn) btn.disabled = false;
    });
  }

  /* --- build single item --- */
  function buildItemHtml(item, flatVars, varCats) {
    var tpl        = item.tpl || {};
    var enabled    = tpl.enabled !== false;
    var content    = tpl.content || '';
    var embedOn    = tpl.embedEnabled !== false;
    var embedColor = tpl.embedColor  || '#6366f1';
    var eTitle     = tpl.embedTitle  || '';
    var eAuthor    = tpl.embedAuthor || '';
    var eDesc      = tpl.embedDescription || '';
    var eFooter    = tpl.embedFooter || '';
    var eThumbnail = !!tpl.embedThumbnail;
    var eFields    = Array.isArray(tpl.embedFields) ? tpl.embedFields : [];
    var hasCustom  = content.length > 0 || eTitle.length > 0 || eDesc.length > 0;
    var sk         = item.key.replace(/_/g, '-');

    /* variable chips */
    var varChipsHtml = '';
    if (flatVars.length) {
      if (Object.keys(varCats).length) {
        Object.keys(varCats).forEach(function(catName) {
          var chips = varCats[catName].map(function(v) {
            return '<span class="response-var-chip" data-var="' + v + '" data-type="' + item.key + '" tabindex="0" role="button" title="Insert ' + v + '">' + v + '</span>';
          }).join('');
          varChipsHtml += '<div class="resp-var-cat"><span class="resp-var-cat-label">' + esc(catName) + '</span>' + chips + '</div>';
        });
      } else {
        varChipsHtml = flatVars.map(function(v) {
          return '<span class="response-var-chip" data-var="' + v + '" data-type="' + item.key + '" tabindex="0" role="button">' + v + '</span>';
        }).join('');
      }
    }

    var fieldsHtml = '';
    eFields.forEach(function(f, i) { fieldsHtml += buildFieldRow(item.key, i, f.name || '', f.value || '', !!f.inline); });

    var h = '<div class="response-item' + (hasCustom ? ' response-has-override' : '') + '" id="resp-item-' + sk + '" data-type="' + item.key + '">';

    /* header */
    h += '<div class="response-item-header">';
    h += '<div><div class="response-item-name">' + esc(item.label);
    h += ' <span class="' + (hasCustom ? 'response-badge-custom' : 'response-badge-default') + '" id="resp-badge-' + sk + '">' + (hasCustom ? 'Custom' : 'Default') + '</span>';
    h += '</div></div>';
    h += '<div class="response-item-actions">';
    h += '<label class="toggle-switch" title="Enable/disable this response"><input type="checkbox" class="resp-toggle" data-type="' + item.key + '"' + (enabled ? ' checked' : '') + '><span class="toggle-slider"></span></label>';
    h += '<button class="btn btn-ghost btn-sm resp-expand-btn" data-type="' + item.key + '" aria-expanded="false">Edit</button>';
    h += '</div></div>';

    /* collapsed preview */
    h += buildCollapsedPreview(content, embedOn, embedColor, eTitle, eDesc, hasCustom);

    /* editor */
    h += '<div class="response-editor" id="resp-editor-' + sk + '">';

    /* FORM COLUMN */
    h += '<div class="resp-form-col">';

    h += '<div class="resp-field-group"><label class="resp-field-label">Plain Text <span class="resp-field-hint">Appears above the embed</span></label>';
    h += '<textarea class="resp-content resp-input" data-type="' + item.key + '" rows="3" placeholder="Optional - leave blank to use embed only">' + esc(content) + '</textarea></div>';

    if (flatVars.length) {
      h += '<div class="resp-field-group resp-vars-section"><div class="resp-field-label">Insert Variable</div><div class="resp-vars-wrap">' + varChipsHtml + '</div></div>';
    }

    /* embed section */
    h += '<div class="resp-embed-section">';
    h += '<div class="resp-embed-header"><div class="resp-embed-header-left"><div class="resp-embed-title-text">Discord Embed</div><div class="resp-embed-subtitle">Rich embed appended to this message</div></div>';
    h += '<label class="toggle-switch"><input type="checkbox" class="resp-embed-toggle" data-type="' + item.key + '"' + (embedOn ? ' checked' : '') + '><span class="toggle-slider"></span></label></div>';

    h += '<div class="resp-embed-body' + (embedOn ? '' : ' resp-embed-body--hidden') + '" id="resp-embed-body-' + sk + '">';

    h += '<div class="resp-embed-color-row"><label class="resp-field-label" style="margin:0">Accent Color</label>';
    h += '<div style="display:flex;align-items:center;gap:10px"><input type="color" class="resp-embed-color resp-color-input" data-type="' + item.key + '" value="' + esc(embedColor) + '">';
    h += '<span class="resp-embed-color-value" id="resp-color-val-' + sk + '">' + esc(embedColor) + '</span></div></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Author <span class="resp-field-hint">Small line above title</span></label>';
    h += '<input type="text" class="resp-embed-author resp-input" data-type="' + item.key + '" placeholder="e.g. FlynnBot Moderation" maxlength="256" value="' + esc(eAuthor) + '"></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Title</label>';
    h += '<input type="text" class="resp-embed-title resp-input" data-type="' + item.key + '" placeholder="e.g. You have been warned" maxlength="256" value="' + esc(eTitle) + '"></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Description <span class="resp-field-hint">Supports variables</span></label>';
    h += '<textarea class="resp-embed-desc resp-input" data-type="' + item.key + '" rows="3" placeholder="e.g. {user}, warned by {moderator} for: {reason}" maxlength="4096">' + esc(eDesc) + '</textarea></div>';

    h += '<div class="resp-field-group"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
    h += '<div class="resp-field-label" style="margin:0">Fields <span class="resp-field-hint">Max 5</span></div>';
    h += '<button class="btn btn-ghost btn-sm resp-add-field-btn" data-type="' + item.key + '" type="button">+ Add Field</button></div>';
    h += '<div class="resp-embed-fields-list" id="resp-fields-' + sk + '">' + fieldsHtml + '</div></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Footer</label>';
    h += '<input type="text" class="resp-embed-footer resp-input" data-type="' + item.key + '" placeholder="e.g. FlynnBot * Case #{case}" maxlength="2048" value="' + esc(eFooter) + '"></div>';

    h += '<div class="resp-thumb-row"><div><div class="resp-field-label" style="margin:0">User Thumbnail</div><div class="resp-field-hint">Show user avatar in thumbnail</div></div>';
    h += '<label class="toggle-switch"><input type="checkbox" class="resp-embed-thumbnail" data-type="' + item.key + '"' + (eThumbnail ? ' checked' : '') + '><span class="toggle-slider"></span></label></div>';

    h += '</div>'; /* /resp-embed-body */
    h += '</div>'; /* /resp-embed-section */

    h += '<div class="resp-actions"><button class="btn btn-ghost btn-sm resp-reset-btn" data-type="' + item.key + '">Reset to Default</button>';
    h += '<button class="btn btn-primary btn-sm resp-save-btn" data-type="' + item.key + '">Save Changes</button></div>';

    h += '</div>'; /* /resp-form-col */

    /* PREVIEW COLUMN */
    h += '<div class="resp-preview-col"><div class="resp-preview-col-title">Live Preview</div>';
    h += '<div class="resp-preview-wrap"><div id="resp-preview-' + sk + '">';
    h += buildPreviewHtml(content, embedOn, embedColor, eAuthor, eTitle, eDesc, eFooter, eThumbnail, eFields);
    h += '</div></div></div>'; /* /resp-preview-wrap /resp-preview-col */

    h += '</div>'; /* /response-editor */
    h += '</div>'; /* /response-item */
    return h;
  }

  /* --- collapsed preview --- */
  function buildCollapsedPreview(content, embedOn, embedColor, eTitle, eDesc, hasCustom) {
    if (!hasCustom) {
      return '<div class="resp-collapsed-preview"><span class="rcp-icon">🤖</span>' +
        '<div class="rcp-content"><div class="rcp-type">Bot Default</div>' +
        '<div class="rcp-text" style="color:var(--text-4);font-style:italic">No customization - uses bot built-in response</div></div></div>';
    }
    var icon = embedOn ? '🖼️' : '💬';
    var typeLabel = [];
    if (content.trim()) typeLabel.push('Text');
    if (embedOn) typeLabel.push('Embed');
    var previewText = content.trim()
      ? content.replace(/\n/g, ' ').slice(0, 100) + (content.length > 100 ? '...' : '')
      : eTitle
        ? eTitle.slice(0, 100)
        : eDesc.replace(/\n/g, ' ').slice(0, 100) + (eDesc.length > 100 ? '...' : '');
    var h = '<div class="resp-collapsed-preview"><span class="rcp-icon">' + icon + '</span>';
    h += '<div class="rcp-content"><div class="rcp-type">' + typeLabel.join(' + ') + '</div>';
    h += '<div class="rcp-text">' + esc(previewText) + '</div></div>';
    if (embedOn) {
      h += '<span class="rcp-embed-badge"><span class="rcp-color-swatch" style="background:' + esc(embedColor) + '"></span>Embed</span>';
    }
    h += '</div>';
    return h;
  }

  /* --- field row --- */
  function buildFieldRow(type, index, name, value, inline) {
    return '<div class="resp-embed-field-row" data-field-index="' + index + '">' +
      '<input type="text" class="resp-input resp-field-name" placeholder="Field name" maxlength="256" value="' + esc(name) + '">' +
      '<input type="text" class="resp-input resp-field-value" placeholder="Field value" maxlength="1024" value="' + esc(value) + '">' +
      '<label class="resp-field-inline-label"><input type="checkbox" class="resp-field-inline-chk"' + (inline ? ' checked' : '') + '> Inline</label>' +
      '<button class="btn btn-ghost btn-sm resp-remove-field-btn" type="button" title="Remove field">x</button></div>';
  }

  /* --- discord preview --- */
  function buildPreviewHtml(content, embedOn, embedColor, author, title, desc, footer, thumbnail, fields) {
    var hasContent = content && content.trim();
    var hasEmbed   = embedOn && (author || title || desc || footer || (fields && fields.length));
    var h = '<div class="resp-discord-preview">';
    h += '<div class="discord-msg-row"><div class="discord-avatar" style="padding:0;overflow:hidden"><img src="/images/flynn.png" alt="FlynnBot" style="width:100%;height:100%;border-radius:50%;object-fit:cover"></div>';
    h += '<div class="discord-msg-body"><div class="discord-username-row">';
    h += '<span class="discord-username">FlynnBot</span><span class="discord-bot-badge">BOT</span>';
    h += '<span class="discord-timestamp">Today at ' + fakeTime() + '</span></div>';
    if (!hasContent && !hasEmbed) {
      h += '<div class="resp-preview-empty">No content yet - start typing above</div>';
    }
    if (hasContent) h += '<div class="resp-preview-text">' + previewInline(content) + '</div>';
    if (hasEmbed) {
      h += '<div class="resp-discord-embed" style="border-left-color:' + esc(embedColor) + '">';
      h += '<div class="resp-discord-embed-inner">';
      if (thumbnail) h += '<div class="resp-embed-thumbnail-wrap"><div class="resp-embed-thumbnail-placeholder">user</div></div>';
      if (author) h += '<div class="resp-embed-author-row">' + previewInline(author) + '</div>';
      if (title)  h += '<div class="resp-embed-title-row">'  + previewInline(title)  + '</div>';
      if (desc)   h += '<div class="resp-embed-desc-row">'   + previewInline(desc)   + '</div>';
      if (fields && fields.length) {
        h += '<div class="resp-embed-fields">';
        fields.forEach(function(f) {
          if (!f.name && !f.value) return;
          h += '<div class="resp-embed-field' + (f.inline ? ' resp-embed-field--inline' : '') + '">';
          h += '<div class="resp-embed-field-name">' + previewInline(f.name || '') + '</div>';
          h += '<div class="resp-embed-field-value">' + previewInline(f.value || '') + '</div></div>';
        });
        h += '</div>';
      }
      if (footer) h += '<div class="resp-embed-footer-row">' + previewInline(footer) + '</div>';
      h += '</div></div>';
    }
    h += '</div></div></div>';
    return h;
  }

  function previewInline(text) {
    return esc(text)
      .replace(/\{[a-zA-Z.]+\}/g, function(m) { return '<strong class="resp-preview-var">' + m + '</strong>'; })
      .replace(/\n/g, '<br>');
  }

  function fakeTime() {
    var d = new Date(), h2 = d.getHours(), m = d.getMinutes();
    var ap = h2 >= 12 ? 'PM' : 'AM'; h2 = h2 % 12 || 12;
    return h2 + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  }

  /* --- read embed values --- */
  function readEmbedValues(type, container) {
    var sk = type.replace(/_/g, '-');
    var q  = function(sel) { return container.querySelector(sel + '[data-type="' + type + '"]'); };
    var fields = [];
    container.querySelectorAll('#resp-fields-' + sk + ' .resp-embed-field-row').forEach(function(row) {
      var n = ((row.querySelector('.resp-field-name') || {}).value || '').trim();
      var v = ((row.querySelector('.resp-field-value') || {}).value || '').trim();
      var i = !!((row.querySelector('.resp-field-inline-chk') || {}).checked);
      if (n || v) fields.push({ name: n, value: v, inline: i });
    });
    return {
      embedEnabled:     !!((q('.resp-embed-toggle') || {}).checked),
      embedColor:       ((q('.resp-embed-color') || {}).value) || '#6366f1',
      embedAuthor:      (((q('.resp-embed-author') || {}).value) || '').trim(),
      embedTitle:       (((q('.resp-embed-title') || {}).value) || '').trim(),
      embedDescription: (((q('.resp-embed-desc') || {}).value) || '').trim(),
      embedFooter:      (((q('.resp-embed-footer') || {}).value) || '').trim(),
      embedThumbnail:   !!((q('.resp-embed-thumbnail') || {}).checked),
      embedFields:      fields,
    };
  }

  /* --- refresh preview --- */
  function refreshPreview(type, container) {
    var sk        = type.replace(/_/g, '-');
    var previewEl = document.getElementById('resp-preview-' + sk);
    if (!previewEl) return;
    var contentEl = container.querySelector('.resp-content[data-type="' + type + '"]');
    var content   = contentEl ? contentEl.value : '';
    var ev        = readEmbedValues(type, container);
    previewEl.innerHTML = buildPreviewHtml(
      content, ev.embedEnabled, ev.embedColor, ev.embedAuthor,
      ev.embedTitle, ev.embedDescription, ev.embedFooter,
      ev.embedThumbnail, ev.embedFields
    );
  }

  /* --- attach all listeners --- */
  function attachListeners(container) {
    // Theme card
    document.getElementById('theme-save-btn')?.addEventListener('click', saveTheme);
    var themeColor = document.getElementById('theme-embedColor');
    var themeColorVal = document.getElementById('theme-color-val');
    if (themeColor && themeColorVal) {
      themeColor.addEventListener('input', function() { themeColorVal.textContent = themeColor.value; });
    }

    container.querySelectorAll('.resp-expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sk     = btn.dataset.type.replace(/_/g, '-');
        var editor = document.getElementById('resp-editor-' + sk);
        var item   = document.getElementById('resp-item-' + sk);
        if (!editor) return;
        var open = editor.classList.toggle('open');
        if (item) item.classList.toggle('editor-open', open);
        btn.textContent = open ? 'Close' : 'Edit';
        btn.setAttribute('aria-expanded', String(open));
      });
    });

    container.querySelectorAll('.resp-embed-toggle').forEach(function(chk) {
      chk.addEventListener('change', function() {
        var sk   = chk.dataset.type.replace(/_/g, '-');
        var body = document.getElementById('resp-embed-body-' + sk);
        if (body) body.classList.toggle('resp-embed-body--hidden', !chk.checked);
        refreshPreview(chk.dataset.type, container);
      });
    });

    container.querySelectorAll('.resp-embed-color').forEach(function(inp) {
      inp.addEventListener('input', function() {
        var sk  = inp.dataset.type.replace(/_/g, '-');
        var lbl = document.getElementById('resp-color-val-' + sk);
        if (lbl) lbl.textContent = inp.value;
        refreshPreview(inp.dataset.type, container);
      });
    });

    container.querySelectorAll('.resp-content, .resp-embed-author, .resp-embed-title, .resp-embed-desc, .resp-embed-footer').forEach(function(el) {
      el.addEventListener('input', function() { refreshPreview(el.dataset.type, container); });
    });

    container.querySelectorAll('.resp-embed-thumbnail').forEach(function(chk) {
      chk.addEventListener('change', function() { refreshPreview(chk.dataset.type, container); });
    });

    container.querySelectorAll('.response-var-chip').forEach(function(chip) {
      var insertVar = function() {
        var active = document.activeElement;
        var ta;
        if (active && active.matches('.resp-input') && active.closest('[data-type="' + chip.dataset.type + '"]')) {
          ta = active;
        } else {
          ta = container.querySelector('.resp-embed-desc[data-type="' + chip.dataset.type + '"]')
            || container.querySelector('.resp-content[data-type="' + chip.dataset.type + '"]');
        }
        if (!ta) return;
        var s = ta.selectionStart || 0, e2 = ta.selectionEnd || 0;
        ta.value = ta.value.slice(0, s) + chip.dataset.var + ta.value.slice(e2);
        ta.selectionStart = ta.selectionEnd = s + chip.dataset.var.length;
        ta.focus();
        refreshPreview(chip.dataset.type, container);
      };
      chip.addEventListener('click', insertVar);
      chip.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); insertVar(); }
      });
    });

    container.querySelectorAll('.resp-add-field-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var type2 = btn.dataset.type;
        var sk    = type2.replace(/_/g, '-');
        var list  = document.getElementById('resp-fields-' + sk);
        if (!list) return;
        if (list.querySelectorAll('.resp-embed-field-row').length >= 5) {
          showToast('Maximum 5 embed fields allowed.', 'error'); return;
        }
        var tmp = document.createElement('div');
        tmp.innerHTML = buildFieldRow(type2, list.children.length, '', '', false);
        var rowEl = tmp.firstElementChild;
        list.appendChild(rowEl);
        bindFieldRow(rowEl, type2, container);
      });
    });

    container.querySelectorAll('.resp-embed-field-row').forEach(function(row) {
      var item = row.closest('.response-item');
      if (!item) return;
      bindFieldRow(row, item.dataset.type, container);
    });

    container.querySelectorAll('.resp-save-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { saveTemplate(btn.dataset.type, btn, container); });
    });
    container.querySelectorAll('.resp-reset-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { resetTemplate(btn.dataset.type, container); });
    });
  }

  function bindFieldRow(row, type, container) {
    var rb = row.querySelector('.resp-remove-field-btn');
    if (rb) rb.addEventListener('click', function() { row.remove(); refreshPreview(type, container); });
    row.querySelectorAll('.resp-field-name, .resp-field-value').forEach(function(inp) {
      inp.addEventListener('input', function() { refreshPreview(type, container); });
    });
    row.querySelectorAll('.resp-field-inline-chk').forEach(function(chk) {
      chk.addEventListener('change', function() { refreshPreview(type, container); });
    });
  }

  /* --- save --- */
  function saveTemplate(type, btnEl, container) {
    var sk        = type.replace(/_/g, '-');
    var toggleEl  = container.querySelector('.resp-toggle[data-type="' + type + '"]');
    var contentEl = container.querySelector('.resp-content[data-type="' + type + '"]');
    var badgeEl   = document.getElementById('resp-badge-' + sk);
    var itemEl    = document.getElementById('resp-item-' + sk);
    var ev        = readEmbedValues(type, container);
    var content   = contentEl ? contentEl.value.trim() : '';
    var payload   = {
      enabled: toggleEl ? toggleEl.checked : true, content: content,
      embedEnabled: ev.embedEnabled, embedColor: ev.embedColor,
      embedAuthor: ev.embedAuthor, embedTitle: ev.embedTitle,
      embedDescription: ev.embedDescription, embedFooter: ev.embedFooter,
      embedThumbnail: ev.embedThumbnail, embedFields: ev.embedFields,
    };
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Saving...'; }
    fetch('/api/guild/' + state.guildId + '/bot-messages/' + encodeURIComponent(type), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    .then(function(res) { if (!res.ok) return res.json().then(function(e) { throw new Error(e.error || 'HTTP ' + res.status); }); return res.json(); })
    .then(function(saved) {
      state.templates[type] = saved;
      var hasCustom = !!(content || ev.embedTitle || ev.embedDescription);
      if (badgeEl) { badgeEl.className = hasCustom ? 'response-badge-custom' : 'response-badge-default'; badgeEl.textContent = hasCustom ? 'Custom' : 'Default'; }
      if (itemEl) itemEl.classList.toggle('response-has-override', hasCustom);
      updateCollapsedPreview(type, content, ev.embedEnabled, ev.embedColor, ev.embedTitle, ev.embedDescription, hasCustom, container);
      showToast('Response saved!', 'success');
    })
    .catch(function(err) { showToast('Save failed: ' + err.message, 'error'); })
    .finally(function() { if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Save Changes'; } });
  }

  function updateCollapsedPreview(type, content, embedOn, embedColor, eTitle, eDesc, hasCustom, container) {
    var sk   = type.replace(/_/g, '-');
    var item = document.getElementById('resp-item-' + sk);
    if (!item) return;
    var existing = item.querySelector('.resp-collapsed-preview');
    if (!existing) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = buildCollapsedPreview(content, embedOn, embedColor, eTitle, eDesc, hasCustom);
    item.replaceChild(tmp.firstElementChild, existing);
  }

  /* --- reset --- */
  function resetTemplate(type, container) {
    var meta  = state.types.find(function(t) { return t.key === type; }) || {};
    if (!await window.showConfirm('Reset "' + (meta.label || type) + '" to default?', { title: 'Reset Response', confirmText: 'Reset' })) return;
    var sk      = type.replace(/_/g, '-');
    var badgeEl = document.getElementById('resp-badge-' + sk);
    var itemEl  = document.getElementById('resp-item-' + sk);
    var defaults = { content: '', enabled: true, embedEnabled: true, embedColor: '#6366f1', embedAuthor: '', embedTitle: '', embedDescription: '', embedFooter: '', embedThumbnail: false, embedFields: [] };
    fetch('/api/guild/' + state.guildId + '/bot-messages/' + encodeURIComponent(type), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaults),
    })
    .then(function(res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(function(saved) {
      state.templates[type] = saved;
      var q = function(sel) { return container.querySelector(sel + '[data-type="' + type + '"]'); };
      var flds = document.getElementById('resp-fields-' + sk);
      var body = document.getElementById('resp-embed-body-' + sk);
      var colorLbl = document.getElementById('resp-color-val-' + sk);
      ['resp-content','resp-embed-author','resp-embed-title','resp-embed-footer'].forEach(function(cls) {
        var el = q('.' + cls); if (el) el.value = '';
      });
      var desc = q('.resp-embed-desc'); if (desc) desc.value = '';
      var color = q('.resp-embed-color'); if (color) color.value = '#6366f1';
      if (colorLbl) colorLbl.textContent = '#6366f1';
      var thumb = q('.resp-embed-thumbnail'); if (thumb) thumb.checked = false;
      var tog   = q('.resp-embed-toggle');   if (tog)   tog.checked   = true;
      if (flds) flds.innerHTML = '';
      if (body) body.classList.remove('resp-embed-body--hidden');
      if (badgeEl) { badgeEl.className = 'response-badge-default'; badgeEl.textContent = 'Default'; }
      if (itemEl) itemEl.classList.remove('response-has-override');
      updateCollapsedPreview(type, '', true, '#6366f1', '', '', false, container);
      refreshPreview(type, container);
      showToast('Reset to default.', 'info');
    })
    .catch(function(err) { showToast('Reset failed: ' + err.message, 'error'); });
  }

  /* --- utilities --- */
  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function showToast(msg, type) {
    type = type || 'info';
    if (typeof toast === 'function') { toast(msg, type); return; }
    var c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px'; document.body.appendChild(c); }
    var t = document.createElement('div');
    t.className = 'toast ' + type + ' show';
    t.textContent = (type==='success'?'check  ':type==='error'?'x  ':'i  ') + msg;
    c.appendChild(t);
    setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 400); }, 3200);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();

