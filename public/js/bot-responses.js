/* ============================================================
   BOT-RESPONSES.JS - Bot Message Template Manager
   API:
     GET  /api/guild/:id/bot-messages  ->  { types: [{key,label,group}], templates: {type->doc} }
     PATCH /api/guild/:id/bot-messages/:type -> saved doc
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
    "Logging": "📋",
    "Community": "👋",
    "Economy": "💰",
    "Leveling": "⭐",
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
    container.innerHTML = "<div class=\"loading-state\"><div class=\"spinner\"></div>Loading response templates...</div>";

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
        container.innerHTML = "<div class=\"error-banner\"><span>Failed to load response templates. " + err.message + "</span></div>";
      });
  }

  function render(container) {
    if (!state.types.length) {
      container.innerHTML = "<div class=\"empty-state\"><div class=\"empty-icon\">💬</div><p>No response types configured.</p></div>";
      return;
    }

    var groups = {};
    state.types.forEach(function(t) {
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group].push({ key: t.key, label: t.label, tpl: state.templates[t.key] || null });
    });

    var html = "";
    Object.keys(groups).forEach(function(groupName) {
      var icon = GROUP_ICON[groupName] || "📝";
      var vars = GROUP_VARS[groupName] || [];
      var items = groups[groupName];

      html += "<div class=\"responses-group\"><div class=\"responses-group-title\">" + icon + " " + esc(groupName) + "</div>";

      items.forEach(function(item) {
        var tpl      = item.tpl;
        var enabled  = tpl ? !!tpl.enabled : true;
        var content  = tpl ? (tpl.content || "") : "";
        var hasCustom = content.length > 0;
        var sk       = item.key.replace(/_/g, "-");

        var varChips = vars.map(function(v) {
          return "<span class=\"response-var-chip\" data-var=\"" + v + "\" data-type=\"" + item.key + "\" tabindex=\"0\" role=\"button\" title=\"Click to insert\">" + v + "</span>";
        }).join("");

        html += "<div class=\"response-item" + (hasCustom ? " response-has-override" : "") + "\" id=\"resp-item-" + sk + "\" data-type=\"" + item.key + "\">";
        html += "<div class=\"response-item-header\">";
        html += "<div><div class=\"response-item-name\">" + esc(item.label);
        html += " <span class=\"" + (hasCustom ? "response-badge-custom" : "response-badge-default") + "\" id=\"resp-badge-" + sk + "\">" + (hasCustom ? "Custom" : "Default") + "</span></div></div>";
        html += "<div class=\"response-item-actions\">";
        html += "<label class=\"toggle\" title=\"Enable/Disable\"><input type=\"checkbox\" class=\"resp-toggle\" data-type=\"" + item.key + "\"" + (enabled ? " checked" : "") + "><span class=\"toggle-slider\"></span></label>";
        html += "<button class=\"btn btn-ghost btn-sm resp-expand-btn\" data-type=\"" + item.key + "\" aria-expanded=\"false\">Edit</button>";
        html += "</div></div>";

        html += "<div class=\"response-editor\" id=\"resp-editor-" + sk + "\">";
        html += "<div class=\"form-group\" style=\"margin-bottom:10px\">";
        html += "<label class=\"form-label\">Response Content</label>";
        html += "<textarea class=\"resp-content form-input\" data-type=\"" + item.key + "\" rows=\"4\" placeholder=\"Leave blank to use FlynnBot default\">" + esc(content) + "</textarea>";
        html += "</div>";

        if (vars.length) {
          html += "<div style=\"margin-bottom:12px\"><div class=\"form-label\" style=\"margin-bottom:6px\">Insert variable</div>";
          html += "<div class=\"response-variables\">" + varChips + "</div></div>";
        }

        html += "<div class=\"response-preview\" id=\"resp-preview-" + sk + "\">";
        html += "<div class=\"response-preview-title\">Preview</div>";
        html += "<div class=\"discord-preview\"><div class=\"discord-preview-desc response-preview-body\" id=\"resp-preview-body-" + sk + "\">" + previewHtml(content) + "</div></div>";
        html += "</div>";

        html += "<div style=\"display:flex;gap:8px;margin-top:14px;justify-content:flex-end\">";
        html += "<button class=\"btn btn-ghost btn-sm resp-reset-btn\" data-type=\"" + item.key + "\">Reset to Default</button>";
        html += "<button class=\"btn btn-primary btn-sm resp-save-btn\" data-type=\"" + item.key + "\">Save</button>";
        html += "</div>";

        html += "</div></div>";
      });

      html += "</div>";
    });

    container.innerHTML = html;
    attachListeners(container);
  }

  function attachListeners(container) {
    container.querySelectorAll(".resp-expand-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var sk     = btn.dataset.type.replace(/_/g, "-");
        var editor = document.getElementById("resp-editor-" + sk);
        if (!editor) return;
        var open   = editor.classList.toggle("open");
        btn.textContent = open ? "Close" : "Edit";
        btn.setAttribute("aria-expanded", open);
      });
    });

    container.querySelectorAll(".resp-content").forEach(function(ta) {
      ta.addEventListener("input", function() {
        var sk      = ta.dataset.type.replace(/_/g, "-");
        var preview = document.getElementById("resp-preview-body-" + sk);
        if (preview) preview.innerHTML = previewHtml(ta.value);
      });
    });

    container.querySelectorAll(".response-var-chip").forEach(function(chip) {
      var insertVar = function() {
        var ta  = container.querySelector(".resp-content[data-type=\"" + chip.dataset.type + "\"]");
        if (!ta) return;
        var s   = ta.selectionStart, e = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + chip.dataset.var + ta.value.slice(e);
        ta.selectionStart = ta.selectionEnd = s + chip.dataset.var.length;
        ta.focus();
        ta.dispatchEvent(new Event("input"));
      };
      chip.addEventListener("click", insertVar);
      chip.addEventListener("keydown", function(ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); insertVar(); } });
    });

    container.querySelectorAll(".resp-save-btn").forEach(function(btn) {
      btn.addEventListener("click", function() { saveTemplate(btn.dataset.type, btn); });
    });

    container.querySelectorAll(".resp-reset-btn").forEach(function(btn) {
      btn.addEventListener("click", function() { resetTemplate(btn.dataset.type); });
    });
  }

  function saveTemplate(type, btnEl) {
    var sk        = type.replace(/_/g, "-");
    var toggleEl  = document.querySelector(".resp-toggle[data-type=\"" + type + "\"]");
    var contentEl = document.querySelector(".resp-content[data-type=\"" + type + "\"]");
    var badgeEl   = document.getElementById("resp-badge-" + sk);
    var itemEl    = document.getElementById("resp-item-" + sk);

    var payload = {
      enabled: toggleEl ? toggleEl.checked : true,
      content: contentEl ? contentEl.value.trim() : "",
    };

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = "Saving..."; }

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
      var hasCustom = !!payload.content;
      if (badgeEl) { badgeEl.className = hasCustom ? "response-badge-custom" : "response-badge-default"; badgeEl.textContent = hasCustom ? "Custom" : "Default"; }
      if (itemEl) itemEl.classList.toggle("response-has-override", hasCustom);
      showToast("Response saved!", "success");
    })
    .catch(function(err) {
      showToast("Save failed: " + err.message, "error");
    })
    .finally(function() {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = "Save"; }
    });
  }

  function resetTemplate(type) {
    var meta  = state.types.find(function(t) { return t.key === type; }) || {};
    var label = meta.label || type;
    if (!confirm("Reset \"" + label + "\" to default? This clears any custom text.")) return;

    var sk        = type.replace(/_/g, "-");
    var contentEl = document.querySelector(".resp-content[data-type=\"" + type + "\"]");
    var previewEl = document.getElementById("resp-preview-body-" + sk);
    var badgeEl   = document.getElementById("resp-badge-" + sk);
    var itemEl    = document.getElementById("resp-item-" + sk);

    fetch("/api/guild/" + state.guildId + "/bot-messages/" + encodeURIComponent(type), {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ content: "", enabled: true }),
    })
    .then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function(saved) {
      state.templates[type] = saved;
      if (contentEl) contentEl.value = "";
      if (previewEl) previewEl.innerHTML = previewHtml("");
      if (badgeEl)   { badgeEl.className = "response-badge-default"; badgeEl.textContent = "Default"; }
      if (itemEl)    itemEl.classList.remove("response-has-override");
      showToast("Reset to default.", "info");
    })
    .catch(function(err) {
      showToast("Reset failed: " + err.message, "error");
    });
  }

  function previewHtml(text) {
    if (!text || !text.trim()) {
      return "<span style=\"color:#4f5462;font-style:italic\">Default bot response will be used</span>";
    }
    return esc(text)
      .replace(/\{[a-zA-Z]+\}/g, function(m) { return "<strong style=\"color:#93c5fd\">" + m + "</strong>"; })
      .replace(/\n/g, "<br>");
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(msg, type) {
    type = type || "info";
    if (window.showToast) { window.showToast(msg, type); return; }
    var c = document.getElementById("toast-container");
    if (!c) { c = document.createElement("div"); c.id = "toast-container"; document.body.appendChild(c); }
    var t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function() { t.classList.add("toast-fade-out"); t.addEventListener("animationend", function() { t.remove(); }, { once: true }); }, 3500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
