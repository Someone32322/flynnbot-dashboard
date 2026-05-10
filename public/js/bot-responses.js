/* ============================================================
   BOT-RESPONSES.JS - Bot Message Template Manager
   API:
     GET  /api/guild/:id/bot-messages  ->  { types: [{key,label,group}], templates: {type->doc} }
     PATCH /api/guild/:id/bot-messages/:type -> saved doc
   Supports: plain text content + full embed builder
   ============================================================ */

(function () {
  "use strict";

  var state = {
    guildId:   null,
    types:     [],
    templates: {},
    loaded:    false,
  };

  var GROUP_ICON = {
    "Punishment Responses": "🔨",
    "Logging":   "📋",
    "Community": "👋",
    "Economy":   "💰",
    "Leveling":  "⭐",
  };

  var GROUP_VARS = {
    "Punishment Responses": ["{user}", "{moderator}", "{reason}", "{duration}", "{case}", "{guild}"],
    "Logging":   ["{user}", "{moderator}", "{reason}", "{guild}", "{channel}"],
    "Community": ["{user}", "{guild}", "{memberCount}"],
    "Economy":   ["{user}", "{amount}", "{balance}", "{guild}"],
    "Leveling":  ["{user}", "{level}", "{xp}", "{guild}"],
  };

  function init() {
    var pd = document.getElementById("pageData");
    if (!pd) return;
    state.guildId = pd.dataset.guildId;
    if (!state.guildId) return;

    document.addEventListener("sectionActivated", function(e) {
      if (e.detail && e.detail.section === "responses" && !state.loaded) {
        loadTemplates();
      }
    });

    var sec = document.getElementById("section-responses");
    if (sec && sec.style.display !== "none" && !state.loaded) {
      loadTemplates();
    }
  }

  function loadTemplates() {
    var container = document.getElementById("botResponsesContainer");
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading response templates…</div>';

    fetch("/api/guild/" + state.guildId + "/bot-messages")
      .then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function(data) {
        state.types     = Array.isArray(data.types) ? data.types : [];
        state.templates = (data.templates && typeof data.templates === "object") ? data.templates : {};
        state.loaded    = true;
        render(container);
      })
      .catch(function(err) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load response templates.<br><small style="color:var(--text-4)">' + esc(err.message) + '</small></p></div>';
      });
  }

  function render(container) {
    if (!state.types.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>No response types configured.</p></div>';
      return;
    }

    var groups = {};
    state.types.forEach(function(t) {
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group].push({ key: t.key, label: t.label, tpl: state.templates[t.key] || null });
    });

    var html = "";
    Object.keys(groups).forEach(function(groupName) {
      var icon  = GROUP_ICON[groupName] || "📝";
      var vars  = GROUP_VARS[groupName] || [];
      var items = groups[groupName];
      html += '<div class="responses-group"><div class="responses-group-title">' + icon + " " + esc(groupName) + "</div>";
      items.forEach(function(item) { html += buildItemHtml(item, vars); });
      html += "</div>";
    });

    container.innerHTML = html;
    attachListeners(container);
  }

  function buildItemHtml(item, vars) {
    var tpl        = item.tpl || {};
    var enabled    = tpl.enabled !== false;
    var content    = tpl.content || "";
    var embedOn    = tpl.embedEnabled !== false;
    var embedColor = tpl.embedColor  || "#6366f1";
    var eTitle     = tpl.embedTitle  || "";
    var eAuthor    = tpl.embedAuthor || "";
    var eDesc      = tpl.embedDescription || "";
    var eFooter    = tpl.embedFooter || "";
    var eThumbnail = !!tpl.embedThumbnail;
    var eFields    = Array.isArray(tpl.embedFields) ? tpl.embedFields : [];
    var hasCustom  = content.length > 0 || eTitle.length > 0 || eDesc.length > 0;
    var sk         = item.key.replace(/_/g, "-");

    var varChips = vars.map(function(v) {
      return '<span class="response-var-chip" data-var="' + v + '" data-type="' + item.key + '" tabindex="0" role="button" title="Insert ' + v + '">' + v + '</span>';
    }).join("");

    var fieldsHtml = "";
    eFields.forEach(function(f, i) { fieldsHtml += buildFieldRow(item.key, i, f.name || "", f.value || "", !!f.inline); });

    var h = "";
    h += '<div class="response-item' + (hasCustom ? " response-has-override" : "") + '" id="resp-item-' + sk + '" data-type="' + item.key + '">';
    h += '<div class="response-item-header">';
    h += '<div><div class="response-item-name">' + esc(item.label);
    h += ' <span class="' + (hasCustom ? "response-badge-custom" : "response-badge-default") + '" id="resp-badge-' + sk + '">' + (hasCustom ? "Custom" : "Default") + '</span></div></div>';
    h += '<div class="response-item-actions">';
    h += '<label class="toggle-switch" title="Enable / Disable"><input type="checkbox" class="resp-toggle" data-type="' + item.key + '"' + (enabled ? " checked" : "") + '><span class="toggle-slider"></span></label>';
    h += '<button class="btn btn-ghost btn-sm resp-expand-btn" data-type="' + item.key + '" aria-expanded="false">Edit</button>';
    h += '</div></div>';

    h += '<div class="response-editor" id="resp-editor-' + sk + '">';

    h += '<div class="resp-field-group">';
    h += '<label class="resp-field-label">Plain Text Content <span class="resp-field-hint">Appears above the embed</span></label>';
    h += '<textarea class="resp-content resp-input" data-type="' + item.key + '" rows="2" placeholder="Optional — leave blank to send the embed only">' + esc(content) + '</textarea>';
    h += '</div>';

    if (vars.length) {
      h += '<div class="resp-field-group"><div class="resp-field-label">Insert variable</div><div class="response-variables">' + varChips + '</div></div>';
    }

    h += '<div class="resp-embed-section">';
    h += '<div class="resp-embed-header">';
    h += '<div class="resp-embed-header-left"><div class="resp-embed-title-text">Discord Embed</div><div class="resp-embed-subtitle">Rich embed attached to this response</div></div>';
    h += '<label class="toggle-switch"><input type="checkbox" class="resp-embed-toggle" data-type="' + item.key + '"' + (embedOn ? " checked" : "") + '><span class="toggle-slider"></span></label>';
    h += '</div>';

    h += '<div class="resp-embed-body' + (embedOn ? "" : " resp-embed-body--hidden") + '" id="resp-embed-body-' + sk + '">';

    h += '<div class="resp-embed-color-row"><label class="resp-field-label" style="margin:0">Embed Color</label>';
    h += '<div style="display:flex;align-items:center;gap:8px"><input type="color" class="resp-embed-color resp-color-input" data-type="' + item.key + '" value="' + esc(embedColor) + '">';
    h += '<span class="resp-embed-color-value" id="resp-color-val-' + sk + '">' + esc(embedColor) + '</span></div></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Author <span class="resp-field-hint">Small text above title</span></label>';
    h += '<input type="text" class="resp-embed-author resp-input" data-type="' + item.key + '" placeholder="e.g. FlynnBot Moderation" maxlength="256" value="' + esc(eAuthor) + '"></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Title</label>';
    h += '<input type="text" class="resp-embed-title resp-input" data-type="' + item.key + '" placeholder="e.g. You have been warned" maxlength="256" value="' + esc(eTitle) + '"></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Description <span class="resp-field-hint">Supports variables</span></label>';
    h += '<textarea class="resp-embed-desc resp-input" data-type="' + item.key + '" rows="3" placeholder="e.g. {user}, you were warned by {moderator} for: {reason}" maxlength="4096">' + esc(eDesc) + '</textarea></div>';

    h += '<div class="resp-field-group"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
    h += '<div class="resp-field-label" style="margin:0">Fields <span class="resp-field-hint">Up to 5</span></div>';
    h += '<button class="btn btn-ghost btn-sm resp-add-field-btn" data-type="' + item.key + '" type="button">+ Add Field</button></div>';
    h += '<div class="resp-embed-fields-list" id="resp-fields-' + sk + '">' + fieldsHtml + '</div></div>';

    h += '<div class="resp-field-group"><label class="resp-field-label">Footer</label>';
    h += '<input type="text" class="resp-embed-footer resp-input" data-type="' + item.key + '" placeholder="e.g. FlynnBot · Case #{case}" maxlength="2048" value="' + esc(eFooter) + '"></div>';

    h += '<div class="resp-thumb-row"><div><div class="resp-field-label" style="margin:0">Show User Thumbnail</div>';
    h += '<div class="resp-field-hint">Display user avatar as embed thumbnail</div></div>';
    h += '<label class="toggle-switch"><input type="checkbox" class="resp-embed-thumbnail" data-type="' + item.key + '"' + (eThumbnail ? " checked" : "") + '><span class="toggle-slider"></span></label></div>';

    h += '</div>'; // /resp-embed-body
    h += '</div>'; // /resp-embed-section

    h += '<div class="resp-preview-wrap"><div class="resp-field-label" style="margin-bottom:8px">Preview</div>';
    h += '<div id="resp-preview-' + sk + '">' + buildPreviewHtml(content, embedOn, embedColor, eAuthor, eTitle, eDesc, eFooter, eThumbnail, eFields) + '</div></div>';

    h += '<div class="resp-actions">';
    h += '<button class="btn btn-ghost btn-sm resp-reset-btn" data-type="' + item.key + '">Reset to Default</button>';
    h += '<button class="btn btn-primary btn-sm resp-save-btn" data-type="' + item.key + '">Save Changes</button>';
    h += '</div>';

    h += '</div></div>'; // /response-editor /response-item
    return h;
  }

  function buildFieldRow(type, index, name, value, inline) {
    return '<div class="resp-embed-field-row" data-field-index="' + index + '">'
      + '<input type="text" class="resp-input resp-field-name" placeholder="Field name" maxlength="256" value="' + esc(name) + '">'
      + '<input type="text" class="resp-input resp-field-value" placeholder="Field value" maxlength="1024" value="' + esc(value) + '">'
      + '<label class="resp-field-inline-label"><input type="checkbox" class="resp-field-inline-chk"' + (inline ? " checked" : "") + '> Inline</label>'
      + '<button class="btn btn-ghost btn-sm resp-remove-field-btn" type="button" title="Remove">✕</button>'
      + '</div>';
  }

  function buildPreviewHtml(content, embedOn, embedColor, author, title, desc, footer, thumbnail, fields) {
    var hasContent = content && content.trim();
    var hasEmbed   = embedOn && (author || title || desc || footer || (fields && fields.length));
    if (!hasContent && !hasEmbed) {
      return '<div class="resp-preview-empty">Default bot response will be used</div>';
    }

    var h = '<div class="resp-discord-preview">';
    h += '<div class="discord-msg-row">';
    h += '<div class="discord-avatar" style="background:var(--accent)">B</div>';
    h += '<div class="discord-msg-body">';
    h += '<div class="discord-username-row"><span class="discord-username">FlynnBot</span><span class="discord-bot-badge">BOT</span><span class="discord-timestamp">Today at ' + fakeTime() + '</span></div>';

    if (hasContent) h += '<div class="resp-preview-text">' + previewInline(content) + '</div>';

    if (hasEmbed) {
      h += '<div class="resp-discord-embed" style="border-left-color:' + esc(embedColor) + '">';
      h += '<div class="resp-discord-embed-inner">';
      if (thumbnail) h += '<div class="resp-embed-thumbnail-wrap"><div class="resp-embed-thumbnail-placeholder">👤</div></div>';
      if (author) h += '<div class="resp-embed-author-row">' + previewInline(author) + '</div>';
      if (title)  h += '<div class="resp-embed-title-row">'  + previewInline(title)  + '</div>';
      if (desc)   h += '<div class="resp-embed-desc-row">'   + previewInline(desc)   + '</div>';
      if (fields && fields.length) {
        h += '<div class="resp-embed-fields">';
        fields.forEach(function(f) {
          if (!f.name && !f.value) return;
          h += '<div class="resp-embed-field' + (f.inline ? ' resp-embed-field--inline' : '') + '">';
          h += '<div class="resp-embed-field-name">' + previewInline(f.name || "") + '</div>';
          h += '<div class="resp-embed-field-value">' + previewInline(f.value || "") + '</div>';
          h += '</div>';
        });
        h += '</div>';
      }
      if (footer) h += '<div class="resp-embed-footer-row">' + previewInline(footer) + '</div>';
      h += '</div></div>'; // /resp-discord-embed-inner /resp-discord-embed
    }

    h += '</div></div></div>'; // /discord-msg-body /discord-msg-row /resp-discord-preview
    return h;
  }

  function previewInline(text) {
    return esc(text)
      .replace(/\{[a-zA-Z]+\}/g, function(m) { return '<strong class="resp-preview-var">' + m + '</strong>'; })
      .replace(/\n/g, "<br>");
  }

  function fakeTime() {
    var d = new Date(), h2 = d.getHours(), m = d.getMinutes();
    var ap = h2 >= 12 ? "PM" : "AM"; h2 = h2 % 12 || 12;
    return h2 + ":" + (m < 10 ? "0" + m : m) + " " + ap;
  }

  function readEmbedValues(type, container) {
    var sk  = type.replace(/_/g, "-");
    var q   = function(sel) { return container.querySelector(sel + '[data-type="' + type + '"]'); };
    var fields = [];
    var rows = container.querySelectorAll('#resp-fields-' + sk + ' .resp-embed-field-row');
    rows.forEach(function(row) {
      var n = (row.querySelector('.resp-field-name')?.value || "").trim();
      var v = (row.querySelector('.resp-field-value')?.value || "").trim();
      var i = !!(row.querySelector('.resp-field-inline-chk')?.checked);
      if (n || v) fields.push({ name: n, value: v, inline: i });
    });
    return {
      embedEnabled:     !!(q('.resp-embed-toggle')?.checked),
      embedColor:       q('.resp-embed-color')?.value || "#6366f1",
      embedAuthor:      (q('.resp-embed-author')?.value || "").trim(),
      embedTitle:       (q('.resp-embed-title')?.value || "").trim(),
      embedDescription: (q('.resp-embed-desc')?.value || "").trim(),
      embedFooter:      (q('.resp-embed-footer')?.value || "").trim(),
      embedThumbnail:   !!(q('.resp-embed-thumbnail')?.checked),
      embedFields:      fields,
    };
  }

  function refreshPreview(type, container) {
    var sk        = type.replace(/_/g, "-");
    var previewEl = document.getElementById("resp-preview-" + sk);
    if (!previewEl) return;
    var contentEl = container.querySelector('.resp-content[data-type="' + type + '"]');
    var content   = contentEl ? contentEl.value : "";
    var ev        = readEmbedValues(type, container);
    previewEl.innerHTML = buildPreviewHtml(
      content, ev.embedEnabled, ev.embedColor, ev.embedAuthor,
      ev.embedTitle, ev.embedDescription, ev.embedFooter,
      ev.embedThumbnail, ev.embedFields
    );
  }

  function attachListeners(container) {
    container.querySelectorAll(".resp-expand-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var sk     = btn.dataset.type.replace(/_/g, "-");
        var editor = document.getElementById("resp-editor-" + sk);
        if (!editor) return;
        var open = editor.classList.toggle("open");
        btn.textContent = open ? "Close" : "Edit";
        btn.setAttribute("aria-expanded", String(open));
      });
    });

    container.querySelectorAll(".resp-embed-toggle").forEach(function(chk) {
      chk.addEventListener("change", function() {
        var sk   = chk.dataset.type.replace(/_/g, "-");
        var body = document.getElementById("resp-embed-body-" + sk);
        if (body) body.classList.toggle("resp-embed-body--hidden", !chk.checked);
        refreshPreview(chk.dataset.type, container);
      });
    });

    container.querySelectorAll(".resp-embed-color").forEach(function(inp) {
      inp.addEventListener("input", function() {
        var sk  = inp.dataset.type.replace(/_/g, "-");
        var lbl = document.getElementById("resp-color-val-" + sk);
        if (lbl) lbl.textContent = inp.value;
        refreshPreview(inp.dataset.type, container);
      });
    });

    container.querySelectorAll(".resp-content, .resp-embed-author, .resp-embed-title, .resp-embed-desc, .resp-embed-footer").forEach(function(el) {
      el.addEventListener("input", function() { refreshPreview(el.dataset.type, container); });
    });

    container.querySelectorAll(".resp-embed-thumbnail").forEach(function(chk) {
      chk.addEventListener("change", function() { refreshPreview(chk.dataset.type, container); });
    });

    container.querySelectorAll(".response-var-chip").forEach(function(chip) {
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
      chip.addEventListener("click", insertVar);
      chip.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); insertVar(); }
      });
    });

    container.querySelectorAll(".resp-add-field-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var type2  = btn.dataset.type;
        var sk     = type2.replace(/_/g, "-");
        var list   = document.getElementById("resp-fields-" + sk);
        if (!list) return;
        var count  = list.querySelectorAll('.resp-embed-field-row').length;
        if (count >= 5) { showToast("Maximum 5 embed fields allowed.", "error"); return; }
        var newRow = document.createElement("div");
        newRow.innerHTML = buildFieldRow(type2, count, "", "", false);
        var rowEl  = newRow.firstElementChild;
        list.appendChild(rowEl);
        bindFieldRow(rowEl, type2, container);
      });
    });

    container.querySelectorAll(".resp-embed-field-row").forEach(function(row) {
      var item = row.closest(".response-item");
      if (!item) return;
      bindFieldRow(row, item.dataset.type, container);
    });

    container.querySelectorAll(".resp-save-btn").forEach(function(btn) {
      btn.addEventListener("click", function() { saveTemplate(btn.dataset.type, btn, container); });
    });

    container.querySelectorAll(".resp-reset-btn").forEach(function(btn) {
      btn.addEventListener("click", function() { resetTemplate(btn.dataset.type, container); });
    });
  }

  function bindFieldRow(row, type, container) {
    var removeBtn = row.querySelector(".resp-remove-field-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", function() { row.remove(); refreshPreview(type, container); });
    }
    row.querySelectorAll(".resp-field-name, .resp-field-value").forEach(function(inp) {
      inp.addEventListener("input", function() { refreshPreview(type, container); });
    });
    row.querySelectorAll(".resp-field-inline-chk").forEach(function(chk) {
      chk.addEventListener("change", function() { refreshPreview(type, container); });
    });
  }

  function saveTemplate(type, btnEl, container) {
    var sk       = type.replace(/_/g, "-");
    var toggleEl = container.querySelector('.resp-toggle[data-type="' + type + '"]');
    var contentEl= container.querySelector('.resp-content[data-type="' + type + '"]');
    var badgeEl  = document.getElementById("resp-badge-" + sk);
    var itemEl   = document.getElementById("resp-item-"  + sk);
    var ev       = readEmbedValues(type, container);
    var content  = contentEl ? contentEl.value.trim() : "";

    var payload = {
      enabled: toggleEl ? toggleEl.checked : true,
      content: content,
      embedEnabled:     ev.embedEnabled,
      embedColor:       ev.embedColor,
      embedAuthor:      ev.embedAuthor,
      embedTitle:       ev.embedTitle,
      embedDescription: ev.embedDescription,
      embedFooter:      ev.embedFooter,
      embedThumbnail:   ev.embedThumbnail,
      embedFields:      ev.embedFields,
    };

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = "Saving…"; }

    fetch("/api/guild/" + state.guildId + "/bot-messages/" + encodeURIComponent(type), {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(e) { throw new Error(e.error || "HTTP " + res.status); });
      return res.json();
    })
    .then(function(saved) {
      state.templates[type] = saved;
      var hasCustom = !!(content || ev.embedTitle || ev.embedDescription);
      if (badgeEl) { badgeEl.className = hasCustom ? "response-badge-custom" : "response-badge-default"; badgeEl.textContent = hasCustom ? "Custom" : "Default"; }
      if (itemEl)  itemEl.classList.toggle("response-has-override", hasCustom);
      showToast("Response saved!", "success");
    })
    .catch(function(err) { showToast("Save failed: " + err.message, "error"); })
    .finally(function() { if (btnEl) { btnEl.disabled = false; btnEl.textContent = "Save Changes"; } });
  }

  function resetTemplate(type, container) {
    var meta  = state.types.find(function(t) { return t.key === type; }) || {};
    var label = meta.label || type;
    if (!confirm('Reset "' + label + '" to default? This clears all custom content and embed settings.')) return;

    var sk      = type.replace(/_/g, "-");
    var badgeEl = document.getElementById("resp-badge-" + sk);
    var itemEl  = document.getElementById("resp-item-"  + sk);

    fetch("/api/guild/" + state.guildId + "/bot-messages/" + encodeURIComponent(type), {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ content: "", enabled: true, embedEnabled: true, embedColor: "#6366f1",
        embedAuthor: "", embedTitle: "", embedDescription: "", embedFooter: "", embedThumbnail: false, embedFields: [] }),
    })
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
    .then(function(saved) {
      state.templates[type] = saved;
      var q = function(sel) { return container.querySelector(sel + '[data-type="' + type + '"]'); };
      var sk2 = type.replace(/_/g, "-");
      var els = { content: q('.resp-content'), color: q('.resp-embed-color'), colorLbl: document.getElementById("resp-color-val-" + sk2),
        author: q('.resp-embed-author'), title: q('.resp-embed-title'), desc: q('.resp-embed-desc'),
        footer: q('.resp-embed-footer'), thumb: q('.resp-embed-thumbnail'), embedTog: q('.resp-embed-toggle'),
        fields: document.getElementById("resp-fields-" + sk2), body: document.getElementById("resp-embed-body-" + sk2) };
      if (els.content)  els.content.value   = "";
      if (els.color)    els.color.value     = "#6366f1";
      if (els.colorLbl) els.colorLbl.textContent = "#6366f1";
      if (els.author)   els.author.value    = "";
      if (els.title)    els.title.value     = "";
      if (els.desc)     els.desc.value      = "";
      if (els.footer)   els.footer.value    = "";
      if (els.thumb)    els.thumb.checked   = false;
      if (els.embedTog) els.embedTog.checked = true;
      if (els.fields)   els.fields.innerHTML = "";
      if (els.body)     els.body.classList.remove("resp-embed-body--hidden");
      if (badgeEl) { badgeEl.className = "response-badge-default"; badgeEl.textContent = "Default"; }
      if (itemEl)  itemEl.classList.remove("response-has-override");
      refreshPreview(type, container);
      showToast("Reset to default.", "info");
    })
    .catch(function(err) { showToast("Reset failed: " + err.message, "error"); });
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function showToast(msg, type) {
    type = type || "info";
    if (typeof toast === "function") { toast(msg, type); return; }
    var c = document.getElementById("toast-container");
    if (!c) { c = document.createElement("div"); c.id = "toast-container"; c.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px"; document.body.appendChild(c); }
    var t = document.createElement("div");
    t.className = "toast " + type + " show";
    t.textContent = (type === "success" ? "✓  " : type === "error" ? "✕  " : "ℹ  ") + msg;
    c.appendChild(t);
    setTimeout(function() { t.classList.remove("show"); setTimeout(function() { t.remove(); }, 400); }, 3200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
