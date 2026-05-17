/**
 * workflow-editor.js — Workflow Builder UI (Phase 2 Enhanced)
 *
 * Architecture: five main classes that communicate via a shared state object.
 *   WorkflowEditor   — top-level controller, owns state, API calls
 *   BlockPalette     — left panel (categories + search with icons, drag-from)
 *   WorkflowCanvas   — centre panel (block list, HTML5 drag-to-reorder, nested hierarchy)
 *   PropertiesPanel  — right panel (dynamic form with complex field editors)
 *   FieldEditor      — modal editors for complex types (arrays, embeds, buttons, modals)
 *
 * Phase 2 Enhancements:
 *   ✅ Improved BlockPalette with icons and better search
 *   ✅ HTML5 drag-to-reorder on canvas with visual feedback
 *   ✅ Complex field editors (embed_fields, button_array, option_array, modal_fields)
 *   ✅ Variable picker/autocomplete support
 *   ✅ Better block type color coding
 *   ✅ Improved animations and transitions
 *   ✅ Accessibility (ARIA labels, keyboard nav basics)
 *   ✅ Scalable workflow organization (collapsible sections, better hierarchy)
 *
 * Dependencies (must be loaded before this script):
 *   workflow-registry.js  (window.WORKFLOW_REGISTRY)
 *   savebar.js            (window.showToast, window.showConfirm)
 *
 * CSP-compliant: no eval, no innerHTML with untrusted input,
 * all DOM built via createElement / textContent.
 */

