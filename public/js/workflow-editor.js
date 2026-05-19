/**
 * workflow-editor.js — Workflow Builder UI (Phase 2)
 *
 * Classes:
 *   WorkflowEditor   — top-level controller, owns state, API calls, autosave
 *   RecentBlocks     — localStorage-backed recent-block tracker
 *   InsertBlockModal — searchable overlay to pick and insert a block type
 *   BlockPalette     — left panel (tabs: Blocks | Variables, favorites, recent)
 *   WorkflowCanvas   — centre panel (flow steps + step numbers + add-between + drag)
 *   PropertiesPanel  — right panel (tabs: Config | Help, variable autocomplete)
 *   FieldEditor      — modal editors for complex array field types
 *
 * CSP-compliant: no eval, no new Function(), no inline handlers.
 * All user content written via textContent / escAttr().
 */
(function () {
  'use strict';

  /* ── Shorthand helpers ───────────────────────────────────── */
  let _uidCtr = Date.now() % 1e9;
  const uid  = () => `b${(_uidCtr++).toString(36)}`;
  const qs   = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa  = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /** Escape a string for use in an HTML attribute value */
  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  /**
   * Build a DOM element with optional attributes/children.
   * Handles: text, class, style (object), event handlers (on*), children, checked, selected, disabled, tabindex, etc.
   * All property keys starting with 'on' are treated as addEventListener calls.
   */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k === 'text') { node.textContent = v; continue; }
      if (k === 'class') { node.className = v; continue; }
      if (k === 'style' && typeof v === 'object') {
        Object.assign(node.style, v); continue;
      }
      if (k === 'children') { continue; } // handled below
      if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2), v); continue;
      }
      if (k === 'checked')  { node.checked  = !!v; continue; }
      if (k === 'selected') { node.selected = !!v; continue; }
      if (k === 'disabled') { node.disabled = !!v; continue; }
      if (k === 'value' && tag !== 'option') { node.value = v; continue; }
      node.setAttribute(k, String(v));
    }
    const allChildren = attrs.children ? [...attrs.children, ...children] : children;
    for (const c of allChildren) {
      if (c instanceof Node) node.appendChild(c);
      else if (c != null) node.appendChild(document.createTextNode(String(c)));
    }
    return node;
  }

  /* ── Block icons map ─────────────────────────────────────── */
  const BLOCK_ICONS = {
    reply: '↩️', followup: '💬', send_message: '📨', dm_user: '📩',
    send_embed: '🖼️', edit_message: '✏️', delete_message: '🗑️',
    add_reaction: '😄', pin_message: '📌', create_thread: '🧵',
    send_button_message: '🔘', send_select_message: '📋', send_modal: '📝',
    await_button: '⏳', await_select: '⏳', await_modal: '⏳',
    create_channel: '📣', delete_channel: '🗑️', rename_channel: '✏️',
    set_slowmode: '🐢', lock_channel: '🔒', unlock_channel: '🔓',
    add_role: '✅', remove_role: '❌', toggle_role: '🔄', create_role: '🛡️',
    timeout_user: '⏱️', kick_user: '👢', ban_user: '🔨', unban_user: '✅',
    set_nickname: '📛', warn_user: '⚠️',
    set_variable: '📦', get_variable: '📤', delete_variable: '🗑️', store_variable: '💾',
    math: '🔢', random_number: '🎲', format_text: '📝', substring: '✂️',
    condition_if: '❓', stop_if: '🛑', loop_times: '🔁', wait_for_event: '👂',
    delay: '⏰', log_action: '📋', http_request: '🌐', format_date: '📅',
  };
  const getBlockIcon = (type) => BLOCK_ICONS[type] || '⚙️';

  /* ── Registry shorthand ──────────────────────────────────── */
  const REG = {
    getBlock:       (t)  => window.WORKFLOW_REGISTRY?.getBlock(t),
    getDefaults:    (t)  => window.WORKFLOW_REGISTRY?.getDefaults(t) || {},
    getByCategory:  (id) => window.WORKFLOW_REGISTRY?.getByCategory(id) || [],
    getCategoryMeta:(t)  => window.WORKFLOW_REGISTRY?.getCategoryMeta(t) ?? null,
    CATEGORIES: () => window.WORKFLOW_REGISTRY?.CATEGORIES || [],
    BLOCKS: ()      => window.WORKFLOW_REGISTRY?.BLOCKS || {},
  };

  /* ── Built-in variables ──────────────────────────────────── */
  const BUILTIN_VARIABLES = [
    // Always available (universal)
    { key: 'user',          desc: '@mention the author' },
    { key: 'username',      desc: 'Author username' },
    { key: 'displayname',   desc: 'Author display name' },
    { key: 'userid',        desc: 'Author user ID' },
    { key: 'avatar',        desc: 'Author avatar URL' },
    { key: 'server',        desc: 'Server name' },
    { key: 'guildid',       desc: 'Server ID' },
    { key: 'membercount',   desc: 'Total member count' },
    { key: 'channel',       desc: '#mention the channel' },
    { key: 'channelname',   desc: 'Channel name' },
    { key: 'channelid',     desc: 'Channel ID' },
    { key: 'message',       desc: 'Trigger message content' },
    { key: 'timestamp',     desc: 'Unix timestamp (seconds)' },
    { key: 'date',          desc: 'Current date (long format)' },
    { key: 'time',          desc: 'Current time (UTC)' },
    { key: 'loop_index',    desc: 'Current loop iteration (0-based)' },
    { key: 'loop_count',    desc: 'Current loop iteration (1-based)' },
    { key: 'item',          desc: 'Current for_each item' },
    { key: 'item_index',    desc: 'Current for_each item index' },
    { key: '_error_message', desc: 'Error message from try/catch' },
  ];

  // Trigger-specific variables (only shown when that trigger type is selected)
  const TRIGGER_SPECIFIC_VARS = {
    slash: [
      { key: 'command_name', desc: 'Slash command name' },
      { key: 'args',         desc: 'All arguments as text' },
    ],
    prefix: [
      { key: 'command_name', desc: 'Command name (without prefix)' },
      { key: 'args',         desc: 'All arguments as text' },
    ],
    contains: [
      { key: 'trigger_value', desc: 'Matched keyword' },
    ],
    exact: [
      { key: 'trigger_value', desc: 'Matched message text' },
    ],
    reaction_add: [
      { key: 'reaction_emoji',    desc: 'The emoji that was reacted' },
      { key: 'reaction_emoji_id', desc: 'Emoji ID (or name for unicode)' },
      { key: 'reactor',           desc: '@mention the reactor' },
      { key: 'reactor_id',        desc: 'Reactor user ID' },
      { key: 'reactor_name',      desc: 'Reactor username' },
      { key: 'reacted_message',   desc: 'Content of the reacted message' },
    ],
    reaction_remove: [
      { key: 'reaction_emoji',    desc: 'The emoji that was removed' },
      { key: 'reaction_emoji_id', desc: 'Emoji ID (or name for unicode)' },
      { key: 'reactor',           desc: '@mention the user who removed reaction' },
      { key: 'reactor_id',        desc: 'Reactor user ID' },
      { key: 'reactor_name',      desc: 'Reactor username' },
    ],
    member_join: [
      { key: 'new_member',       desc: '@mention the new member' },
      { key: 'new_member_id',    desc: 'New member user ID' },
      { key: 'new_member_name',  desc: 'New member username' },
      { key: 'new_member_avatar',desc: 'New member avatar URL' },
      { key: 'account_age_days', desc: 'Account age in days' },
      { key: 'account_created',  desc: 'Account creation date' },
    ],
    member_leave: [
      { key: 'left_member_name', desc: 'Left member username' },
      { key: 'left_member_id',   desc: 'Left member user ID' },
    ],
    button: [
      { key: 'button_id',        desc: 'Custom ID of clicked button' },
      { key: 'button_user',      desc: '@mention the user who clicked' },
      { key: 'button_user_id',   desc: 'Clicking user ID' },
      { key: 'button_user_name', desc: 'Clicking user username' },
    ],
    select_menu: [
      { key: 'selected_values', desc: 'All selected values (comma-separated)' },
      { key: 'selected_count',  desc: 'Number of selected values' },
      { key: 'selected_0',      desc: 'First selected value' },
      { key: 'selected_1',      desc: 'Second selected value' },
    ],
    voice_join: [
      { key: 'voice_channel',      desc: 'Name of voice channel joined' },
      { key: 'voice_channel_id',   desc: 'ID of voice channel joined' },
    ],
    voice_leave: [
      { key: 'voice_channel',      desc: 'Name of voice channel left' },
      { key: 'voice_channel_id',   desc: 'ID of voice channel left' },
    ],
    scheduled: [
      { key: 'scheduled_name', desc: 'Name of this scheduled workflow' },
      { key: 'scheduled_time', desc: 'ISO timestamp when triggered' },
    ],
  };
  // Legacy aliases
  TRIGGER_SPECIFIC_VARS.reaction = TRIGGER_SPECIFIC_VARS.reaction_add;

  const getAvailableVariables = (state) => {
    const vars = [...BUILTIN_VARIABLES];
    const triggerType = state?.trigger?.type;
    if (triggerType && TRIGGER_SPECIFIC_VARS[triggerType]) {
      vars.push(...TRIGGER_SPECIFIC_VARS[triggerType]);
    }
    for (const v of (state.variables || [])) {
      if (v.name) vars.push({ key: v.name, desc: v.description || v.scope || 'workflow variable' });
    }
    return vars;
  };

  /* ── Trigger normalisation ───────────────────────────────── */
  const LEGACY_TRIGGER_MAP = { slash: 'SLASH', prefix: 'PREFIX', exact: 'EXACT', message: 'MESSAGE', reaction: 'REACTION', join: 'JOIN', leave: 'LEAVE' };
  const normalizeTriggerType = (t) => LEGACY_TRIGGER_MAP[t?.toLowerCase()] || t || 'SLASH';

  /* ── Toast helper ────────────────────────────────────────── */
  let _toastTimer = null;
  function showToast(msg, type = '') {
    const existing = qs('.wf-toast');
    if (existing) existing.remove();
    if (_toastTimer) clearTimeout(_toastTimer);
    const toast = el('div', { class: `wf-toast${type ? ` wf-toast--${type}` : ''}`, text: msg });
    document.body.appendChild(toast);
    _toastTimer = setTimeout(() => {
      toast.classList.add('wf-toast--out');
      setTimeout(() => toast.remove(), 350);
    }, 2500);
  }

  /* ═══════════════════════════════════════════════════════════
     RecentBlocks — localStorage recent-block tracker
     ═══════════════════════════════════════════════════════════ */
  class RecentBlocks {
    static KEY = 'wf_recent_blocks';
    static MAX = 8;

    static get() {
      try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); }
      catch { return []; }
    }

    static add(type) {
      const list = this.get().filter(t => t !== type);
      list.unshift(type);
      try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, this.MAX))); } catch {}
    }
  }

  /* ═══════════════════════════════════════════════════════════
     FavoriteBlocks — localStorage favorites
     ═══════════════════════════════════════════════════════════ */
  class FavoriteBlocks {
    static KEY = 'wf_fav_blocks';

    static get() {
      try { return new Set(JSON.parse(localStorage.getItem(this.KEY) || '[]')); }
      catch { return new Set(); }
    }

    static toggle(type) {
      const s = this.get();
      if (s.has(type)) s.delete(type); else s.add(type);
      try { localStorage.setItem(this.KEY, JSON.stringify([...s])); } catch {}
    }

    static has(type) { return this.get().has(type); }
  }

  /* ═══════════════════════════════════════════════════════════
     InsertBlockModal — searchable add-block overlay
     ═══════════════════════════════════════════════════════════ */
  class InsertBlockModal {
    /**
     * Opens the insert-block modal.
     * @returns {Promise<string|null>} block type string or null if cancelled
     */
    static open(insertLabel = 'Insert Block') {
      return new Promise((resolve) => {
        let focusedIdx = -1;
        let filteredItems = [];

        const overlay = el('div', { class: 'wf-insert-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': insertLabel });
        const modal   = el('div', { class: 'wf-insert-modal' });

        const onClose = (type) => {
          overlay.remove();
          resolve(type || null);
        };

        // Close on overlay click
        overlay.addEventListener('click', (e) => { if (e.target === overlay) onClose(null); });

        // Header
        const searchInput = el('input', {
          type: 'search',
          class: 'wf-insert-modal__search',
          placeholder: 'Search blocks…',
          autocomplete: 'off',
          'aria-label': 'Search blocks',
        });

        const header = el('div', { class: 'wf-insert-modal__header' }, [
          el('p', { class: 'wf-insert-modal__title', text: insertLabel }),
          el('div', { class: 'wf-insert-modal__search-wrap' }, [
            el('span', { class: 'wf-insert-modal__search-icon', text: '🔍', 'aria-hidden': 'true' }),
            searchInput,
            el('span', { class: 'wf-insert-modal__esc-hint', text: 'esc' }),
          ]),
        ]);
        modal.appendChild(header);

        // Results container
        const results = el('div', { class: 'wf-insert-modal__results', role: 'listbox' });
        modal.appendChild(results);

        // Footer hints
        modal.appendChild(el('div', { class: 'wf-insert-modal__footer' }, [
          el('kbd', { class: 'wf-insert-modal__kbd', text: '↑↓' }),
          document.createTextNode(' navigate  '),
          el('kbd', { class: 'wf-insert-modal__kbd', text: '↵' }),
          document.createTextNode(' insert  '),
          el('kbd', { class: 'wf-insert-modal__kbd', text: 'esc' }),
          document.createTextNode(' cancel'),
        ]));

        const renderResults = (query) => {
          results.textContent = '';
          focusedIdx = -1;
          filteredItems = [];

          const q = query.toLowerCase().trim();
          const cats = REG.CATEGORIES();
          const recent = RecentBlocks.get();
          const favSet = FavoriteBlocks.get();

          // Recent section
          if (!q && recent.length > 0) {
            const recentDefs = recent.map(t => REG.getBlock(t)).filter(Boolean);
            if (recentDefs.length) {
              results.appendChild(el('div', { class: 'wf-insert-modal__cat-hdr' }, [
                el('span', { text: '🕐 Recent' }),
              ]));
              for (const def of recentDefs) {
                const item = this._buildResultItem(def, onClose, filteredItems);
                results.appendChild(item);
              }
            }
          }

          // Favorites section
          if (!q && favSet.size > 0) {
            const favDefs = [...favSet].map(t => REG.getBlock(t)).filter(Boolean);
            if (favDefs.length) {
              results.appendChild(el('div', { class: 'wf-insert-modal__cat-hdr' }, [
                el('span', { text: '⭐ Favorites' }),
              ]));
              for (const def of favDefs) {
                const item = this._buildResultItem(def, onClose, filteredItems);
                results.appendChild(item);
              }
            }
          }

          // Category sections
          let anyResult = false;
          for (const cat of cats) {
            const blocks = REG.getByCategory(cat.id).filter(def =>
              !q ||
              def.label.toLowerCase().includes(q) ||
              (def.description || '').toLowerCase().includes(q) ||
              def.type.toLowerCase().includes(q)
            );
            if (!blocks.length) continue;
            anyResult = true;
            results.appendChild(el('div', {
              class: 'wf-insert-modal__cat-hdr',
              style: { color: cat.color },
            }, [el('span', { text: cat.label })]));
            for (const def of blocks) {
              const item = this._buildResultItem(def, onClose, filteredItems);
              results.appendChild(item);
            }
          }

          if (!anyResult && q) {
            results.appendChild(el('div', { class: 'wf-insert-modal__empty', text: `No results for "${query}"` }));
          }
        };

        renderResults('');

        // Search input handler
        let debounce = null;
        searchInput.addEventListener('input', () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => renderResults(searchInput.value), 80);
        });

        // Keyboard navigation
        overlay.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(null); return; }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusedIdx = Math.min(focusedIdx + 1, filteredItems.length - 1);
            this._updateFocus(filteredItems, focusedIdx);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusedIdx = Math.max(focusedIdx - 1, 0);
            this._updateFocus(filteredItems, focusedIdx);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (focusedIdx >= 0 && filteredItems[focusedIdx]) {
              const type = filteredItems[focusedIdx].dataset.blockType;
              if (type) onClose(type);
            }
            return;
          }
        });

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        setTimeout(() => searchInput.focus(), 50);
      });
    }

    static _buildResultItem(def, onClose, filteredItemsArr) {
      const icon = getBlockIcon(def.type);
      const catMeta = REG.getCategoryMeta(def.type);
      const item = el('div', {
        class: 'wf-insert-modal__item',
        role: 'option',
        tabindex: '-1',
        'data-block-type': def.type,
      }, [
        el('span', { class: 'wf-insert-modal__item-icon', text: icon, 'aria-hidden': 'true' }),
        el('div', { class: 'wf-insert-modal__item-info' }, [
          el('div', { class: 'wf-insert-modal__item-label', text: def.label }),
          el('div', { class: 'wf-insert-modal__item-desc', text: def.description || '' }),
        ]),
        el('span', { class: 'wf-insert-modal__item-cat', text: catMeta?.label || '' }),
      ]);
      const idx = filteredItemsArr.length;
      filteredItemsArr.push(item);
      item.addEventListener('click', () => {
        RecentBlocks.add(def.type);
        onClose(def.type);
      });
      item.addEventListener('mouseover', () => {
        filteredItemsArr.forEach((i, j) => {
          i.classList.toggle('wf-insert-modal__item--focused', j === idx);
        });
      });
      return item;
    }

    static _updateFocus(items, idx) {
      items.forEach((item, i) => {
        const focused = i === idx;
        item.classList.toggle('wf-insert-modal__item--focused', focused);
        if (focused) item.scrollIntoView({ block: 'nearest' });
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     BlockPalette — left panel
     ═══════════════════════════════════════════════════════════ */
  class BlockPalette {
    constructor(editor) {
      this.editor    = editor;
      this.container = qs('#wf-palette');
      this._collapsed  = new Set();
      this._searchQuery = '';
      this._activeTab   = 'blocks'; // 'blocks' | 'variables'
    }

    render() {
      if (!this.container) return;
      this.container.textContent = '';

      // Tab bar
      const tabs = el('div', { class: 'wf-palette__tabs', role: 'tablist' });
      const tabBlocks = el('button', {
        class: `wf-palette__tab ${this._activeTab === 'blocks' ? 'wf-palette__tab--active' : ''}`,
        type: 'button', role: 'tab', text: '⚙️ Blocks',
        'aria-selected': String(this._activeTab === 'blocks'),
      });
      const tabVars = el('button', {
        class: `wf-palette__tab ${this._activeTab === 'variables' ? 'wf-palette__tab--active' : ''}`,
        type: 'button', role: 'tab', text: '📦 Variables',
        'aria-selected': String(this._activeTab === 'variables'),
      });
      tabBlocks.addEventListener('click', () => { this._activeTab = 'blocks'; this.render(); });
      tabVars.addEventListener('click', () => { this._activeTab = 'variables'; this.render(); });
      tabs.append(tabBlocks, tabVars);
      this.container.appendChild(tabs);

      if (this._activeTab === 'blocks') {
        this._renderBlocksPanel();
      } else {
        this._renderVariablesPanel();
      }
    }

    _renderBlocksPanel() {
      const panel = el('div', { class: 'wf-palette__panel', id: 'wf-palette-blocks' });

      // Search box
      const searchWrap = el('div', { class: 'wf-palette__search' });
      const searchInput = el('input', {
        type: 'search',
        class: 'wf-palette__search-input',
        placeholder: '🔍 Search blocks…',
        value: this._searchQuery,
        autocomplete: 'off',
      });
      let searchDebounce = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          this._searchQuery = searchInput.value;
          const catsEl = panel.querySelector('.wf-palette__cats');
          if (catsEl) {
            const recentEl = panel.querySelector('.wf-palette__section--recent');
            if (recentEl) recentEl.style.display = this._searchQuery ? 'none' : '';
            const favEl = panel.querySelector('.wf-palette__section--favs');
            if (favEl) favEl.style.display = this._searchQuery ? 'none' : '';
            catsEl.textContent = '';
            this._renderCategoryItems(catsEl, this._searchQuery);
          }
        }, 100);
      });
      searchWrap.appendChild(searchInput);
      panel.appendChild(searchWrap);

      // Recent blocks section
      const recent = RecentBlocks.get();
      if (recent.length > 0) {
        const recentSection = el('div', { class: 'wf-palette__section wf-palette__section--recent' });
        const header = el('div', { class: 'wf-palette__section-header' }, [
          el('span', { text: '🕐 Recent' }),
        ]);
        recentSection.appendChild(header);
        const blocksEl = el('div', { class: 'wf-palette__blocks' });
        for (const type of recent.slice(0, 5)) {
          const def = REG.getBlock(type);
          if (!def) continue;
          blocksEl.appendChild(this._buildItem(def));
        }
        recentSection.appendChild(blocksEl);
        panel.appendChild(recentSection);
      }

      // Favorites section
      const favSet = FavoriteBlocks.get();
      if (favSet.size > 0) {
        const favSection = el('div', { class: 'wf-palette__section wf-palette__section--favs' });
        favSection.appendChild(el('div', { class: 'wf-palette__section-header' }, [
          el('span', { text: '⭐ Favorites' }),
        ]));
        const blocksEl = el('div', { class: 'wf-palette__blocks' });
        for (const type of favSet) {
          const def = REG.getBlock(type);
          if (!def) continue;
          blocksEl.appendChild(this._buildItem(def));
        }
        favSection.appendChild(blocksEl);
        panel.appendChild(favSection);
      }

      // Category list
      const catsEl = el('div', { class: 'wf-palette__cats' });
      this._renderCategoryItems(catsEl, this._searchQuery);
      panel.appendChild(catsEl);

      this.container.appendChild(panel);

      // Focus search
      setTimeout(() => { if (document.activeElement?.tagName !== 'INPUT') searchInput.focus(); }, 0);
    }

    _renderCategoryItems(catsEl, query) {
      const q = (query || '').toLowerCase().trim();
      for (const cat of REG.CATEGORIES()) {
        const blocks = REG.getByCategory(cat.id).filter(def =>
          !q ||
          def.label.toLowerCase().includes(q) ||
          (def.description || '').toLowerCase().includes(q) ||
          def.type.toLowerCase().includes(q)
        );
        if (!blocks.length) continue;

        const isCollapsed = q ? false : this._collapsed.has(cat.id);

        const catHeader = el('div', {
          class: 'wf-palette__cat-header',
          role: 'button',
          tabindex: '0',
          'aria-expanded': String(!isCollapsed),
          'aria-controls': `wf-cat-${cat.id}`,
          style: { color: cat.color },
        }, [
          el('span', { text: cat.label }),
          el('span', { class: 'wf-palette__cat-chevron', text: '▾', 'aria-hidden': 'true' }),
        ]);

        const toggle = () => {
          if (this._collapsed.has(cat.id)) this._collapsed.delete(cat.id);
          else this._collapsed.add(cat.id);
          catHeader.setAttribute('aria-expanded', String(!this._collapsed.has(cat.id)));
          blocksEl.classList.toggle('wf-palette__blocks--collapsed', this._collapsed.has(cat.id));
        };
        catHeader.addEventListener('click', toggle);
        catHeader.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

        const blocksEl = el('div', {
          class: `wf-palette__blocks ${isCollapsed ? 'wf-palette__blocks--collapsed' : ''}`,
          id: `wf-cat-${cat.id}`,
          role: 'group',
        });

        for (const def of blocks) {
          blocksEl.appendChild(this._buildItem(def));
        }

        catsEl.append(catHeader, blocksEl);
      }
    }

    _buildItem(def) {
      const icon  = getBlockIcon(def.type);
      const isFav = FavoriteBlocks.has(def.type);

      const item = el('div', {
        class: 'wf-palette__item',
        role: 'button',
        tabindex: '0',
        draggable: 'true',
        title: def.description || def.label,
        'data-type': def.type,
      }, [
        el('span', { class: 'wf-palette__item-icon', text: icon, 'aria-hidden': 'true' }),
        el('span', { class: 'wf-palette__item-label', text: def.label }),
      ]);

      // Pin/star button
      const pinBtn = el('button', {
        class: `wf-palette__pin-btn ${isFav ? 'wf-palette__pin-btn--active' : ''}`,
        type: 'button',
        title: isFav ? 'Remove from favorites' : 'Add to favorites',
        'aria-label': isFav ? 'Remove from favorites' : 'Add to favorites',
        text: '⭐',
      });
      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        FavoriteBlocks.toggle(def.type);
        this.render();
      });
      item.appendChild(pinBtn);

      // Click to add
      item.addEventListener('click', () => {
        RecentBlocks.add(def.type);
        this.editor.addBlock(def.type);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          RecentBlocks.add(def.type);
          this.editor.addBlock(def.type);
        }
      });

      // Drag start
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', def.type);
        e.dataTransfer.setData('text/wf-block-type', def.type);
        e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('wf-palette__item--dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('wf-palette__item--dragging'));

      return item;
    }

    _renderVariablesPanel() {
      const panel = el('div', { class: 'wf-palette__panel', id: 'wf-palette-vars' });
      const vars  = this.editor.state.variables || [];

      const wrap = el('div', { class: 'wf-vars-panel' });
      const header = el('div', { class: 'wf-vars-panel__header' }, [
        el('span', { class: 'wf-vars-panel__title', text: 'Workflow Variables' }),
      ]);
      const addBtn = el('button', { class: 'wf-vars-panel__add-btn', type: 'button', text: '+ New' });
      addBtn.addEventListener('click', () => this._addVariable());
      header.appendChild(addBtn);
      wrap.appendChild(header);

      // Hint
      wrap.appendChild(el('p', { class: 'wf-vars-panel__hint' }, [
        document.createTextNode('Use '),
        el('code', { text: '{varName}' }),
        document.createTextNode(' in text fields to insert a variable value.'),
      ]));

      const list = el('div', { class: 'wf-vars-list' });
      if (!vars.length) {
        list.appendChild(el('p', { class: 'wf-vars-panel__empty', text: 'No variables defined. Click + New to add one.' }));
      } else {
        for (const v of vars) {
          list.appendChild(this._buildVarRow(v));
        }
      }
      wrap.appendChild(list);

      panel.appendChild(wrap);
      this.container.appendChild(panel);
    }

    _buildVarRow(v) {
      const scopeClass = { workflow: 'workflow', user: 'user', guild: 'guild' }[v.scope || 'workflow'] || 'workflow';
      const row = el('div', { class: 'wf-var-row' }, [
        el('span', { class: `wf-var-row__scope wf-var-row__scope--${scopeClass}`, text: v.scope || 'wf' }),
        el('span', { class: 'wf-var-row__name', text: v.key || '—' }),
      ]);
      const copyBtn = el('button', { class: 'wf-var-row__copy-btn', type: 'button', title: 'Copy as {variable}', text: '📋' });
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(`{${v.key}}`).then(() => showToast(`Copied {${v.key}}`, 'success'));
      });
      const delBtn = el('button', { class: 'wf-var-row__del-btn', type: 'button', title: 'Delete variable', text: '🗑️' });
      delBtn.addEventListener('click', () => {
        this.editor.state.variables = (this.editor.state.variables || []).filter(x => x.key !== v.key);
        this.editor._markDirty();
        this.render();
      });
      row.append(copyBtn, delBtn);
      return row;
    }

    _addVariable() {
      const key = window.prompt('Variable name (letters, numbers, underscores):');
      if (!key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        if (key !== null) showToast('Invalid variable name', 'error');
        return;
      }
      const scope = 'workflow';
      if (!Array.isArray(this.editor.state.variables)) this.editor.state.variables = [];
      if (this.editor.state.variables.some(v => v.key === key)) {
        showToast('Variable already exists', 'error'); return;
      }
      this.editor.state.variables.push({ key, scope, value: '' });
      this.editor._markDirty();
      this.render();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     WorkflowCanvas — centre panel (Phase 2: flow steps)
     ═══════════════════════════════════════════════════════════ */
  class WorkflowCanvas {
    constructor(editor) {
      this.editor    = editor;
      this.container = qs('#wf-canvas');
      this._dragId   = null;
      this._insertAt = null; // index where drop indicator should appear
      this._expandedNested = new Set();
    }

    render() {
      if (!this.container) return;
      this.container.textContent = '';

      const blocks = this.editor.state.blocks;

      if (!blocks.length) {
        this.container.appendChild(this._buildEmptyState());
        this._wireCanvasDrop(this.container);
        return;
      }

      const flow = el('div', { class: 'wf-canvas__flow' });

      // Trigger node
      flow.appendChild(this._buildTriggerNode());

      // First add-zone (before block 0)
      flow.appendChild(this._buildAddZone(0, true));

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const step  = this._buildStep(block, i + 1, i, this.editor.state.blocks);
        flow.appendChild(step);

        // Add-zone between blocks (or end zone after last)
        const isLast = i === blocks.length - 1;
        flow.appendChild(this._buildAddZone(i + 1, false, isLast));
      }

      this.container.appendChild(flow);
      this._wireCanvasDrop(this.container);
    }

    _buildTriggerNode() {
      const tType  = this.editor.state.trigger?.type  || 'SLASH';
      const tValue = this.editor.state.trigger?.value || '';
      return el('div', { class: 'wf-trigger-node' }, [
        el('span', { class: 'wf-trigger-node__dot', 'aria-hidden': 'true' }),
        el('span', { class: 'wf-trigger-node__label', text: 'Trigger' }),
        el('span', { class: 'wf-trigger-node__value', text: `${tType}${tValue ? ': ' + tValue : ''}` }),
      ]);
    }

    _buildEmptyState() {
      const wrap = el('div', { class: 'wf-canvas__flow' });
      const empty = el('div', { class: 'wf-canvas__empty' }, [
        el('div', { class: 'wf-canvas__empty-icon', text: '✨', 'aria-hidden': 'true' }),
        el('p',   { class: 'wf-canvas__empty-title', text: 'Empty Workflow' }),
        el('p',   { class: 'wf-canvas__empty-sub',   text: 'Click a block in the panel to the left, or use the button below.' }),
      ]);
      const addBtn = el('button', { class: 'wf-canvas__empty-btn', type: 'button', text: '+ Add First Block' });
      addBtn.addEventListener('click', async () => {
        const type = await InsertBlockModal.open('Add First Block');
        if (type) {
          RecentBlocks.add(type);
          this.editor.addBlock(type);
        }
      });
      empty.appendChild(addBtn);
      wrap.appendChild(empty);
      return wrap;
    }

    _buildStep(block, stepNum, arrayIdx, parentArray) {
      const def     = REG.getBlock(block.type);
      if (!def) return el('div');
      const catMeta = REG.getCategoryMeta(block.type);
      const color   = catMeta?.color || 'var(--accent)';

      const step = el('div', { class: 'wf-step', 'data-step-idx': String(arrayIdx) });

      // Gutter (number + line)
      const gutter = el('div', { class: 'wf-step__gutter' }, [
        el('div', { class: 'wf-step__number', style: { '--block-accent': color }, text: String(stepNum) }),
        el('div', { class: 'wf-step__gutter-line' }),
      ]);
      step.appendChild(gutter);

      // Block card
      const content = el('div', { class: 'wf-step__content' });
      content.appendChild(this._buildCard(block, 0, parentArray));
      step.appendChild(content);

      return step;
    }

    _buildAddZone(insertIdx, isFirst = false, isEnd = false) {
      const zone = el('div', {
        class: `wf-add-zone${isEnd ? ' wf-add-zone--end' : ''}`,
        'data-insert-idx': String(insertIdx),
      });

      // Gutter line continuation
      const gutter = el('div', { class: 'wf-add-zone__gutter' });
      if (!isFirst) gutter.appendChild(el('div', { class: 'wf-add-zone__line' }));
      zone.appendChild(gutter);

      // The actual add button (shows on hover)
      const content = el('div', { class: 'wf-add-zone__content' });
      content.appendChild(el('div', { class: 'wf-add-zone__divider' }));

      const addBtn = el('button', {
        class: 'wf-add-zone__btn',
        type: 'button',
        title: 'Insert block here',
        'aria-label': `Insert block at position ${insertIdx + 1}`,
      }, [
        el('span', { text: '+', 'aria-hidden': 'true' }),
        el('span', { text: isEnd ? 'Add Block' : 'Insert here' }),
      ]);
      addBtn.addEventListener('click', async () => {
        const type = await InsertBlockModal.open('Insert Block');
        if (type) {
          RecentBlocks.add(type);
          this.editor.addBlockAt(type, insertIdx);
        }
      });
      content.appendChild(addBtn);
      content.appendChild(el('div', { class: 'wf-add-zone__divider' }));
      zone.appendChild(content);

      // Drop zone support
      zone.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('text/wf-block-type')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          zone.classList.add('wf-add-zone--drag-over');
        }
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('wf-add-zone--drag-over'));
      zone.addEventListener('drop', (e) => {
        zone.classList.remove('wf-add-zone--drag-over');
        const type = e.dataTransfer.getData('text/wf-block-type') || e.dataTransfer.getData('text/plain');
        if (type && REG.getBlock(type)) {
          e.preventDefault();
          e.stopPropagation();
          RecentBlocks.add(type);
          this.editor.addBlockAt(type, insertIdx);
        }
      });

      return zone;
    }

    _buildCard(block, depth, parentArray) {
      const def     = REG.getBlock(block.type);
      if (!def) return el('div');
      const catMeta = REG.getCategoryMeta(block.type);
      const color   = catMeta?.color || 'var(--accent)';
      const isSelected = this.editor._selectedId === block.id;
      const icon = getBlockIcon(block.type);

      const card = el('div', {
        class: `wf-block${isSelected ? ' wf-block--selected' : ''}`,
        'data-id': block.id,
        'data-type': block.type,
        draggable: 'true',
        style: { '--block-accent': color },
        role: 'button',
        tabindex: depth === 0 ? '0' : '-1',
        'aria-label': `${def.label}: ${this._summarize(block, def)}`,
        'aria-selected': String(isSelected),
      });

      // Header
      const header = el('div', { class: 'wf-block__header' }, [
        el('span', { class: 'wf-block__icon', text: icon, 'aria-hidden': 'true' }),
        el('span', { class: 'wf-block__type', text: def.label }),
        el('span', { class: 'wf-block__summary', 'data-summary': '' }),
      ]);
      header.querySelector('[data-summary]').textContent = this._summarize(block, def);

      // Actions
      const actions = el('div', { class: 'wf-block__actions', 'aria-label': 'Block actions' });

      const upBtn = el('button', { class: 'wf-block__action', type: 'button', title: 'Move up', text: '↑', 'aria-label': 'Move up' });
      upBtn.addEventListener('click', (e) => { e.stopPropagation(); this.editor.moveBlock(block.id, -1); });

      const downBtn = el('button', { class: 'wf-block__action', type: 'button', title: 'Move down', text: '↓', 'aria-label': 'Move down' });
      downBtn.addEventListener('click', (e) => { e.stopPropagation(); this.editor.moveBlock(block.id, 1); });

      const delBtn = el('button', {
        class: 'wf-block__action wf-block__action--delete',
        type: 'button', title: 'Delete block', text: '✕', 'aria-label': 'Delete block',
      });
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this block?')) return;
        this.editor.deleteBlock(block.id);
      });

      actions.append(upBtn, downBtn, delBtn);
      header.appendChild(actions);
      card.appendChild(header);

      // Click / keyboard selection
      card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') this.editor.selectBlock(block.id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.editor.selectBlock(block.id); }
        else if (e.key === 'Delete') { e.preventDefault(); this.editor.deleteBlock(block.id); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.editor.moveBlock(block.id, -1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); this.editor.moveBlock(block.id, 1); }
      });

      // Nested sections (IF/ELSE/LOOP)
      if (def.maxNested) {
        card.appendChild(this._buildNestedSection(block, 'if_blocks', 'IF branch', color, depth));
        if (block.type === 'condition_if') {
          card.appendChild(this._buildNestedSection(block, 'else_blocks', 'ELSE branch', '#f59e0b', depth));
        }
        if (block.type === 'loop_times') {
          card.appendChild(this._buildNestedSection(block, 'loop_blocks', 'Loop body', '#8b5cf6', depth));
        }
      }

      // Drag-to-reorder
      card.addEventListener('dragstart', (e) => {
        this._dragId = block.id;
        e.dataTransfer.setData('application/wf-block-id', block.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('wf-block--dragging');
      });
      card.addEventListener('dragend', () => {
        this._dragId = null;
        card.classList.remove('wf-block--dragging');
        qsa('.wf-block--drag-over').forEach(c => c.classList.remove('wf-block--drag-over'));
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
      const isExpanded = this._expandedNested.has(sectionId) || nestedBlocks.length > 0;

      const wrap = el('div', {
        class: `wf-block__nested${isExpanded ? ' wf-block__nested--expanded' : ' wf-block__nested--collapsed'}`,
      });

      const toggleBtn = el('button', {
        class: 'wf-block__nested-toggle', type: 'button',
        'aria-expanded': String(isExpanded), 'aria-controls': sectionId,
        text: isExpanded ? '▾' : '▸',
      });
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isExpanded) this._expandedNested.delete(sectionId);
        else this._expandedNested.add(sectionId);
        this.render();
      });

      wrap.appendChild(el('div', { class: 'wf-block__nested-header' }, [
        toggleBtn,
        el('span', { class: 'wf-block__nested-label', text: sectionLabel, style: { borderColor: color } }),
        el('span', { class: 'wf-block__nested-count', text: `(${nestedBlocks.length})` }),
      ]));

      if (isExpanded) {
        const contentEl = el('div', { class: 'wf-block__nested-content', id: sectionId });
        if (nestedBlocks.length) {
          for (const nb of nestedBlocks) {
            contentEl.appendChild(this._buildCard(nb, depth + 1, nestedBlocks));
          }
        } else {
          const emptyEl = el('div', { class: 'wf-block__nested-empty', text: 'Drop blocks here or click to add…' });
          emptyEl.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('text/wf-block-type')) {
              e.preventDefault();
              emptyEl.classList.add('wf-block__nested-empty--drag-over');
            }
          });
          emptyEl.addEventListener('dragleave', () => emptyEl.classList.remove('wf-block__nested-empty--drag-over'));
          emptyEl.addEventListener('drop', (e) => {
            emptyEl.classList.remove('wf-block__nested-empty--drag-over');
            const type = e.dataTransfer.getData('text/wf-block-type') || e.dataTransfer.getData('text/plain');
            if (type && REG.getBlock(type)) {
              e.preventDefault(); e.stopPropagation();
              if (!Array.isArray(block.data[arrayKey])) block.data[arrayKey] = [];
              RecentBlocks.add(type);
              this.editor.addBlock(type, block.data[arrayKey]);
            }
          });
          contentEl.appendChild(emptyEl);
        }

        // Drop from palette into nested area
        contentEl.addEventListener('dragover', (e) => {
          if (e.dataTransfer.types.includes('text/wf-block-type')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
        });
        contentEl.addEventListener('drop', (e) => {
          const type = e.dataTransfer.getData('text/wf-block-type') || e.dataTransfer.getData('text/plain');
          if (type && REG.getBlock(type)) {
            e.preventDefault(); e.stopPropagation();
            if (!Array.isArray(block.data[arrayKey])) block.data[arrayKey] = [];
            RecentBlocks.add(type);
            this.editor.addBlock(type, block.data[arrayKey]);
          }
        });

        wrap.appendChild(contentEl);
      }

      return wrap;
    }

    _wireCanvasDrop(container) {
      container.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('text/wf-block-type') || e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      });
      container.addEventListener('drop', (e) => {
        const type = e.dataTransfer.getData('text/wf-block-type') || e.dataTransfer.getData('text/plain');
        if (type && REG.getBlock(type) && !e.defaultPrevented) {
          e.preventDefault();
          RecentBlocks.add(type);
          this.editor.addBlock(type);
        }
      });
    }

    _reorder(fromId, toId, blocks) {
      const fromIdx = blocks.findIndex(b => b.id === fromId);
      const toIdx   = blocks.findIndex(b => b.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [item] = blocks.splice(fromIdx, 1);
      blocks.splice(toIdx, 0, item);
      this.editor._markDirty();
      this.render();
    }

    _summarize(block, def) {
      const d = block.data || {};
      switch (block.type) {
        case 'reply': case 'followup': case 'send_message': case 'dm_user': case 'format_text':
          return (d.content || d.template || '').slice(0, 60) || '(empty)';
        case 'send_embed':
          return (d.title || d.description || '').slice(0, 60) || '(embed)';
        case 'set_variable':
          return d.var_name ? `${d.var_name} = ${String(d.value || '').slice(0, 30)}` : '';
        case 'add_role': case 'remove_role': case 'toggle_role':
          return d.role_id ? `Role ${d.role_id}` : '';
        case 'condition_if': case 'stop_if':
          return d.condition_type || '(set condition)';
        case 'loop_times':
          return d.times ? `${d.times}×` : '';
        case 'delay':
          return d.ms ? `${d.ms}ms` : '';
        case 'math':
          return d.expression ? `${d.expression} → ${d.store_as || '?'}` : '';
        default:
          return def.description ? def.description.slice(0, 50) : '';
      }
    }

    refreshSelection() {
      qsa('.wf-block--selected', this.container).forEach(c => c.classList.remove('wf-block--selected'));
      if (this.editor._selectedId) {
        const el = qs(`[data-id="${CSS.escape(this.editor._selectedId)}"]`, this.container);
        if (el) { el.classList.add('wf-block--selected'); el.setAttribute('aria-selected', 'true'); }
      }
    }

    refreshBlockCard(id) {
      const found = this.editor.findBlock(id);
      if (!found) return;
      const cardEl = qs(`[data-id="${CSS.escape(id)}"]`, this.container);
      if (!cardEl) { this.render(); return; }
      const def = REG.getBlock(found.block.type);
      const summaryEl = cardEl.querySelector('[data-summary]');
      if (summaryEl) summaryEl.textContent = this._summarize(found.block, def);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     FieldEditor — modal editors for complex array field types
     ═══════════════════════════════════════════════════════════ */
  class FieldEditor {
    static async editArrayField(fieldType, currentValue, field) {
      return new Promise((resolve) => {
        let resolvedValue; // closure-captured reference updated by sub-editors

        const modal   = el('div', { class: 'wf-modal-overlay' });
        const dialog  = el('div', { class: 'wf-modal', role: 'dialog', 'aria-modal': 'true' });

        const onClose = (val) => { modal.remove(); resolve(val); };
        const onCancel = () => onClose(undefined);
        const onSave   = () => onClose(resolvedValue);

        dialog.appendChild(el('div', { class: 'wf-modal__header' }, [
          el('h3', { class: 'wf-modal__title', text: `Edit ${field.label}` }),
          el('button', { class: 'wf-modal__close', type: 'button', text: '✕', 'aria-label': 'Close', onclick: onCancel }),
        ]));

        const body = el('div', { class: 'wf-modal__body' });
        const { node, getValue } = this._buildFieldEditorContent(fieldType, currentValue);
        body.appendChild(node);
        dialog.appendChild(body);

        dialog.appendChild(el('div', { class: 'wf-modal__footer' }, [
          el('button', { class: 'wf-btn wf-btn--secondary', type: 'button', text: 'Cancel', onclick: onCancel }),
          el('button', {
            class: 'wf-btn wf-btn--primary', type: 'button', text: 'Save',
            onclick: () => { resolvedValue = getValue(); onSave(); },
          }),
        ]));

        // Close on overlay click or Esc
        modal.addEventListener('click', (e) => { if (e.target === modal) onCancel(); });
        modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') onCancel(); });

        modal.appendChild(dialog);
        document.body.appendChild(modal);
        modal.querySelector('button')?.focus();
      });
    }

    static _buildFieldEditorContent(fieldType, currentValue) {
      switch (fieldType) {
        case 'embed_fields':  return this._embedFieldsEditor(currentValue);
        case 'button_array':  return this._buttonArrayEditor(currentValue);
        case 'option_array':  return this._optionArrayEditor(currentValue);
        case 'modal_fields':  return this._modalFieldsEditor(currentValue);
        default: {
          const node = el('div', { text: `No editor available for type: ${fieldType}` });
          return { node, getValue: () => currentValue };
        }
      }
    }

    static _embedFieldsEditor(currentValue) {
      const items = Array.isArray(currentValue) ? currentValue.map(f => ({ ...f })) : [];
      const container = el('div', { class: 'wf-field-editor' });
      const list = el('div', { class: 'wf-field-editor__list' });

      const render = () => {
        list.textContent = '';
        items.forEach((f, i) => {
          const item = el('div', { class: 'wf-field-editor__item' });
          const nameInput = el('input', { type: 'text', class: 'wf-field-editor__input', placeholder: 'Field name', value: f.name || '' });
          nameInput.addEventListener('input', () => { f.name = nameInput.value; });
          const valInput = el('textarea', { class: 'wf-field-editor__textarea', placeholder: 'Field value', rows: 2 });
          valInput.textContent = f.value || '';
          valInput.addEventListener('input', () => { f.value = valInput.value; });
          const inlineLabel = el('label', { class: 'wf-field-editor__inline-label' });
          const inlineChk = el('input', { type: 'checkbox', checked: !!f.inline });
          inlineChk.addEventListener('change', () => { f.inline = inlineChk.checked; });
          inlineLabel.append(inlineChk, el('span', { text: ' Inline' }));
          const removeBtn = el('button', { class: 'wf-field-editor__remove', type: 'button', text: '✕', 'aria-label': 'Remove field' });
          removeBtn.addEventListener('click', () => { items.splice(i, 1); render(); });
          item.append(nameInput, valInput, inlineLabel, removeBtn);
          list.appendChild(item);
        });
      };
      render();

      const addBtn = el('button', { class: 'wf-btn wf-btn--secondary wf-field-editor__add-btn', type: 'button', text: '+ Add field' });
      addBtn.addEventListener('click', () => { items.push({ name: '', value: '', inline: false }); render(); });

      container.append(el('p', { text: `Embed fields (${items.length}/25):` }), list, addBtn);
      return { node: container, getValue: () => items };
    }

    static _buttonArrayEditor(currentValue) {
      const items = Array.isArray(currentValue) ? currentValue.map(b => ({ ...b })) : [];
      const container = el('div', { class: 'wf-field-editor' });
      const list = el('div', { class: 'wf-field-editor__list' });
      const addBtn = el('button', { class: 'wf-btn wf-btn--secondary wf-field-editor__add-btn', type: 'button', text: '+ Add button' });

      const render = () => {
        list.textContent = '';
        addBtn.disabled = items.length >= 5;
        addBtn.classList.toggle('wf-btn--disabled', items.length >= 5);
        items.forEach((b, i) => {
          const item = el('div', { class: 'wf-field-editor__item' });
          const labelInput = el('input', { type: 'text', class: 'wf-field-editor__input', placeholder: 'Label', value: b.label || '' });
          labelInput.addEventListener('input', () => { b.label = labelInput.value; });
          const idInput = el('input', { type: 'text', class: 'wf-field-editor__input', placeholder: 'Custom ID (optional)', value: b.customId || '' });
          idInput.addEventListener('input', () => { b.customId = idInput.value; });
          const styleSelect = el('select', { class: 'wf-field-editor__select' });
          for (const [v, l] of [['primary','Primary'],['secondary','Secondary'],['success','Success'],['danger','Danger']]) {
            styleSelect.appendChild(el('option', { value: v, text: l, selected: b.style === v }));
          }
          styleSelect.addEventListener('change', () => { b.style = styleSelect.value; });
          const removeBtn = el('button', { class: 'wf-field-editor__remove', type: 'button', text: '✕', 'aria-label': 'Remove button' });
          removeBtn.addEventListener('click', () => { items.splice(i, 1); render(); });
          item.append(labelInput, idInput, styleSelect, removeBtn);
          list.appendChild(item);
        });
      };
      render();

      addBtn.addEventListener('click', () => { if (items.length < 5) { items.push({ label: '', customId: '', style: 'primary' }); render(); } });
      container.append(el('p', { text: 'Buttons (max 5):' }), list, addBtn);
      return { node: container, getValue: () => items };
    }

    static _optionArrayEditor(currentValue) {
      const items = Array.isArray(currentValue) ? currentValue.map(o => ({ ...o })) : [];
      const container = el('div', { class: 'wf-field-editor' });
      const list = el('div', { class: 'wf-field-editor__list' });
      const addBtn = el('button', { class: 'wf-btn wf-btn--secondary wf-field-editor__add-btn', type: 'button', text: '+ Add option' });

      const render = () => {
        list.textContent = '';
        addBtn.disabled = items.length >= 25;
        addBtn.classList.toggle('wf-btn--disabled', items.length >= 25);
        items.forEach((o, i) => {
          const item = el('div', { class: 'wf-field-editor__item' });
          const lInput = el('input', { type: 'text', class: 'wf-field-editor__input', placeholder: 'Label', value: o.label || '' });
          lInput.addEventListener('input', () => { o.label = lInput.value; });
          const vInput = el('input', { type: 'text', class: 'wf-field-editor__input', placeholder: 'Value', value: o.value || '' });
          vInput.addEventListener('input', () => { o.value = vInput.value; });
          const dInput = el('input', { type: 'text', class: 'wf-field-editor__input', placeholder: 'Description (optional)', value: o.description || '' });
          dInput.addEventListener('input', () => { o.description = dInput.value; });
          const removeBtn = el('button', { class: 'wf-field-editor__remove', type: 'button', text: '✕', 'aria-label': 'Remove option' });
          removeBtn.addEventListener('click', () => { items.splice(i, 1); render(); });
          item.append(lInput, vInput, dInput, removeBtn);
          list.appendChild(item);
        });
      };
      render();

      addBtn.addEventListener('click', () => { if (items.length < 25) { items.push({ label: '', value: '', description: '' }); render(); } });
      container.append(el('p', { text: 'Select options (max 25):' }), list, addBtn);
      return { node: container, getValue: () => items };
    }

    static _modalFieldsEditor(currentValue) {
      const items = Array.isArray(currentValue) ? currentValue.map(f => ({ ...f })) : [];
      const container = el('div', { class: 'wf-field-editor' });
      const list = el('div', { class: 'wf-field-editor__list' });
      const addBtn = el('button', { class: 'wf-btn wf-btn--secondary wf-field-editor__add-btn', type: 'button', text: '+ Add field' });

      const render = () => {
        list.textContent = '';
        addBtn.disabled = items.length >= 5;
        addBtn.classList.toggle('wf-btn--disabled', items.length >= 5);
        items.forEach((f, i) => {
          const item = el('div', { class: 'wf-field-editor__item' });
          const lInput = el('input', { type: 'text', class: 'wf-field-editor__input', placeholder: 'Field label', value: f.label || '' });
          lInput.addEventListener('input', () => { f.label = lInput.value; });
          const styleSelect = el('select', { class: 'wf-field-editor__select' });
          for (const [v, l] of [['short','Short text'],['paragraph','Paragraph']]) {
            styleSelect.appendChild(el('option', { value: v, text: l, selected: f.style === v }));
          }
          styleSelect.addEventListener('change', () => { f.style = styleSelect.value; });
          const reqLabel = el('label', { class: 'wf-field-editor__inline-label' });
          const reqChk = el('input', { type: 'checkbox', checked: !!f.required });
          reqChk.addEventListener('change', () => { f.required = reqChk.checked; });
          reqLabel.append(reqChk, el('span', { text: ' Required' }));
          const removeBtn = el('button', { class: 'wf-field-editor__remove', type: 'button', text: '✕', 'aria-label': 'Remove field' });
          removeBtn.addEventListener('click', () => { items.splice(i, 1); render(); });
          item.append(lInput, styleSelect, reqLabel, removeBtn);
          list.appendChild(item);
        });
      };
      render();

      addBtn.addEventListener('click', () => { if (items.length < 5) { items.push({ label: '', style: 'short', required: false }); render(); } });
      container.append(el('p', { text: 'Modal fields (max 5):' }), list, addBtn);
      return { node: container, getValue: () => items };
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PropertiesPanel — right panel
     ═══════════════════════════════════════════════════════════ */
  class PropertiesPanel {
    constructor(editor) {
      this.editor    = editor;
      this.container = qs('#wf-props');
      this._blockId  = null;
      this._activeTab = 'config'; // 'config' | 'help'
    }

    clear() {
      this._blockId = null;
      if (!this.container) return;
      this.container.textContent = '';
      this.container.appendChild(
        el('div', { class: 'wf-props__empty' }, [
          el('div', { class: 'wf-props__empty-icon', text: '⚙️', 'aria-hidden': 'true' }),
          document.createTextNode('Select a block to edit its settings.'),
        ])
      );
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
      const header = el('div', { class: 'wf-props__header', style: { borderColor: color } }, [
        el('div', { class: 'wf-props__header-row' }, [
          el('span', { class: 'wf-props__header-icon', text: getBlockIcon(block.type), 'aria-hidden': 'true' }),
          el('h3',  { class: 'wf-props__title', text: def.label }),
        ]),
        el('p', { class: 'wf-props__desc', text: def.description || '' }),
      ]);
      this.container.appendChild(header);

      // Tab bar
      const tabBar = el('div', { class: 'wf-props__tabs', role: 'tablist' });
      const configTab = el('button', {
        class: `wf-props__tab ${this._activeTab === 'config' ? 'wf-props__tab--active' : ''}`,
        type: 'button', role: 'tab', text: '⚙️ Config',
        'aria-selected': String(this._activeTab === 'config'),
      });
      const helpTab = el('button', {
        class: `wf-props__tab ${this._activeTab === 'help' ? 'wf-props__tab--active' : ''}`,
        type: 'button', role: 'tab', text: '💡 Help',
        'aria-selected': String(this._activeTab === 'help'),
      });
      configTab.addEventListener('click', () => {
        if (this._activeTab === 'config') return;
        this._activeTab = 'config';
        this.showBlock(block);
      });
      helpTab.addEventListener('click', () => {
        if (this._activeTab === 'help') return;
        this._activeTab = 'help';
        this.showBlock(block);
      });
      tabBar.append(configTab, helpTab);
      this.container.appendChild(tabBar);

      // Panel content
      if (this._activeTab === 'config') {
        const panel = el('div', { class: 'wf-props__panel' });
        if (!def.fields.length) {
          panel.appendChild(el('p', { class: 'wf-props__no-fields', text: 'This block has no configurable settings.' }));
        } else {
          const form = el('div', { class: 'wf-props__form' });
          for (const field of def.fields) {
            const row = this._buildFieldRow(field, block);
            if (row) form.appendChild(row);
          }
          panel.appendChild(form);
        }
        this.container.appendChild(panel);
      } else {
        this.container.appendChild(this._buildHelpPanel(block, def));
      }
    }

    _buildHelpPanel(block, def) {
      const panel = el('div', { class: 'wf-props__panel' });
      const wrap  = el('div', { class: 'wf-props__help' });

      // Description
      wrap.appendChild(el('div', {}, [
        el('p', { class: 'wf-props__help-section-title', text: 'About this block' }),
        el('p', { class: 'wf-props__help-desc', text: def.description || 'No description available.' }),
      ]));

      // Available variables
      const vars = getAvailableVariables(this.editor.state);
      if (vars.length) {
        const varSection = el('div');
        varSection.appendChild(el('p', { class: 'wf-props__help-section-title', text: 'Available variables' }));
        varSection.appendChild(el('p', { class: 'wf-props__hint', style: { fontSize: '11px', color: 'var(--text-4)' }, text: 'Click to copy. Use {var} in any text field.' }));
        const chips = el('div', { class: 'wf-props__avail-vars' });
        for (const v of vars) {
          const chip = el('div', { class: 'wf-props__var-chip', title: v.desc, tabindex: '0' }, [
            el('span', { text: `{${v.key}}` }),
            el('span', { class: 'wf-props__var-chip-desc', text: v.desc }),
          ]);
          chip.addEventListener('click', () => {
            navigator.clipboard?.writeText(`{${v.key}}`).then(() => showToast(`Copied {${v.key}}`, 'success'));
          });
          chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') chip.click(); });
          chips.appendChild(chip);
        }
        varSection.appendChild(chips);
        wrap.appendChild(varSection);
      }

      panel.appendChild(wrap);
      return panel;
    }

    _buildFieldRow(field, block) {
      const data  = block.data || {};
      const value = data[field.key] !== undefined ? data[field.key] : (field.default !== undefined ? field.default : '');

      if (field.type === 'branch_label') {
        return el('div', { class: 'wf-props__branch-label', text: field.label });
      }

      // showIf logic
      if (field.showIf) {
        const condVal = data[field.showIf.key];
        const expected = field.showIf.value;
        const show = Array.isArray(expected) ? expected.includes(condVal) : condVal === expected;
        if (!show) return null;
      }

      const rowEl = el('div', { class: 'wf-props__row' });
      const labelEl = el('label', {
        class: `wf-props__label${field.required ? ' wf-props__label--required' : ''}`,
        text: field.label,
      });
      if (field.hint) labelEl.appendChild(el('span', { class: 'wf-props__hint', text: ` — ${field.hint}` }));
      rowEl.appendChild(labelEl);

      let inputEl = null;

      switch (field.type) {
        case 'text': {
          const wrap = el('div', { class: 'wf-props__field-wrap' });
          inputEl = el('input', {
            type: 'text', class: 'wf-props__input',
            value: String(value), placeholder: field.placeholder || '',
          });
          if (field.max) inputEl.setAttribute('maxlength', String(field.max));
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value));
          this._attachVarAutocomplete(inputEl, block, field.key);
          wrap.appendChild(inputEl);
          if (field.max) {
            const counter = el('div', { class: 'wf-char-count', text: `${String(value).length}/${field.max}` });
            inputEl.addEventListener('input', () => {
              const len = inputEl.value.length;
              counter.textContent = `${len}/${field.max}`;
              counter.className = `wf-char-count${len > field.max * 0.9 ? ' wf-char-count--warn' : ''}${len > field.max ? ' wf-char-count--over' : ''}`;
            });
            wrap.appendChild(counter);
          }
          rowEl.appendChild(wrap);
          return rowEl;
        }

        case 'textarea': {
          const wrap = el('div', { class: 'wf-props__field-wrap' });
          inputEl = el('textarea', {
            class: 'wf-props__textarea',
            placeholder: field.placeholder || '',
            rows: 4,
          });
          if (field.max) inputEl.setAttribute('maxlength', String(field.max));
          inputEl.textContent = String(value);
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value));
          this._attachVarAutocomplete(inputEl, block, field.key);
          wrap.appendChild(inputEl);
          if (field.max) {
            const counter = el('div', { class: 'wf-char-count', text: `${String(value).length}/${field.max}` });
            inputEl.addEventListener('input', () => {
              const len = inputEl.value.length;
              counter.textContent = `${len}/${field.max}`;
              counter.className = `wf-char-count${len > field.max * 0.9 ? ' wf-char-count--warn' : ''}${len > field.max ? ' wf-char-count--over' : ''}`;
            });
            wrap.appendChild(counter);
          }
          rowEl.appendChild(wrap);
          return rowEl;
        }

        case 'number':
          inputEl = el('input', { type: 'number', class: 'wf-props__input', value: String(value) });
          if (field.min != null) inputEl.setAttribute('min', String(field.min));
          if (field.max != null) inputEl.setAttribute('max', String(field.max));
          inputEl.addEventListener('input', () => this._onChange(block, field.key, Number(inputEl.value)));
          break;

        case 'toggle': {
          const wrap = el('label', { class: 'wf-props__toggle-wrap' });
          inputEl = el('input', { type: 'checkbox', class: 'wf-props__toggle' });
          inputEl.checked = !!value;
          inputEl.addEventListener('change', () => {
            this._onChange(block, field.key, inputEl.checked);
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
            const found = this.editor.findBlock(block.id);
            if (found) this.showBlock(found.block);
          });
          break;
        }

        case 'role':
        case 'channel':
          inputEl = el('input', {
            type: 'text', class: 'wf-props__input',
            value: String(value),
            placeholder: field.type === 'role' ? 'Role ID or {variable}' : 'Channel ID or {variable}',
          });
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value.trim()));
          this._attachVarAutocomplete(inputEl, block, field.key);
          break;

        case 'color':
          inputEl = el('input', { type: 'color', class: 'wf-props__color', value: value || '#5865f2' });
          inputEl.addEventListener('input', () => this._onChange(block, field.key, inputEl.value));
          break;

        case 'embed_fields':
        case 'modal_fields':
        case 'button_array':
        case 'option_array': {
          const currentArray = Array.isArray(value) ? value : [];
          const editBtn = el('button', {
            class: 'wf-btn wf-btn--secondary',
            type: 'button',
            text: `✏️ Edit ${field.label}`,
          });
          editBtn.addEventListener('click', async () => {
            const newVal = await FieldEditor.editArrayField(field.type, currentArray, field);
            if (newVal !== undefined) {
              this._onChange(block, field.key, newVal);
              const found = this.editor.findBlock(block.id);
              if (found) this.showBlock(found.block);
            }
          });
          rowEl.appendChild(editBtn);
          if (currentArray.length > 0) {
            rowEl.appendChild(el('p', {
              class: 'wf-props__field-info',
              text: `${currentArray.length} item${currentArray.length !== 1 ? 's' : ''} configured`,
            }));
          }
          return rowEl;
        }

        default: return null;
      }

      if (inputEl) rowEl.appendChild(inputEl);
      return rowEl;
    }

    /**
     * Attaches a {variable} autocomplete dropdown to a text or textarea input.
     * Triggers when the user types `{` — shows matching variable names.
     */
    _attachVarAutocomplete(inputEl, block, fieldKey) {
      let picker = null;

      const closePicker = () => {
        if (picker) { picker.remove(); picker = null; }
      };

      inputEl.addEventListener('keydown', (e) => {
        if (picker) {
          if (e.key === 'Escape') { e.preventDefault(); closePicker(); return; }
          const items = picker.querySelectorAll('.wf-var-picker__item');
          const focused = picker.querySelector('.wf-var-picker__item--focused');
          const idx = Array.from(items).indexOf(focused);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = items[idx + 1] || items[0];
            focused?.classList.remove('wf-var-picker__item--focused');
            next?.classList.add('wf-var-picker__item--focused');
            next?.scrollIntoView({ block: 'nearest' });
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = items[idx - 1] || items[items.length - 1];
            focused?.classList.remove('wf-var-picker__item--focused');
            prev?.classList.add('wf-var-picker__item--focused');
            prev?.scrollIntoView({ block: 'nearest' });
            return;
          }
          if (e.key === 'Enter' && focused) {
            e.preventDefault();
            focused.click();
            return;
          }
        }
      });

      inputEl.addEventListener('input', () => {
        closePicker();
        const val = inputEl.value;
        const cursor = inputEl.selectionStart || 0;
        // Find the last `{` before the cursor
        const before = val.slice(0, cursor);
        const braceIdx = before.lastIndexOf('{');
        if (braceIdx === -1) return;
        const partial = before.slice(braceIdx + 1).toLowerCase();
        // Don't show if already closed
        if (before.slice(braceIdx).includes('}')) return;

        const availVars = getAvailableVariables(this.editor.state);
        const filtered = availVars.filter(v => v.key.toLowerCase().includes(partial));
        if (!filtered.length) return;

        const wrap = inputEl.closest('.wf-props__field-wrap');
        if (!wrap) return;

        picker = el('div', { class: 'wf-var-picker', role: 'listbox' });
        for (const v of filtered.slice(0, 12)) {
          const item = el('div', { class: 'wf-var-picker__item', role: 'option', tabindex: '-1' }, [
            el('span', { class: 'wf-var-picker__item-name', text: `{${v.key}}` }),
            el('span', { class: 'wf-var-picker__item-desc', text: v.desc }),
          ]);
          item.addEventListener('click', () => {
            // Replace from `{` to cursor with `{varName}`
            const newVal = val.slice(0, braceIdx) + `{${v.key}}` + val.slice(cursor);
            inputEl.value = newVal;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            const newCursor = braceIdx + v.key.length + 2;
            inputEl.setSelectionRange(newCursor, newCursor);
            closePicker();
            inputEl.focus();
          });
          picker.appendChild(item);
        }
        wrap.style.position = 'relative';
        wrap.appendChild(picker);
      });

      inputEl.addEventListener('blur', () => { setTimeout(closePicker, 150); });
    }

    _onChange(block, key, value) {
      this.editor.updateBlockData(block.id, key, value);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     WorkflowEditor — top-level controller
     ═══════════════════════════════════════════════════════════ */
  class WorkflowEditor {
    constructor() {
      const dataEl = qs('#wfPageData');
      if (!dataEl) return;

      this._guildId    = dataEl.dataset.guildId   || '';
      this._wfId       = dataEl.dataset.workflowId || '';
      this._selectedId = null;
      this._autosaveTimer = null;
      this._draft_key  = `wf_draft_${this._guildId}_${this._wfId || 'new'}`;

      // Parse initial workflow JSON
      let raw = {};
      try { raw = JSON.parse(dataEl.dataset.workflowJson || '{}'); } catch {}

      this.state = {
        name:        raw.name        || 'New Workflow',
        description: raw.description || '',
        enabled:     raw.enabled     ?? true,
        trigger: {
          // Keep lowercase so it matches the EJS <select> option values.
          // Normalize to uppercase only when sending to the API in save().
          type:  (raw.trigger?.type || raw.triggerType || 'slash').toLowerCase(),
          value: raw.trigger?.value || raw.triggerValue || '',
        },
        permissions: raw.permissions || {},
        blocks:      raw.blocks      || [],
        variables:   raw.variables   || [],
      };

      this._ensureIds(this.state.blocks);

      // Init sub-components
      this.palette    = new BlockPalette(this);
      this.canvas     = new WorkflowCanvas(this);
      this.propsPanel = new PropertiesPanel(this);

      // Render
      this.palette.render();
      this.canvas.render();
      this.propsPanel.clear();

      // Wire UI
      this._bindTopBar();
      this._bindBeforeUnload();
      this._bindKeyboardShortcuts();
      this._updateStepCount();
    }

    /* ── ID management ──────────────────────────────────────── */
    _ensureIds(blocks) {
      for (const b of blocks) {
        if (!b.id) b.id = uid();
        if (!b.data) b.data = {};
        for (const key of ['if_blocks', 'else_blocks', 'loop_blocks']) {
          if (Array.isArray(b.data[key])) this._ensureIds(b.data[key]);
        }
      }
    }

    findBlock(id, blocks = this.state.blocks) {
      for (const block of blocks) {
        if (block.id === id) return { block, parent: null, arrayKey: null };
        for (const key of ['if_blocks', 'else_blocks', 'loop_blocks']) {
          if (Array.isArray(block.data?.[key])) {
            const found = this.findBlock(id, block.data[key]);
            if (found) return found;
          }
        }
      }
      return null;
    }

    /* ── Block operations ────────────────────────────────────── */
    selectBlock(id) {
      this._selectedId = id;
      this.canvas.refreshSelection();
      const found = this.findBlock(id);
      if (found) this.propsPanel.showBlock(found.block);
      else this.propsPanel.clear();
    }

    addBlock(type, targetBlocks = null) {
      const arr  = targetBlocks || this.state.blocks;
      const data = REG.getDefaults(type);
      const block = { id: uid(), type, data };
      this._ensureIds([block]);
      arr.push(block);
      this._markDirty();
      this._updateStepCount();
      this.canvas.render();
      // Auto-select the new block
      setTimeout(() => {
        this.selectBlock(block.id);
        const cardEl = qs(`[data-id="${CSS.escape(block.id)}"]`);
        cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
      return block;
    }

    addBlockAt(type, insertIdx) {
      const data  = REG.getDefaults(type);
      const block = { id: uid(), type, data };
      this._ensureIds([block]);
      this.state.blocks.splice(insertIdx, 0, block);
      this._markDirty();
      this._updateStepCount();
      this.canvas.render();
      setTimeout(() => {
        this.selectBlock(block.id);
        const cardEl = qs(`[data-id="${CSS.escape(block.id)}"]`);
        cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
      return block;
    }

    updateBlockData(id, key, value) {
      const found = this.findBlock(id);
      if (!found) return;
      if (!found.block.data) found.block.data = {};
      found.block.data[key] = value;
      this._markDirty();
      this.canvas.refreshBlockCard(id);
    }

    deleteBlock(id, targetBlocks = null) {
      const arr = targetBlocks || this.state.blocks;
      const idx = arr.findIndex(b => b.id === id);
      if (idx !== -1) {
        arr.splice(idx, 1);
        if (this._selectedId === id) {
          this._selectedId = null;
          this.propsPanel.clear();
        }
        this._markDirty();
        this._updateStepCount();
        this.canvas.render();
        return;
      }
      // Recurse into nested
      for (const b of arr) {
        for (const key of ['if_blocks', 'else_blocks', 'loop_blocks']) {
          if (Array.isArray(b.data?.[key])) this.deleteBlock(id, b.data[key]);
        }
      }
    }

    moveBlock(id, direction) {
      const arr = this.state.blocks;
      const idx = arr.findIndex(b => b.id === id);
      if (idx === -1) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      this._markDirty();
      this.canvas.render();
      // Re-select and scroll
      setTimeout(() => {
        this.selectBlock(id);
        const cardEl = qs(`[data-id="${CSS.escape(id)}"]`);
        cardEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 40);
    }

    /* ── Persistence ─────────────────────────────────────────── */
    async save() {
      const saveBtn = qs('#wf-save-btn');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

      const payload = {
        name:        this.state.name,
        description: this.state.description,
        enabled:     this.state.enabled,
        trigger:     { type: normalizeTriggerType(this.state.trigger.type), value: this.state.trigger.value },
        permissions: this.state.permissions,
        blocks:      this._stripIds(this.state.blocks),
        variables:   this.state.variables,
      };

      try {
        const method = this._wfId ? 'PATCH' : 'POST';
        const url    = this._wfId
          ? `/api/guilds/${this._guildId}/workflows/${this._wfId}`
          : `/api/guilds/${this._guildId}/workflows`;

        const res  = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Save failed' }));
          throw new Error(err.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.workflow?._id && !this._wfId) {
          this._wfId = data.workflow._id;
          history.replaceState({}, '', `/workflow-editor/${this._guildId}/${this._wfId}`);
          this._draft_key = `wf_draft_${this._guildId}_${this._wfId}`;
        }

        this._clearDirty();
        this._clearDraft();
        this._updateAutosaveIndicator('Saved');
        showToast('Workflow saved ✓', 'success');
      } catch (err) {
        showToast(`Save error: ${err.message}`, 'error');
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
      }
    }

    async validate() {
      const validateBtn = qs('#wf-validate-btn');
      if (validateBtn) { validateBtn.disabled = true; validateBtn.textContent = 'Validating…'; }
      try {
        const res  = await fetch(`/api/guilds/${this._guildId}/workflows/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks: this._stripIds(this.state.blocks), trigger: this.state.trigger }),
        });
        const data = await res.json();
        if (data.valid) showToast('✅ Workflow is valid!', 'success');
        else            showToast(`❌ ${data.errors?.[0] || 'Validation failed'}`, 'error');
      } catch (err) {
        showToast(`Validate error: ${err.message}`, 'error');
      } finally {
        if (validateBtn) { validateBtn.disabled = false; validateBtn.textContent = 'Validate'; }
      }
    }

    _stripIds(blocks) {
      return blocks.map(b => {
        const copy = { ...b, data: { ...b.data } };
        delete copy.id;
        for (const key of ['if_blocks', 'else_blocks', 'loop_blocks']) {
          if (Array.isArray(copy.data[key])) copy.data[key] = this._stripIds(copy.data[key]);
        }
        return copy;
      });
    }

    /* ── Dirty / autosave ────────────────────────────────────── */
    _markDirty() {
      qs('#wf-dirty-dot')?.classList.add('wf-dirty-dot--visible');
      const saveBtn = qs('#wf-save-btn');
      if (saveBtn) saveBtn.disabled = false;
      // Debounced autosave (3s after last change)
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this._autosave(), 3000);
    }

    _clearDirty() {
      qs('#wf-dirty-dot')?.classList.remove('wf-dirty-dot--visible');
    }

    _autosave() {
      try {
        const draft = {
          name:      this.state.name,
          trigger:   this.state.trigger,
          blocks:    this._stripIds(this.state.blocks),
          variables: this.state.variables,
          enabled:   this.state.enabled,
          savedAt:   Date.now(),
        };
        localStorage.setItem(this._draft_key, JSON.stringify(draft));
        this._updateAutosaveIndicator('Draft saved');
      } catch {}
    }

    _clearDraft() {
      try { localStorage.removeItem(this._draft_key); } catch {}
    }

    _updateAutosaveIndicator(msg) {
      const el = qs('#wf-autosave');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('wf-topbar__autosave--visible');
      clearTimeout(this._autosaveIndicatorTimer);
      this._autosaveIndicatorTimer = setTimeout(() => {
        el.classList.remove('wf-topbar__autosave--visible');
      }, 3000);
    }

    _updateStepCount() {
      const chip = qs('#wf-step-count');
      if (!chip) return;
      const n = this.state.blocks.length;
      chip.textContent = `${n} step${n !== 1 ? 's' : ''}`;
    }

    /* ── Topbar bindings ─────────────────────────────────────── */
    _bindTopBar() {
      const nameInput = qs('#wf-name-input');
      if (nameInput) {
        nameInput.value = this.state.name;
        nameInput.addEventListener('input', () => {
          this.state.name = nameInput.value;
          this._markDirty();
        });
      }

      const triggerSel = qs('#wf-trigger-type');
      if (triggerSel) {
        triggerSel.value = this.state.trigger.type;
        triggerSel.addEventListener('change', () => {
          this.state.trigger.type = triggerSel.value;
          this._markDirty();
          this._updateTriggerValueVisibility();
          this.canvas.render(); // update trigger node
        });
      }

      const triggerVal = qs('#wf-trigger-value');
      if (triggerVal) {
        triggerVal.value = this.state.trigger.value;
        triggerVal.addEventListener('input', () => {
          this.state.trigger.value = triggerVal.value;
          this._markDirty();
        });
        this._updateTriggerValueVisibility();
      }

      const enabledToggle = qs('#wf-enabled-toggle');
      if (enabledToggle) {
        enabledToggle.checked = this.state.enabled;
        enabledToggle.addEventListener('change', () => {
          this.state.enabled = enabledToggle.checked;
          this._markDirty();
        });
      }

      const saveBtn = qs('#wf-save-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.addEventListener('click', () => this.save());
      }

      const validateBtn = qs('#wf-validate-btn');
      if (validateBtn) {
        validateBtn.addEventListener('click', () => this.validate());
      }
    }

    _updateTriggerValueVisibility() {
      const triggerSel    = qs('#wf-trigger-type');
      const triggerValRow = qs('#wf-trigger-value-row');
      if (!triggerSel) return;
      const v = (triggerSel.value || '').toLowerCase();
      const needsValue = ['slash', 'prefix', 'exact', 'contains', 'regex'].includes(v);
      if (triggerValRow) {
        if (needsValue) { triggerValRow.removeAttribute('hidden'); triggerValRow.style.display = ''; }
        else            { triggerValRow.style.display = 'none'; }
      }
    }

    _bindBeforeUnload() {
      window.addEventListener('beforeunload', (e) => {
        if (qs('#wf-dirty-dot')?.classList.contains('wf-dirty-dot--visible')) {
          e.preventDefault();
          e.returnValue = 'You have unsaved changes.';
        }
      });
    }

    _bindKeyboardShortcuts() {
      document.addEventListener('keydown', async (e) => {
        // Cmd/Ctrl + S → Save
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
          e.preventDefault();
          this.save();
          return;
        }
        // Cmd/Ctrl + Enter → Open Insert Block Modal
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          const type = await InsertBlockModal.open('Add Block');
          if (type) {
            RecentBlocks.add(type);
            this.addBlock(type);
          }
          return;
        }
        // Cmd/Ctrl + K → Focus palette search
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          qs('.wf-palette__search-input')?.focus();
          return;
        }
      });
    }
  }

  /* ── Bootstrap ──────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('wfPageData')) return;
    window._wfEditor = new WorkflowEditor();
  });

}());
