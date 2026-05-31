/* ================================================================
   BUILDER.JS — Message Builder v1
   API:
     GET    /api/guild/:id/messages
     POST   /api/guild/:id/messages
     PUT    /api/guild/:id/messages/:msgId
     DELETE /api/guild/:id/messages/:msgId
     POST   /api/guild/:id/messages/:msgId/send
     POST   /api/guild/:id/messages/:msgId/attach
   ================================================================ */
(function () {
  'use strict';

  /* ── state ──────────────────────────────────────────────────── */
  var _guildId   = null;
  var _channels  = [];
  var _messages  = [];        // saved messages from API
  var _editing   = null;      // { _id, name, content, embeds, delivery, actionRows } or null=new
  var _initialized = false;

  /* ── helpers ────────────────────────────────────────────────── */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  function hexToInt(hex) {
    if (!hex) return 0x0f52ba;
    return parseInt(String(hex).replace(/^#/, ''), 16) || 0x0f52ba;
  }

  function intToHex(n) {
    if (!n && n !== 0) return '#0f52ba';
    return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6);
  }

  function apiFetch(path, opts) {
    return fetch('/api' + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || r.statusText); return d; }); });
  }

  function v(id) { return document.getElementById(id); }

  /* ── delivery type metadata ─────────────────────────────────── */
  var DELIVERY_TYPES = [
    { type: 'template',         icon: '📄', label: 'Template',       hint: 'Save as a reusable template. Send manually.' },
    { type: 'channel',          icon: '📢', label: 'Channel',        hint: 'Send to a specific channel immediately or on demand.' },
    { type: 'webhook',          icon: '🔗', label: 'Webhook',        hint: 'Send via a Discord webhook URL.' },
    { type: 'schedule_once',    icon: '🕐', label: 'Schedule Once',  hint: 'Send at a specific date and time.' },
    { type: 'schedule_repeat',  icon: '🔁', label: 'Recurring',      hint: 'Repeat on a set interval (e.g. every 60 minutes).' },
    { type: 'sticky',           icon: '📌', label: 'Sticky',         hint: 'Repost to the channel each time a new message is sent.' },
    { type: 'command',          icon: '⚡', label: 'Command',         hint: 'Trigger this message using a slash command keyword.' },
  ];

  var DELIVERY_BADGE = {
    template:        'badge-template',
    channel:         'badge-channel',
    webhook:         'badge-webhook',
    schedule_once:   'badge-schedule',
    schedule_repeat: 'badge-schedule',
    sticky:          'badge-sticky',
    command:         'badge-command',
  };

  /* ── default objects ─────────────────────────────────────────── */
  function defaultEmbed() {
    return { _uid: uid(), title: '', description: '', url: '', color: '#0f52ba', authorName: '', authorIcon: '', authorUrl: '', footerText: '', footerIcon: '', imageUrl: '', thumbnail: '', timestamp: false, fields: [] };
  }

  function defaultMsg() {
    return { name: '', content: '', embeds: [], delivery: { type: 'template', channelId: null, webhookUrl: null, scheduleAt: null, intervalMins: 60, commandTrigger: null, commandRequiredRoleId: null }, actionRows: [] };
  }

  /* ── init ────────────────────────────────────────────────────── */
  function init() {
    var pd = document.getElementById('pageData');
    if (!pd) return;
    _guildId = pd.dataset.guildId;
    if (!_guildId) return;

    document.addEventListener('sectionActivated', function (e) {
      if (e.detail && e.detail.section === 'embeds' && !_initialized) {
        _initialized = true;
        loadAll();
        bindTopBar();
        bindAttachModal();
      }
    });
  }

  /* ── load channels + messages ────────────────────────────────── */
  function loadAll() {
    apiFetch('/guild/' + _guildId + '/channels')
      .then(function (ch) { _channels = ch; })
      .catch(function () { _channels = []; });
    loadMessages();
  }

  function loadMessages() {
    apiFetch('/guild/' + _guildId + '/messages')
      .then(function (msgs) {
        _messages = msgs;
        renderStrip();
        checkEmptyState();
      })
      .catch(function (err) {
        console.error('[Builder] load messages', err);
        _messages = [];
        renderStrip();
        checkEmptyState();
      });
  }

  /* ── strip ───────────────────────────────────────────────────── */
  function renderStrip() {
    var strip = v('builderListStrip');
    if (!strip) return;
    strip.innerHTML = _messages.map(function (m) {
      var type = (m.delivery && m.delivery.type) || 'template';
      var label = (DELIVERY_TYPES.find(function (d) { return d.type === type; }) || {}).label || type;
      var badge  = DELIVERY_BADGE[type] || 'badge-template';
      var active = _editing && _editing._id === m._id ? ' active' : '';
      return '<div class="builder-msg-card' + active + '" data-id="' + esc(m._id) + '">' +
        '<div class="builder-msg-card-name">' + esc(m.name) + '</div>' +
        '<span class="builder-msg-card-badge ' + badge + '">' + label + '</span>' +
        '<div class="builder-msg-card-actions">' +
          '<button class="btn btn-sm btn-outline" data-edit="' + esc(m._id) + '">Edit</button>' +
          '<button class="btn btn-sm btn-danger" data-delete="' + esc(m._id) + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    strip.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); openEditor(btn.dataset.edit); });
    });
    strip.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); deleteMessage(btn.dataset.delete); });
    });
    strip.querySelectorAll('.builder-msg-card').forEach(function (card) {
      card.addEventListener('click', function () { openEditor(card.dataset.id); });
    });
  }

  function checkEmptyState() {
    var empty  = v('builderEmptyState');
    var editor = v('builderEditor');
    if (!empty) return;
    if (_editing) {
      empty.style.display = 'none';
    } else {
      empty.style.display = _messages.length ? 'none' : '';
    }
  }

  /* ── top bar buttons ─────────────────────────────────────────── */
  function bindTopBar() {
    var newBtn      = v('builderNewBtn');
    var newBtnEmpty = v('builderNewBtnEmpty');
    if (newBtn)      newBtn.addEventListener('click',      openNewEditor);
    if (newBtnEmpty) newBtnEmpty.addEventListener('click', openNewEditor);
  }

  function openNewEditor() {
    _editing = defaultMsg();
    buildEditorUI();
    showEditor();
  }

  /* ── open existing message in editor ────────────────────────── */
  function openEditor(msgId) {
    var m = _messages.find(function (x) { return x._id === msgId; });
    if (!m) return;
    _editing = JSON.parse(JSON.stringify(m));
    // ensure _uid on each embed for keying
    (_editing.embeds || []).forEach(function (e) { e._uid = e._uid || uid(); });
    buildEditorUI();
    showEditor();
    renderStrip(); // refresh active card
  }

  function showEditor() {
    var editor = v('builderEditor');
    var empty  = v('builderEmptyState');
    if (editor) editor.style.display = '';
    if (empty)  empty.style.display  = 'none';
  }

  function hideEditor() {
    var editor = v('builderEditor');
    if (editor) editor.style.display = 'none';
    _editing = null;
    renderStrip();
    checkEmptyState();
  }

  /* ── build editor UI ─────────────────────────────────────────── */
  function buildEditorUI() {
    if (!_editing) return;

    // Name
    var nameInput = v('builderEditorMsgName');
    if (nameInput) nameInput.value = _editing.name || '';

    // Content
    var contentTA = v('builderContent');
    var contentCount = v('builderContentCount');
    if (contentTA) {
      contentTA.value = _editing.content || '';
      if (contentCount) contentCount.textContent = contentTA.value.length;
      contentTA.oninput = function () {
        if (contentCount) contentCount.textContent = contentTA.value.length;
        updatePreview();
      };
    }

    // Embeds list
    renderEmbedsList();

    // Delivery
    renderDeliveryUI();

    // Action rows
    renderActionRowsList();

    // Preview
    updatePreview();

    // Bind top buttons
    bindEditorButtons();

    // Collapsibles
    bindCollapsibles();
  }

  function bindEditorButtons() {
    var backBtn    = v('builderEditorBack');
    var focusBtn   = v('builderFocusBtn');
    var saveBtn    = v('builderSaveBtn');
    var sendBtn    = v('builderSendNowBtn');
    var importBtn  = v('builderImportJsonBtn');
    var exportBtn  = v('builderExportJsonBtn');
    var fileInput  = v('builderJsonFileInput');
    var addEmbed   = v('builderAddEmbedBtn');
    var addRow     = v('builderAddRowBtn');

    if (backBtn)   backBtn.onclick   = hideEditor;
    if (focusBtn)  focusBtn.onclick  = toggleFocusMode;
    if (saveBtn)   saveBtn.onclick   = saveMessage;
    if (sendBtn)   sendBtn.onclick   = sendNow;
    if (importBtn) importBtn.onclick = function () { if (fileInput) fileInput.click(); };
    if (fileInput) fileInput.onchange = importJSON;
    if (exportBtn) exportBtn.onclick = exportJSON;
    if (addEmbed)  addEmbed.onclick  = addEmbed_handler;
    if (addRow)    addRow.onclick    = addActionRow;
  }

  /* ── focus mode ──────────────────────────────────────────────── */
  function toggleFocusMode() {
    var sec = document.getElementById('section-embeds');
    var btn = v('builderFocusBtn');
    if (!sec) return;
    var active = sec.classList.toggle('builder-focus-mode');
    document.body.classList.toggle('builder-focus-active', active);
    if (btn) btn.textContent = active ? '✕ Exit Focus' : '⤢ Focus Mode';
  }

  /* ── collapsibles ────────────────────────────────────────────── */
  function bindCollapsibles() {
    document.querySelectorAll('.bsec-header[data-collapsible]').forEach(function (hdr) {
      hdr.onclick = null;
      hdr.addEventListener('click', function () {
        var bsec = hdr.closest('.bsec');
        if (bsec) bsec.classList.toggle('open');
      });
    });
    document.querySelectorAll('.embed-panel-header').forEach(function (hdr) {
      hdr.onclick = null;
      hdr.addEventListener('click', function () {
        var panel = hdr.closest('.embed-panel');
        if (panel) panel.classList.toggle('open');
      });
    });
    document.querySelectorAll('.embed-sub-header').forEach(function (hdr) {
      hdr.onclick = null;
      hdr.addEventListener('click', function () {
        var sub = hdr.closest('.embed-sub');
        if (sub) sub.classList.toggle('open');
      });
    });
    document.querySelectorAll('.ar-comp-header').forEach(function (hdr) {
      hdr.onclick = null;
      hdr.addEventListener('click', function () {
        var comp = hdr.closest('.ar-comp');
        if (comp) comp.classList.toggle('open');
      });
    });
  }

  /* ── embeds ──────────────────────────────────────────────────── */
  function addEmbed_handler() {
    if (!_editing) return;
    if ((_editing.embeds || []).length >= 10) { alert('Maximum 10 embeds per message.'); return; }
    if (!_editing.embeds) _editing.embeds = [];
    _editing.embeds.push(defaultEmbed());
    renderEmbedsList();
    updatePreview();
  }

  function renderEmbedsList() {
    var list   = v('builderEmbedsList');
    var empty  = v('builderEmbedsEmpty');
    if (!list) return;
    var embeds = (_editing && _editing.embeds) || [];
    if (!embeds.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = embeds.map(function (em, idx) {
      return buildEmbedPanel(em, idx);
    }).join('');

    // Bind embed events
    list.querySelectorAll('[data-remove-embed]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); removeEmbed(parseInt(btn.dataset.removeEmbed)); });
    });
    list.querySelectorAll('[data-add-field]').forEach(function (btn) {
      btn.addEventListener('click', function () { addField(parseInt(btn.dataset.addField)); });
    });
    list.querySelectorAll('[data-remove-field]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeField(parseInt(btn.dataset.embedIdx), parseInt(btn.dataset.removeField)); });
    });

    // Live update from embed inputs
    list.querySelectorAll('[data-embed-field]').forEach(function (el) {
      el.addEventListener('input', function () { readEmbedValues(); updatePreview(); });
      el.addEventListener('change', function () { readEmbedValues(); updatePreview(); });
    });

    bindCollapsibles();
  }

  function buildEmbedPanel(em, idx) {
    var titleLabel = esc(em.title) || ('Embed ' + (idx + 1));
    var colorHex   = typeof em.color === 'number' ? intToHex(em.color) : (em.color || '#0f52ba');
    return '<div class="embed-panel open" data-embed-idx="' + idx + '">' +
      '<div class="embed-panel-header">' +
        '<div class="embed-panel-bar" style="background:' + esc(colorHex) + '"></div>' +
        '<div class="embed-panel-title">Embed ' + (idx + 1) + (em.title ? ' — ' + esc(em.title) : '') + '</div>' +
        '<button class="btn btn-sm btn-danger" data-remove-embed="' + idx + '" style="margin-left:auto;margin-right:0.5rem" title="Remove embed">✕</button>' +
        '<span class="embed-panel-chevron">▾</span>' +
      '</div>' +
      '<div class="embed-panel-body">' +
        /* Color */
        '<div class="embed-sub open">' +
          '<div class="embed-sub-header"><span class="embed-sub-title">Color</span><span class="embed-sub-chevron">▾</span></div>' +
          '<div class="embed-sub-body">' +
            '<div class="bf-color-row">' +
              '<label class="bf-label" style="flex-shrink:0">Color<input type="color" data-embed-field="color" data-idx="' + idx + '" value="' + esc(colorHex) + '"></label>' +
              '<label class="bf-label" style="flex:1">Hex<input type="text" data-embed-field="colorHex" data-idx="' + idx + '" value="' + esc(colorHex) + '" maxlength="7" placeholder="#0f52ba"></label>' +
            '</div>' +
          '</div>' +
        '</div>' +
        /* Author */
        '<div class="embed-sub open">' +
          '<div class="embed-sub-header"><span class="embed-sub-title">Author</span><span class="embed-sub-chevron">▾</span></div>' +
          '<div class="embed-sub-body">' +
            '<label class="bf-label">Author Name<input type="text" data-embed-field="authorName" data-idx="' + idx + '" value="' + esc(em.authorName) + '" maxlength="256" placeholder="Author name…"></label>' +
            '<div class="bf-row">' +
              '<label class="bf-label">Author Icon URL<input type="url" data-embed-field="authorIcon" data-idx="' + idx + '" value="' + esc(em.authorIcon) + '" placeholder="https://…"></label>' +
              '<label class="bf-label">Author URL<input type="url" data-embed-field="authorUrl" data-idx="' + idx + '" value="' + esc(em.authorUrl) + '" placeholder="https://…"></label>' +
            '</div>' +
          '</div>' +
        '</div>' +
        /* Body */
        '<div class="embed-sub open">' +
          '<div class="embed-sub-header"><span class="embed-sub-title">Body</span><span class="embed-sub-chevron">▾</span></div>' +
          '<div class="embed-sub-body">' +
            '<label class="bf-label">Title<input type="text" data-embed-field="title" data-idx="' + idx + '" value="' + esc(em.title) + '" maxlength="256" placeholder="Embed title…"></label>' +
            '<label class="bf-label">URL (makes title a link)<input type="url" data-embed-field="url" data-idx="' + idx + '" value="' + esc(em.url) + '" placeholder="https://…"></label>' +
            '<label class="bf-label">Description<textarea data-embed-field="description" data-idx="' + idx + '" rows="4" maxlength="4096" placeholder="Embed description…">' + esc(em.description) + '</textarea></label>' +
            '<label class="bf-toggle-row"><input type="checkbox" data-embed-field="timestamp" data-idx="' + idx + '"' + (em.timestamp ? ' checked' : '') + '> Show timestamp</label>' +
          '</div>' +
        '</div>' +
        /* Thumbnail + Image */
        '<div class="embed-sub open">' +
          '<div class="embed-sub-header"><span class="embed-sub-title">Images</span><span class="embed-sub-chevron">▾</span></div>' +
          '<div class="embed-sub-body">' +
            '<div class="bf-row">' +
              '<label class="bf-label">Thumbnail URL<input type="url" data-embed-field="thumbnail" data-idx="' + idx + '" value="' + esc(em.thumbnail) + '" placeholder="https://… (small, top-right)"></label>' +
              '<label class="bf-label">Image URL<input type="url" data-embed-field="imageUrl" data-idx="' + idx + '" value="' + esc(em.imageUrl) + '" placeholder="https://… (large, below body)"></label>' +
            '</div>' +
          '</div>' +
        '</div>' +
        /* Footer */
        '<div class="embed-sub open">' +
          '<div class="embed-sub-header"><span class="embed-sub-title">Footer</span><span class="embed-sub-chevron">▾</span></div>' +
          '<div class="embed-sub-body">' +
            '<label class="bf-label">Footer Text<input type="text" data-embed-field="footerText" data-idx="' + idx + '" value="' + esc(em.footerText) + '" maxlength="2048" placeholder="Footer text…"></label>' +
            '<label class="bf-label">Footer Icon URL<input type="url" data-embed-field="footerIcon" data-idx="' + idx + '" value="' + esc(em.footerIcon) + '" placeholder="https://…"></label>' +
          '</div>' +
        '</div>' +
        /* Fields */
        '<div class="embed-sub open">' +
          '<div class="embed-sub-header">' +
            '<span class="embed-sub-title">Fields (' + (em.fields || []).length + '/25)</span>' +
            '<button class="btn btn-sm" data-add-field="' + idx + '" style="margin-left:auto">+ Field</button>' +
            '<span class="embed-sub-chevron" style="margin-left:0.4rem">▾</span>' +
          '</div>' +
          '<div class="embed-sub-body">' +
            '<div class="embed-fields-list" id="fieldslist-' + idx + '">' +
              (em.fields || []).map(function (f, fi) { return buildFieldRow(f, idx, fi); }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' + // embed-panel-body
    '</div>';    // embed-panel
  }

  function buildFieldRow(f, embedIdx, fieldIdx) {
    return '<div class="embed-field-row">' +
      '<label class="bf-label" style="flex:1">Name<input type="text" data-embed-field="fieldName" data-idx="' + embedIdx + '" data-fidx="' + fieldIdx + '" value="' + esc(f.name) + '" maxlength="256" placeholder="Field name…"></label>' +
      '<label class="bf-label" style="flex:2">Value<input type="text" data-embed-field="fieldValue" data-idx="' + embedIdx + '" data-fidx="' + fieldIdx + '" value="' + esc(f.value) + '" maxlength="1024" placeholder="Field value…"></label>' +
      '<div class="embed-field-inline-wrap"><input type="checkbox" data-embed-field="fieldInline" data-idx="' + embedIdx + '" data-fidx="' + fieldIdx + '"' + (f.inline ? ' checked' : '') + '> Inline</div>' +
      '<button class="btn btn-sm btn-danger" data-remove-field="' + fieldIdx + '" data-embed-idx="' + embedIdx + '" style="margin-top:1.4rem;flex-shrink:0" title="Remove field">✕</button>' +
    '</div>';
  }

  function readEmbedValues() {
    if (!_editing) return;
    var list = v('builderEmbedsList');
    if (!list) return;
    var embeds = _editing.embeds || [];

    list.querySelectorAll('[data-embed-field]').forEach(function (el) {
      var field = el.dataset.embedField;
      var idx   = parseInt(el.dataset.idx);
      var fidx  = el.dataset.fidx !== undefined ? parseInt(el.dataset.fidx) : null;
      if (!embeds[idx]) return;
      var em = embeds[idx];

      if (field === 'color') {
        em.color = hexToInt(el.value);
        var hexInput = list.querySelector('[data-embed-field="colorHex"][data-idx="' + idx + '"]');
        if (hexInput) hexInput.value = el.value;
        // Update bar
        var panel = list.querySelector('[data-embed-idx="' + idx + '"] .embed-panel-bar');
        if (panel) panel.style.background = el.value;
      } else if (field === 'colorHex') {
        if (/^#[0-9a-fA-F]{6}$/.test(el.value)) {
          em.color = hexToInt(el.value);
          var picker = list.querySelector('[data-embed-field="color"][data-idx="' + idx + '"]');
          if (picker) picker.value = el.value;
          var bar = list.querySelector('[data-embed-idx="' + idx + '"] .embed-panel-bar');
          if (bar) bar.style.background = el.value;
        }
      } else if (field === 'timestamp') {
        em.timestamp = el.checked;
      } else if (field === 'fieldName' && fidx !== null) {
        if (!em.fields) em.fields = [];
        if (!em.fields[fidx]) em.fields[fidx] = {};
        em.fields[fidx].name = el.value;
      } else if (field === 'fieldValue' && fidx !== null) {
        if (!em.fields) em.fields = [];
        if (!em.fields[fidx]) em.fields[fidx] = {};
        em.fields[fidx].value = el.value;
      } else if (field === 'fieldInline' && fidx !== null) {
        if (!em.fields) em.fields = [];
        if (!em.fields[fidx]) em.fields[fidx] = {};
        em.fields[fidx].inline = el.checked;
      } else {
        em[field] = el.value || null;
      }
    });
  }

  function addField(embedIdx) {
    if (!_editing || !_editing.embeds[embedIdx]) return;
    var em = _editing.embeds[embedIdx];
    if (!em.fields) em.fields = [];
    if (em.fields.length >= 25) { alert('Maximum 25 fields per embed.'); return; }
    em.fields.push({ name: '', value: '', inline: false });
    renderEmbedsList();
    updatePreview();
  }

  function removeField(embedIdx, fieldIdx) {
    if (!_editing || !_editing.embeds[embedIdx]) return;
    _editing.embeds[embedIdx].fields.splice(fieldIdx, 1);
    renderEmbedsList();
    updatePreview();
  }

  function removeEmbed(idx) {
    if (!_editing) return;
    _editing.embeds.splice(idx, 1);
    renderEmbedsList();
    updatePreview();
  }

  /* ── delivery ────────────────────────────────────────────────── */
  function renderDeliveryUI() {
    var grid = v('deliveryTypeGrid');
    var cfg  = v('deliveryConfig');
    if (!grid || !cfg) return;
    var current = (_editing && _editing.delivery && _editing.delivery.type) || 'template';

    grid.innerHTML = DELIVERY_TYPES.map(function (d) {
      return '<button class="delivery-type-btn' + (d.type === current ? ' active' : '') + '" data-dtype="' + d.type + '">' +
        '<span class="delivery-type-icon">' + d.icon + '</span>' +
        '<span>' + d.label + '</span>' +
      '</button>';
    }).join('');

    grid.querySelectorAll('.delivery-type-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _editing.delivery = Object.assign(_editing.delivery || {}, { type: btn.dataset.dtype });
        renderDeliveryUI();
      });
    });

    cfg.innerHTML = buildDeliveryConfig(current);
    bindDeliveryConfig(current);
  }

  function channelOptions(selectedId) {
    var opts = '<option value="">— Select channel —</option>';
    (_channels || []).filter(function (c) { return c.type === 0 || c.type === 5; }).forEach(function (c) {
      opts += '<option value="' + esc(c.id) + '"' + (c.id === selectedId ? ' selected' : '') + '>#' + esc(c.name) + '</option>';
    });
    return opts;
  }

  function buildDeliveryConfig(type) {
    var d = (_editing && _editing.delivery) || {};
    if (type === 'template')  return '<p class="bf-hint">This message is saved as a reusable template. Use <strong>Send Now</strong> to send it on demand.</p>';
    if (type === 'channel')   return '<label class="bf-label">Channel<select id="deliveryChannel">' + channelOptions(d.channelId) + '</select></label>';
    if (type === 'webhook')   return '<label class="bf-label">Webhook URL<input type="url" id="deliveryWebhook" value="' + esc(d.webhookUrl) + '" placeholder="https://discord.com/api/webhooks/…"></label>';
    if (type === 'schedule_once') return '<label class="bf-label">Send at<input type="datetime-local" id="deliveryScheduleAt" value="' + (d.scheduleAt ? new Date(d.scheduleAt).toISOString().slice(0, 16) : '') + '"></label>';
    if (type === 'schedule_repeat') return '<label class="bf-label">Repeat every (minutes)<input type="number" id="deliveryInterval" value="' + (d.intervalMins || 60) + '" min="5" max="44640"></label>';
    if (type === 'sticky')    return '<label class="bf-label">Stick to channel<select id="deliveryChannel">' + channelOptions(d.channelId) + '</select></label><p class="bf-hint" style="margin-top:0.5rem">Every time a new message is posted in the channel, the bot deletes the previous sticky and reposts this message.</p>';
    if (type === 'command')   return '<label class="bf-label">Command trigger keyword<input type="text" id="deliveryCommand" value="' + esc(d.commandTrigger) + '" placeholder="e.g. rules, info, help…" maxlength="32"></label>';
    return '';
  }

  function bindDeliveryConfig(type) {
    if (type === 'channel' || type === 'sticky') {
      var sel = v('deliveryChannel');
      if (sel) sel.addEventListener('change', function () { _editing.delivery.channelId = sel.value || null; });
    }
    if (type === 'webhook') {
      var inp = v('deliveryWebhook');
      if (inp) inp.addEventListener('input', function () { _editing.delivery.webhookUrl = inp.value || null; });
    }
    if (type === 'schedule_once') {
      var dt = v('deliveryScheduleAt');
      if (dt) dt.addEventListener('change', function () { _editing.delivery.scheduleAt = dt.value ? new Date(dt.value).toISOString() : null; });
    }
    if (type === 'schedule_repeat') {
      var itv = v('deliveryInterval');
      if (itv) itv.addEventListener('input', function () { _editing.delivery.intervalMins = parseInt(itv.value) || 60; });
    }
    if (type === 'command') {
      var cmd = v('deliveryCommand');
      if (cmd) cmd.addEventListener('input', function () { _editing.delivery.commandTrigger = cmd.value || null; });
    }
  }

  /* ── action rows ─────────────────────────────────────────────── */
  function addActionRow() {
    if (!_editing) return;
    if (!_editing.actionRows) _editing.actionRows = [];
    if (_editing.actionRows.length >= 5) { alert('Maximum 5 action rows per message.'); return; }
    _editing.actionRows.push({ rowId: uid(), rowType: 'button', placeholder: null, options: [] });
    renderActionRowsList();
  }

  function renderActionRowsList() {
    var list  = v('builderActionRowsList');
    var empty = v('builderActionRowsEmpty');
    if (!list) return;
    var rows = (_editing && _editing.actionRows) || [];
    if (!rows.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = rows.map(function (row, ri) { return buildARRow(row, ri); }).join('');

    list.querySelectorAll('[data-remove-row]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeActionRow(parseInt(btn.dataset.removeRow)); });
    });
    list.querySelectorAll('[data-ar-type]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var ri = parseInt(sel.dataset.arType);
        _editing.actionRows[ri].rowType = sel.value;
        renderActionRowsList();
      });
    });
    list.querySelectorAll('[data-add-option]').forEach(function (btn) {
      btn.addEventListener('click', function () { addAROption(parseInt(btn.dataset.addOption)); });
    });
    list.querySelectorAll('[data-remove-option]').forEach(function (btn) {
      btn.addEventListener('click', function () { removeAROption(parseInt(btn.dataset.rowIdx), parseInt(btn.dataset.removeOption)); });
    });
    list.querySelectorAll('[data-ar-opt-field]').forEach(function (el) {
      el.addEventListener('input', function () { readARValues(); });
      el.addEventListener('change', function () { readARValues(); });
    });
    list.querySelectorAll('[data-ar-style]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ri  = parseInt(btn.dataset.rowIdx);
        var oi  = parseInt(btn.dataset.optIdx);
        var sty = btn.dataset.arStyle;
        if (_editing.actionRows[ri] && _editing.actionRows[ri].options[oi]) {
          _editing.actionRows[ri].options[oi].style = sty;
          btn.closest('.ar-style-row').querySelectorAll('.ar-style-btn').forEach(function (b) {
            b.classList.toggle('selected', b.dataset.arStyle === sty);
          });
        }
      });
    });
    bindCollapsibles();
  }

  function buildARRow(row, ri) {
    var typeOpts = [
      { v: 'button', l: '🔵 Buttons' },
      { v: 'select', l: '📋 Select Menu' },
      { v: 'emoji',  l: '😀 Emoji Reactions' },
    ].map(function (o) { return '<option value="' + o.v + '"' + (row.rowType === o.v ? ' selected' : '') + '>' + o.l + '</option>'; }).join('');

    return '<div class="ar-row">' +
      '<div class="ar-row-header">' +
        '<span class="ar-row-label">Row ' + (ri + 1) + '</span>' +
        '<select class="ar-row-type-select" data-ar-type="' + ri + '">' + typeOpts + '</select>' +
        '<button class="btn btn-sm btn-danger" data-remove-row="' + ri + '" style="margin-left:auto">✕ Remove</button>' +
      '</div>' +
      '<div class="ar-row-body">' +
        '<div class="ar-components-list">' +
          (row.options || []).map(function (opt, oi) { return buildAROption(opt, row.rowType, ri, oi); }).join('') +
        '</div>' +
        '<button class="btn btn-sm" data-add-option="' + ri + '" style="margin-top:0.5rem">+ Add ' + (row.rowType === 'emoji' ? 'Emoji' : row.rowType === 'select' ? 'Option' : 'Button') + '</button>' +
      '</div>' +
    '</div>';
  }

  function buildAROption(opt, rowType, ri, oi) {
    var styles = ['primary', 'secondary', 'success', 'danger', 'link'];
    var styleRow = rowType === 'button' ? '<div class="ar-style-row">' + styles.map(function (s) {
      return '<button type="button" class="ar-style-btn' + (opt.style === s ? ' selected' : '') + '" data-ar-style="' + s + '" data-row-idx="' + ri + '" data-opt-idx="' + oi + '">' + s + '</button>';
    }).join('') + '</div>' : '';

    var labelPlaceholder = rowType === 'emoji' ? 'Emoji (e.g. ⭐ or :star:)' : 'Label…';

    return '<div class="ar-comp open">' +
      '<div class="ar-comp-header">' +
        '<span class="ar-comp-title">' + (opt.label || (rowType === 'emoji' ? 'Emoji ' : 'Option ') + (oi + 1)) + '</span>' +
        '<button class="btn btn-sm btn-danger" data-remove-option="' + oi + '" data-row-idx="' + ri + '" style="flex-shrink:0">✕</button>' +
        '<span class="ar-comp-chevron" style="margin-left:0.4rem">▾</span>' +
      '</div>' +
      '<div class="ar-comp-body">' +
        '<label class="bf-label">Label / Emoji<input type="text" data-ar-opt-field="label" data-row-idx="' + ri + '" data-opt-idx="' + oi + '" value="' + esc(opt.label) + '" placeholder="' + esc(labelPlaceholder) + '" maxlength="80"></label>' +
        (rowType !== 'emoji' ? '<label class="bf-label">Emoji (optional, e.g. ⭐)<input type="text" data-ar-opt-field="emoji" data-row-idx="' + ri + '" data-opt-idx="' + oi + '" value="' + esc(opt.emoji) + '" maxlength="20" placeholder="Optional emoji…"></label>' : '') +
        styleRow +
        (rowType === 'button' || rowType === 'select' ? buildARActionSection(opt, ri, oi) : '') +
      '</div>' +
    '</div>';
  }

  function buildARActionSection(opt, ri, oi) {
    var actions = ['role', 'message', 'dm'].map(function (a) {
      return '<option value="' + a + '"' + (opt.action === a ? ' selected' : '') + '>' + (a === 'role' ? '🎭 Toggle Role' : a === 'message' ? '💬 Reply Message' : '📩 DM User') + '</option>';
    }).join('');
    return '<div class="ar-action-section">' +
      '<label class="bf-label">Action<select data-ar-opt-field="action" data-row-idx="' + ri + '" data-opt-idx="' + oi + '">' + actions + '</select></label>' +
      (opt.action === 'role' ? '<label class="bf-label">Role ID<input type="text" data-ar-opt-field="roleId" data-row-idx="' + ri + '" data-opt-idx="' + oi + '" value="' + esc(opt.roleId) + '" placeholder="Role ID…" maxlength="30"></label>' : '') +
      ((opt.action === 'message' || opt.action === 'dm') ? '<label class="bf-label">Response Content<input type="text" data-ar-opt-field="content" data-row-idx="' + ri + '" data-opt-idx="' + oi + '" value="' + esc(opt.content) + '" placeholder="Response text…" maxlength="2000"></label>' : '') +
    '</div>';
  }

  function readARValues() {
    if (!_editing) return;
    var list = v('builderActionRowsList');
    if (!list) return;
    list.querySelectorAll('[data-ar-opt-field]').forEach(function (el) {
      var field = el.dataset.arOptField;
      var ri    = parseInt(el.dataset.rowIdx);
      var oi    = parseInt(el.dataset.optIdx);
      if (!_editing.actionRows[ri] || !_editing.actionRows[ri].options[oi]) return;
      _editing.actionRows[ri].options[oi][field] = el.value || null;
    });
  }

  function addAROption(ri) {
    if (!_editing || !_editing.actionRows[ri]) return;
    _editing.actionRows[ri].options.push({ optId: uid(), label: '', emoji: null, style: 'primary', action: 'role', roleId: null, content: null });
    renderActionRowsList();
  }

  function removeAROption(ri, oi) {
    if (!_editing || !_editing.actionRows[ri]) return;
    _editing.actionRows[ri].options.splice(oi, 1);
    renderActionRowsList();
  }

  function removeActionRow(ri) {
    if (!_editing) return;
    _editing.actionRows.splice(ri, 1);
    renderActionRowsList();
  }

  /* ── Discord preview ─────────────────────────────────────────── */
  function updatePreview() {
    if (!_editing) return;

    var contentEl    = v('previewContent');
    var embedsEl     = v('previewEmbeds');
    var componentsEl = v('previewComponents');
    var tsEl         = v('previewTimestamp');

    // Content
    if (contentEl) {
      var text = (v('builderContent') && v('builderContent').value) || _editing.content || '';
      contentEl.className = 'discord-content';
      contentEl.textContent = text;
    }

    // Embeds
    readEmbedValues();
    if (embedsEl) {
      embedsEl.innerHTML = (_editing.embeds || []).map(function (em) {
        var colorHex = typeof em.color === 'number' ? intToHex(em.color) : (em.color || '#0f52ba');
        var html = '<div class="dp-embed" style="border-left-color:' + esc(colorHex) + '">';
        html += '<div class="dp-embed-body">';
        if (em.authorName) html += '<div class="dp-embed-author">' + (em.authorIcon ? '<img src="' + esc(em.authorIcon) + '" onerror="this.style.display=\'none\'">' : '') + esc(em.authorName) + '</div>';
        if (em.title) html += '<div class="dp-embed-title">' + (em.url ? '<a href="' + esc(em.url) + '" target="_blank" rel="noopener noreferrer">' + esc(em.title) + '</a>' : esc(em.title)) + '</div>';
        if (em.description) html += '<div class="dp-embed-desc" style="font-size:0.85rem;color:#dbdee1;line-height:1.4;white-space:pre-wrap;word-break:break-word">' + esc(em.description) + '</div>';
        if (em.fields && em.fields.length) {
          var inlines = []; var fieldsHTML = '';
          em.fields.forEach(function (f) {
            fieldsHTML += '<div style="margin-top:0.4rem' + (f.inline ? ';display:inline-block;min-width:150px;margin-right:1rem;vertical-align:top' : '') + '"><div style="font-size:0.8rem;font-weight:700;color:#fff;margin-bottom:2px">' + esc(f.name) + '</div><div style="font-size:0.8rem;color:#dbdee1">' + esc(f.value) + '</div></div>';
          });
          html += '<div style="margin-top:0.5rem;display:flex;flex-wrap:wrap">' + fieldsHTML + '</div>';
        }
        if (em.imageUrl) html += '<img src="' + esc(em.imageUrl) + '" style="max-width:100%;border-radius:4px;margin-top:0.5rem" onerror="this.style.display=\'none\'">';
        if (em.footerText || em.timestamp) {
          html += '<div style="font-size:0.75rem;color:#949ba4;margin-top:0.5rem;display:flex;align-items:center;gap:0.3rem">';
          if (em.footerIcon) html += '<img src="' + esc(em.footerIcon) + '" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display=\'none\'">';
          if (em.footerText) html += esc(em.footerText);
          if (em.footerText && em.timestamp) html += ' • ';
          if (em.timestamp) html += new Date().toLocaleString();
          html += '</div>';
        }
        html += '</div>';
        if (em.thumbnail) html += '<div style="padding:0.65rem 0.5rem 0 0;flex-shrink:0"><img src="' + esc(em.thumbnail) + '" style="width:80px;height:80px;object-fit:cover;border-radius:4px" onerror="this.style.display=\'none\'"></div>';
        html += '</div>';
        return html;
      }).join('');
    }

    // Components
    readARValues();
    if (componentsEl) {
      componentsEl.innerHTML = (_editing.actionRows || []).map(function (row) {
        if (row.rowType === 'button') {
          return '<div class="dp-action-row">' + (row.options || []).map(function (opt) {
            return '<div class="dp-btn dp-btn-' + esc(opt.style || 'primary') + '">' + (opt.emoji ? esc(opt.emoji) + ' ' : '') + esc(opt.label || 'Button') + '</div>';
          }).join('') + '</div>';
        }
        if (row.rowType === 'select') {
          return '<div class="dp-action-row"><div class="dp-select">' + esc(row.placeholder || 'Select an option…') + '</div></div>';
        }
        if (row.rowType === 'emoji') {
          return '<div class="dp-reactions">' + (row.options || []).map(function (opt) {
            return '<div class="dp-reaction">' + esc(opt.label || '⭐') + ' 0</div>';
          }).join('') + '</div>';
        }
        return '';
      }).join('');
    }

    // Timestamp
    if (tsEl) {
      tsEl.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  }

  /* ── save ────────────────────────────────────────────────────── */
  function collectData() {
    if (!_editing) return null;
    var nameInput = v('builderEditorMsgName');
    _editing.name    = nameInput ? nameInput.value.trim() : _editing.name;
    _editing.content = v('builderContent') ? v('builderContent').value : _editing.content;
    readEmbedValues();
    readARValues();
    return {
      name:       _editing.name,
      content:    _editing.content || null,
      embeds:     (_editing.embeds || []).map(function (em) {
        var out = Object.assign({}, em);
        delete out._uid;
        if (typeof out.color === 'string') out.color = hexToInt(out.color);
        return out;
      }),
      delivery:   _editing.delivery || { type: 'template' },
      actionRows: _editing.actionRows || [],
    };
  }

  function saveMessage() {
    var btn = v('builderSaveBtn');
    if (!btn) return;
    var data = collectData();
    if (!data) return;
    if (!data.name) { alert('Please enter a message name.'); return; }

    btn.disabled = true;
    btn.textContent = 'Saving…';

    var promise = _editing._id
      ? apiFetch('/guild/' + _guildId + '/messages/' + _editing._id, { method: 'PUT',  body: JSON.stringify(data) })
      : apiFetch('/guild/' + _guildId + '/messages',                  { method: 'POST', body: JSON.stringify(data) });

    promise.then(function (saved) {
      _editing._id = saved._id || _editing._id;
      btn.textContent = '✓ Saved';
      setTimeout(function () { btn.textContent = '💾 Save'; btn.disabled = false; }, 2000);
      loadMessages();
    }).catch(function (err) {
      btn.textContent = '💾 Save';
      btn.disabled = false;
      alert('Save failed: ' + err.message);
    });
  }

  /* ── send now ────────────────────────────────────────────────── */
  function sendNow() {
    if (!_editing || !_editing._id) {
      alert('Save the message first before sending.');
      return;
    }
    var btn = v('builderSendNowBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    apiFetch('/guild/' + _guildId + '/messages/' + _editing._id + '/send', { method: 'POST', body: JSON.stringify({}) })
      .then(function () {
        if (btn) { btn.textContent = '✓ Sent!'; setTimeout(function () { btn.textContent = '▶ Send Now'; btn.disabled = false; }, 2500); }
      })
      .catch(function (err) {
        if (btn) { btn.textContent = '▶ Send Now'; btn.disabled = false; }
        alert('Send failed: ' + err.message);
      });
  }

  /* ── delete ──────────────────────────────────────────────────── */
  function deleteMessage(msgId) {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    apiFetch('/guild/' + _guildId + '/messages/' + msgId, { method: 'DELETE' })
      .then(function () {
        if (_editing && _editing._id === msgId) hideEditor();
        loadMessages();
      })
      .catch(function (err) { alert('Delete failed: ' + err.message); });
  }

  /* ── import / export JSON ────────────────────────────────────── */
  function exportJSON() {
    var data = collectData();
    if (!data) return;
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (data.name || 'message') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJSON() {
    var fileInput = v('builderJsonFileInput');
    if (!fileInput || !fileInput.files[0]) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!_editing) _editing = defaultMsg();
        if (data.name)       _editing.name       = data.name;
        if (data.content !== undefined) _editing.content = data.content;
        if (Array.isArray(data.embeds)) {
          _editing.embeds = data.embeds.map(function (em) { em._uid = uid(); return em; });
        }
        if (data.delivery)    _editing.delivery    = data.delivery;
        if (data.actionRows)  _editing.actionRows  = data.actionRows;
        buildEditorUI();
        if (v('builderEditorMsgName')) v('builderEditorMsgName').value = _editing.name || '';
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(fileInput.files[0]);
    fileInput.value = '';
  }

  /* ── attach modal ────────────────────────────────────────────── */
  function openAttachModal()  { var b = v('attachMsgBackdrop'); if (b) { b.classList.add('open');    b.setAttribute('aria-hidden', 'false'); } }
  function closeAttachModal() { var b = v('attachMsgBackdrop'); if (b) { b.classList.remove('open'); b.setAttribute('aria-hidden', 'true');  } }

  function bindAttachModal() {
    var openBtn   = v('builderAttachMsgBtn');
    var closeBtn  = v('attachMsgClose');
    var cancelBtn = v('attachMsgCancel');
    var attachBtn = v('attachMsgConfirm');
    var backdrop  = v('attachMsgBackdrop');
    var urlInput  = v('attachMsgUrl');

    if (openBtn)   openBtn.addEventListener('click',   openAttachModal);
    if (closeBtn)  closeBtn.addEventListener('click',  closeAttachModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAttachModal);
    if (backdrop)  backdrop.addEventListener('click',  function (e) { if (e.target === backdrop) closeAttachModal(); });

    if (attachBtn) {
      attachBtn.addEventListener('click', function () {
        if (!_editing || !_editing._id) { alert('Save the message first.'); return; }
        var url = urlInput && urlInput.value.trim();
        if (!url) { alert('Please enter a Discord message URL.'); return; }
        var statusEl = document.getElementById('attachMsgStatus');
        attachBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Attaching…';
        apiFetch('/guild/' + _guildId + '/messages/' + _editing._id + '/attach', { method: 'POST', body: JSON.stringify({ messageUrl: url }) })
          .then(function () {
            closeAttachModal();
            if (urlInput)  urlInput.value   = '';
            if (statusEl)  statusEl.textContent = '';
            attachBtn.disabled = false;
          })
          .catch(function (err) {
            if (statusEl) statusEl.textContent = 'Error: ' + err.message;
            attachBtn.disabled = false;
          });
      });
    }
  }

  /* ── bootstrap ───────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