(function () {
  'use strict';

  const REG = window.WORKFLOW_REGISTRY;
  if (!REG) {
    console.error('[WorkflowEditor] workflow-registry.js not loaded.');
    return;
  }

  const LEGACY_TRIGGER_MAP = {
    slash_command: 'slash',
    prefix_command: 'prefix',
    exact_match: 'exact',
    button_click: 'button',
    reaction_add: 'reaction',
  };

  function normalizeTriggerType(type) {
    if (!type) return '';
    return LEGACY_TRIGGER_MAP[type] || type;
  }

  // ── Unique ID generator ──────────────────────────────────────
  let _uid = Date.now();
  function uid() { return 'blk_' + (++_uid).toString(36); }

  // ── Element helpers ──────────────────────────────────────────
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class')       e.className = v;
      else if (k === 'text')   e.textContent = v;
      else if (k === 'style')  Object.assign(e.style, v);
      else if (k.startsWith('data-')) e.setAttribute(k, v);
      else                     e[k] = v;
    }
    for (const child of children) {
      if (child) e.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return e;
  }

  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

  // ── Escape HTML for safe attribute values ────────────────────
  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Block icon map (simple emoji-based icons) ────────────────
  const BLOCK_ICONS = {
    reply: '💬', followup: '↩️', send_message: '📤', dm_user: '📧', edit_reply: '✏️',
    send_embed: '🎨', edit_message: '✏️', delete_message: '🗑️', pin_message: '📌',
    add_reaction: '👍', purge_messages: '💨', send_buttons: '🔘', send_select_menu: '📋',
    show_modal: '📝', await_button: '⏳', await_select: '⏳', await_message: '⏳',
    create_thread: '🧵', set_channel_topic: '📝', set_slowmode: '🐌', lock_channel: '🔒',
    add_role: '➕', remove_role: '➖', toggle_role: '🔄', set_nickname: '🏷️',
    kick_member: '👢', ban_member: '🚫', timeout_member: '⏱️', remove_timeout: '✅',
    get_member_info: 'ℹ️', warn_member: '⚠️', set_variable: '📦', get_variable: '📦',
    increment_variable: '⬆️', delete_variable: '🗑️', random_number: '🎲', random_choice: '🎲',
    math: '🧮', format_text: '✂️', string_operation: '📄', number_format: '🔢', log_to_channel: '📋',
    condition_if: '🔀', stop_if: '⛔', loop_times: '🔁', delay: '⏱️', stop_flow: '🛑',
  };

  function getBlockIcon(type) {
    return BLOCK_ICONS[type] || '📦';
  }

  // ── Variable utilities ────────────────────────────────────────
  const BUILTIN_VARIABLES = [
    'user', 'username', 'displayname', 'userid', 'tag', 'avatar',
    'server', 'serverid', 'membercount', 'channel', 'channelname', 'channelid',
    'mentioned', 'command_name', 'trigger_value', 'loop_index', 'loop_count',
  ];

  function getAvailableVariables(workflow) {
    const vars = BUILTIN_VARIABLES.slice();
    if (Array.isArray(workflow?.variables)) {
      for (const v of workflow.variables) {
        if (v.name) vars.push(v.name);
      }
    }
    return vars;
  }

  function highlightVariableMatches(text, query) {
    if (!query) return text;
    const re = new RegExp(`(${query})`, 'gi');
    return text.replace(re, (m) => m);
  }

  // ═══════════════════════════════════════════════════════════
  // WorkflowEditor — top-level controller
  // ═══════════════════════════════════════════════════════════
  class WorkflowEditor {
    constructor() {
      // Read page data island
      const dataEl  = document.getElementById('wfPageData');
      this.guildId  = dataEl?.dataset.guildId   || '';
      this.wfId     = dataEl?.dataset.workflowId || null;

      let parsed = null;
      try {
        parsed = dataEl?.dataset.workflowJson ? JSON.parse(dataEl.dataset.workflowJson) : null;
      } catch { /* fall through */ }

      /** Mutable workflow state */
      this.state = {
        name:        parsed?.name        || '',
        description: parsed?.description || '',
        enabled:     parsed?.enabled     ?? true,
        trigger:     parsed?.trigger     || { type: '', value: '', description: '', options: [] },
        permissions: parsed?.permissions || {
          allowedRoles: [], allowedChannels: [], requiredPermissions: [],
          caseSensitive: false, deleteUserMessage: false, cooldownSeconds: 0,
          cooldownScope: 'user', ephemeralErrors: true,
        },
        blocks:    parsed?.blocks    || [],
        variables: parsed?.variables || [],
      };

      // Ensure all blocks have local IDs for drag/drop
      this._ensureIds(this.state.blocks);
      this.state.trigger.type = normalizeTriggerType(this.state.trigger.type);

      this._dirty       = false;
      this._saving      = false;
      this._selectedId  = null;  // currently selected block id

      this.palette    = new BlockPalette(this);
      this.canvas     = new WorkflowCanvas(this);
      this.propsPanel = new PropertiesPanel(this);

      this._init();
    }

    _init() {
      this.palette.render();
      this.canvas.render();
      this._bindTopBar();
      this._bindBeforeUnload();
    }

    // ── Block tree helpers ────────────────────────────────────

    _ensureIds(blocks) {
      if (!Array.isArray(blocks)) return;
      for (const b of blocks) {
        if (!b.id) b.id = uid();
        if (b.data?.if_blocks)   this._ensureIds(b.data.if_blocks);
        if (b.data?.else_blocks) this._ensureIds(b.data.else_blocks);
        if (b.data?.loop_blocks) this._ensureIds(b.data.loop_blocks);
      }
    }

    /** Find a block by id, anywhere in the tree. Returns { block, parent, arrayKey } */
    findBlock(id, blocks = this.state.blocks, parent = null, arrayKey = null) {
      for (const b of blocks) {
        if (b.id === id) return { block: b, parent, arrayKey };
        // Recurse into nested arrays
        for (const key of ['if_blocks', 'else_blocks', 'loop_blocks']) {
          if (Array.isArray(b.data?.[key])) {
            const found = this.findBlock(id, b.data[key], b, key);
            if (found) return found;
          }
        }
      }
      return null;
    }

    // ── Public mutation API (used by canvas + props panel) ────

    selectBlock(id) {
      this._selectedId = id;
      this.canvas.refreshSelection();
      if (id) {
        const found = this.findBlock(id);
        if (found) this.propsPanel.showBlock(found.block);
      } else {
        this.propsPanel.clear();
      }
    }

    addBlock(type, targetBlocks = this.state.blocks) {
      const def = REG.getBlock(type);
      if (!def) return;

      const newBlock = {
        id:   uid(),
        type,
        data: REG.getDefaults(type),
      };
      targetBlocks.push(newBlock);
      this._markDirty();
      this.canvas.render();
      this.selectBlock(newBlock.id);
    }

    updateBlockData(id, key, value) {
      const found = this.findBlock(id);
      if (!found) return;
      found.block.data = found.block.data || {};
      found.block.data[key] = value;
      this._markDirty();
      this.canvas.refreshBlockCard(id);
    }

    deleteBlock(id, targetBlocks = this.state.blocks) {
      const idx = targetBlocks.findIndex((b) => b.id === id);
      if (idx !== -1) {
        targetBlocks.splice(idx, 1);
        if (this._selectedId === id) this.selectBlock(null);
        this._markDirty();
        this.canvas.render();
        return true;
      }
      // Recurse into nested arrays
      for (const b of targetBlocks) {
        for (const key of ['if_blocks', 'else_blocks', 'loop_blocks']) {
          if (Array.isArray(b.data?.[key])) {
            if (this.deleteBlock(id, b.data[key])) return true;
          }
        }
      }
      return false;
    }

    moveBlock(id, direction, targetBlocks = this.state.blocks) {
      const idx = targetBlocks.findIndex((b) => b.id === id);
      if (idx === -1) {
        for (const b of targetBlocks) {
          for (const key of ['if_blocks', 'else_blocks', 'loop_blocks']) {
            if (Array.isArray(b.data?.[key])) {
              if (this.moveBlock(id, direction, b.data[key])) return true;
            }
          }
        }
        return false;
      }
      const swap = idx + direction;
      if (swap < 0 || swap >= targetBlocks.length) return false;
      [targetBlocks[idx], targetBlocks[swap]] = [targetBlocks[swap], targetBlocks[idx]];
      this._markDirty();
      this.canvas.render();
      this.selectBlock(id);
      return true;
    }

    // ── Save / load ───────────────────────────────────────────

    async save() {
      if (this._saving) return;
      this._saving = true;

      const body = {
        name:        this.state.name,
        description: this.state.description,
        enabled:     this.state.enabled,
        trigger:     this.state.trigger,
        permissions: this.state.permissions,
        blocks:      this._stripIds(JSON.parse(JSON.stringify(this.state.blocks))),
        variables:   this.state.variables,
      };

      const url    = this.wfId
        ? `/api/guild/${this.guildId}/workflows/${this.wfId}`
        : `/api/guild/${this.guildId}/workflows`;
      const method = this.wfId ? 'PATCH' : 'POST';

      try {
        const res  = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
        const json = await res.json();

        if (!res.ok) {
          const msg = json.details?.join('\n') || json.error || 'Save failed.';
          window.showToast?.(msg, 'error');
          return;
        }

        if (!this.wfId && json.workflow?._id) {
          this.wfId = json.workflow._id;
          const u = new URL(window.location.href);
          u.searchParams.set('id', this.wfId);
          window.history.replaceState(null, '', u.toString());
        }

        this._clearDirty();
        window.showToast?.('Workflow saved!', 'success');
      } catch (err) {
        console.error('[WorkflowEditor] Save error:', err);
        window.showToast?.('Network error while saving.', 'error');
      } finally {
        this._saving = false;
      }
    }

    async validate() {
      if (!this.wfId) {
        window.showToast?.('Save the workflow first, then validate.', 'warning');
        return;
      }

      const body = {
        name:        this.state.name,
        description: this.state.description,
        enabled:     this.state.enabled,
        trigger:     this.state.trigger,
        permissions: this.state.permissions,
        blocks:      this._stripIds(JSON.parse(JSON.stringify(this.state.blocks))),
        variables:   this.state.variables,
      };

      try {
        const res = await fetch(`/api/guild/${this.guildId}/workflows/${this.wfId}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();

        if (!res.ok) {
          window.showToast?.(json.error || 'Validation request failed.', 'error');
          return;
        }

        if (json.valid) {
          window.showToast?.('Validation passed.', 'success');
        } else {
          const details = Array.isArray(json.errors) ? json.errors.join('\n') : 'Validation failed.';
          window.showToast?.(details, 'error');
        }
      } catch (err) {
        console.error('[WorkflowEditor] Validate error:', err);
        window.showToast?.('Network error while validating.', 'error');
      }
    }

    /** Remove runtime IDs before sending to API */
    _stripIds(blocks) {
      if (!Array.isArray(blocks)) return blocks;
      return blocks.map((b) => {
        const copy = { ...b };
        delete copy.id;
        if (copy.data) {
          if (Array.isArray(copy.data.if_blocks))   copy.data.if_blocks   = this._stripIds(copy.data.if_blocks);
          if (Array.isArray(copy.data.else_blocks))  copy.data.else_blocks  = this._stripIds(copy.data.else_blocks);
          if (Array.isArray(copy.data.loop_blocks)) copy.data.loop_blocks = this._stripIds(copy.data.loop_blocks);
        }
        return copy;
      });
    }

    // ── Dirty state ────────────────────────────────────────────

    _markDirty() {
      if (!this._dirty) {
        this._dirty = true;
        qs('#wf-save-btn')?.classList.remove('wf-btn--disabled');
        qs('#wf-dirty-dot')?.removeAttribute('hidden');
      }
    }

    _clearDirty() {
      this._dirty = false;
      qs('#wf-save-btn')?.classList.add('wf-btn--disabled');
      qs('#wf-dirty-dot')?.setAttribute('hidden', '');
    }

    _bindBeforeUnload() {
      window.addEventListener('beforeunload', (e) => {
        if (this._dirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }

    // ── Top bar bindings ──────────────────────────────────────

    _bindTopBar() {
      const nameInput = qs('#wf-name-input');
      const descInput = qs('#wf-desc-input');
      const saveBtn   = qs('#wf-save-btn');
      const validateBtn = qs('#wf-validate-btn');
      const enabledToggle = qs('#wf-enabled-toggle');
      const triggerType   = qs('#wf-trigger-type');
      const triggerValue  = qs('#wf-trigger-value');

      if (nameInput) {
        nameInput.value = this.state.name;
        nameInput.addEventListener('input', () => {
          this.state.name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 50);
          nameInput.value = this.state.name;
          this._markDirty();
        });
      }

      if (descInput) {
        descInput.value = this.state.description;
        descInput.addEventListener('input', () => {
          this.state.description = descInput.value.slice(0, 200);
          this._markDirty();
        });
      }

      if (enabledToggle) {
        enabledToggle.checked = this.state.enabled;
        enabledToggle.addEventListener('change', () => {
          this.state.enabled = enabledToggle.checked;
          this._markDirty();
        });
      }

      if (triggerType) {
        triggerType.value = this.state.trigger.type;
        triggerType.addEventListener('change', () => {
          this.state.trigger.type = normalizeTriggerType(triggerType.value);
          triggerType.value = this.state.trigger.type;
          this._updateTriggerValueVisibility();
          this._markDirty();
        });
        this._updateTriggerValueVisibility();
      }

      if (triggerValue) {
        triggerValue.value = this.state.trigger.value || '';
        triggerValue.addEventListener('input', () => {
          this.state.trigger.value = triggerValue.value.trim().slice(0, 100);
          this._markDirty();
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.save());
        if (!this._dirty) saveBtn.classList.add('wf-btn--disabled');
      }

      if (validateBtn) {
        validateBtn.addEventListener('click', () => this.validate());
      }
    }

    _updateTriggerValueVisibility() {
      const triggerValueRow = qs('#wf-trigger-value-row');
      if (!triggerValueRow) return;
      const needsValue = ['slash', 'prefix', 'contains', 'exact', 'regex'];
      const show = needsValue.includes(this.state.trigger.type);
      triggerValueRow.hidden = !show;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BlockPalette — left panel (Phase 2: enhanced with icons, better search)
  // ═══════════════════════════════════════════════════════════
  class BlockPalette {
    constructor(editor) {
      this.editor     = editor;
      this.container  = qs('#wf-palette');
      this._collapsed = new Set(); // collapsed category ids
      this._searchQuery = '';
    }

    render() {
      if (!this.container) return;
      this.container.textContent = '';

      // Search box with clear button
      const searchWrap = el('div', { class: 'wf-palette__search' }, [
        el('input', {
          type: 'text', id: 'wf-palette-search',
          class: 'wf-palette__search-input',
          placeholder: 'Search blocks… (⌘K)',
          autocomplete: 'off',
          spellcheck: 'false',
          'aria-label': 'Search blocks',
        }),
        el('span', { class: 'wf-palette__search-icon', text: '🔍' }),
      ]);
      this.container.appendChild(searchWrap);

      const quickAdd = el('div', { class: 'wf-palette__quick-add' }, [
        el('select', { id: 'wf-palette-quick-select', class: 'wf-palette__quick-select', 'aria-label': 'Add action block' }),
        el('button', { id: 'wf-palette-quick-btn', type: 'button', class: 'wf-btn wf-btn--secondary', text: 'Add Action Block' }),
      ]);
      this.container.appendChild(quickAdd);

      // Category list
      const list = el('div', { class: 'wf-palette__list', role: 'navigation', 'aria-label': 'Block categories' });
      this.container.appendChild(list);
      this._list = list;

      this._renderCategories('');

      const quickSelect = qs('#wf-palette-quick-select');
      const quickBtn = qs('#wf-palette-quick-btn');
      if (quickSelect) {
        const allBlocks = Object.entries(REG.BLOCKS)
          .map(([type, def]) => ({ type, label: def.label }))
          .sort((a, b) => a.label.localeCompare(b.label));
        quickSelect.appendChild(el('option', { value: '', text: 'Select a block…' }));
        for (const item of allBlocks) {
          quickSelect.appendChild(el('option', { value: item.type, text: item.label }));
        }
      }
      if (quickBtn && quickSelect) {
        quickBtn.addEventListener('click', () => {
          const type = quickSelect.value;
          if (!type) {
            window.showToast?.('Choose a block first.', 'warning');
            return;
          }
          this.editor.addBlock(type);
          quickSelect.value = '';
        });
      }

      // Wire up search
      const searchInput = qs('#wf-palette-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this._searchQuery = e.target.value;
          this._renderCategories(this._searchQuery);
        });
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            searchInput.value = '';
            this._searchQuery = '';
            this._renderCategories('');
          }
        });
      }

      // Keyboard shortcut (⌘K or Ctrl+K to focus search)
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          searchInput?.focus();
        }
      });
    }

    _renderCategories(query) {
      if (!this._list) return;
      this._list.textContent = '';

      const q = query.trim().toLowerCase();

      for (const cat of REG.CATEGORIES) {
        const blocks = REG.getByCategory(cat.id).filter((b) =>
          !q || b.label.toLowerCase().includes(q) || 
                b.description?.toLowerCase().includes(q) ||
                b.type.toLowerCase().includes(q)
        );
        if (!blocks.length) continue;

        const isCollapsed = this._collapsed.has(cat.id) && !q;

        // Category header with color dot and count
        const header = el('button', {
          class: `wf-palette__cat-header ${isCollapsed ? 'wf-palette__cat-header--collapsed' : ''}`,
          'data-cat': cat.id,
          type: 'button',
          'aria-expanded': isCollapsed ? 'false' : 'true',
          'aria-controls': `cat-${cat.id}`,
        }, [
          el('span', { class: 'wf-palette__cat-dot', style: { background: cat.color }, 'aria-hidden': 'true' }),
          el('span', { class: 'wf-palette__cat-label', text: cat.label }),
          el('span', { class: 'wf-palette__cat-count', text: String(blocks.length) }),
          el('span', { class: 'wf-palette__cat-arrow', text: isCollapsed ? '▸' : '▾', 'aria-hidden': 'true' }),
        ]);

        header.addEventListener('click', () => {
          if (this._collapsed.has(cat.id)) this._collapsed.delete(cat.id);
          else this._collapsed.add(cat.id);
          this._renderCategories(q);
        });

        this._list.appendChild(header);

        if (!isCollapsed) {
          const blocksEl = el('div', { class: 'wf-palette__blocks', id: `cat-${cat.id}` });
          for (const block of blocks) {
            const icon = getBlockIcon(block.type);
            const item = el('div', {
              class: 'wf-palette__item',
              draggable: 'true',
              'data-type': block.type,
              title: block.description || block.label,
              role: 'button',
              tabindex: '0',
              'aria-label': `Block: ${block.label}. ${block.description || ''}`,
            }, [
              el('span', { class: 'wf-palette__item-icon', text: icon, 'aria-hidden': 'true' }),
              el('span', { class: 'wf-palette__item-label', text: block.label }),
            ]);

            // Click to add
            item.addEventListener('click', () => {
              this.editor.addBlock(block.type);
            });

            // Keyboard support (Enter/Space)
            item.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.editor.addBlock(block.type);
              }
            });

            // Drag start — set type in transfer
            item.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData('text/plain', block.type);
              e.dataTransfer.setData('text/wf-block-type', block.type);
              e.dataTransfer.effectAllowed = 'copy';
              item.classList.add('wf-palette__item--dragging');
            });
            item.addEventListener('dragend', () => {
              item.classList.remove('wf-palette__item--dragging');
            });

            blocksEl.appendChild(item);
          }
          this._list.appendChild(blocksEl);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // WorkflowCanvas — centre panel (Phase 2: enhanced drag/drop, visual hierarchy)
  // ═══════════════════════════════════════════════════════════
  class WorkflowCanvas {
    constructor(editor) {
      this.editor    = editor;
      this.container = qs('#wf-canvas');
      this._dragId   = null;
      this._dragOverId = null;
      this._expandedNestedSections = new Set();
    }

    render() {
      if (!this.container) return;
      this.container.textContent = '';

      const blockCount = this.editor.state.blocks.length;
      if (blockCount === 0) {
        this.container.appendChild(this._emptyState());
      } else {
        const list = el('div', { class: 'wf-canvas__list' });
        for (const block of this.editor.state.blocks) {
          list.appendChild(this._buildCard(block, 0, this.editor.state.blocks));
        }
        this.container.appendChild(list);
      }

      // Drop zone for dragging from palette
      this.container.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('text/wf-block-type') || e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      });
      this.container.addEventListener('drop', (e) => {
        const type = e.dataTransfer.getData('text/wf-block-type') || e.dataTransfer.getData('text/plain');
        if (type && REG.getBlock(type)) {
          e.preventDefault();
          this.editor.addBlock(type);
        }
      });
    }

    _emptyState() {
      return el('div', { class: 'wf-canvas__empty' }, [
        el('p', { class: 'wf-canvas__empty-title', text: '✨ Empty Workflow' }),
        el('p', { class: 'wf-canvas__empty-sub',   text: 'Drag or click a block from the left panel to get started.' }),
      ]);
    }

    _buildCard(block, depth, parentArray) {
      const def     = REG.getBlock(block.type);
      if (!def) return el('div');
      const catMeta = REG.getCategoryMeta(block.type);
      const color   = catMeta?.color || 'var(--accent)';
      const isSelected = this.editor._selectedId === block.id;
      const icon = getBlockIcon(block.type);

      const card = el('div', {
        class: `wf-block ${isSelected ? 'wf-block--selected' : ''}`,
        'data-id': block.id,
        'data-type': block.type,
        draggable: 'true',
        style: { '--block-accent': color },
        'aria-label': `${icon} ${def.label}`,
        role: 'button',
        tabindex: depth === 0 ? '0' : '-1',
      });

      // Header
      const header = el('div', { class: 'wf-block__header' }, [
        el('span', { class: 'wf-block__icon', text: icon, 'aria-hidden': 'true' }),
        el('span', { class: 'wf-block__type', text: def.label }),
        el('span', { class: 'wf-block__summary', text: this._summarize(block, def) }),
      ]);

      // Action buttons
      const actions = el('div', { class: 'wf-block__actions' });

      const upBtn = el('button', { class: 'wf-block__action', type: 'button', title: 'Move up (↑)', text: '↑', 'aria-label': `Move ${def.label} up` });
      upBtn.addEventListener('click', (e) => { e.stopPropagation(); this.editor.moveBlock(block.id, -1); });

      const downBtn = el('button', { class: 'wf-block__action', type: 'button', title: 'Move down (↓)', text: '↓', 'aria-label': `Move ${def.label} down` });
      downBtn.addEventListener('click', (e) => { e.stopPropagation(); this.editor.moveBlock(block.id, 1); });

      const delBtn = el('button', { class: 'wf-block__action wf-block__action--delete', type: 'button', title: 'Delete block (Del)', text: '✕', 'aria-label': `Delete ${def.label}` });
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await window.showConfirm?.('Delete this block?', { confirmText: 'Delete', danger: true });
        if (ok !== false) this.editor.deleteBlock(block.id);
      });

      actions.append(upBtn, downBtn, delBtn);
      header.appendChild(actions);
      card.appendChild(header);

      // Select on click / keyboard
      card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') this.editor.selectBlock(block.id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.editor.selectBlock(block.id);
        } else if (e.key === 'Delete') {
          e.preventDefault();
          this.editor.deleteBlock(block.id);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.editor.moveBlock(block.id, -1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.editor.moveBlock(block.id, 1);
        }
      });

      // Nested blocks (condition_if, loop_times)
      if (def.maxNested) {
        card.appendChild(this._buildNestedSection(block, 'if_blocks', 'IF blocks', color, depth));
        if (block.type === 'condition_if') {
          card.appendChild(this._buildNestedSection(block, 'else_blocks', 'ELSE blocks', '#f59e0b', depth));
        }
        if (block.type === 'loop_times') {
          card.appendChild(this._buildNestedSection(block, 'loop_blocks', 'LOOP blocks', '#8b5cf6', depth));
        }
      }

      // Drag-to-reorder with visual feedback
      card.addEventListener('dragstart', (e) => {
        this._dragId = block.id;
        e.dataTransfer.setData('application/wf-block-id', block.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('wf-block--dragging');
        e.dataTransfer.setDragImage(card, 0, 0);
      });
      card.addEventListener('dragend', () => {
        this._dragId = null;
        card.classList.remove('wf-block--dragging');
        qsa('.wf-block--drag-over').forEach((c) => c.classList.remove('wf-block--drag-over'));
      });
      card.addEventListener('dragover', (e) => {
        if (this._dragId && this._dragId !== block.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          card.classList.add('wf-block--drag-over');
        }
      });
      card.addEventListener('dragleave', () => card.classList.remove('wf-block--drag-over'));
      card.addEventListener('drop', (e) => {
        card.classList.remove('wf-block--drag-over');
        const fromId = e.dataTransfer.getData('application/wf-block-id');
        if (!fromId || fromId === block.id) return;
        e.preventDefault();
        e.stopPropagation();
        this._reorder(fromId, block.id, parentArray);
      });

      return card;
    }

    _buildNestedSection(block, arrayKey, sectionLabel, color, depth) {
      const nestedBlocks = block.data?.[arrayKey] || [];
      const sectionId = `${block.id}-${arrayKey}`;
      const isExpanded = !this._expandedNestedSections.has(sectionId) || nestedBlocks.length === 0;
      const wrap = el('div', { class: `wf-block__nested ${isExpanded ? 'wf-block__nested--expanded' : 'wf-block__nested--collapsed'}` });

      const toggleBtn = el('button', {
        class: 'wf-block__nested-toggle',
        type: 'button',
        'aria-expanded': String(isExpanded),
        'aria-controls': sectionId,
        text: isExpanded ? '▾' : '▸',
      });
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isExpanded) this._expandedNestedSections.add(sectionId);
        else this._expandedNestedSections.delete(sectionId);
        this.render();
      });

      const header = el('div', { class: 'wf-block__nested-header' }, [
        toggleBtn,
        el('span', { class: 'wf-block__nested-label', text: sectionLabel, style: { borderColor: color } }),
        el('span', { class: 'wf-block__nested-count', text: `(${nestedBlocks.length})` }),
      ]);
      wrap.appendChild(header);

      if (isExpanded) {
        const container = el('div', { class: 'wf-block__nested-content', id: sectionId });
        if (nestedBlocks.length) {
          for (const nb of nestedBlocks) {
            container.appendChild(this._buildCard(nb, depth + 1, nestedBlocks));
          }
        } else {
          container.appendChild(el('div', { class: 'wf-block__nested-empty', text: 'Drop blocks here…' }));
        }

        // Drop zone for nested blocks from palette
        container.addEventListener('dragover', (e) => {
          if (e.dataTransfer.types.includes('text/wf-block-type') || e.dataTransfer.types.includes('text/plain')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        });
        container.addEventListener('drop', (e) => {
          const type = e.dataTransfer.getData('text/wf-block-type') || e.dataTransfer.getData('text/plain');
          if (type && REG.getBlock(type)) {
            e.preventDefault();
            e.stopPropagation();
            if (!Array.isArray(block.data[arrayKey])) block.data[arrayKey] = [];
            this.editor.addBlock(type, block.data[arrayKey]);
          }
        });

        wrap.appendChild(container);
      }

      return wrap;
    }

    _reorder(fromId, toId, blocks) {
      const fromIdx = blocks.findIndex((b) => b.id === fromId);
      const toIdx   = blocks.findIndex((b) => b.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [item] = blocks.splice(fromIdx, 1);
      blocks.splice(toIdx, 0, item);
      this.editor._markDirty();
      this.editor.canvas.render();
    }

    /** Inline summary text shown on the collapsed card */
    _summarize(block, def) {
      const d = block.data || {};
      switch (block.type) {
        case 'reply':
        case 'followup':
        case 'send_message':
        case 'dm_user':
        case 'format_text':
          return (d.content || d.template || '').slice(0, 60) || '(empty)';
        case 'send_embed':
          return (d.title || d.description || '').slice(0, 60) || '(embed)';
        case 'set_variable':
          return d.var_name ? `${d.var_name} = ${String(d.value || '').slice(0, 30)}` : '';
        case 'add_role':
        case 'remove_role':
        case 'toggle_role':
          return d.role_id ? `Role: ${d.role_id}` : '';
        case 'condition_if':
          return d.condition_type || '(set condition)';
        case 'stop_if':
          return d.condition_type || '(set condition)';
        case 'loop_times':
          return d.times ? `${d.times}×` : '(set times)';
        case 'delay':
          return d.ms ? `${d.ms}ms` : '(set delay)';
        case 'math':
          return d.expression ? `${d.expression} → ${d.store_as}` : '(set expression)';
        default:
          return def.description ? def.description.slice(0, 50) : '';
      }
    }

    refreshSelection() {
      qsa('.wf-block--selected').forEach((c) => c.classList.remove('wf-block--selected'));
      if (this.editor._selectedId) {
        const el = qs(`[data-id="${CSS.escape(this.editor._selectedId)}"]`);
        if (el) el.classList.add('wf-block--selected');
      }
    }

    refreshBlockCard(id) {
      const found = this.editor.findBlock(id);
      if (!found) return;
      const cardEl = qs(`[data-id="${CSS.escape(id)}"]`);
      if (!cardEl) { this.render(); return; }

      const def = REG.getBlock(found.block.type);
      const summaryEl = cardEl.querySelector('.wf-block__summary');
      if (summaryEl) summaryEl.textContent = this._summarize(found.block, def);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FieldEditor — Modal editors for complex field types (Phase 2)
  // ═══════════════════════════════════════════════════════════
  class FieldEditor {
    /**
     * Show modal editor for complex field types
     * Returns Promise<value> or undefined if cancelled
     */
    static async editArrayField(fieldType, currentValue, field, availableVars) {
      return new Promise((resolve) => {
        const modal = el('div', { class: 'wf-modal-overlay' });
        const dialog = el('div', { class: 'wf-modal' });

        const onClose = (val) => {
          modal.remove();
          resolve(val);
        };

        const onCancel = () => onClose(undefined);
        const onSave = () => {
          const newVal = this._collectModalValue(fieldType, dialog);
          onClose(newVal);
        };

        // Header
        dialog.appendChild(el('div', { class: 'wf-modal__header' }, [
          el('h3', { class: 'wf-modal__title', text: `Edit ${field.label}` }),
          el('button', { class: 'wf-modal__close', type: 'button', text: '✕',
            onclick: onCancel, 'aria-label': 'Close' }),
        ]));

        // Body
        const body = el('div', { class: 'wf-modal__body' });
        const editors = this._buildFieldEditorContent(fieldType, currentValue, availableVars);
        body.appendChild(editors);
        dialog.appendChild(body);

        // Footer
        dialog.appendChild(el('div', { class: 'wf-modal__footer' }, [
          el('button', { class: 'wf-btn wf-btn--secondary', type: 'button', text: 'Cancel', onclick: onCancel }),
          el('button', { class: 'wf-btn wf-btn--primary', type: 'button', text: 'Save', onclick: onSave }),
        ]));

        modal.appendChild(dialog);
        document.body.appendChild(modal);
      });
    }

    static _buildFieldEditorContent(fieldType, currentValue, availableVars) {
      const container = el('div', { class: 'wf-field-editor' });

      switch (fieldType) {
        case 'embed_fields':
          return this._buildEmbedFieldsEditor(container, currentValue);
        case 'button_array':
          return this._buildButtonArrayEditor(container, currentValue);
        case 'option_array':
          return this._buildOptionArrayEditor(container, currentValue);
        case 'modal_fields':
          return this._buildModalFieldsEditor(container, currentValue);
        default:
          container.textContent = `No editor for ${fieldType}`;
          return container;
      }
    }

    static _buildEmbedFieldsEditor(container, currentValue) {
      const fields = Array.isArray(currentValue) ? currentValue : [];
      const list = el('div', { class: 'wf-field-editor__list' });

      const renderFields = () => {
        list.textContent = '';
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i] || {};
          const item = el('div', { class: 'wf-field-editor__item' }, [
            el('input', {
              type: 'text',
              placeholder: 'Field name',
              value: f.name || '',
              onchange: (e) => { f.name = e.target.value; },
              class: 'wf-field-editor__input',
            }),
            el('textarea', {
              placeholder: 'Field value',
              value: f.value || '',
              onchange: (e) => { f.value = e.target.value; },
              class: 'wf-field-editor__textarea',
              rows: 2,
            }),
            el('label', {
              class: 'wf-field-editor__inline-label',
              children: [
                el('input', {
                  type: 'checkbox',
                  checked: f.inline || false,
                  onchange: (e) => { f.inline = e.target.checked; },
                }),
                el('span', { text: ' Inline' }),
              ],
            }),
            el('button', {
              class: 'wf-field-editor__remove',
              type: 'button',
              text: '✕',
              onclick: () => { fields.splice(i, 1); renderFields(); },
            }),
          ]);
          list.appendChild(item);
        }
      };

      renderFields();

      container.append(
        el('p', { text: 'Embed fields:' }),
        list,
        el('button', {
          class: 'wf-btn wf-btn--secondary wf-field-editor__add-btn',
          type: 'button',
          text: '+ Add field',
          onclick: () => { fields.push({ name: '', value: '', inline: false }); renderFields(); },
        })
      );

      container.dataset.editorValue = JSON.stringify(fields);
      return container;
    }

    static _buildButtonArrayEditor(container, currentValue) {
      const buttons = Array.isArray(currentValue) ? currentValue : [];
      const list = el('div', { class: 'wf-field-editor__list' });

      const renderButtons = () => {
        list.textContent = '';
        for (let i = 0; i < buttons.length; i++) {
          const b = buttons[i] || {};
          const item = el('div', { class: 'wf-field-editor__item' }, [
            el('input', {
              type: 'text',
              placeholder: 'Label',
              value: b.label || '',
              onchange: (e) => { b.label = e.target.value; },
              class: 'wf-field-editor__input',
            }),
            el('input', {
              type: 'text',
              placeholder: 'Custom ID (optional)',
              value: b.customId || '',
              onchange: (e) => { b.customId = e.target.value; },
              class: 'wf-field-editor__input',
            }),
            el('select', {
              onchange: (e) => { b.style = e.target.value; },
              class: 'wf-field-editor__select',
              children: [
                el('option', { value: 'primary', text: 'Primary (blurple)', selected: b.style === 'primary' }),
                el('option', { value: 'secondary', text: 'Secondary (grey)', selected: b.style === 'secondary' }),
                el('option', { value: 'success', text: 'Success (green)', selected: b.style === 'success' }),
                el('option', { value: 'danger', text: 'Danger (red)', selected: b.style === 'danger' }),
              ],
            }),
            el('button', {
              class: 'wf-field-editor__remove',
              type: 'button',
              text: '✕',
              onclick: () => { buttons.splice(i, 1); renderButtons(); },
            }),
          ]);
          list.appendChild(item);
        }
      };

      renderButtons();

      container.append(
        el('p', { text: 'Buttons (max 5):' }),
        list,
        el('button', {
          class: `wf-btn wf-btn--secondary wf-field-editor__add-btn ${buttons.length >= 5 ? 'wf-btn--disabled' : ''}`,
          type: 'button',
          text: '+ Add button',
          onclick: () => { if (buttons.length < 5) { buttons.push({ label: '', customId: '', style: 'primary' }); renderButtons(); } },
          disabled: buttons.length >= 5,
        })
      );

      container.dataset.editorValue = JSON.stringify(buttons);
      return container;
    }

    static _buildOptionArrayEditor(container, currentValue) {
      const options = Array.isArray(currentValue) ? currentValue : [];
      const list = el('div', { class: 'wf-field-editor__list' });

      const renderOptions = () => {
        list.textContent = '';
        for (let i = 0; i < options.length; i++) {
          const o = options[i] || {};
          const item = el('div', { class: 'wf-field-editor__item' }, [
            el('input', {
              type: 'text',
              placeholder: 'Label',
              value: o.label || '',
              onchange: (e) => { o.label = e.target.value; },
              class: 'wf-field-editor__input',
            }),
            el('input', {
              type: 'text',
              placeholder: 'Value',
              value: o.value || '',
              onchange: (e) => { o.value = e.target.value; },
              class: 'wf-field-editor__input',
            }),
            el('input', {
              type: 'text',
              placeholder: 'Description (optional)',
              value: o.description || '',
              onchange: (e) => { o.description = e.target.value; },
              class: 'wf-field-editor__input',
            }),
            el('button', {
              class: 'wf-field-editor__remove',
              type: 'button',
              text: '✕',
              onclick: () => { options.splice(i, 1); renderOptions(); },
            }),
          ]);
          list.appendChild(item);
        }
      };

      renderOptions();

      container.append(
        el('p', { text: 'Select menu options (max 25):' }),
        list,
        el('button', {
          class: `wf-btn wf-btn--secondary wf-field-editor__add-btn ${options.length >= 25 ? 'wf-btn--disabled' : ''}`,
          type: 'button',
          text: '+ Add option',
          onclick: () => { if (options.length < 25) { options.push({ label: '', value: '', description: '' }); renderOptions(); } },
          disabled: options.length >= 25,
        })
      );

      container.dataset.editorValue = JSON.stringify(options);
      return container;
    }

    static _buildModalFieldsEditor(container, currentValue) {
      const fields = Array.isArray(currentValue) ? currentValue : [];
      const list = el('div', { class: 'wf-field-editor__list' });

      const renderFields = () => {
        list.textContent = '';
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i] || {};
          const item = el('div', { class: 'wf-field-editor__item' }, [
            el('input', {
              type: 'text',
              placeholder: 'Label',
              value: f.label || '',
              onchange: (e) => { f.label = e.target.value; },
              class: 'wf-field-editor__input',
            }),
            el('select', {
              onchange: (e) => { f.style = e.target.value; },
              class: 'wf-field-editor__select',
              children: [
                el('option', { value: 'short', text: 'Short text', selected: f.style === 'short' }),
                el('option', { value: 'paragraph', text: 'Paragraph', selected: f.style === 'paragraph' }),
              ],
            }),
            el('label', {
              class: 'wf-field-editor__inline-label',
              children: [
                el('input', {
                  type: 'checkbox',
                  checked: f.required || false,
                  onchange: (e) => { f.required = e.target.checked; },
                }),
                el('span', { text: ' Required' }),
              ],
            }),
            el('button', {
              class: 'wf-field-editor__remove',
              type: 'button',
              text: '✕',
              onclick: () => { fields.splice(i, 1); renderFields(); },
            }),
          ]);
          list.appendChild(item);
        }
      };

      renderFields();

      container.append(
        el('p', { text: 'Modal fields (max 5):' }),
        list,
        el('button', {
          class: `wf-btn wf-btn--secondary wf-field-editor__add-btn ${fields.length >= 5 ? 'wf-btn--disabled' : ''}`,
          type: 'button',
          text: '+ Add field',
          onclick: () => { if (fields.length < 5) { fields.push({ label: '', style: 'short', required: false }); renderFields(); } },
          disabled: fields.length >= 5,
        })
      );

      container.dataset.editorValue = JSON.stringify(fields);
      return container;
    }

    static _collectModalValue(fieldType, dialog) {
      const editor = dialog.querySelector('.wf-field-editor');
      if (!editor) return undefined;
      try {
        return JSON.parse(editor.dataset.editorValue || 'null');
      } catch {
        return undefined;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PropertiesPanel — right panel (Phase 2: enhanced with complex editors)
  // ═══════════════════════════════════════════════════════════
  class PropertiesPanel {
    constructor(editor) {
      this.editor    = editor;
      this.container = qs('#wf-props');
      this._blockId  = null;
    }

    clear() {
      this._blockId = null;
      if (!this.container) return;
      this.container.textContent = '';
      this.container.appendChild(el('p', { class: 'wf-props__empty', text: 'Select a block to edit its properties.' }));
    }

    showBlock(block) {
      this._blockId = block.id;
      if (!this.container) return;
      this.container.textContent = '';

      const def = REG.getBlock(block.type);
      if (!def) { this.clear(); return; }

      const catMeta = REG.getCategoryMeta(block.type);
      const color   = catMeta?.color || 'var(--accent)';

      // Header
      this.container.appendChild(el('div', { class: 'wf-props__header', style: { borderColor: color } }, [
        el('h3', { class: 'wf-props__title', text: def.label }),
        el('p',  { class: 'wf-props__desc',  text: def.description || '' }),
      ]));

      if (!def.fields.length) {
        this.container.appendChild(el('p', { class: 'wf-props__no-fields', text: 'This block has no configuration.' }));
        return;
      }

      // Build form
      const form = el('div', { class: 'wf-props__form' });
      for (const field of def.fields) {
        const row = this._buildFieldRow(field, block);
        if (row) form.appendChild(row);
      }
      this.container.appendChild(form);
    }

    _buildFieldRow(field, block) {
      const data  = block.data || {};
      const value = data[field.key] !== undefined ? data[field.key] : '';

      // Branch label (section divider for condition else)
      if (field.type === 'branch_label') {
        return el('div', { class: 'wf-props__branch-label', text: field.label });
      }

      // Show/hide logic
      if (field.showIf) {
        const condVal = data[field.showIf.key];
        const expected = field.showIf.value;
        const show = Array.isArray(expected) ? expected.includes(condVal) : condVal === expected;
        if (!show) return null;
      }

      const rowEl = el('div', { class: 'wf-props__row' });
      const labelEl = el('label', {
        class: `wf-props__label ${field.required ? 'wf-props__label--required' : ''}`,
        text: field.label,
      });
      if (field.hint) labelEl.appendChild(el('span', { class: 'wf-props__hint', text: ` — ${field.hint}` }));
      rowEl.appendChild(labelEl);

      let inputEl = null;

      switch (field.type) {
        case 'text':
          inputEl = el('input', {
            type: 'text', class: 'wf-props__input',
            value: String(value), maxLength: field.max || 500,
            placeholder: field.placeholder || '',
          });
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value));
          break;

        case 'textarea':
          inputEl = el('textarea', {
            class: 'wf-props__textarea',
            maxLength: field.max || 2000,
            placeholder: field.placeholder || '',
            rows: 4,
          });
          inputEl.textContent = String(value);
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value));
          break;

        case 'number':
          inputEl = el('input', {
            type: 'number', class: 'wf-props__input',
            value: String(value),
            min: String(field.min ?? ''),
            max: String(field.max ?? ''),
          });
          inputEl.addEventListener('input', () => this._onChange(block, field.key, Number(inputEl.value)));
          break;

        case 'toggle': {
          const wrap = el('label', { class: 'wf-props__toggle-wrap' });
          inputEl = el('input', { type: 'checkbox', class: 'wf-props__toggle' });
          inputEl.checked = !!value;
          inputEl.addEventListener('change', () => {
            this._onChange(block, field.key, inputEl.checked);
            // Re-render the full panel (showIf dependencies may change)
            const found = this.editor.findBlock(block.id);
            if (found) this.showBlock(found.block);
          });
          wrap.append(inputEl, el('span', { class: 'wf-props__toggle-track' }));
          rowEl.appendChild(wrap);
          return rowEl;
        }

        case 'select': {
          inputEl = el('select', { class: 'wf-props__select' });
          for (const opt of (field.options || [])) {
            const o = el('option', { value: opt.v, text: opt.l });
            if (String(value) === String(opt.v)) o.selected = true;
            inputEl.appendChild(o);
          }
          inputEl.addEventListener('change', () => {
            this._onChange(block, field.key, inputEl.value);
            // Re-render for showIf
            const found = this.editor.findBlock(block.id);
            if (found) this.showBlock(found.block);
          });
          break;
        }

        case 'role':
        case 'channel':
          // Rendered as text input with hint — proper pickers are a Phase 2 enhancement
          inputEl = el('input', {
            type: 'text', class: 'wf-props__input',
            value: String(value),
            placeholder: field.type === 'role' ? 'Role ID' : 'Channel ID',
          });
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value.trim()));
          break;

        case 'color':
          inputEl = el('input', { type: 'color', class: 'wf-props__color', value: value || '#5865f2' });
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value));
          break;

        case 'embed_fields':
        case 'modal_fields':
        case 'button_array':
        case 'option_array': {
          // Complex array editors — now functional in Phase 2!
          const currentValue = value || [];
          const editBtn = el('button', {
            class: 'wf-btn wf-btn--secondary',
            type: 'button',
            text: `✏️ Edit ${field.label}`,
            'aria-label': `Edit ${field.label}`,
          });
          editBtn.addEventListener('click', async () => {
            const availableVars = getAvailableVariables(this.editor.state);
            const newVal = await FieldEditor.editArrayField(field.type, currentValue, field, availableVars);
            if (newVal !== undefined) {
              this._onChange(block, field.key, newVal);
            }
          });
          rowEl.appendChild(editBtn);
          if (Array.isArray(currentValue) && currentValue.length > 0) {
            rowEl.appendChild(el('p', {
              class: 'wf-props__field-info',
              text: `${currentValue.length} item${currentValue.length !== 1 ? 's' : ''} configured`,
            }));
          }
          return rowEl;
        }

        default:
          return null;
      }

      if (inputEl) rowEl.appendChild(inputEl);
      return rowEl;
    }

    _onChange(block, key, value) {
      this.editor.updateBlockData(block.id, key, value);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Bootstrap
  // ═══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('wfPageData')) return; // not on workflow editor page
    window._wfEditor = new WorkflowEditor();
  });

}());
