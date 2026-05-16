/**
 * command-builder.js — Advanced Workflow Command Builder v2
 *
 * Architecture:
 *  - BLOCK_REGISTRY: single source of truth for every block type (category, icon, fields, defaults)
 *  - _blocks: flat array of {id, type, data, _children} for linear + branching flows
 *  - Rendering: each block type declares its own field schema, rendered generically
 *  - Security: whitelist-only types, no eval, no dynamic code, HTML-escaped at render time
 *  - CSP-safe: external file, no inline handlers, all events wired in JS
 */
(function () {
  'use strict';

  /* ============================================================
     BLOCK REGISTRY — Single source of truth for all block types
     Each entry: { cat, label, icon, color, accent, fields[], defaultData }
     Field types: text, textarea, select, role, channel, number, color,
                  toggle, tags, embed_fields, code (plain-text, no eval),
                  button_array, option_array, condition_pair
     ============================================================ */
  const REGISTRY = {

    // ── MESSAGES ─────────────────────────────────────────────
    reply: {
      cat: 'messages', label: 'Reply to User', icon: 'message-square',
      color: '#57f287', accent: 'rgba(87,242,135,0.15)',
      fields: [
        { key: 'content', type: 'textarea', label: 'Message Content', required: true, max: 2000,
          placeholder: 'Your reply… Variables: {user} {username} {server} {channel} {membercount}' },
        { key: 'ephemeral', type: 'toggle', label: 'Ephemeral (only visible to user)' },
        { key: 'ping_user', type: 'toggle', label: 'Ping User in Reply' },
      ],
      defaults: { content: '', ephemeral: false, ping_user: false },
    },
    send_message: {
      cat: 'messages', label: 'Send Message', icon: 'send',
      color: '#60a5fa', accent: 'rgba(96,165,250,0.15)',
      fields: [
        { key: 'content', type: 'textarea', label: 'Message Content', required: true, max: 2000,
          placeholder: 'Message text… Variables: {user} {username} {server} {channel}' },
        { key: 'channel_id', type: 'channel', label: 'Send To Channel', hint: 'Leave blank to use current channel' },
        { key: 'ephemeral', type: 'toggle', label: 'Ephemeral (slash commands only)' },
      ],
      defaults: { content: '', channel_id: '', ephemeral: false },
    },
    send_embed: {
      cat: 'messages', label: 'Send Embed', icon: 'layout',
      color: '#7289da', accent: 'rgba(114,137,218,0.18)',
      fields: [
        { key: 'title', type: 'text', label: 'Title', max: 256, placeholder: 'Embed title' },
        { key: 'description', type: 'textarea', label: 'Description', max: 4096,
          placeholder: 'Embed body — supports {user} {username} {server} {channel} {membercount}' },
        { key: 'color', type: 'color', label: 'Color' },
        { key: 'footer', type: 'text', label: 'Footer Text', max: 2048 },
        { key: 'thumbnail', type: 'text', label: 'Thumbnail URL', placeholder: 'https://…', max: 512 },
        { key: 'image', type: 'text', label: 'Image URL', placeholder: 'https://…', max: 512 },
        { key: 'url', type: 'text', label: 'Title URL (clickable)', placeholder: 'https://…', max: 512 },
        { key: 'timestamp', type: 'toggle', label: 'Show Timestamp' },
        { key: 'show_author', type: 'toggle', label: 'Show Triggering User as Author' },
        { key: 'channel_id', type: 'channel', label: 'Send To Channel', hint: 'Leave blank for current channel' },
        { key: 'fields', type: 'embed_fields', label: 'Embed Fields' },
      ],
      defaults: { title: '', description: '', color: '#5865f2', footer: '', thumbnail: '', image: '',
                  url: '', timestamp: false, show_author: false, channel_id: '', fields: [] },
    },
    edit_message: {
      cat: 'messages', label: 'Edit a Message', icon: 'edit-2',
      color: '#a78bfa', accent: 'rgba(167,139,250,0.15)',
      fields: [
        { key: 'message_id_var', type: 'text', label: 'Message ID Variable', placeholder: '{last_msg_id} or a stored variable key',
          hint: 'Use the message ID from a previous "Store Message ID" block' },
        { key: 'content', type: 'textarea', label: 'New Content', max: 2000 },
        { key: 'channel_id', type: 'channel', label: 'Channel (if different)' },
      ],
      defaults: { message_id_var: '', content: '', channel_id: '' },
    },
    delete_message: {
      cat: 'messages', label: 'Delete a Message', icon: 'trash-2',
      color: '#f87171', accent: 'rgba(248,113,113,0.15)',
      fields: [
        { key: 'target', type: 'select', label: 'Delete Which Message',
          options: [
            { v: 'trigger', l: 'The trigger message' },
            { v: 'bot_last', l: 'Last bot response' },
            { v: 'by_id', l: 'Specific message by ID variable' },
          ] },
        { key: 'message_id_var', type: 'text', label: 'Message ID Variable', placeholder: '{last_msg_id}',
          showIf: { key: 'target', value: 'by_id' } },
        { key: 'delay_ms', type: 'number', label: 'Delay (ms)', min: 0, max: 60000, hint: '0 = immediate' },
      ],
      defaults: { target: 'trigger', message_id_var: '', delay_ms: 0 },
    },
    dm_user: {
      cat: 'messages', label: 'DM User', icon: 'mail',
      color: '#fbbf24', accent: 'rgba(251,191,36,0.15)',
      fields: [
        { key: 'content', type: 'textarea', label: 'DM Content', required: true, max: 2000,
          placeholder: 'Private message… Variables: {user} {server}' },
        { key: 'fail_silent', type: 'toggle', label: 'Silently ignore if DMs are closed' },
      ],
      defaults: { content: '', fail_silent: true },
    },

    // ── DISCORD COMPONENTS ───────────────────────────────────
    send_buttons: {
      cat: 'components', label: 'Send Button Row', icon: 'square',
      color: '#818cf8', accent: 'rgba(129,140,248,0.18)',
      fields: [
        { key: 'message', type: 'textarea', label: 'Message Above Buttons', max: 2000 },
        { key: 'buttons', type: 'button_array', label: 'Buttons', hint: 'Up to 5 buttons per row, 5 rows max' },
        { key: 'channel_id', type: 'channel', label: 'Channel', hint: 'Leave blank for current channel' },
        { key: 'timeout_min', type: 'number', label: 'Expire After (minutes)', min: 0, max: 1440,
          hint: '0 = never expire' },
      ],
      defaults: { message: '', buttons: [], channel_id: '', timeout_min: 0 },
    },
    send_select_menu: {
      cat: 'components', label: 'Send Select Menu', icon: 'chevron-down',
      color: '#34d399', accent: 'rgba(52,211,153,0.15)',
      fields: [
        { key: 'placeholder', type: 'text', label: 'Placeholder Text', max: 150, placeholder: 'Choose an option…' },
        { key: 'message', type: 'textarea', label: 'Message Above Menu', max: 2000 },
        { key: 'options', type: 'option_array', label: 'Options', hint: 'Up to 25 options' },
        { key: 'min_values', type: 'number', label: 'Min Selections', min: 1, max: 25 },
        { key: 'max_values', type: 'number', label: 'Max Selections', min: 1, max: 25 },
        { key: 'channel_id', type: 'channel', label: 'Channel' },
        { key: 'timeout_min', type: 'number', label: 'Expire After (minutes)', min: 0, max: 1440 },
      ],
      defaults: { placeholder: 'Choose an option…', message: '', options: [], min_values: 1, max_values: 1,
                  channel_id: '', timeout_min: 0 },
    },
    show_modal: {
      cat: 'components', label: 'Show Modal (Form)', icon: 'layers',
      color: '#f472b6', accent: 'rgba(244,114,182,0.15)',
      fields: [
        { key: 'title', type: 'text', label: 'Modal Title', required: true, max: 45 },
        { key: 'fields', type: 'modal_fields', label: 'Input Fields', hint: 'Up to 5 text inputs' },
        { key: 'store_prefix', type: 'text', label: 'Variable Prefix for Responses', max: 20,
          placeholder: 'modal', hint: 'Answers stored as {modal_1}, {modal_2}, etc.' },
      ],
      defaults: { title: '', fields: [], store_prefix: 'modal' },
    },
    add_reaction: {
      cat: 'components', label: 'Add Reaction', icon: 'smile',
      color: '#fbbf24', accent: 'rgba(251,191,36,0.12)',
      fields: [
        { key: 'emoji', type: 'text', label: 'Emoji', required: true, max: 100,
          placeholder: '👍 or :thumbsup: or <:name:id>' },
      ],
      defaults: { emoji: '' },
    },

    // ── ROLES ────────────────────────────────────────────────
    add_role: {
      cat: 'roles', label: 'Add Role', icon: 'user-plus',
      color: '#4ade80', accent: 'rgba(74,222,128,0.15)',
      fields: [
        { key: 'role_id', type: 'role', label: 'Role', required: true },
        { key: 'reason', type: 'text', label: 'Audit Log Reason', max: 512 },
      ],
      defaults: { role_id: '', reason: '' },
    },
    remove_role: {
      cat: 'roles', label: 'Remove Role', icon: 'user-minus',
      color: '#f87171', accent: 'rgba(248,113,113,0.15)',
      fields: [
        { key: 'role_id', type: 'role', label: 'Role', required: true },
        { key: 'reason', type: 'text', label: 'Audit Log Reason', max: 512 },
      ],
      defaults: { role_id: '', reason: '' },
    },
    toggle_role: {
      cat: 'roles', label: 'Toggle Role', icon: 'refresh-cw',
      color: '#38bdf8', accent: 'rgba(56,189,248,0.15)',
      fields: [
        { key: 'role_id', type: 'role', label: 'Role', required: true,
          hint: 'Adds if not present, removes if present' },
      ],
      defaults: { role_id: '' },
    },

    // ── MODERATION ───────────────────────────────────────────
    timeout_user: {
      cat: 'moderation', label: 'Timeout User', icon: 'clock',
      color: '#fb923c', accent: 'rgba(251,146,60,0.15)',
      fields: [
        { key: 'duration_min', type: 'number', label: 'Duration (minutes)', required: true, min: 1, max: 40320 },
        { key: 'reason', type: 'text', label: 'Reason', max: 512 },
      ],
      defaults: { duration_min: 10, reason: '' },
    },
    warn_user: {
      cat: 'moderation', label: 'Warn User', icon: 'alert-triangle',
      color: '#facc15', accent: 'rgba(250,204,21,0.15)',
      fields: [
        { key: 'reason', type: 'text', label: 'Reason', required: true, max: 512 },
        { key: 'dm_user', type: 'toggle', label: 'DM the user their warning' },
      ],
      defaults: { reason: '', dm_user: true },
    },
    kick_user: {
      cat: 'moderation', label: 'Kick User', icon: 'log-out',
      color: '#f97316', accent: 'rgba(249,115,22,0.15)',
      fields: [
        { key: 'reason', type: 'text', label: 'Reason', required: true, max: 512 },
        { key: 'dm_user', type: 'toggle', label: 'DM the user before kick' },
      ],
      defaults: { reason: '', dm_user: false },
    },
    ban_user: {
      cat: 'moderation', label: 'Ban User', icon: 'slash',
      color: '#ef4444', accent: 'rgba(239,68,68,0.18)',
      fields: [
        { key: 'reason', type: 'text', label: 'Reason', required: true, max: 512 },
        { key: 'delete_days', type: 'number', label: 'Delete Message History (days)', min: 0, max: 7 },
        { key: 'dm_user', type: 'toggle', label: 'DM the user before ban' },
      ],
      defaults: { reason: '', delete_days: 0, dm_user: false },
    },
    purge_messages: {
      cat: 'moderation', label: 'Bulk Delete Messages', icon: 'trash',
      color: '#f87171', accent: 'rgba(248,113,113,0.12)',
      fields: [
        { key: 'count', type: 'number', label: 'Number of Messages', required: true, min: 1, max: 100 },
        { key: 'filter', type: 'select', label: 'Filter',
          options: [
            { v: 'all', l: 'All messages' },
            { v: 'bots', l: 'Bot messages only' },
            { v: 'user', l: 'From triggering user only' },
          ] },
      ],
      defaults: { count: 5, filter: 'all' },
    },

    // ── ECONOMY ─────────────────────────────────────────────
    give_coins: {
      cat: 'economy', label: 'Give Coins', icon: 'dollar-sign',
      color: '#fbbf24', accent: 'rgba(251,191,36,0.15)',
      fields: [
        { key: 'amount', type: 'number', label: 'Amount', required: true, min: 1, max: 1000000 },
        { key: 'to', type: 'select', label: 'Give To',
          options: [{ v: 'user', l: 'Triggering User' }, { v: 'target', l: 'Mentioned User ({mentioned})' }] },
        { key: 'location', type: 'select', label: 'Destination',
          options: [{ v: 'wallet', l: 'Wallet' }, { v: 'bank', l: 'Bank' }] },
      ],
      defaults: { amount: 100, to: 'user', location: 'wallet' },
    },
    take_coins: {
      cat: 'economy', label: 'Take Coins', icon: 'minus-circle',
      color: '#f87171', accent: 'rgba(248,113,113,0.15)',
      fields: [
        { key: 'amount', type: 'number', label: 'Amount', required: true, min: 1, max: 1000000 },
        { key: 'from', type: 'select', label: 'Take From',
          options: [{ v: 'user', l: 'Triggering User' }, { v: 'target', l: 'Mentioned User' }] },
        { key: 'location', type: 'select', label: 'Source',
          options: [{ v: 'wallet', l: 'Wallet' }, { v: 'bank', l: 'Bank' }] },
        { key: 'fail_if_broke', type: 'toggle', label: 'Stop if insufficient funds' },
      ],
      defaults: { amount: 100, from: 'user', location: 'wallet', fail_if_broke: true },
    },
    check_balance: {
      cat: 'economy', label: 'Get Balance → Variable', icon: 'credit-card',
      color: '#fbbf24', accent: 'rgba(251,191,36,0.12)',
      fields: [
        { key: 'var_wallet', type: 'text', label: 'Store Wallet Balance As', placeholder: 'wallet', max: 32,
          hint: 'Accessible as {wallet} in later blocks' },
        { key: 'var_bank', type: 'text', label: 'Store Bank Balance As', placeholder: 'bank', max: 32 },
      ],
      defaults: { var_wallet: 'wallet', var_bank: 'bank' },
    },
    give_item: {
      cat: 'economy', label: 'Give Inventory Item', icon: 'package',
      color: '#a78bfa', accent: 'rgba(167,139,250,0.15)',
      fields: [
        { key: 'item_id', type: 'text', label: 'Item ID', required: true, max: 64 },
        { key: 'item_name', type: 'text', label: 'Item Name', required: true, max: 64 },
        { key: 'quantity', type: 'number', label: 'Quantity', min: 1, max: 999 },
        { key: 'emoji', type: 'text', label: 'Emoji', max: 10 },
      ],
      defaults: { item_id: '', item_name: '', quantity: 1, emoji: '📦' },
    },

    // ── LEVELING ─────────────────────────────────────────────
    give_xp: {
      cat: 'leveling', label: 'Give XP', icon: 'trending-up',
      color: '#818cf8', accent: 'rgba(129,140,248,0.15)',
      fields: [
        { key: 'amount', type: 'number', label: 'XP Amount', required: true, min: 1, max: 100000 },
      ],
      defaults: { amount: 100 },
    },
    take_xp: {
      cat: 'leveling', label: 'Take XP', icon: 'trending-down',
      color: '#f87171', accent: 'rgba(248,113,113,0.12)',
      fields: [
        { key: 'amount', type: 'number', label: 'XP Amount', required: true, min: 1, max: 100000 },
      ],
      defaults: { amount: 100 },
    },
    get_level: {
      cat: 'leveling', label: 'Get Level → Variable', icon: 'bar-chart-2',
      color: '#818cf8', accent: 'rgba(129,140,248,0.12)',
      fields: [
        { key: 'var_level', type: 'text', label: 'Store Level As', placeholder: 'level', max: 32 },
        { key: 'var_xp', type: 'text', label: 'Store XP As', placeholder: 'xp', max: 32 },
      ],
      defaults: { var_level: 'level', var_xp: 'xp' },
    },

    // ── VARIABLES ───────────────────────────────────────────
    set_variable: {
      cat: 'variables', label: 'Set Variable', icon: 'database',
      color: '#38bdf8', accent: 'rgba(56,189,248,0.15)',
      fields: [
        { key: 'var_name', type: 'text', label: 'Variable Name', required: true, max: 32,
          placeholder: 'my_var', hint: 'Access later as {my_var}' },
        { key: 'value', type: 'text', label: 'Value', required: true, max: 500,
          placeholder: 'value or {another_var}' },
        { key: 'scope', type: 'select', label: 'Scope',
          options: [
            { v: 'flow', l: 'This execution only (temporary)' },
            { v: 'user', l: 'Per-user persistent (DB)' },
            { v: 'guild', l: 'Per-server persistent (DB)' },
          ] },
      ],
      defaults: { var_name: '', value: '', scope: 'flow' },
    },
    get_variable: {
      cat: 'variables', label: 'Get Variable', icon: 'search',
      color: '#38bdf8', accent: 'rgba(56,189,248,0.12)',
      fields: [
        { key: 'var_name', type: 'text', label: 'Variable Name', required: true, max: 32 },
        { key: 'scope', type: 'select', label: 'Scope',
          options: [
            { v: 'user', l: 'Per-user (DB)' },
            { v: 'guild', l: 'Per-server (DB)' },
          ] },
        { key: 'default_value', type: 'text', label: 'Default If Not Found', max: 500 },
        { key: 'store_as', type: 'text', label: 'Store Result As (flow var)', max: 32 },
      ],
      defaults: { var_name: '', scope: 'user', default_value: '0', store_as: '' },
    },
    increment_variable: {
      cat: 'variables', label: 'Increment/Decrement Variable', icon: 'plus-circle',
      color: '#34d399', accent: 'rgba(52,211,153,0.12)',
      fields: [
        { key: 'var_name', type: 'text', label: 'Variable Name', required: true, max: 32 },
        { key: 'amount', type: 'number', label: 'Amount (negative to decrement)', min: -99999, max: 99999 },
        { key: 'scope', type: 'select', label: 'Scope',
          options: [{ v: 'user', l: 'Per-user (DB)' }, { v: 'guild', l: 'Per-server (DB)' }] },
      ],
      defaults: { var_name: '', amount: 1, scope: 'user' },
    },
    random_number: {
      cat: 'variables', label: 'Random Number → Variable', icon: 'shuffle',
      color: '#a78bfa', accent: 'rgba(167,139,250,0.12)',
      fields: [
        { key: 'min', type: 'number', label: 'Minimum', min: 0, max: 999999 },
        { key: 'max', type: 'number', label: 'Maximum', min: 1, max: 999999 },
        { key: 'store_as', type: 'text', label: 'Store As', placeholder: 'random', max: 32 },
      ],
      defaults: { min: 1, max: 100, store_as: 'random' },
    },

    // ── FLOW CONTROL ─────────────────────────────────────────
    condition_if: {
      cat: 'flow', label: 'Condition (If/Else)', icon: 'git-branch',
      color: '#f472b6', accent: 'rgba(244,114,182,0.18)',
      fields: [
        { key: 'condition_type', type: 'select', label: 'Check Type',
          options: [
            { v: 'has_role', l: 'User has role' },
            { v: 'not_has_role', l: 'User does NOT have role' },
            { v: 'in_channel', l: 'Command used in channel' },
            { v: 'not_in_channel', l: 'Command NOT in channel' },
            { v: 'var_equals', l: 'Variable equals value' },
            { v: 'var_not_equals', l: 'Variable does not equal value' },
            { v: 'var_greater', l: 'Variable greater than number' },
            { v: 'var_less', l: 'Variable less than number' },
            { v: 'user_has_perm', l: 'User has permission' },
            { v: 'economy_gte', l: 'User wallet/bank >= amount' },
            { v: 'level_gte', l: 'User level >= value' },
            { v: 'arg_equals', l: 'Command argument equals value' },
            { v: 'mentioned_user', l: 'User was mentioned in command' },
          ] },
        { key: 'role_id', type: 'role', label: 'Role',
          showIf: { key: 'condition_type', value: ['has_role', 'not_has_role'] } },
        { key: 'channel_id', type: 'channel', label: 'Channel',
          showIf: { key: 'condition_type', value: ['in_channel', 'not_in_channel'] } },
        { key: 'var_name', type: 'text', label: 'Variable Name', max: 32,
          showIf: { key: 'condition_type', value: ['var_equals', 'var_not_equals', 'var_greater', 'var_less'] } },
        { key: 'compare_value', type: 'text', label: 'Compare To Value', max: 500,
          showIf: { key: 'condition_type', value: ['var_equals', 'var_not_equals', 'var_greater', 'var_less', 'economy_gte', 'level_gte', 'arg_equals'] } },
        { key: 'economy_source', type: 'select', label: 'Economy Source',
          options: [{ v: 'wallet', l: 'Wallet' }, { v: 'bank', l: 'Bank' }],
          showIf: { key: 'condition_type', value: ['economy_gte'] } },
        { key: 'permission', type: 'select', label: 'Permission',
          options: [
            { v: 'ManageMessages', l: 'Manage Messages' },
            { v: 'ManageRoles', l: 'Manage Roles' },
            { v: 'ManageChannels', l: 'Manage Channels' },
            { v: 'Administrator', l: 'Administrator' },
            { v: 'BanMembers', l: 'Ban Members' },
            { v: 'KickMembers', l: 'Kick Members' },
            { v: 'ModerateMembers', l: 'Timeout Members' },
          ],
          showIf: { key: 'condition_type', value: ['user_has_perm'] } },
        { key: 'else_blocks', type: 'branch_label', label: 'ELSE branch',
          hint: 'Blocks nested under ELSE run when condition is false' },
      ],
      defaults: {
        condition_type: 'has_role', role_id: '', channel_id: '', var_name: '',
        compare_value: '', economy_source: 'wallet', permission: 'ManageMessages',
        if_blocks: [], else_blocks: [],
      },
    },
    stop_if: {
      cat: 'flow', label: 'Stop If (Guard)', icon: 'x-circle',
      color: '#f87171', accent: 'rgba(248,113,113,0.18)',
      fields: [
        { key: 'condition_type', type: 'select', label: 'Stop When',
          options: [
            { v: 'has_role', l: 'User HAS role' },
            { v: 'not_has_role', l: 'User does NOT have role' },
            { v: 'in_channel', l: 'Used in channel' },
            { v: 'not_in_channel', l: 'NOT in channel' },
            { v: 'var_equals', l: 'Variable equals value' },
            { v: 'user_has_perm', l: 'User HAS permission' },
            { v: 'user_not_perm', l: 'User MISSING permission' },
            { v: 'economy_lt', l: 'User balance < amount' },
          ] },
        { key: 'role_id', type: 'role', label: 'Role',
          showIf: { key: 'condition_type', value: ['has_role', 'not_has_role'] } },
        { key: 'channel_id', type: 'channel', label: 'Channel',
          showIf: { key: 'condition_type', value: ['in_channel', 'not_in_channel'] } },
        { key: 'var_name', type: 'text', label: 'Variable Name', max: 32,
          showIf: { key: 'condition_type', value: ['var_equals'] } },
        { key: 'compare_value', type: 'text', label: 'Value to Compare', max: 500,
          showIf: { key: 'condition_type', value: ['var_equals', 'economy_lt'] } },
        { key: 'economy_source', type: 'select', label: 'Economy Source',
          options: [{ v: 'wallet', l: 'Wallet' }, { v: 'bank', l: 'Bank' }],
          showIf: { key: 'condition_type', value: ['economy_lt'] } },
        { key: 'permission', type: 'select', label: 'Permission',
          options: [
            { v: 'ManageMessages', l: 'Manage Messages' }, { v: 'ManageRoles', l: 'Manage Roles' },
            { v: 'Administrator', l: 'Administrator' }, { v: 'BanMembers', l: 'Ban Members' },
          ],
          showIf: { key: 'condition_type', value: ['user_has_perm', 'user_not_perm'] } },
        { key: 'reply_msg', type: 'textarea', label: 'Reply with Error Message (optional)', max: 2000 },
      ],
      defaults: { condition_type: 'not_has_role', role_id: '', channel_id: '', var_name: '',
                  compare_value: '', economy_source: 'wallet', permission: 'ManageMessages', reply_msg: '' },
    },
    delay: {
      cat: 'flow', label: 'Wait / Delay', icon: 'pause',
      color: '#94a3b8', accent: 'rgba(148,163,184,0.15)',
      fields: [
        { key: 'ms', type: 'number', label: 'Delay (milliseconds)', required: true, min: 100, max: 10000,
          hint: '100ms – 10 000ms (10s) max per block' },
      ],
      defaults: { ms: 1000 },
    },
    stop_flow: {
      cat: 'flow', label: 'Stop Workflow', icon: 'stop-circle',
      color: '#94a3b8', accent: 'rgba(148,163,184,0.15)',
      fields: [],
      defaults: {},
    },

    // ── CHANNELS ─────────────────────────────────────────────
    create_thread: {
      cat: 'channels', label: 'Create Thread', icon: 'git-commit',
      color: '#38bdf8', accent: 'rgba(56,189,248,0.12)',
      fields: [
        { key: 'name', type: 'text', label: 'Thread Name', required: true, max: 100,
          placeholder: '{username}\'s thread' },
        { key: 'auto_archive_min', type: 'select', label: 'Auto-archive After',
          options: [
            { v: '60', l: '1 hour' }, { v: '1440', l: '1 day' },
            { v: '4320', l: '3 days' }, { v: '10080', l: '1 week' },
          ] },
      ],
      defaults: { name: '', auto_archive_min: '1440' },
    },
    lock_channel: {
      cat: 'channels', label: 'Lock Channel (slowmode)', icon: 'lock',
      color: '#f87171', accent: 'rgba(248,113,113,0.12)',
      fields: [
        { key: 'slowmode_seconds', type: 'number', label: 'Slowmode (seconds, 0 = lock)',
          min: 0, max: 21600 },
        { key: 'channel_id', type: 'channel', label: 'Channel (blank = current)' },
      ],
      defaults: { slowmode_seconds: 0, channel_id: '' },
    },

    // ── UTILITY ──────────────────────────────────────────────
    fetch_user_info: {
      cat: 'utility', label: 'Fetch User Info → Variables', icon: 'user',
      color: '#7dd3fc', accent: 'rgba(125,211,252,0.15)',
      fields: [
        { key: 'target', type: 'select', label: 'Target User',
          options: [{ v: 'author', l: 'Command Author' }, { v: 'mentioned', l: 'Mentioned User ({mentioned})' }] },
        { key: 'var_prefix', type: 'text', label: 'Variable Prefix', max: 20, placeholder: 'target',
          hint: 'Stores {target_id}, {target_username}, {target_joined}, {target_created}' },
      ],
      defaults: { target: 'author', var_prefix: 'target' },
    },
    log_to_channel: {
      cat: 'utility', label: 'Log to Channel', icon: 'file-text',
      color: '#94a3b8', accent: 'rgba(148,163,184,0.12)',
      fields: [
        { key: 'channel_id', type: 'channel', label: 'Log Channel', required: true },
        { key: 'message', type: 'textarea', label: 'Log Message', required: true, max: 2000,
          placeholder: '{user} ran /{command_name} in {channel}' },
        { key: 'as_embed', type: 'toggle', label: 'Send as embed' },
        { key: 'embed_color', type: 'color', label: 'Embed Color',
          showIf: { key: 'as_embed', value: true } },
      ],
      defaults: { channel_id: '', message: '', as_embed: false, embed_color: '#5865f2' },
    },
    math: {
      cat: 'utility', label: 'Math Operation', icon: 'hash',
      color: '#a78bfa', accent: 'rgba(167,139,250,0.12)',
      fields: [
        { key: 'expression', type: 'text', label: 'Expression (safe arithmetic)', required: true, max: 200,
          placeholder: '{wallet} + 100', hint: 'Supports +, -, *, /, %, floor(), ceil(), round(), min(), max(). No code execution.' },
        { key: 'store_as', type: 'text', label: 'Store Result As', required: true, max: 32, placeholder: 'result' },
      ],
      defaults: { expression: '', store_as: 'result' },
    },
    format_text: {
      cat: 'utility', label: 'Format Text → Variable', icon: 'type',
      color: '#7dd3fc', accent: 'rgba(125,211,252,0.12)',
      fields: [
        { key: 'template', type: 'textarea', label: 'Text Template', required: true, max: 2000,
          placeholder: 'Hello {username}, you have {wallet} coins!' },
        { key: 'store_as', type: 'text', label: 'Store As', required: true, max: 32, placeholder: 'formatted' },
      ],
      defaults: { template: '', store_as: 'formatted' },
    },

  }; // END REGISTRY

  /* ============================================================
     CATEGORIES — ordered display groups
     ============================================================ */
  const CATEGORIES = [
    { id: 'messages',   label: 'Messages',    icon: 'message-circle', color: '#60a5fa' },
    { id: 'components', label: 'Components',  icon: 'square',          color: '#818cf8' },
    { id: 'roles',      label: 'Roles',       icon: 'shield',          color: '#4ade80' },
    { id: 'moderation', label: 'Moderation',  icon: 'gavel',           color: '#f97316' },
    { id: 'economy',    label: 'Economy',     icon: 'dollar-sign',     color: '#fbbf24' },
    { id: 'leveling',   label: 'Leveling',    icon: 'trending-up',     color: '#818cf8' },
    { id: 'variables',  label: 'Variables',   icon: 'database',        color: '#38bdf8' },
    { id: 'flow',       label: 'Flow Control', icon: 'git-branch',     color: '#f472b6' },
    { id: 'channels',   label: 'Channels',    icon: 'hash',            color: '#38bdf8' },
    { id: 'utility',    label: 'Utility',     icon: 'tool',            color: '#94a3b8' },
  ];

  /* ============================================================
     ICON REGISTRY (inline SVG paths keyed by icon name)
     All icons from Feather Icons set (MIT licensed)
     ============================================================ */
  const ICONS = {
    'message-square':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
    'send':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    'layout':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
    'edit-2':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    'trash-2':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
    'mail':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    'square':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`,
    'chevron-down':    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
    'layers':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    'smile':           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    'user-plus':       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    'user-minus':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    'refresh-cw':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>`,
    'clock':           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    'alert-triangle':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    'log-out':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    'slash':           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
    'trash':           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>`,
    'dollar-sign':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    'minus-circle':    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    'credit-card':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    'package':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`,
    'trending-up':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    'trending-down':   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
    'bar-chart-2':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    'database':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
    'search':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    'plus-circle':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    'shuffle':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
    'git-branch':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>`,
    'x-circle':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    'pause':           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    'stop-circle':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg>`,
    'git-commit':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/></svg>`,
    'lock':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
    'user':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    'file-text':       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    'hash':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
    'type':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
    'tool':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
    'message-circle':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,
    'shield':          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    'gavel':           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 6l-1-2H5v17h2v-7h5l1 2h7V6h-6zm4 8h-4l-1-2H7V6h5l1 2h5v6z"/></svg>`,
    'lightning':       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    'plus':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    'x':               `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    'chevron-up':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`,
    'arrow-up':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
    'arrow-down':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
    'copy':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
    'save':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13"/><polyline points="7 3 7 8 15 8"/></svg>`,
    'arrow-left':      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
    'zap':             `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    'warning':         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  function icon(name, size = 14) {
    const svg = ICONS[name] || ICONS['tool'];
    return svg.replace('<svg', `<svg width="${size}" height="${size}"`);
  }

  // ── Helpers ───────────────────────────────────────────────────
  function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }
  function showToast(msg, type = 'info') { window.showToast?.(msg, type); }

  // ── State ────────────────────────────────────────────────────
  let _guildId = '', _cmdId = '';
  let _roles = [], _channels = [];
  let _blocks = [];
  let _idCounter = 0;
  let _dirty = false, _saving = false;
  let _pendingNavUrl = null;
  let _selectedRoles = [], _selectedChannels = [];
  let _paletteFilter = '';

  function markDirty() {
    if (_dirty) return; _dirty = true;
    const btn = el('cbSaveBtn');
    if (btn && !btn.querySelector('.cb-unsaved-dot')) {
      const dot = document.createElement('span'); dot.className = 'cb-unsaved-dot';
      btn.insertBefore(dot, btn.firstChild);
    }
    updateBlockCount();
  }
  function markClean() {
    _dirty = false;
    el('cbSaveBtn')?.querySelector('.cb-unsaved-dot')?.remove();
  }
  function updateBlockCount() {
    const badge = el('cbBlockCount');
    if (badge) badge.textContent = `${_blocks.length} block${_blocks.length !== 1 ? 's' : ''}`;
  }

  // ── Palette rendering ─────────────────────────────────────────
  function renderPalette() {
    const container = el('cbPalette');
    if (!container) return;
    const q = _paletteFilter.toLowerCase();
    let html = '';
    for (const cat of CATEGORIES) {
      const items = Object.entries(REGISTRY).filter(([, r]) => r.cat === cat.id &&
        (!q || r.label.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)));
      if (!items.length) continue;
      html += `<div class="cb-cat-section">
        <div class="cb-cat-header" style="color:${cat.color}">${icon(cat.icon, 12)} ${esc(cat.label)}</div>
        <div class="cb-cat-items">`;
      for (const [type, reg] of items) {
        html += `<button class="cb-palette-btn" data-add-block="${esc(type)}" title="${esc(reg.label)}" style="border-left-color:${reg.color}">
          <span class="cb-palette-btn-icon" style="color:${reg.color}">${icon(reg.icon, 12)}</span>
          <span>${esc(reg.label)}</span>
        </button>`;
      }
      html += `</div></div>`;
    }
    container.innerHTML = html || '<div class="cb-no-results">No blocks match your search.</div>';
    container.querySelectorAll('[data-add-block]').forEach(btn => {
      btn.addEventListener('click', () => addBlock(btn.dataset.addBlock, {}));
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    const pageData = el('cbPageData');
    if (!pageData) return;
    _guildId = pageData.dataset.guildId || '';
    _cmdId   = pageData.dataset.cmdId   || '';
    if (!_guildId) return;

    renderPalette();
    wireStaticEvents();

    // Load roles + channels, then load cmd if editing
    try {
      const [roles, channels] = await Promise.all([
        fetch(`/api/guild/${_guildId}/roles`).then(r => r.json()).catch(() => []),
        fetch(`/api/guild/${_guildId}/channels`).then(r => r.json()).catch(() => []),
      ]);
      _roles    = Array.isArray(roles) ? roles.filter(r => !r.managed && r.name !== '@everyone') : [];
      _channels = Array.isArray(channels) ? channels.filter(c => c.type === 0 || c.type === 5 || c.type === 11) : [];

      populateRoleSelect();
      populateChannelSelect();

      // Load existing command if editing
      let cmd = null;
      const rawJson = pageData.dataset.cmdJson;
      if (rawJson) {
        try { cmd = JSON.parse(rawJson.replace(/&quot;/g, '"')); } catch {}
      }

      if (cmd) {
        loadCommand(cmd);
      } else {
        // Default: one reply block
        addBlock('reply', {});
      }
    } catch (err) {
      console.error('[Builder] init error', err);
    }

    // Show the flow
    el('cbCanvasLoading').style.display = 'none';
    el('cbFlow').style.display = '';

    // Wire collapse toggles on fixed blocks
    wireCollapseToggle('cbBlockTrigger');
    wireCollapseToggle('cbBlockRestrictions');
  });

  // ── Wire static (non-block) events ───────────────────────────
  function wireStaticEvents() {
    el('cbSaveBtn')?.addEventListener('click', handleSave);
    el('cbValidateBtn')?.addEventListener('click', runValidation);

    el('cbEnabled')?.addEventListener('change', () => {
      el('cbEnabledLabel').textContent = el('cbEnabled').checked ? 'Enabled' : 'Disabled';
      markDirty();
    });
    el('cbCmdName')?.addEventListener('input', markDirty);

    el('cbTriggerTypeTabs')?.addEventListener('click', e => {
      const tab = e.target.closest('[data-ttype]');
      if (!tab) return;
      document.querySelectorAll('.cb-tab').forEach(t => t.classList.remove('cb-tab--active'));
      tab.classList.add('cb-tab--active');
      updateTriggerHints(tab.dataset.ttype);
      markDirty();
    });
    el('cbTrigger')?.addEventListener('input', () => { updateTriggerSummary(); markDirty(); });
    el('cbDescription')?.addEventListener('input', markDirty);
    el('cbCooldown')?.addEventListener('input', markDirty);
    el('cbCaseSensitive')?.addEventListener('change', () => { updateRestrictionSummary(); markDirty(); });
    el('cbDeleteTrigger')?.addEventListener('change', () => { updateRestrictionSummary(); markDirty(); });

    // Palette search
    el('cbPaletteSearch')?.addEventListener('input', e => { _paletteFilter = e.target.value; renderPalette(); });

    // Back button
    el('cbBackBtn')?.addEventListener('click', e => {
      if (_dirty) { e.preventDefault(); _pendingNavUrl = el('cbBackBtn').href; showUnsavedModal(); }
    });
    el('cbUnsavedStay')?.addEventListener('click', hideUnsavedModal);
    el('cbUnsavedLeave')?.addEventListener('click', () => { _dirty = false; if (_pendingNavUrl) window.location.href = _pendingNavUrl; });
    window.addEventListener('beforeunload', e => { if (_dirty) { e.preventDefault(); e.returnValue = ''; } });

    // Variables copy
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy).then(() => showToast(`Copied ${btn.dataset.copy}`, 'success')).catch(() => {});
      });
    });

    // Multi-selects
    el('cbReqRolesSelect')?.addEventListener('change', () => {
      const val = el('cbReqRolesSelect').value;
      if (!val || _selectedRoles.includes(val)) { el('cbReqRolesSelect').value = ''; return; }
      _selectedRoles.push(val); el('cbReqRolesSelect').value = '';
      renderMultiTags('cbReqRolesTags', _selectedRoles, _roles, removeRole);
      updateRestrictionSummary(); markDirty();
    });
    el('cbAllowedChannelsSelect')?.addEventListener('change', () => {
      const val = el('cbAllowedChannelsSelect').value;
      if (!val || _selectedChannels.includes(val)) { el('cbAllowedChannelsSelect').value = ''; return; }
      _selectedChannels.push(val); el('cbAllowedChannelsSelect').value = '';
      renderMultiTags('cbAllowedChannelsTags', _selectedChannels, _channels, removeChannel);
      updateRestrictionSummary(); markDirty();
    });
  }

  function removeRole(id) {
    _selectedRoles = _selectedRoles.filter(r => r !== id);
    renderMultiTags('cbReqRolesTags', _selectedRoles, _roles, removeRole);
    updateRestrictionSummary(); markDirty();
  }
  function removeChannel(id) {
    _selectedChannels = _selectedChannels.filter(c => c !== id);
    renderMultiTags('cbAllowedChannelsTags', _selectedChannels, _channels, removeChannel);
    updateRestrictionSummary(); markDirty();
  }

  function renderMultiTags(containerId, selectedIds, allItems, onRemove) {
    const container = el(containerId); if (!container) return;
    container.innerHTML = selectedIds.map(id => {
      const item = allItems.find(r => r.id === id);
      return `<span class="cb-tag">${esc(item ? item.name : id)}<button class="cb-tag-remove" data-remove-id="${esc(id)}" aria-label="Remove">&times;</button></span>`;
    }).join('');
    container.querySelectorAll('[data-remove-id]').forEach(btn => btn.addEventListener('click', () => onRemove(btn.dataset.removeId)));
  }

  function populateRoleSelect() {
    const sel = el('cbReqRolesSelect'); if (!sel) return;
    sel.innerHTML = `<option value="">Add a required role…</option>` +
      _roles.map(r => {
        const hex = r.color ? '#' + r.color.toString(16).padStart(6, '0') : '';
        return `<option value="${esc(r.id)}" style="${hex ? 'color:' + hex : ''}">${esc(r.name)}</option>`;
      }).join('');
  }
  function populateChannelSelect() {
    const sel = el('cbAllowedChannelsSelect'); if (!sel) return;
    sel.innerHTML = `<option value="">Add an allowed channel…</option>` +
      _channels.map(c => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('');
  }

  function updateTriggerHints(type) {
    const hints = {
      slash: 'Slash command — lowercase, no spaces. e.g. "greet"',
      prefix: 'Full prefix. e.g. "!hello"',
      contains: 'Bot responds when message contains this text',
      exact: 'Bot responds when message exactly matches this',
      regex: 'JavaScript regex (no surrounding slashes)',
    };
    const placeholders = { slash:'greet', prefix:'!hello', contains:'good morning', exact:'hello bot', regex:'\\bhello\\b' };
    const hint = el('cbTriggerHint'); if (hint) hint.textContent = hints[type] || '';
    const input = el('cbTrigger'); if (input) input.placeholder = placeholders[type] || '';
    const desc = el('cbDescField'); if (desc) desc.style.display = type === 'slash' ? '' : 'none';
    updateTriggerSummary();
  }
  function updateTriggerSummary() {
    const ttype = document.querySelector('.cb-tab--active')?.dataset.ttype || 'slash';
    const trigger = el('cbTrigger')?.value?.trim() || '';
    const labels = { slash:'Slash', prefix:'Prefix', contains:'Contains', exact:'Exact', regex:'Regex' };
    const s = el('cbTriggerSummary');
    if (s) s.textContent = trigger ? `${labels[ttype]||ttype}: ${trigger}` : `${labels[ttype]||'Slash'} command`;
  }
  function updateRestrictionSummary() {
    const s = el('cbRestrictionsSummary'); if (!s) return;
    const parts = [];
    if (_selectedRoles.length) parts.push(`${_selectedRoles.length} role(s) required`);
    if (_selectedChannels.length) parts.push(`${_selectedChannels.length} channel(s)`);
    if (el('cbCaseSensitive')?.checked) parts.push('case sensitive');
    if (el('cbDeleteTrigger')?.checked) parts.push('delete trigger');
    s.textContent = parts.length ? parts.join(' · ') : 'No restrictions';
  }

  function wireCollapseToggle(blockId) {
    const block = el(blockId); if (!block) return;
    const btn = block.querySelector('.cb-block-collapse-btn'); if (!btn) return;
    const body = el(btn.dataset.collapseTarget); if (!body) return;
    btn.addEventListener('click', () => {
      const collapsed = body.classList.contains('cb-block-body--collapsed');
      body.classList.toggle('cb-block-body--collapsed', !collapsed);
      btn.querySelector('.cb-chevron')?.classList.toggle('cb-chevron--up', !collapsed);
    });
  }

  // ── Load existing command ─────────────────────────────────────
  function loadCommand(cmd) {
    const nameInput = el('cbCmdName'); if (nameInput) nameInput.value = cmd.name || '';
    const enabledCb = el('cbEnabled');
    if (enabledCb) { enabledCb.checked = cmd.enabled !== false; el('cbEnabledLabel').textContent = enabledCb.checked ? 'Enabled' : 'Disabled'; }
    const ttype = cmd.triggerType || 'slash';
    document.querySelectorAll('.cb-tab').forEach(t => t.classList.toggle('cb-tab--active', t.dataset.ttype === ttype));
    updateTriggerHints(ttype);
    if (el('cbTrigger')) el('cbTrigger').value = cmd.trigger || '';
    if (el('cbDescription')) el('cbDescription').value = cmd.description || '';
    if (el('cbCooldown')) el('cbCooldown').value = cmd.cooldownSeconds ?? 0;
    if (el('cbCaseSensitive')) el('cbCaseSensitive').checked = !!cmd.caseSensitive;
    if (el('cbDeleteTrigger')) el('cbDeleteTrigger').checked = !!cmd.deleteUserMessage;
    _selectedRoles = Array.isArray(cmd.allowedRoles) ? [...cmd.allowedRoles] : [];
    _selectedChannels = Array.isArray(cmd.allowedChannels) ? [...cmd.allowedChannels] : [];
    renderMultiTags('cbReqRolesTags', _selectedRoles, _roles, removeRole);
    renderMultiTags('cbAllowedChannelsTags', _selectedChannels, _channels, removeChannel);
    updateRestrictionSummary(); updateTriggerSummary();
    _blocks = []; _idCounter = 0;
    if (Array.isArray(cmd.blocks) && cmd.blocks.length) {
      cmd.blocks.forEach(b => addBlock(b.type, b.data || {}));
    } else if (cmd.response) {
      addBlock('reply', { content: cmd.response });
    } else {
      addBlock('reply', {});
    }
  }

  // ── Block management ──────────────────────────────────────────
  function addBlock(type, data) {
    if (!REGISTRY[type]) { showToast('Unknown block type: ' + type, 'error'); return; }
    const id = ++_idCounter;
    const reg = REGISTRY[type];
    const merged = Object.assign({}, reg.defaults || {}, data || {});
    _blocks.push({ id, type, data: merged });
    renderAllBlocks(); markDirty();
    requestAnimationFrame(() => el(`cb-b-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  function removeBlock(id) { _blocks = _blocks.filter(b => b.id !== id); renderAllBlocks(); markDirty(); }

  function moveBlock(id, direction) {
    const idx = _blocks.findIndex(b => b.id === id); if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= _blocks.length) return;
    const arr = [..._blocks]; [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    _blocks = arr; renderAllBlocks(); markDirty();
    requestAnimationFrame(() => el(`cb-b-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  function duplicateBlock(id) {
    const src = _blocks.find(b => b.id === id); if (!src) return;
    const newId = ++_idCounter;
    _blocks.splice(_blocks.findIndex(b => b.id === id) + 1, 0, { id: newId, type: src.type, data: JSON.parse(JSON.stringify(src.data)) });
    renderAllBlocks(); markDirty();
  }

  // ── Render blocks ─────────────────────────────────────────────
  function renderAllBlocks() {
    const container = el('cbActionBlocks'); if (!container) return;
    if (_blocks.length === 0) {
      container.innerHTML = `<div class="cb-empty-state">
        <div class="cb-empty-icon">${icon('zap', 32)}</div>
        <div class="cb-empty-title">No blocks yet</div>
        <div class="cb-empty-sub">Click a block in the left panel to add it to your workflow</div>
      </div>`;
      updateBlockCount(); return;
    }
    container.innerHTML = _blocks.map((b, i) => renderBlockHTML(b, i)).join('');
    _blocks.forEach(b => {
      el(`cb-b-remove-${b.id}`)?.addEventListener('click', () => removeBlock(b.id));
      el(`cb-b-up-${b.id}`)?.addEventListener('click', () => moveBlock(b.id, -1));
      el(`cb-b-down-${b.id}`)?.addEventListener('click', () => moveBlock(b.id, 1));
      el(`cb-b-dup-${b.id}`)?.addEventListener('click', () => duplicateBlock(b.id));
      wireCollapseToggle(`cb-b-${b.id}`);
      wireBlockInputs(b.id, b.type);
    });
    updateBlockCount();
  }

  function renderBlockHTML(b, idx) {
    const reg = REGISTRY[b.type]; if (!reg) return '';
    const isFirst = idx === 0, isLast = idx === _blocks.length - 1;
    const connector = idx > 0 ? '<div class="cb-connector"></div>' : '';
    const blockIcon = icon(reg.icon, 13);
    const summary = buildBlockSummary(b);
    const body = buildBlockBody(b);
    return `${connector}<div class="cb-block" id="cb-b-${b.id}" style="border-left-color:${reg.color};--block-accent:${reg.accent||'transparent'}">
      <div class="cb-block-header" style="background:${reg.accent}">
        <div class="cb-block-header-left">
          <div class="cb-block-drag-handle" title="Drag to reorder">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg>
          </div>
          <span class="cb-block-type-icon" style="color:${reg.color}">${blockIcon}</span>
          <span class="cb-block-type-label">${esc(reg.label)}</span>
          <span class="cb-block-summary" id="cb-b-summary-${b.id}">${esc(summary)}</span>
        </div>
        <div class="cb-block-header-right">
          <button class="cb-block-action-btn" id="cb-b-up-${b.id}" title="Move up" ${isFirst ? 'disabled' : ''}>${icon('arrow-up', 11)}</button>
          <button class="cb-block-action-btn" id="cb-b-down-${b.id}" title="Move down" ${isLast ? 'disabled' : ''}>${icon('arrow-down', 11)}</button>
          <button class="cb-block-action-btn" id="cb-b-dup-${b.id}" title="Duplicate block">${icon('copy', 11)}</button>
          <button class="cb-block-action-btn cb-block-action-btn--danger" id="cb-b-remove-${b.id}" title="Remove block">${icon('x', 11)}</button>
          <button class="cb-block-collapse-btn" data-collapse-target="cb-b-body-${b.id}" aria-label="Toggle">
            <svg class="cb-chevron cb-chevron--up" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>
      <div class="cb-block-body" id="cb-b-body-${b.id}">${body}</div>
    </div>`;
  }

  // ── Generic block body renderer ───────────────────────────────
  function buildBlockBody(b) {
    const reg = REGISTRY[b.type]; if (!reg) return '';
    const id = b.id; const d = b.data || {};
    if (b.type === 'send_embed') return buildEmbedBody(id, d);
    if (b.type === 'condition_if') return buildConditionBody(id, d);
    if (b.type === 'send_buttons') return buildButtonsBody(id, d);
    if (b.type === 'send_select_menu') return buildSelectMenuBody(id, d);
    if (b.type === 'stop_flow') return `<div class="cb-hint cb-hint-center">Stops all further blocks from executing when reached.</div>`;

    let html = '';
    for (const field of reg.fields || []) {
      if (field.type === 'branch_label') continue;
      if (field.showIf) {
        const allowed = Array.isArray(field.showIf.value) ? field.showIf.value : [field.showIf.value];
        if (field.showIf.value === true) { if (!d[field.showIf.key]) continue; }
        else if (!allowed.includes(d[field.showIf.key])) continue;
      }
      html += renderField(id, field, d[field.key]);
    }
    return html || `<div class="cb-hint">This block has no configurable options.</div>`;
  }

  function renderField(blockId, field, value) {
    const fid = `cb-f-${blockId}-${field.key}`;
    const labelHtml = `<label class="cb-label" for="${fid}">${esc(field.label)}${field.required ? ' <span class="cb-req">*</span>' : ''}</label>`;
    const hintHtml = field.hint ? `<div class="cb-hint">${esc(field.hint)}</div>` : '';

    switch (field.type) {
      case 'text':
        return `<div class="cb-field">${labelHtml}<input class="cb-input" type="text" id="${fid}" maxlength="${field.max||200}" value="${esc(value||'')}" placeholder="${esc(field.placeholder||'')}">${hintHtml}</div>`;
      case 'textarea':
        return `<div class="cb-field">${labelHtml}<textarea class="cb-input cb-textarea cb-textarea--tall" id="${fid}" maxlength="${field.max||2000}" placeholder="${esc(field.placeholder||'')}">${esc(value||'')}</textarea>${hintHtml}</div>`;
      case 'number':
        return `<div class="cb-field">${labelHtml}<input class="cb-input" type="number" id="${fid}" min="${field.min??0}" max="${field.max??99999}" value="${parseFloat(value)||0}">${hintHtml}</div>`;
      case 'color':
        return `<div class="cb-field cb-field--inline">${labelHtml}<input class="cb-input cb-color-input" type="color" id="${fid}" value="${esc(value||'#5865f2')}">${hintHtml}</div>`;
      case 'toggle':
        return `<div class="cb-field cb-field--toggle"><label class="cb-toggle-label"><input type="checkbox" class="cb-checkbox" id="${fid}" ${value ? 'checked' : ''}><span>${esc(field.label)}</span></label>${hintHtml}</div>`;
      case 'select': {
        const opts = (field.options||[]).map(o => `<option value="${esc(o.v)}" ${value===o.v?'selected':''}>${esc(o.l)}</option>`).join('');
        return `<div class="cb-field">${labelHtml}<select class="cb-input" id="${fid}">${opts}</select>${hintHtml}</div>`;
      }
      case 'role': {
        const opts = _roles.map(r => {
          const hex = r.color ? '#' + r.color.toString(16).padStart(6, '0') : '';
          return `<option value="${esc(r.id)}" ${value===r.id?'selected':''} style="${hex?'color:'+hex:''}">${esc(r.name)}</option>`;
        }).join('');
        return `<div class="cb-field">${labelHtml}<select class="cb-input" id="${fid}"><option value="">— Select a role —</option>${opts}</select>${hintHtml}</div>`;
      }
      case 'channel': {
        const opts = _channels.map(c => `<option value="${esc(c.id)}" ${value===c.id?'selected':''}>#${esc(c.name)}</option>`).join('');
        return `<div class="cb-field">${labelHtml}<select class="cb-input" id="${fid}"><option value="">— ${field.hint||'Current channel'} —</option>${opts}</select>${hintHtml}</div>`;
      }
      case 'embed_fields': return buildEmbedFieldsEditor(blockId, value);
      case 'modal_fields': return buildModalFieldsEditor(blockId, value);
      default: return '';
    }
  }

  // ── Embed body ────────────────────────────────────────────────
  function buildEmbedBody(id, d) {
    let html = '';
    for (const field of REGISTRY.send_embed.fields) {
      if (field.key === 'fields') { html += buildEmbedFieldsEditor(id, d.fields); }
      else { html += renderField(id, field, d[field.key]); }
    }
    return html;
  }

  function buildEmbedFieldsEditor(blockId, fieldsArr) {
    const fields = Array.isArray(fieldsArr) ? fieldsArr : [];
    const rows = fields.map((f, fi) => `
      <div class="cb-embed-field-row" id="cb-f-${blockId}-fieldrow-${fi}">
        <div class="cb-field cb-field--grow"><label class="cb-label">Name</label>
          <input class="cb-input" type="text" id="cb-f-${blockId}-fn-${fi}" maxlength="256" value="${esc(f.name||'')}" placeholder="Field title">
        </div>
        <div class="cb-field cb-field--grow"><label class="cb-label">Value</label>
          <input class="cb-input" type="text" id="cb-f-${blockId}-fv-${fi}" maxlength="1024" value="${esc(f.value||'')}" placeholder="Field content">
        </div>
        <div class="cb-field" style="min-width:70px;flex:none">
          <label class="cb-toggle-label" style="margin-top:22px">
            <input type="checkbox" class="cb-checkbox" id="cb-f-${blockId}-fi-${fi}" ${f.inline?'checked':''}><span>Inline</span>
          </label>
        </div>
        <button class="cb-block-action-btn cb-block-action-btn--danger cb-embed-field-remove" style="margin-top:20px" data-field-idx="${fi}" data-block-id="${blockId}" title="Remove">${icon('x',11)}</button>
      </div>`).join('');
    return `<div class="cb-field"><label class="cb-label">Embed Fields <span class="cb-hint-inline">(up to 25)</span></label>
      <div class="cb-embed-fields" id="cb-f-${blockId}-fields">${rows}</div>
      <button class="cb-add-field-btn" id="cb-f-${blockId}-addfield">${icon('plus',12)} Add Field</button></div>`;
  }

  function buildModalFieldsEditor(blockId, fieldsArr) {
    const fields = Array.isArray(fieldsArr) ? fieldsArr : [];
    const rows = fields.map((f, fi) => `
      <div class="cb-modal-field-row" id="cb-f-${blockId}-mfrow-${fi}">
        <div class="cb-field cb-field--grow"><label class="cb-label">Label</label>
          <input class="cb-input" type="text" id="cb-f-${blockId}-mfl-${fi}" maxlength="45" value="${esc(f.label||'')}" placeholder="Field label">
        </div>
        <div class="cb-field" style="min-width:100px;flex:none"><label class="cb-label">Style</label>
          <select class="cb-input" id="cb-f-${blockId}-mfs-${fi}">
            <option value="short" ${f.style!=='paragraph'?'selected':''}>Short</option>
            <option value="paragraph" ${f.style==='paragraph'?'selected':''}>Paragraph</option>
          </select>
        </div>
        <div class="cb-field" style="min-width:70px;flex:none">
          <label class="cb-toggle-label" style="margin-top:22px">
            <input type="checkbox" class="cb-checkbox" id="cb-f-${blockId}-mfr-${fi}" ${f.required?'checked':''}><span>Req</span>
          </label>
        </div>
        <button class="cb-block-action-btn cb-block-action-btn--danger cb-modal-field-remove" style="margin-top:20px" data-field-idx="${fi}" title="Remove">${icon('x',11)}</button>
      </div>`).join('');
    return `<div class="cb-field"><label class="cb-label">Modal Input Fields <span class="cb-hint-inline">(up to 5)</span></label>
      <div class="cb-modal-fields" id="cb-f-${blockId}-mfields">${rows}</div>
      <button class="cb-add-field-btn" id="cb-f-${blockId}-addmodalfield">${icon('plus',12)} Add Input</button></div>`;
  }

  // ── Button row body ───────────────────────────────────────────
  function buildButtonsBody(id, d) {
    const buttons = Array.isArray(d.buttons) ? d.buttons : [];
    const btns = buttons.map((btn, bi) => `
      <div class="cb-btn-row-item" id="cb-f-${id}-btnrow-${bi}">
        <div class="cb-field cb-field--grow"><label class="cb-label">Label</label>
          <input class="cb-input" type="text" id="cb-f-${id}-bl-${bi}" maxlength="80" value="${esc(btn.label||'')}" placeholder="Click me">
        </div>
        <div class="cb-field" style="min-width:90px;flex:none"><label class="cb-label">Style</label>
          <select class="cb-input" id="cb-f-${id}-bs-${bi}">
            <option value="Primary" ${btn.style==='Primary'?'selected':''}>Blue</option>
            <option value="Secondary" ${btn.style==='Secondary'?'selected':''}>Grey</option>
            <option value="Success" ${btn.style==='Success'?'selected':''}>Green</option>
            <option value="Danger" ${btn.style==='Danger'?'selected':''}>Red</option>
            <option value="Link" ${btn.style==='Link'?'selected':''}>Link</option>
          </select>
        </div>
        <div class="cb-field cb-field--grow"><label class="cb-label">Custom ID / URL</label>
          <input class="cb-input" type="text" id="cb-f-${id}-bi-${bi}" maxlength="100" value="${esc(btn.customId||btn.url||'')}" placeholder="${btn.style==='Link'?'https://…':'btn_action'}">
        </div>
        <button class="cb-block-action-btn cb-block-action-btn--danger cb-btn-remove" style="margin-top:20px" data-btn-idx="${bi}" title="Remove">${icon('x',11)}</button>
      </div>`).join('');
    const msgField = renderField(id, { key: 'message', type: 'textarea', label: 'Message (optional)', max: 2000, placeholder: 'Text above buttons' }, d.message);
    const chanField = renderField(id, { key: 'channel_id', type: 'channel', label: 'Channel', hint: 'Blank = current channel' }, d.channel_id);
    return `${msgField}${chanField}<div class="cb-field"><label class="cb-label">Buttons <span class="cb-hint-inline">(up to 5)</span></label>
      <div class="cb-btn-rows" id="cb-f-${id}-btnrows">${btns}</div>
      <button class="cb-add-field-btn" id="cb-f-${id}-addbtn">${icon('plus',12)} Add Button</button></div>`;
  }

  // ── Select menu body ──────────────────────────────────────────
  function buildSelectMenuBody(id, d) {
    const opts = Array.isArray(d.options) ? d.options : [];
    const rows = opts.map((opt, oi) => `
      <div class="cb-select-option-row" id="cb-f-${id}-selrow-${oi}">
        <div class="cb-field cb-field--grow"><label class="cb-label">Label</label>
          <input class="cb-input" type="text" id="cb-f-${id}-sol-${oi}" maxlength="100" value="${esc(opt.label||'')}" placeholder="Option label">
        </div>
        <div class="cb-field cb-field--grow"><label class="cb-label">Value</label>
          <input class="cb-input" type="text" id="cb-f-${id}-sov-${oi}" maxlength="100" value="${esc(opt.value||'')}" placeholder="option_value">
        </div>
        <div class="cb-field cb-field--grow"><label class="cb-label">Description</label>
          <input class="cb-input" type="text" id="cb-f-${id}-sod-${oi}" maxlength="100" value="${esc(opt.description||'')}" placeholder="Optional">
        </div>
        <button class="cb-block-action-btn cb-block-action-btn--danger cb-sel-remove" style="margin-top:20px" data-opt-idx="${oi}" title="Remove">${icon('x',11)}</button>
      </div>`).join('');
    const phField = renderField(id, { key: 'placeholder', type: 'text', label: 'Placeholder', max: 150, placeholder: 'Choose an option…' }, d.placeholder);
    const msgField = renderField(id, { key: 'message', type: 'textarea', label: 'Message (optional)', max: 2000 }, d.message);
    const chanField = renderField(id, { key: 'channel_id', type: 'channel', label: 'Channel', hint: 'Blank = current channel' }, d.channel_id);
    return `${phField}${msgField}${chanField}<div class="cb-field"><label class="cb-label">Options <span class="cb-hint-inline">(up to 25)</span></label>
      <div class="cb-select-options" id="cb-f-${id}-selopts">${rows}</div>
      <button class="cb-add-field-btn" id="cb-f-${id}-addselopt">${icon('plus',12)} Add Option</button></div>`;
  }

  // ── Condition block body ──────────────────────────────────────
  function buildConditionBody(id, d) {
    let condFields = '';
    for (const field of REGISTRY.condition_if.fields) {
      if (field.type === 'branch_label') continue;
      if (field.showIf) {
        const allowed = Array.isArray(field.showIf.value) ? field.showIf.value : [field.showIf.value];
        if (!allowed.includes(d[field.showIf.key])) continue;
      }
      condFields += renderField(id, field, d[field.key]);
    }
    const renderBranch = (branchBlocks) => (branchBlocks||[]).map(bb => {
      const br = REGISTRY[bb.type]; if (!br) return '';
      return `<div class="cb-branch-block" style="border-left-color:${br.color}"><span style="color:${br.color}">${icon(br.icon,11)}</span> <span>${esc(br.label)}</span></div>`;
    }).join('') || '<div class="cb-hint">No blocks in this branch.</div>';
    return `${condFields}
      <div class="cb-condition-branches">
        <div class="cb-branch cb-branch--if">
          <div class="cb-branch-label cb-branch-label--if">${icon('zap',11)} IF True:</div>
          <div id="cb-f-${id}-ifblocks">${renderBranch(d.if_blocks)}</div>
        </div>
        <div class="cb-branch cb-branch--else">
          <div class="cb-branch-label cb-branch-label--else">${icon('x-circle',11)} ELSE:</div>
          <div id="cb-f-${id}-elseblocks">${renderBranch(d.else_blocks)}</div>
        </div>
      </div>
      <div class="cb-hint" style="margin-top:8px">Tip: For simpler branching, use Stop-If blocks above this point instead.</div>`;
  }

  // ── Block summaries ───────────────────────────────────────────
  function buildBlockSummary(b) {
    const d = b.data || {};
    switch (b.type) {
      case 'reply': case 'send_message': case 'dm_user': return (d.content||'').slice(0,45) || 'No content';
      case 'send_embed': return (d.title||d.description||'').slice(0,45) || 'Empty embed';
      case 'add_role': case 'remove_role': case 'toggle_role': {
        const r = _roles.find(x => x.id === d.role_id);
        return r ? r.name : (d.role_id ? 'Unknown role' : 'Select a role');
      }
      case 'add_reaction': return d.emoji || 'Select emoji';
      case 'give_coins': return `+${d.amount||0} coins`;
      case 'take_coins': return `-${d.amount||0} coins`;
      case 'give_xp': return `+${d.amount||0} XP`;
      case 'take_xp': return `-${d.amount||0} XP`;
      case 'set_variable': return d.var_name ? `{${d.var_name}} = ${d.value||''}` : 'Configure variable';
      case 'condition_if': return d.condition_type || 'Set condition type';
      case 'stop_if': return 'Guard: ' + (d.condition_type||'set type');
      case 'delay': return `Wait ${d.ms||1000}ms`;
      case 'timeout_user': return `Timeout ${d.duration_min||10}min`;
      case 'warn_user': return (d.reason||'').slice(0,40) || 'Set reason';
      case 'math': return d.expression ? `${d.expression.slice(0,30)} → {${d.store_as||'result'}}` : 'Configure';
      default: return '';
    }
  }

  // ── Wire block inputs ─────────────────────────────────────────
  function wireBlockInputs(id, type) {
    const reg = REGISTRY[type]; if (!reg) return;
    const summarize = () => {
      const s = el(`cb-b-summary-${id}`);
      if (s) s.textContent = buildBlockSummary(_blocks.find(b=>b.id===id)||{data:{}});
      markDirty();
    };

    // Wire selects that have showIf deps to rebuild the body
    const selectsWithDeps = (reg.fields||[]).filter(f => f.type === 'select' &&
      (reg.fields||[]).some(g => g.showIf?.key === f.key));
    for (const field of selectsWithDeps) {
      el(`cb-f-${id}-${field.key}`)?.addEventListener('change', () => { collectBlockData(id); renderAllBlocks(); });
    }

    // General inputs
    for (const field of reg.fields||[]) {
      const domEl = el(`cb-f-${id}-${field.key}`); if (!domEl) continue;
      const ev = (field.type==='toggle'||field.type==='select'||field.type==='role'||field.type==='channel') ? 'change' : 'input';
      domEl.addEventListener(ev, summarize);
    }

    // Embed fields
    el(`cb-f-${id}-addfield`)?.addEventListener('click', () => {
      const b = _blocks.find(x => x.id === id); if (!b) return;
      if (!Array.isArray(b.data.fields)) b.data.fields = [];
      if (b.data.fields.length >= 25) { showToast('Maximum 25 fields.', 'warning'); return; }
      b.data.fields.push({ name:'', value:'', inline:false }); renderAllBlocks(); markDirty();
    });
    el(`cb-f-${id}-fields`)?.addEventListener('click', e => {
      const btn = e.target.closest('.cb-embed-field-remove'); if (!btn) return;
      const b = _blocks.find(x => x.id === id); if (!b||!Array.isArray(b.data.fields)) return;
      b.data.fields.splice(parseInt(btn.dataset.fieldIdx), 1); renderAllBlocks(); markDirty();
    });

    // Modal fields
    el(`cb-f-${id}-addmodalfield`)?.addEventListener('click', () => {
      const b = _blocks.find(x => x.id === id); if (!b) return;
      if (!Array.isArray(b.data.fields)) b.data.fields = [];
      if (b.data.fields.length >= 5) { showToast('Maximum 5 modal inputs.', 'warning'); return; }
      b.data.fields.push({ label:'', style:'short', required:false }); renderAllBlocks(); markDirty();
    });
    el(`cb-f-${id}-mfields`)?.addEventListener('click', e => {
      const btn = e.target.closest('.cb-modal-field-remove'); if (!btn) return;
      const b = _blocks.find(x => x.id === id); if (!b||!Array.isArray(b.data.fields)) return;
      b.data.fields.splice(parseInt(btn.dataset.fieldIdx), 1); renderAllBlocks(); markDirty();
    });

    // Buttons
    el(`cb-f-${id}-addbtn`)?.addEventListener('click', () => {
      const b = _blocks.find(x => x.id === id); if (!b) return;
      if (!Array.isArray(b.data.buttons)) b.data.buttons = [];
      if (b.data.buttons.length >= 5) { showToast('Maximum 5 buttons.', 'warning'); return; }
      b.data.buttons.push({ label:'', style:'Primary', customId:'' }); renderAllBlocks(); markDirty();
    });
    el(`cb-f-${id}-btnrows`)?.addEventListener('click', e => {
      const btn = e.target.closest('.cb-btn-remove'); if (!btn) return;
      const b = _blocks.find(x => x.id === id); if (!b||!Array.isArray(b.data.buttons)) return;
      b.data.buttons.splice(parseInt(btn.dataset.btnIdx), 1); renderAllBlocks(); markDirty();
    });

    // Select menu options
    el(`cb-f-${id}-addselopt`)?.addEventListener('click', () => {
      const b = _blocks.find(x => x.id === id); if (!b) return;
      if (!Array.isArray(b.data.options)) b.data.options = [];
      if (b.data.options.length >= 25) { showToast('Maximum 25 options.', 'warning'); return; }
      b.data.options.push({ label:'', value:'', description:'' }); renderAllBlocks(); markDirty();
    });
    el(`cb-f-${id}-selopts`)?.addEventListener('click', e => {
      const btn = e.target.closest('.cb-sel-remove'); if (!btn) return;
      const b = _blocks.find(x => x.id === id); if (!b||!Array.isArray(b.data.options)) return;
      b.data.options.splice(parseInt(btn.dataset.optIdx), 1); renderAllBlocks(); markDirty();
    });
  }

  // ── Collect block data from DOM ───────────────────────────────
  function collectBlockData(id) {
    const b = _blocks.find(x => x.id === id); if (!b) return;
    const reg = REGISTRY[b.type]; if (!reg) return;
    const val = k => el(`cb-f-${id}-${k}`)?.value ?? '';
    const chk = k => !!el(`cb-f-${id}-${k}`)?.checked;
    const num = (k, def=0) => parseFloat(el(`cb-f-${id}-${k}`)?.value)||def;

    for (const field of reg.fields||[]) {
      switch (field.type) {
        case 'toggle': b.data[field.key] = chk(field.key); break;
        case 'number': b.data[field.key] = num(field.key, field.min??0); break;
        case 'embed_fields': {
          const cont = el(`cb-f-${id}-fields`);
          if (cont) {
            const rows = cont.querySelectorAll('.cb-embed-field-row');
            b.data.fields = Array.from(rows).map((_,fi) => ({
              name: el(`cb-f-${id}-fn-${fi}`)?.value?.trim()||'',
              value: el(`cb-f-${id}-fv-${fi}`)?.value?.trim()||'',
              inline: !!el(`cb-f-${id}-fi-${fi}`)?.checked,
            })).filter(f=>f.name||f.value);
          }
          break;
        }
        case 'modal_fields': {
          const cont = el(`cb-f-${id}-mfields`);
          if (cont) {
            const rows = cont.querySelectorAll('.cb-modal-field-row');
            b.data.fields = Array.from(rows).map((_,fi) => ({
              label: el(`cb-f-${id}-mfl-${fi}`)?.value?.trim()||'',
              style: el(`cb-f-${id}-mfs-${fi}`)?.value||'short',
              required: !!el(`cb-f-${id}-mfr-${fi}`)?.checked,
            })).filter(f=>f.label);
          }
          break;
        }
        default: b.data[field.key] = val(field.key); break;
      }
    }
    if (b.type === 'send_buttons') {
      const cont = el(`cb-f-${id}-btnrows`);
      if (cont) {
        const rows = cont.querySelectorAll('.cb-btn-row-item');
        b.data.buttons = Array.from(rows).map((_,bi) => ({
          label: el(`cb-f-${id}-bl-${bi}`)?.value?.trim()||'',
          style: el(`cb-f-${id}-bs-${bi}`)?.value||'Primary',
          customId: el(`cb-f-${id}-bi-${bi}`)?.value?.trim()||'',
        })).filter(btn=>btn.label);
      }
    }
    if (b.type === 'send_select_menu') {
      const cont = el(`cb-f-${id}-selopts`);
      if (cont) {
        const rows = cont.querySelectorAll('.cb-select-option-row');
        b.data.options = Array.from(rows).map((_,oi) => ({
          label: el(`cb-f-${id}-sol-${oi}`)?.value?.trim()||'',
          value: el(`cb-f-${id}-sov-${oi}`)?.value?.trim()||'',
          description: el(`cb-f-${id}-sod-${oi}`)?.value?.trim()||'',
        })).filter(o=>o.label||o.value);
      }
    }
  }

  function collectAllBlocks() {
    _blocks.forEach(b => collectBlockData(b.id));
    return _blocks.map(b => ({ type: b.type, data: b.data }));
  }

  // ── Validation ────────────────────────────────────────────────
  function runValidation() {
    if (validateWorkflow(true)) showToast('Workflow looks valid!', 'success');
  }

  function validateWorkflow() {
    const name = el('cbCmdName')?.value?.trim().toLowerCase().replace(/\s+/g,'-')||'';
    const ttype = document.querySelector('.cb-tab--active')?.dataset.ttype||'slash';
    const trigger = el('cbTrigger')?.value?.trim()||'';
    const blocks = collectAllBlocks();

    if (!name) { showToast('Command name is required.', 'warning'); return false; }
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) { showToast('Name: 1-32 chars, lowercase a-z 0-9 _ -', 'warning'); return false; }
    if (!trigger) { showToast('Trigger/command text is required.', 'warning'); return false; }
    if (ttype==='slash' && !/^[a-z0-9_-]{1,32}$/.test(trigger)) { showToast('Slash names must be lowercase, no spaces.', 'warning'); return false; }
    if (ttype==='regex') { try { new RegExp(trigger); } catch { showToast('Invalid regex pattern.', 'warning'); return false; } }
    if (blocks.length===0) { showToast('Add at least one block.', 'warning'); return false; }
    if (blocks.length>50) { showToast('Maximum 50 blocks per command.', 'warning'); return false; }
    if (blocks.filter(b=>b.type==='condition_if').length>5) { showToast('Maximum 5 condition blocks.', 'warning'); return false; }

    for (const b of blocks) {
      if (!REGISTRY[b.type]) { showToast('Invalid block type: '+b.type, 'error'); return false; }
      const d = b.data||{};
      if (['reply','send_message','dm_user'].includes(b.type) && !d.content) { showToast(`"${REGISTRY[b.type].label}" is missing content.`, 'warning'); return false; }
      if (['add_role','remove_role','toggle_role'].includes(b.type) && !d.role_id) { showToast(`"${REGISTRY[b.type].label}" has no role.`, 'warning'); return false; }
      if (b.type==='send_embed' && !d.description && !d.title) { showToast('Embed needs title or description.', 'warning'); return false; }
      if (b.type==='add_reaction' && !d.emoji) { showToast('Reaction block missing emoji.', 'warning'); return false; }
      if (b.type==='set_variable') {
        if (!d.var_name) { showToast('Set Variable needs a name.', 'warning'); return false; }
        if (!/^[a-z0-9_]{1,32}$/i.test(d.var_name)) { showToast('Variable names: alphanumeric+underscore, max 32.', 'warning'); return false; }
      }
      if (b.type==='send_embed') {
        for (const urlF of ['thumbnail','image','url']) {
          if (d[urlF] && !/^https?:\/\//i.test(d[urlF])) { showToast(`Embed ${urlF} must be https://`, 'warning'); return false; }
        }
      }
    }
    return true;
  }

  // ── Save ──────────────────────────────────────────────────────
  async function handleSave() {
    if (_saving) return;
    const blocks = collectAllBlocks();
    if (!validateWorkflow()) return;
    const name = el('cbCmdName')?.value?.trim().toLowerCase().replace(/\s+/g,'-')||'';
    const ttype = document.querySelector('.cb-tab--active')?.dataset.ttype||'slash';

    _saving = true;
    const saveBtn = el('cbSaveBtn'); if (saveBtn) saveBtn.disabled = true;

    const body = {
      name,
      trigger: el('cbTrigger')?.value?.trim()||'',
      triggerType: ttype,
      description: el('cbDescription')?.value?.trim()||'',
      cooldownSeconds: Math.max(0, Math.min(86400, parseInt(el('cbCooldown')?.value)||0)),
      allowedRoles: [..._selectedRoles], allowedChannels: [..._selectedChannels],
      caseSensitive: !!el('cbCaseSensitive')?.checked,
      deleteUserMessage: !!el('cbDeleteTrigger')?.checked,
      enabled: el('cbEnabled')?.checked !== false,
      blocks,
    };

    try {
      const url = _cmdId ? `/api/guild/${_guildId}/custom-commands/${_cmdId}` : `/api/guild/${_guildId}/custom-commands`;
      const res = await fetch(url, { method: _cmdId?'PATCH':'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      if (!_cmdId && data._id) {
        _cmdId = data._id;
        window.history?.replaceState({}, '', `/dashboard/${_guildId}/custom-commands/builder/${data._id}`);
      }
      markClean(); showToast('Command saved!', 'success');
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      _saving = false; if (saveBtn) saveBtn.disabled = false;
    }
  }

  function showUnsavedModal() { el('cbUnsavedModal').style.display = ''; }
  function hideUnsavedModal() { el('cbUnsavedModal').style.display = 'none'; }

})();
