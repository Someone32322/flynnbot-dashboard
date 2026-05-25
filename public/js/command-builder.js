/* ═══════════════════════════════════════════════════════════════════
   command-builder.js — Professional Command Builder v3
   Complete IIFE. No eval(), no new Function().
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Server data ──────────────────────────────────────────────── */
  const _srv = JSON.parse(document.getElementById('cb-server-data').textContent || '{}');
  const GUILD_ID = _srv.guildId;

  /* ── Constants ────────────────────────────────────────────────── */
  const MAX_BLOCKS = 100;
  const MAX_UNDO   = 50;
  const AUTOSAVE_MS = 2500;

  /* ══════════════════════════════════════════════════════════════
     BLOCK DEFINITIONS
  ══════════════════════════════════════════════════════════════ */
  const BLOCK_CATEGORIES = [
    { key: 'response',  label: 'Response',  color: '#5865f2', icon: '💬' },
    { key: 'flow',      label: 'Flow',      color: '#fee75c', icon: '🔀' },
    { key: 'variables', label: 'Variables', color: '#57f287', icon: '📦' },
    { key: 'storage',   label: 'Storage',   color: '#43b581', icon: '💾' },
    { key: 'member',    label: 'Member',    color: '#f04747', icon: '👤' },
    { key: 'channel',   label: 'Channel',   color: '#4fdc7c', icon: '#️⃣' },
    { key: 'leveling',  label: 'Leveling',  color: '#43b581', icon: '⭐' },
    { key: 'lookup',    label: 'Lookup',    color: '#7289da', icon: '🔍' },
    { key: 'utility',   label: 'Utility',   color: '#99aab5', icon: '🔧' },
  ];

  /* Schema field types:
     text, textarea, number, toggle, select, role_picker, channel_picker,
     embed_list, button_list, select_options, variable, json_code, tags
  */
  const BLOCK_DEFS = {
    /* ── RESPONSE ─────────────────────────────────────────── */
    reply: {
      category: 'response', label: 'Reply', icon: '↩️', color: '#5865f2',
      description: 'Reply to the user who triggered the command',
      schema: {
        content:    { type: 'textarea', label: 'Message Content', placeholder: 'Hello {user}!', hint: 'Supports {variables}' },
        embeds:     { type: 'embed_list', label: 'Embeds' },
        ephemeral:  { type: 'toggle', label: 'Ephemeral (only visible to sender)', slashOnly: true },
        tts:        { type: 'toggle', label: 'Text to Speech' },
        components: { type: 'button_list', label: 'Buttons / Components' },
      },
    },
    edit_reply: {
      category: 'response', label: 'Edit Reply', icon: '✏️', color: '#5865f2',
      description: 'Edit the original reply after sending',
      schema: {
        content: { type: 'textarea', label: 'New Content', placeholder: 'Updated reply...' },
        embeds:  { type: 'embed_list', label: 'Embeds' },
      },
    },
    followup: {
      category: 'response', label: 'Follow-up', icon: '➕', color: '#5865f2',
      description: 'Send an additional message after the initial reply',
      schema: {
        content:   { type: 'textarea', label: 'Message Content', placeholder: 'Follow-up message...' },
        embeds:    { type: 'embed_list', label: 'Embeds' },
        ephemeral: { type: 'toggle', label: 'Ephemeral', slashOnly: true },
      },
    },
    delete_reply: {
      category: 'response', label: 'Delete Reply', icon: '🗑️', color: '#5865f2',
      description: 'Delete the original reply message',
      schema: {},
    },
    send_message: {
      category: 'response', label: 'Send Message', icon: '📨', color: '#5865f2',
      description: 'Send a message to a specified channel',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Target Channel', placeholder: '{channel.id} or ID or #name' },
        content:    { type: 'textarea', label: 'Message Content', placeholder: 'Hello, {server}!' },
        embeds:     { type: 'embed_list', label: 'Embeds' },
        components: { type: 'button_list', label: 'Buttons' },
      },
    },
    send_embed: {
      category: 'response', label: 'Send Embed', icon: '🎨', color: '#5865f2',
      description: 'Send a rich embed message',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Target Channel', placeholder: 'Leave empty to reply in current channel' },
        embeds:     { type: 'embed_list', label: 'Embeds', required: true },
        reply:      { type: 'toggle', label: 'Reply in current channel' },
      },
    },
    send_dm: {
      category: 'response', label: 'Send DM', icon: '📩', color: '#5865f2',
      description: 'Send a direct message to a user',
      schema: {
        user_id: { type: 'text', label: 'User ID or Variable', placeholder: '{user.id}' },
        content: { type: 'textarea', label: 'Message Content', placeholder: 'Private message...' },
        embeds:  { type: 'embed_list', label: 'Embeds' },
      },
    },
    send_buttons: {
      category: 'response', label: 'Send Buttons', icon: '🔘', color: '#5865f2',
      description: 'Send a message with interactive buttons',
      schema: {
        content:    { type: 'textarea', label: 'Message Content' },
        components: { type: 'button_list', label: 'Buttons', required: true },
        reply:      { type: 'toggle', label: 'Reply to trigger message' },
      },
    },
    send_select: {
      category: 'response', label: 'Send Select Menu', icon: '📋', color: '#5865f2',
      description: 'Send a message with a select dropdown',
      schema: {
        content:     { type: 'textarea', label: 'Message Content' },
        placeholder: { type: 'text', label: 'Dropdown placeholder', placeholder: 'Select an option...' },
        options:     { type: 'select_options', label: 'Select Options', required: true },
        custom_id:   { type: 'text', label: 'Custom ID', placeholder: 'my-select-menu', required: true },
        reply:       { type: 'toggle', label: 'Reply to trigger message' },
      },
    },
    open_modal: {
      category: 'response', label: 'Open Modal', icon: '📝', color: '#5865f2',
      description: 'Open a modal dialog (slash and button triggers only)',
      schema: {
        custom_id: { type: 'text', label: 'Modal Custom ID', required: true, placeholder: 'my-modal' },
        title:     { type: 'text', label: 'Modal Title', required: true, placeholder: 'Enter information', maxlength: 45 },
        fields:    { type: 'modal_fields', label: 'Input Fields' },
      },
    },
    edit_message: {
      category: 'response', label: 'Edit Message', icon: '📝', color: '#5865f2',
      description: 'Edit an existing message in a channel',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel', placeholder: '{channel.id}' },
        message_id: { type: 'text', label: 'Message ID', required: true, placeholder: '{message.id}' },
        content:    { type: 'textarea', label: 'New Content' },
        embeds:     { type: 'embed_list', label: 'Embeds' },
      },
    },
    delete_message: {
      category: 'response', label: 'Delete Message', icon: '🗑️', color: '#f04747',
      description: 'Delete a specific message',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel', placeholder: '{channel.id}' },
        message_id: { type: 'text', label: 'Message ID', required: true, placeholder: '{message.id}' },
      },
    },
    pin_message: {
      category: 'response', label: 'Pin Message', icon: '📌', color: '#5865f2',
      description: 'Pin a message in a channel',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel', placeholder: '{channel.id}' },
        message_id: { type: 'text', label: 'Message ID', required: true, placeholder: '{message.id}' },
      },
    },
    add_reaction: {
      category: 'response', label: 'Add Reaction', icon: '😀', color: '#5865f2',
      description: 'Add an emoji reaction to a message',
      schema: {
        emoji:      { type: 'text', label: 'Emoji', required: true, placeholder: '👍 or custom emoji ID' },
        message_id: { type: 'text', label: 'Message ID (leave empty for trigger message)', placeholder: '{message.id}' },
      },
    },

    /* ── FLOW ─────────────────────────────────────────────── */
    condition: {
      category: 'flow', label: 'Condition (If/Else)', icon: '🔀', color: '#fee75c',
      description: 'Branch execution based on a condition',
      schema: {
        left:     { type: 'text', label: 'Left Value', required: true, placeholder: '{var.count}' },
        operator: { type: 'select', label: 'Operator', required: true, options: [
          { value: 'equals', label: 'equals' }, { value: 'not_equals', label: 'not equals' },
          { value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'not contains' },
          { value: 'starts_with', label: 'starts with' }, { value: 'ends_with', label: 'ends with' },
          { value: 'greater', label: '>' }, { value: 'greater_eq', label: '>=' },
          { value: 'less', label: '<' }, { value: 'less_eq', label: '<=' },
          { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
        ]},
        right:     { type: 'text', label: 'Right Value', placeholder: '5' },
        true_blocks:  { type: 'nested_blocks', label: 'Then (blocks if true)', _nested: 'true' },
        false_blocks: { type: 'nested_blocks', label: 'Else (blocks if false)', _nested: 'false' },
      },
    },
    stop_if: {
      category: 'flow', label: 'Stop If', icon: '🛑', color: '#fee75c',
      description: 'Stop execution if a condition is met',
      schema: {
        left:     { type: 'text', label: 'Left Value', required: true, placeholder: '{user.id}' },
        operator: { type: 'select', label: 'Operator', required: true, options: [
          { value: 'equals', label: 'equals' }, { value: 'not_equals', label: 'not equals' },
          { value: 'is_empty', label: 'is empty' }, { value: 'is_not_empty', label: 'is not empty' },
          { value: 'contains', label: 'contains' }, { value: 'greater', label: '>' }, { value: 'less', label: '<' },
        ]},
        right:   { type: 'text', label: 'Right Value', placeholder: 'value' },
        message: { type: 'text', label: 'Error Message (optional)', placeholder: 'You cannot use this command.' },
      },
    },
    stop: {
      category: 'flow', label: 'Stop', icon: '⛔', color: '#f04747',
      description: 'Immediately stop command execution',
      schema: {
        message: { type: 'text', label: 'Stop Message (optional)', placeholder: '' },
      },
    },
    loop: {
      category: 'flow', label: 'Loop', icon: '🔁', color: '#fee75c',
      description: 'Repeat a set of blocks N times',
      schema: {
        count:       { type: 'text', label: 'Repeat Count', required: true, placeholder: '5 or {var.count}' },
        iterator_var: { type: 'text', label: 'Iterator Variable Name', placeholder: 'i' },
        blocks:      { type: 'nested_blocks', label: 'Blocks to Repeat', _nested: 'loop' },
      },
    },
    for_each: {
      category: 'flow', label: 'For Each', icon: '📑', color: '#fee75c',
      description: 'Loop over each item in a list variable',
      schema: {
        list_var:  { type: 'text', label: 'List Variable', required: true, placeholder: '{var.myList}' },
        item_var:  { type: 'text', label: 'Item Variable Name', required: true, placeholder: 'item' },
        blocks:    { type: 'nested_blocks', label: 'Blocks per Item', _nested: 'forEach' },
      },
    },
    try_catch: {
      category: 'flow', label: 'Try / Catch', icon: '🪤', color: '#fee75c',
      description: 'Attempt blocks and handle errors',
      schema: {
        try_blocks:   { type: 'nested_blocks', label: 'Try Blocks', _nested: 'try' },
        catch_blocks: { type: 'nested_blocks', label: 'Catch Blocks (error available as {error})', _nested: 'catch' },
      },
    },
    run_command: {
      category: 'flow', label: 'Run Command', icon: '⚡', color: '#fee75c',
      description: 'Execute another custom command by name',
      schema: {
        command_name: { type: 'text', label: 'Command Name', required: true, placeholder: 'my-other-command' },
      },
    },

    /* ── VARIABLES ────────────────────────────────────────── */
    set_var: {
      category: 'variables', label: 'Set Variable', icon: '📦', color: '#57f287',
      description: 'Set a runtime variable to a value',
      schema: {
        name:  { type: 'text', label: 'Variable Name', required: true, placeholder: 'count', hint: 'Accessible as {var.count}' },
        value: { type: 'text', label: 'Value', required: true, placeholder: '5 or {user.name}' },
      },
    },
    math: {
      category: 'variables', label: 'Math Operation', icon: '🔢', color: '#57f287',
      description: 'Perform a math operation and store result',
      schema: {
        result_var: { type: 'text', label: 'Result Variable', required: true, placeholder: 'total' },
        left:       { type: 'text', label: 'Left Value', required: true, placeholder: '{var.count}' },
        operator:   { type: 'select', label: 'Operation', required: true, options: [
          { value: '+', label: 'Add (+)' }, { value: '-', label: 'Subtract (-)' },
          { value: '*', label: 'Multiply (×)' }, { value: '/', label: 'Divide (÷)' },
          { value: '%', label: 'Modulo (%)' }, { value: 'max', label: 'Maximum' }, { value: 'min', label: 'Minimum' },
        ]},
        right:      { type: 'text', label: 'Right Value', required: true, placeholder: '1' },
      },
    },
    format_text: {
      category: 'variables', label: 'Format Text', icon: '🔤', color: '#57f287',
      description: 'Format or transform text and store result',
      schema: {
        result_var: { type: 'text', label: 'Result Variable', required: true, placeholder: 'formatted' },
        input:      { type: 'text', label: 'Input', required: true, placeholder: '{var.text}' },
        transform:  { type: 'select', label: 'Transform', required: true, options: [
          { value: 'uppercase', label: 'UPPERCASE' }, { value: 'lowercase', label: 'lowercase' },
          { value: 'capitalize', label: 'Capitalize First' }, { value: 'trim', label: 'Trim whitespace' },
          { value: 'length', label: 'String length' }, { value: 'reverse', label: 'Reverse' },
          { value: 'slice', label: 'Slice (start/end)' }, { value: 'replace', label: 'Replace' },
        ]},
        arg1: { type: 'text', label: 'Arg 1 (for slice: start, replace: search)', placeholder: '0' },
        arg2: { type: 'text', label: 'Arg 2 (for slice: end, replace: replacement)', placeholder: '10' },
      },
    },
    random_number: {
      category: 'variables', label: 'Random Number', icon: '🎲', color: '#57f287',
      description: 'Generate a random integer between min and max',
      schema: {
        result_var: { type: 'text', label: 'Result Variable', required: true, placeholder: 'roll' },
        min:        { type: 'number', label: 'Min', placeholder: '1' },
        max:        { type: 'number', label: 'Max', required: true, placeholder: '100' },
      },
    },
    random_choice: {
      category: 'variables', label: 'Random Choice', icon: '🎯', color: '#57f287',
      description: 'Pick a random item from a list',
      schema: {
        result_var: { type: 'text', label: 'Result Variable', required: true, placeholder: 'chosen' },
        choices:    { type: 'tags', label: 'Choices (comma-separated)', placeholder: 'option1, option2, option3' },
      },
    },
    list_push: {
      category: 'variables', label: 'List Push', icon: '➕', color: '#57f287',
      description: 'Append a value to a list variable',
      schema: {
        list_var: { type: 'text', label: 'List Variable', required: true, placeholder: 'myList' },
        value:    { type: 'text', label: 'Value to Append', required: true, placeholder: '{user.id}' },
      },
    },
    list_pop: {
      category: 'variables', label: 'List Pop', icon: '➖', color: '#57f287',
      description: 'Remove and return the last item from a list',
      schema: {
        list_var:   { type: 'text', label: 'List Variable', required: true, placeholder: 'myList' },
        result_var: { type: 'text', label: 'Store Result In', placeholder: 'popped' },
      },
    },
    list_get: {
      category: 'variables', label: 'List Get', icon: '📋', color: '#57f287',
      description: 'Get an item from a list by index',
      schema: {
        list_var:   { type: 'text', label: 'List Variable', required: true, placeholder: 'myList' },
        index:      { type: 'text', label: 'Index', required: true, placeholder: '0' },
        result_var: { type: 'text', label: 'Store Result In', required: true, placeholder: 'item' },
      },
    },
    list_length: {
      category: 'variables', label: 'List Length', icon: '🔢', color: '#57f287',
      description: 'Get the count of items in a list',
      schema: {
        list_var:   { type: 'text', label: 'List Variable', required: true, placeholder: 'myList' },
        result_var: { type: 'text', label: 'Store Result In', required: true, placeholder: 'count' },
      },
    },
    list_contains: {
      category: 'variables', label: 'List Contains', icon: '🔍', color: '#57f287',
      description: 'Check if list contains a value, store boolean',
      schema: {
        list_var:   { type: 'text', label: 'List Variable', required: true, placeholder: 'myList' },
        value:      { type: 'text', label: 'Value to Search', required: true, placeholder: '{user.id}' },
        result_var: { type: 'text', label: 'Store Result In (true/false)', required: true, placeholder: 'found' },
      },
    },
    list_join: {
      category: 'variables', label: 'List Join', icon: '🔗', color: '#57f287',
      description: 'Join list items into a single string',
      schema: {
        list_var:   { type: 'text', label: 'List Variable', required: true, placeholder: 'myList' },
        separator:  { type: 'text', label: 'Separator', placeholder: ', ' },
        result_var: { type: 'text', label: 'Store Result In', required: true, placeholder: 'joined' },
      },
    },
    list_clear: {
      category: 'variables', label: 'List Clear', icon: '🗑️', color: '#57f287',
      description: 'Remove all items from a list variable',
      schema: {
        list_var: { type: 'text', label: 'List Variable', required: true, placeholder: 'myList' },
      },
    },

    /* ── STORAGE ──────────────────────────────────────────── */
    save_var: {
      category: 'storage', label: 'Save to DB', icon: '💾', color: '#43b581',
      description: 'Persist a variable to the database',
      schema: {
        key:       { type: 'text', label: 'Storage Key (reference name)', required: true, placeholder: 'myVar' },
        value:     { type: 'text', label: 'Value', required: true, placeholder: '{var.count}' },
        scope:     { type: 'select', label: 'Scope', options: [
          { value: 'guild', label: 'Server-wide' }, { value: 'user', label: 'Per User' },
          { value: 'channel', label: 'Per Channel' },
        ]},
      },
    },
    load_var: {
      category: 'storage', label: 'Load from DB', icon: '📂', color: '#43b581',
      description: 'Load a stored variable from the database',
      schema: {
        key:        { type: 'text', label: 'Storage Key', required: true, placeholder: 'myVar' },
        result_var: { type: 'text', label: 'Store In Variable', required: true, placeholder: 'loaded', hint: 'Accessible as {var.loaded}' },
        scope:      { type: 'select', label: 'Scope', options: [
          { value: 'guild', label: 'Server-wide' }, { value: 'user', label: 'Per User' },
          { value: 'channel', label: 'Per Channel' },
        ]},
        default_val: { type: 'text', label: 'Default if not found', placeholder: '0' },
      },
    },
    delete_stored_var: {
      category: 'storage', label: 'Delete Stored', icon: '🗑️', color: '#43b581',
      description: 'Delete a stored variable from the database',
      schema: {
        key:   { type: 'text', label: 'Storage Key', required: true, placeholder: 'myVar' },
        scope: { type: 'select', label: 'Scope', options: [
          { value: 'guild', label: 'Server-wide' }, { value: 'user', label: 'Per User' },
          { value: 'channel', label: 'Per Channel' },
        ]},
      },
    },
    increment_var: {
      category: 'storage', label: 'Increment Stored', icon: '➕', color: '#43b581',
      description: 'Atomically increment or decrement a stored number',
      schema: {
        key:    { type: 'text', label: 'Storage Key', required: true, placeholder: 'counter' },
        amount: { type: 'text', label: 'Amount (+/-)', required: true, placeholder: '1' },
        scope:  { type: 'select', label: 'Scope', options: [
          { value: 'guild', label: 'Server-wide' }, { value: 'user', label: 'Per User' },
        ]},
        result_var: { type: 'text', label: 'Store new value in', placeholder: 'newCount' },
      },
    },

    /* ── MEMBER ───────────────────────────────────────────── */
    add_role: {
      category: 'member', label: 'Add Role', icon: '➕', color: '#f04747',
      description: 'Add a role to a member',
      schema: {
        user_id: { type: 'text', label: 'User ID', placeholder: '{user.id}' },
        role_id: { type: 'role_picker', label: 'Role', required: true, placeholder: 'Select role...' },
        reason:  { type: 'text', label: 'Reason', placeholder: 'Role granted by bot' },
      },
    },
    remove_role: {
      category: 'member', label: 'Remove Role', icon: '➖', color: '#f04747',
      description: 'Remove a role from a member',
      schema: {
        user_id: { type: 'text', label: 'User ID', placeholder: '{user.id}' },
        role_id: { type: 'role_picker', label: 'Role', required: true, placeholder: 'Select role...' },
        reason:  { type: 'text', label: 'Reason', placeholder: 'Role removed by bot' },
      },
    },
    toggle_role: {
      category: 'member', label: 'Toggle Role', icon: '🔄', color: '#f04747',
      description: 'Add the role if user doesn\'t have it, remove if they do',
      schema: {
        user_id: { type: 'text', label: 'User ID', placeholder: '{user.id}' },
        role_id: { type: 'role_picker', label: 'Role', required: true, placeholder: 'Select role...' },
        result_var: { type: 'text', label: 'Store action (added/removed)', placeholder: 'roleAction' },
      },
    },
    kick: {
      category: 'member', label: 'Kick', icon: '👢', color: '#f04747',
      description: 'Kick a member from the server',
      schema: {
        user_id: { type: 'text', label: 'User ID', required: true, placeholder: '{user.id}' },
        reason:  { type: 'text', label: 'Reason', placeholder: 'Kicked via custom command' },
      },
    },
    ban: {
      category: 'member', label: 'Ban', icon: '🔨', color: '#f04747',
      description: 'Ban a user from the server',
      schema: {
        user_id:     { type: 'text', label: 'User ID', required: true, placeholder: '{user.id}' },
        reason:      { type: 'text', label: 'Reason', placeholder: 'Banned via custom command' },
        delete_days: { type: 'number', label: 'Delete Message Days', placeholder: '0' },
      },
    },
    timeout: {
      category: 'member', label: 'Timeout', icon: '⏱️', color: '#f04747',
      description: 'Timeout a member for a duration',
      schema: {
        user_id:   { type: 'text', label: 'User ID', required: true, placeholder: '{user.id}' },
        duration:  { type: 'text', label: 'Duration', required: true, placeholder: '10m (s/m/h/d)' },
        reason:    { type: 'text', label: 'Reason', placeholder: 'Timed out via custom command' },
      },
    },
    unmute: {
      category: 'member', label: 'Remove Timeout', icon: '🔓', color: '#57f287',
      description: 'Remove timeout from a member',
      schema: {
        user_id: { type: 'text', label: 'User ID', required: true, placeholder: '{user.id}' },
        reason:  { type: 'text', label: 'Reason', placeholder: '' },
      },
    },
    warn: {
      category: 'member', label: 'Warn', icon: '⚠️', color: '#f04747',
      description: 'Add a warning to a member',
      schema: {
        user_id: { type: 'text', label: 'User ID', required: true, placeholder: '{user.id}' },
        reason:  { type: 'text', label: 'Reason', required: true, placeholder: 'Warning reason' },
        notify:  { type: 'toggle', label: 'Notify user via DM' },
      },
    },
    set_nickname: {
      category: 'member', label: 'Set Nickname', icon: '🏷️', color: '#f04747',
      description: 'Change a member\'s server nickname',
      schema: {
        user_id:  { type: 'text', label: 'User ID', placeholder: '{user.id}' },
        nickname: { type: 'text', label: 'New Nickname', placeholder: 'Leave empty to reset' },
      },
    },

    /* ── CHANNEL ──────────────────────────────────────────── */
    lock_channel: {
      category: 'channel', label: 'Lock Channel', icon: '🔒', color: '#4fdc7c',
      description: 'Prevent @everyone from sending messages',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel (default: current)', placeholder: '{channel.id}' },
        reason:     { type: 'text', label: 'Reason', placeholder: '' },
      },
    },
    unlock_channel: {
      category: 'channel', label: 'Unlock Channel', icon: '🔓', color: '#4fdc7c',
      description: 'Allow @everyone to send messages again',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel (default: current)', placeholder: '{channel.id}' },
        reason:     { type: 'text', label: 'Reason', placeholder: '' },
      },
    },
    set_slowmode: {
      category: 'channel', label: 'Set Slowmode', icon: '🐢', color: '#4fdc7c',
      description: 'Set or remove slowmode in a channel',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel (default: current)', placeholder: '' },
        seconds:    { type: 'number', label: 'Seconds (0 to disable)', required: true, placeholder: '5' },
      },
    },
    set_topic: {
      category: 'channel', label: 'Set Topic', icon: '📌', color: '#4fdc7c',
      description: 'Update the channel topic',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel (default: current)', placeholder: '' },
        topic:      { type: 'text', label: 'New Topic', required: true, placeholder: 'Channel topic...' },
      },
    },
    purge: {
      category: 'channel', label: 'Purge Messages', icon: '🧹', color: '#f04747',
      description: 'Bulk delete messages from a channel',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Channel (default: current)', placeholder: '' },
        amount:     { type: 'number', label: 'Count (1–100)', required: true, placeholder: '10' },
        filter:     { type: 'select', label: 'Filter', options: [
          { value: 'all', label: 'All messages' }, { value: 'bots', label: 'Bot messages only' },
          { value: 'user', label: 'Trigger user only' },
        ]},
      },
    },
    create_thread: {
      category: 'channel', label: 'Create Thread', icon: '🧵', color: '#4fdc7c',
      description: 'Create a new thread in a channel',
      schema: {
        name:       { type: 'text', label: 'Thread Name', required: true, placeholder: 'Discussion: {var.topic}' },
        channel_id: { type: 'channel_picker', label: 'Parent Channel (default: current)', placeholder: '' },
        auto_archive: { type: 'select', label: 'Auto Archive', options: [
          { value: '60', label: '1 hour' }, { value: '1440', label: '1 day' },
          { value: '4320', label: '3 days' }, { value: '10080', label: '1 week' },
        ]},
        result_var: { type: 'text', label: 'Store Thread ID in', placeholder: 'threadId' },
      },
    },
    log: {
      category: 'channel', label: 'Log', icon: '📋', color: '#4fdc7c',
      description: 'Send a log message to a specific channel',
      schema: {
        channel_id: { type: 'channel_picker', label: 'Log Channel', required: true, placeholder: '' },
        content:    { type: 'textarea', label: 'Log Message', required: true, placeholder: 'User {user} ran command...' },
        embeds:     { type: 'embed_list', label: 'Embed (optional)' },
      },
    },

    /* ── LEVELING ─────────────────────────────────────────── */
    give_xp: {
      category: 'leveling', label: 'Give XP', icon: '⭐', color: '#43b581',
      description: 'Grant XP to a user',
      schema: {
        user_id: { type: 'text', label: 'User ID', placeholder: '{user.id}' },
        amount:  { type: 'text', label: 'XP Amount', required: true, placeholder: '100' },
      },
    },
    take_xp: {
      category: 'leveling', label: 'Take XP', icon: '⬇️', color: '#43b581',
      description: 'Remove XP from a user',
      schema: {
        user_id: { type: 'text', label: 'User ID', placeholder: '{user.id}' },
        amount:  { type: 'text', label: 'XP Amount', required: true, placeholder: '50' },
      },
    },
    get_level: {
      category: 'leveling', label: 'Get Level', icon: '📊', color: '#43b581',
      description: 'Get a user\'s level and XP into variables',
      schema: {
        user_id:      { type: 'text', label: 'User ID', placeholder: '{user.id}' },
        level_var:    { type: 'text', label: 'Store Level In', placeholder: 'level' },
        xp_var:       { type: 'text', label: 'Store XP In', placeholder: 'xp' },
      },
    },

    /* ── LOOKUP ───────────────────────────────────────────── */
    get_member: {
      category: 'lookup', label: 'Get Member', icon: '👤', color: '#7289da',
      description: 'Fetch member data into variables',
      schema: {
        user_id:    { type: 'text', label: 'User ID', required: true, placeholder: '{option.user}' },
        result_var: { type: 'text', label: 'Store Member Object In', required: true, placeholder: 'target', hint: 'Accessible as {var.target.name}, {var.target.id} etc.' },
      },
    },
    get_user: {
      category: 'lookup', label: 'Get User', icon: '🧑', color: '#7289da',
      description: 'Fetch user data by ID (no guild required)',
      schema: {
        user_id:    { type: 'text', label: 'User ID', required: true, placeholder: '{option.user}' },
        result_var: { type: 'text', label: 'Store In', required: true, placeholder: 'fetchedUser' },
      },
    },
    random_member: {
      category: 'lookup', label: 'Random Member', icon: '🎲', color: '#7289da',
      description: 'Pick a random online or all member',
      schema: {
        filter:     { type: 'select', label: 'Filter', options: [
          { value: 'all', label: 'All members' }, { value: 'online', label: 'Online only' }, { value: 'human', label: 'Non-bots' },
        ]},
        result_var: { type: 'text', label: 'Store Member In', required: true, placeholder: 'randomUser' },
      },
    },

    /* ── UTILITY ──────────────────────────────────────────── */
    delay: {
      category: 'utility', label: 'Delay', icon: '⏳', color: '#99aab5',
      description: 'Wait before continuing (max 30s)',
      schema: {
        ms: { type: 'number', label: 'Delay (milliseconds)', required: true, placeholder: '1000' },
      },
    },
    http_request: {
      category: 'utility', label: 'HTTP Request', icon: '🌐', color: '#99aab5',
      description: 'Make an outbound HTTP request and store the response',
      schema: {
        method:     { type: 'select', label: 'Method', options: [
          { value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' }, { value: 'PATCH', label: 'PATCH' }, { value: 'DELETE', label: 'DELETE' },
        ]},
        url:        { type: 'text', label: 'URL', required: true, placeholder: 'https://api.example.com/data' },
        body:       { type: 'textarea', label: 'Request Body (JSON)', placeholder: '{"key": "{var.value}"}' },
        result_var: { type: 'text', label: 'Store Response In', placeholder: 'response', hint: 'Body accessible as {var.response.field}' },
        headers:    { type: 'textarea', label: 'Headers (JSON)', placeholder: '{"Authorization": "Bearer token"}' },
      },
    },
    number_format: {
      category: 'utility', label: 'Number Format', icon: '🔢', color: '#99aab5',
      description: 'Format a number with commas or decimals',
      schema: {
        input:      { type: 'text', label: 'Number', required: true, placeholder: '{var.coins}' },
        result_var: { type: 'text', label: 'Store Result In', required: true, placeholder: 'formatted' },
        decimals:   { type: 'number', label: 'Decimal Places', placeholder: '0' },
        style:      { type: 'select', label: 'Style', options: [
          { value: 'decimal', label: 'Decimal (1,234.56)' }, { value: 'currency', label: 'Currency ($1,234.56)' },
          { value: 'compact', label: 'Compact (1.2K)' },
        ]},
      },
    },
    await_message: {
      category: 'utility', label: 'Await Message', icon: '⏰', color: '#99aab5',
      description: 'Wait for the user to send a message (max 60s)',
      schema: {
        timeout_ms: { type: 'number', label: 'Timeout (ms)', placeholder: '30000' },
        result_var: { type: 'text', label: 'Store Message Content In', required: true, placeholder: 'userInput' },
        timeout_blocks: { type: 'nested_blocks', label: 'Blocks if timeout', _nested: 'timeout' },
      },
    },
    await_button: {
      category: 'utility', label: 'Await Button', icon: '🖱️', color: '#99aab5',
      description: 'Wait for user to click a button (max 60s)',
      schema: {
        timeout_ms:  { type: 'number', label: 'Timeout (ms)', placeholder: '30000' },
        result_var:  { type: 'text', label: 'Store Clicked Button ID In', required: true, placeholder: 'clickedId' },
        timeout_blocks: { type: 'nested_blocks', label: 'Blocks if timeout', _nested: 'timeout' },
      },
    },
  };
  /* ══════════════════════════════════════════════════════════════
     TRIGGER TYPES
  ══════════════════════════════════════════════════════════════ */
  const TRIGGER_CONFIGS = {
    slash: {
      label: 'Slash Command', icon: '/', badgeClass: 'cb-type-slash',
      description: 'Triggered when user types /commandname',
      fields: [
        { key: 'value', type: 'text', label: 'Command Name', required: true,
          placeholder: 'command-name', hint: 'Lowercase, no spaces. Max 32 chars.',
          validate: v => /^[\w-]{1,32}$/.test(v) || 'Only letters, numbers, hyphens' },
        { key: 'description', type: 'text', label: 'Description', required: true,
          placeholder: 'What does this command do?', maxlength: 100 },
        { key: '_options', type: 'options_editor', label: 'Options' },
      ],
    },
    prefix: {
      label: 'Prefix Command', icon: '!', badgeClass: 'cb-type-prefix',
      description: 'Triggered when message starts with a prefix + command',
      fields: [
        { key: 'value', type: 'text', label: 'Trigger Word', required: true, placeholder: 'hello' },
        { key: 'aliases', type: 'tags', label: 'Aliases', placeholder: 'hi, hey' },
        { key: 'caseSensitive', type: 'toggle', label: 'Case Sensitive' },
      ],
    },
    exact: {
      label: 'Exact Match', icon: '=', badgeClass: 'cb-type-exact',
      description: 'Triggered when message is exactly this text',
      fields: [
        { key: 'value', type: 'text', label: 'Exact Text', required: true, placeholder: 'hello bot' },
        { key: 'caseSensitive', type: 'toggle', label: 'Case Sensitive' },
      ],
    },
    contains: {
      label: 'Contains', icon: '~', badgeClass: 'cb-type-contains',
      description: 'Triggered when message contains this keyword',
      fields: [
        { key: 'value', type: 'text', label: 'Keyword', required: true, placeholder: 'thank you' },
        { key: 'caseSensitive', type: 'toggle', label: 'Case Sensitive' },
      ],
    },
    startsWith: {
      label: 'Starts With', icon: '^', badgeClass: 'cb-type-contains',
      description: 'Triggered when message starts with this text',
      fields: [
        { key: 'value', type: 'text', label: 'Prefix Text', required: true, placeholder: 'hey bot' },
        { key: 'caseSensitive', type: 'toggle', label: 'Case Sensitive' },
      ],
    },
    regex: {
      label: 'Regex', icon: '.*', badgeClass: 'cb-type-regex',
      description: 'Triggered when message matches a regular expression',
      fields: [
        { key: 'value', type: 'text', label: 'Regex Pattern', required: true, placeholder: '^hello\\s+world' },
        { key: 'flags', type: 'text', label: 'Flags', placeholder: 'i (case insensitive)' },
      ],
    },
    button: {
      label: 'Button Click', icon: '🔘', badgeClass: 'cb-type-button',
      description: 'Triggered when a button with matching custom ID is clicked',
      fields: [
        { key: 'value', type: 'text', label: 'Custom ID', required: true, placeholder: 'confirm-action' },
        { key: 'matchType', type: 'select', label: 'Match Type', options: [
          { value: 'exact', label: 'Exact match' }, { value: 'startsWith', label: 'Starts with' },
          { value: 'regex', label: 'Regex' },
        ]},
      ],
    },
    select_menu: {
      label: 'Select Menu', icon: '📋', badgeClass: 'cb-type-button',
      description: 'Triggered when an option from a select menu is chosen',
      fields: [
        { key: 'value', type: 'text', label: 'Custom ID', required: true, placeholder: 'my-select-menu' },
        { key: 'matchType', type: 'select', label: 'Match Type', options: [
          { value: 'exact', label: 'Exact match' }, { value: 'startsWith', label: 'Starts with' },
          { value: 'regex', label: 'Regex' },
        ]},
      ],
    },
    modal_submit: {
      label: 'Modal Submit', icon: '📝', badgeClass: 'cb-type-button',
      description: 'Triggered when a modal form is submitted',
      fields: [
        { key: 'value', type: 'text', label: 'Modal Custom ID', required: true, placeholder: 'my-modal' },
        { key: 'matchType', type: 'select', label: 'Match Type', options: [
          { value: 'exact', label: 'Exact match' }, { value: 'startsWith', label: 'Starts with' },
        ]},
      ],
    },
    member_join: {
      label: 'Member Join', icon: '👋', badgeClass: 'cb-type-event',
      description: 'Triggered when a new member joins the server',
      fields: [],
    },
    member_leave: {
      label: 'Member Leave', icon: '👋', badgeClass: 'cb-type-event',
      description: 'Triggered when a member leaves the server',
      fields: [],
    },
    reaction_add: {
      label: 'Reaction Added', icon: '😀', badgeClass: 'cb-type-event',
      description: 'Triggered when a reaction is added',
      fields: [
        { key: 'emoji', type: 'text', label: 'Emoji (leave empty for any)', placeholder: '👍 or :custom_emoji:' },
        { key: 'messageId', type: 'text', label: 'Message ID filter (optional)', placeholder: '' },
      ],
    },
    reaction_remove: {
      label: 'Reaction Removed', icon: '😢', badgeClass: 'cb-type-event',
      description: 'Triggered when a reaction is removed',
      fields: [
        { key: 'emoji', type: 'text', label: 'Emoji (leave empty for any)', placeholder: '👍' },
        { key: 'messageId', type: 'text', label: 'Message ID filter (optional)', placeholder: '' },
      ],
    },
    voice_join: {
      label: 'Voice Join', icon: '🔊', badgeClass: 'cb-type-event',
      description: 'Triggered when a member joins a voice channel',
      fields: [
        { key: 'channelId', type: 'text', label: 'Channel ID filter (optional)', placeholder: 'Leave empty for any channel' },
      ],
    },
    voice_leave: {
      label: 'Voice Leave', icon: '🔇', badgeClass: 'cb-type-event',
      description: 'Triggered when a member leaves a voice channel',
      fields: [
        { key: 'channelId', type: 'text', label: 'Channel ID filter (optional)', placeholder: '' },
      ],
    },
    message_delete: {
      label: 'Message Deleted', icon: '🗑️', badgeClass: 'cb-type-event',
      description: 'Triggered when a message is deleted',
      fields: [
        { key: 'channelId', type: 'text', label: 'Channel ID filter (optional)', placeholder: '' },
      ],
    },
    message_edit: {
      label: 'Message Edited', icon: '✏️', badgeClass: 'cb-type-event',
      description: 'Triggered when a message is edited',
      fields: [
        { key: 'channelId', type: 'text', label: 'Channel ID filter (optional)', placeholder: '' },
      ],
    },
    scheduled: {
      label: 'Scheduled', icon: '⏰', badgeClass: 'cb-type-scheduled',
      description: 'Triggered on a recurring schedule',
      fields: [
        { key: 'interval', type: 'select', label: 'Run Every', required: true, options: [
          { value: '1m', label: '1 minute' }, { value: '5m', label: '5 minutes' },
          { value: '15m', label: '15 minutes' }, { value: '30m', label: '30 minutes' },
          { value: '1h', label: '1 hour' }, { value: '6h', label: '6 hours' },
          { value: '12h', label: '12 hours' }, { value: '24h', label: '24 hours' },
        ]},
        { key: 'timezone', type: 'text', label: 'Timezone', placeholder: 'UTC' },
      ],
    },
  };

  /* Triggers that do NOT support ephemeral replies */
  const NO_EPHEMERAL_TRIGGERS = new Set([
    'prefix','exact','contains','startsWith','regex',
    'member_join','member_leave','reaction_add','reaction_remove',
    'voice_join','voice_leave','message_delete','message_edit','scheduled',
  ]);

  /* ── System Variables by Trigger Type ──────────────────────── */
  function getSystemVars(triggerType) {
    const base = [
      { name: '{user}',             desc: 'User mention', group: 'User' },
      { name: '{user.id}',          desc: 'User ID', group: 'User' },
      { name: '{user.name}',        desc: 'Username', group: 'User' },
      { name: '{user.displayName}', desc: 'Display name', group: 'User' },
      { name: '{user.avatar}',      desc: 'Avatar URL', group: 'User' },
      { name: '{user.createdAt}',   desc: 'Account creation date', group: 'User' },
      { name: '{member.joinedAt}',  desc: 'Server join date', group: 'Member' },
      { name: '{member.nickname}',  desc: 'Server nickname', group: 'Member' },
      { name: '{server}',           desc: 'Server name', group: 'Server' },
      { name: '{server.id}',        desc: 'Server ID', group: 'Server' },
      { name: '{server.memberCount}', desc: 'Member count', group: 'Server' },
      { name: '{channel}',          desc: 'Channel mention', group: 'Channel' },
      { name: '{channel.id}',       desc: 'Channel ID', group: 'Channel' },
      { name: '{channel.name}',     desc: 'Channel name', group: 'Channel' },
      { name: '{timestamp}',        desc: 'Current unix timestamp', group: 'Utility' },
      { name: '{date}',             desc: 'Current date', group: 'Utility' },
      { name: '{time}',             desc: 'Current time', group: 'Utility' },
    ];
    const byTrigger = {
      slash:        [{ name: '{option.NAME}', desc: 'Value of slash option named NAME', group: 'Trigger' }],
      prefix:       [{ name: '{args}', desc: 'All arguments joined', group: 'Trigger' }, { name: '{args.0}', desc: 'First argument', group: 'Trigger' }],
      contains:     [{ name: '{message.content}', desc: 'Full message content', group: 'Trigger' }],
      exact:        [{ name: '{message.content}', desc: 'Full message content', group: 'Trigger' }],
      startsWith:   [{ name: '{message.content}', desc: 'Full message content', group: 'Trigger' }, { name: '{args}', desc: 'Text after prefix', group: 'Trigger' }],
      regex:        [{ name: '{message.content}', desc: 'Full message content', group: 'Trigger' }, { name: '{match.0}', desc: 'Full match', group: 'Trigger' }, { name: '{match.1}', desc: 'Capture group 1', group: 'Trigger' }],
      button:       [{ name: '{button.id}', desc: 'Button custom ID', group: 'Trigger' }, { name: '{button.label}', desc: 'Button label', group: 'Trigger' }],
      select_menu:  [{ name: '{select.id}', desc: 'Select menu custom ID', group: 'Trigger' }, { name: '{select.values}', desc: 'Selected values', group: 'Trigger' }],
      modal_submit: [{ name: '{modal.id}', desc: 'Modal custom ID', group: 'Trigger' }, { name: '{modal.field.NAME}', desc: 'Value from modal field NAME', group: 'Trigger' }],
      reaction_add: [{ name: '{reaction.emoji}', desc: 'Reacted emoji', group: 'Trigger' }, { name: '{reaction.messageId}', desc: 'Message ID', group: 'Trigger' }],
      reaction_remove: [{ name: '{reaction.emoji}', desc: 'Removed emoji', group: 'Trigger' }],
      voice_join:   [{ name: '{channel.id}', desc: 'Voice channel joined', group: 'Trigger' }],
      voice_leave:  [{ name: '{channel.id}', desc: 'Voice channel left', group: 'Trigger' }],
      message_delete: [{ name: '{message.content}', desc: 'Deleted message content', group: 'Trigger' }],
      message_edit: [{ name: '{message.before}', desc: 'Original content', group: 'Trigger' }, { name: '{message.after}', desc: 'New content', group: 'Trigger' }],
      scheduled:    [],
    };
    return { base, trigger: byTrigger[triggerType] || [] };
  }

  /* ══════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════ */
  let _state = {
    _id: null,
    name: '',
    description: '',
    trigger: { type: 'slash', value: '', description: '', options: [] },
    conditions: {},
    blocks: [],
    enabled: true,
    selectedBlockIdx: null,
    dirty: false,
    saving: false,
    activePropsTab: 'config',
    undoStack: [],
    redoStack: [],
  };

  let _guilds = { roles: [], channels: [] };
  let _autosaveTimer = null;
  let _embedCallback = null;

  /* ── Fetch guild roles + channels ──────────────────────────── */
  async function loadGuildData() {
    try {
      const [rRes, cRes] = await Promise.all([
        fetch(`/api/guild/${GUILD_ID}/roles`),
        fetch(`/api/guild/${GUILD_ID}/channels`),
      ]);
      if (rRes.ok) _guilds.roles = await rRes.json();
      if (cRes.ok) _guilds.channels = await cRes.json();
    } catch (e) { /* non-fatal */ }
  }

  /* ══════════════════════════════════════════════════════════════
     UNDO / REDO
  ══════════════════════════════════════════════════════════════ */
  function pushUndo() {
    const snapshot = JSON.stringify({ blocks: _state.blocks, trigger: _state.trigger, name: _state.name, description: _state.description, conditions: _state.conditions });
    _state.undoStack.push(snapshot);
    if (_state.undoStack.length > MAX_UNDO) _state.undoStack.shift();
    _state.redoStack = [];
    _refreshUndoButtons();
  }

  function undo() {
    if (!_state.undoStack.length) return;
    const cur = JSON.stringify({ blocks: _state.blocks, trigger: _state.trigger, name: _state.name, description: _state.description, conditions: _state.conditions });
    _state.redoStack.push(cur);
    const snap = JSON.parse(_state.undoStack.pop());
    Object.assign(_state, snap);
    _state.selectedBlockIdx = null;
    markDirty(); renderAll();
    _refreshUndoButtons();
  }

  function redo() {
    if (!_state.redoStack.length) return;
    const cur = JSON.stringify({ blocks: _state.blocks, trigger: _state.trigger, name: _state.name, description: _state.description, conditions: _state.conditions });
    _state.undoStack.push(cur);
    const snap = JSON.parse(_state.redoStack.pop());
    Object.assign(_state, snap);
    _state.selectedBlockIdx = null;
    markDirty(); renderAll();
    _refreshUndoButtons();
  }

  function _refreshUndoButtons() {
    const u = document.getElementById('cb-undo-btn');
    const r = document.getElementById('cb-redo-btn');
    if (u) u.disabled = _state.undoStack.length === 0;
    if (r) r.disabled = _state.redoStack.length === 0;
  }

  /* ══════════════════════════════════════════════════════════════
     DIRTY STATE / AUTOSAVE
  ══════════════════════════════════════════════════════════════ */
  function markDirty() {
    _state.dirty = true;
    setStatus('unsaved', 'Unsaved');
    const bar = document.getElementById('cb-unsaved-bar');
    if (bar) bar.classList.add('cb-visible');
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(autoSave, AUTOSAVE_MS);
  }

  function markClean() {
    _state.dirty = false;
    setStatus('saved', 'Saved');
    const bar = document.getElementById('cb-unsaved-bar');
    if (bar) bar.classList.remove('cb-visible');
  }

  function setStatus(cls, text) {
    const el = document.getElementById('cb-status');
    if (!el) return;
    el.className = 'cb-status cb-status-' + cls;
    el.textContent = text;
  }

  function autoSave() {
    if (_state._id && _state.dirty) saveCommand(true);
  }

  /* ══════════════════════════════════════════════════════════════
     VALIDATION
  ══════════════════════════════════════════════════════════════ */
  function validateCommand() {
    const errors = [];
    const name = (_state.name || '').trim();
    if (!name) errors.push('Command name is required');
    else if (/\s/.test(name)) errors.push('Command name cannot contain spaces');

    const t = _state.trigger;
    const tc = TRIGGER_CONFIGS[t.type];
    if (!tc) errors.push('Invalid trigger type');
    else {
      for (const f of (tc.fields || [])) {
        if (f.required && !t[f.key]) errors.push(`Trigger: ${f.label} is required`);
        if (f.validate && t[f.key]) {
          const msg = f.validate(t[f.key]);
          if (msg !== true) errors.push(`Trigger: ${msg}`);
        }
      }
    }

    if (_state.blocks.length > MAX_BLOCKS) errors.push(`Too many blocks (max ${MAX_BLOCKS})`);

    for (let i = 0; i < _state.blocks.length; i++) {
      const b = _state.blocks[i];
      const def = BLOCK_DEFS[b.type];
      if (!def) { errors.push(`Block ${i + 1}: Unknown type "${b.type}"`); continue; }
      for (const [key, schema] of Object.entries(def.schema || {})) {
        if (schema.required && !b.data[key] && b.data[key] !== 0 && b.data[key] !== false) {
          errors.push(`Block ${i + 1} (${def.label}): "${schema.label}" is required`);
        }
        if (key === 'ephemeral' && b.data.ephemeral && NO_EPHEMERAL_TRIGGERS.has(t.type)) {
          errors.push(`Block ${i + 1} (${def.label}): Ephemeral is not supported for "${tc ? tc.label : t.type}" trigger`);
        }
      }
    }
    return errors;
  }

  function renderValidationBar(errors) {
    const el = document.getElementById('cb-validation-bar');
    if (!el) return;
    if (!errors.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'block';
    el.className = 'cb-validation-panel';
    el.innerHTML = errors.slice(0, 5).map(e =>
      `<div class="cb-validation-error"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${escHtml(e)}</div>`
    ).join('') + (errors.length > 5 ? `<div style="color:var(--text-4);font-size:11px">+${errors.length - 5} more errors</div>` : '');
  }

  /* ══════════════════════════════════════════════════════════════
     PALETTE RENDER
  ══════════════════════════════════════════════════════════════ */
  let _paletteCollapsed = {};

  function renderPalette(filter) {
    const container = document.getElementById('cb-palette-body');
    if (!container) return;
    const q = (filter || '').toLowerCase();
    let html = '';

    for (const cat of BLOCK_CATEGORIES) {
      const items = Object.entries(BLOCK_DEFS).filter(([, def]) =>
        def.category === cat.key &&
        (!q || def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q))
      );
      if (!items.length) continue;
      const collapsed = _paletteCollapsed[cat.key] && !q;
      html += `<div class="cb-category${collapsed ? ' collapsed' : ''}" data-cat="${escAttr(cat.key)}">
        <div class="cb-category-header" data-toggle-cat="${escAttr(cat.key)}">
          <span>${escHtml(cat.icon)} ${escHtml(cat.label)}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="cb-category-items">
          ${items.map(([type, def]) => `
            <div class="cb-palette-item" data-block-type="${escAttr(type)}" title="${escAttr(def.description || '')}">
              <span class="cb-palette-icon" style="background:${def.color}22;color:${def.color}">${escHtml(def.icon)}</span>
              <span class="cb-palette-label">${escHtml(def.label)}</span>
            </div>`).join('')}
        </div>
      </div>`;
    }
    container.innerHTML = html || '<div style="padding:16px;color:var(--text-4);font-size:13px;text-align:center">No blocks match</div>';
  }

  /* ══════════════════════════════════════════════════════════════
     TRIGGER BAR RENDER
  ══════════════════════════════════════════════════════════════ */
  function renderTriggerBar() {
    const container = document.getElementById('cb-trigger-inner');
    if (!container) return;
    const t = _state.trigger;
    const tc = TRIGGER_CONFIGS[t.type] || {};

    // Type selector
    let html = `<div class="cb-trigger-field">
      <span class="cb-trigger-label">Trigger Type</span>
      <select class="cb-trigger-type-select" id="cb-trigger-type">
        ${Object.entries(TRIGGER_CONFIGS).map(([k, v]) =>
          `<option value="${escAttr(k)}"${t.type === k ? ' selected' : ''}>${escHtml(v.label)}</option>`
        ).join('')}
      </select>
    </div>`;

    // Dynamic fields
    for (const field of (tc.fields || [])) {
      if (field.key === '_options') {
        html += `<div class="cb-trigger-field" style="align-self:flex-end">
          <button class="cb-trigger-btn" id="cb-options-open-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Options (${(t.options || []).length})
          </button>
        </div>`;
        continue;
      }
      const val = (t[field.key] !== undefined && t[field.key] !== null) ? t[field.key] : '';
      if (field.type === 'toggle') {
        html += `<div class="cb-trigger-field" style="align-self:center;padding-top:16px">
          <label class="cb-toggle-switch">
            <input type="checkbox" class="cb-trigger-toggle" data-field="${escAttr(field.key)}"${val ? ' checked' : ''}>
            <span class="cb-toggle-track"></span><span class="cb-toggle-thumb"></span>
          </label>
          <span style="font-size:12px;color:var(--text-3);margin-left:6px">${escHtml(field.label)}</span>
        </div>`;
      } else if (field.type === 'select') {
        html += `<div class="cb-trigger-field">
          <span class="cb-trigger-label">${escHtml(field.label)}</span>
          <select class="cb-trigger-type-select cb-trigger-field-input" data-field="${escAttr(field.key)}">
            ${(field.options || []).map(o => `<option value="${escAttr(o.value)}"${val === o.value ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('')}
          </select>
        </div>`;
      } else if (field.type === 'tags') {
        html += `<div class="cb-trigger-field cb-trigger-field-wide">
          <span class="cb-trigger-label">${escHtml(field.label)}</span>
          <input type="text" class="cb-trigger-type-select cb-trigger-field-input" data-field="${escAttr(field.key)}" data-field-type="tags" value="${escAttr(Array.isArray(val) ? val.join(', ') : val)}" placeholder="${escAttr(field.placeholder || '')}">
        </div>`;
      } else {
        html += `<div class="cb-trigger-field${field.wide ? ' cb-trigger-field-wide' : ''}">
          <span class="cb-trigger-label">${escHtml(field.label)}${field.required ? ' <span style="color:var(--red)">*</span>' : ''}</span>
          <input type="text" class="cb-trigger-type-select cb-trigger-field-input" data-field="${escAttr(field.key)}" value="${escAttr(val)}" placeholder="${escAttr(field.placeholder || '')}"${field.maxlength ? ` maxlength="${field.maxlength}"` : ''}>
        </div>`;
      }
    }

    container.innerHTML = html;
    updateTriggerBadge();
    bindTriggerBarEvents();
  }

  function updateTriggerBadge() {
    const t = _state.trigger;
    const tc = TRIGGER_CONFIGS[t.type] || {};
    const badge = document.getElementById('cb-trigger-badge');
    const text  = document.getElementById('cb-trigger-badge-text');
    if (!badge) return;
    badge.className = 'cb-trigger-badge ' + (tc.badgeClass || 'cb-type-slash');
    if (text) text.textContent = tc.label || t.type;
  }

  function bindTriggerBarEvents() {
    const typeSelect = document.getElementById('cb-trigger-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        pushUndo();
        _state.trigger = { type: e.target.value, value: '', options: [] };
        markDirty();
        renderTriggerBar();
        renderPropsPanel();
      });
    }
    document.querySelectorAll('.cb-trigger-field-input').forEach(el => {
      el.addEventListener('input', () => {
        const field = el.dataset.field;
        const isTag = el.dataset.fieldType === 'tags';
        _state.trigger[field] = isTag ? el.value.split(',').map(s => s.trim()).filter(Boolean) : el.value;
        markDirty();
        if (field === 'value') {
          updateTriggerBadge();
          // For slash commands, keep _state.name in sync with the trigger command name
          if (_state.trigger.type === 'slash') {
            const cleaned = el.value.toLowerCase().replace(/[^a-z0-9-_]/g, '');
            _state.name = cleaned;
            const topbarName = document.getElementById('cb-cmd-name');
            if (topbarName) topbarName.value = cleaned;
            const propsName = document.getElementById('cp-name');
            if (propsName) propsName.value = cleaned;
          }
        }
      });
    });
    document.querySelectorAll('.cb-trigger-toggle').forEach(el => {
      el.addEventListener('change', () => {
        _state.trigger[el.dataset.field] = el.checked;
        markDirty();
      });
    });
    const optBtn = document.getElementById('cb-options-open-btn');
    if (optBtn) optBtn.addEventListener('click', () => openModal('cb-options-modal', renderOptionsModal));
  }

  /* ══════════════════════════════════════════════════════════════
     CANVAS RENDER
  ══════════════════════════════════════════════════════════════ */
  function renderCanvas() {
    const container = document.getElementById('cb-canvas-inner');
    if (!container) return;
    const blocks = _state.blocks;

    if (!blocks.length) {
      container.innerHTML = `<div class="cb-canvas-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="12" y1="9" x2="12" y2="15"/></svg>
        <p>No blocks yet</p>
        <span class="cb-empty-sub">Click "Add Block" below, or drag from the palette on the left</span>
      </div>`;
    } else {
      container.innerHTML = blocks.map((block, i) => renderBlockCard(block, i)).join('');
    }

    const countEl = document.getElementById('cb-block-count');
    if (countEl) countEl.textContent = blocks.length ? `${blocks.length} / ${MAX_BLOCKS} blocks` : '';
    bindCanvasEvents();
  }

  function renderBlockCard(block, idx) {
    const def = BLOCK_DEFS[block.type] || { label: block.type, icon: '?', color: '#666', schema: {} };
    const isSelected = _state.selectedBlockIdx === idx;
    const errors = getBlockErrors(block, idx);
    const preview = getBlockPreview(block, def);

    return `<div class="cb-block-wrap" data-block-idx="${idx}">
      <div class="cb-block${isSelected ? ' cb-block-selected' : ''}${errors.length ? ' cb-block-has-error' : ''}" data-block-idx="${idx}">
        <div class="cb-block-header">
          <span class="cb-block-type-icon" style="background:${def.color}22;color:${def.color}">${def.icon || '?'}</span>
          <span class="cb-block-type-label">${escHtml(def.label || block.type)}</span>
          ${preview ? `<span class="cb-block-preview">${escHtml(preview)}</span>` : ''}
          <div class="cb-block-actions">
            <button class="cb-icon-btn cb-block-up-btn" data-idx="${idx}" title="Move up" ${idx === 0 ? 'disabled' : ''}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button class="cb-icon-btn cb-block-down-btn" data-idx="${idx}" title="Move down" ${idx === _state.blocks.length - 1 ? 'disabled' : ''}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="cb-icon-btn cb-block-dup-btn" data-idx="${idx}" title="Duplicate block">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="cb-icon-btn cb-block-del-btn" data-idx="${idx}" title="Delete block" style="color:var(--red)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        ${errors.length ? `<div class="cb-block-error"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${escHtml(errors[0])}</div>` : ''}
      </div>
    </div>`;
  }

  function getBlockPreview(block, def) {
    const d = block.data || {};
    if (d.content) return String(d.content).slice(0, 40);
    if (d.name && d.value !== undefined) return `${d.name} = ${d.value}`;
    if (d.key) return d.key;
    if (d.role_id) { const role = _guilds.roles.find(r => r.id === d.role_id); return role ? `@${role.name}` : d.role_id; }
    if (d.url) return d.url.slice(0, 40);
    if (d.command_name) return d.command_name;
    return '';
  }

  function getBlockErrors(block, idx) {
    const errors = [];
    const def = BLOCK_DEFS[block.type];
    if (!def) return [`Unknown block type: ${block.type}`];
    for (const [key, schema] of Object.entries(def.schema || {})) {
      if (schema.required && !block.data[key] && block.data[key] !== 0 && block.data[key] !== false) {
        errors.push(`"${schema.label}" is required`);
      }
      if (key === 'ephemeral' && block.data.ephemeral && NO_EPHEMERAL_TRIGGERS.has(_state.trigger.type)) {
        errors.push('Ephemeral not supported for this trigger type');
      }
    }
    return errors;
  }

  function bindCanvasEvents() {
    document.querySelectorAll('.cb-block[data-block-idx]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        selectBlock(parseInt(el.dataset.blockIdx));
      });
    });
    document.querySelectorAll('.cb-block-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBlock(parseInt(btn.dataset.idx));
      });
    });
    document.querySelectorAll('.cb-block-up-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveBlock(parseInt(btn.dataset.idx), -1);
      });
    });
    document.querySelectorAll('.cb-block-down-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveBlock(parseInt(btn.dataset.idx), 1);
      });
    });
    document.querySelectorAll('.cb-block-dup-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        duplicateBlock(parseInt(btn.dataset.idx));
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     BLOCK OPERATIONS
  ══════════════════════════════════════════════════════════════ */
  function addBlock(type) {
    if (_state.blocks.length >= MAX_BLOCKS) { showToast('Maximum block limit reached', 'error'); return; }
    pushUndo();
    _state.blocks.push({ type, data: {} });
    _state.selectedBlockIdx = _state.blocks.length - 1;
    markDirty();
    renderCanvas();
    renderPropsPanel();
    // Scroll to bottom
    const inner = document.getElementById('cb-canvas-inner');
    if (inner) inner.scrollTop = inner.scrollHeight;
  }

  function deleteBlock(idx) {
    pushUndo();
    _state.blocks.splice(idx, 1);
    if (_state.selectedBlockIdx === idx) _state.selectedBlockIdx = null;
    else if (_state.selectedBlockIdx > idx) _state.selectedBlockIdx--;
    markDirty();
    renderCanvas();
    renderPropsPanel();
  }

  function moveBlock(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= _state.blocks.length) return;
    pushUndo();
    const temp = _state.blocks[idx];
    _state.blocks[idx] = _state.blocks[newIdx];
    _state.blocks[newIdx] = temp;
    if (_state.selectedBlockIdx === idx) _state.selectedBlockIdx = newIdx;
    else if (_state.selectedBlockIdx === newIdx) _state.selectedBlockIdx = idx;
    markDirty();
    renderCanvas();
  }

  function duplicateBlock(idx) {
    if (_state.blocks.length >= MAX_BLOCKS) { showToast('Maximum block limit reached', 'error'); return; }
    pushUndo();
    const copy = JSON.parse(JSON.stringify(_state.blocks[idx]));
    _state.blocks.splice(idx + 1, 0, copy);
    _state.selectedBlockIdx = idx + 1;
    markDirty();
    renderCanvas();
    renderPropsPanel();
  }

  function selectBlock(idx) {
    _state.selectedBlockIdx = idx;
    renderCanvas();
    renderPropsPanel();
  }

  /* ══════════════════════════════════════════════════════════════
     PROPERTIES PANEL RENDER
  ══════════════════════════════════════════════════════════════ */
  function renderPropsPanel() {
    const body = document.getElementById('cb-props-body');
    const title = document.getElementById('cb-props-title');
    const varsBtn = document.getElementById('cb-props-vars-btn');
    if (!body) return;

    const idx = _state.selectedBlockIdx;
    const hasBlock = idx !== null && _state.blocks[idx];

    if (title) title.textContent = hasBlock ? BLOCK_DEFS[_state.blocks[idx].type]?.label || 'Block' : 'Command';
    if (varsBtn) varsBtn.style.display = hasBlock ? '' : 'none';

    const tab = _state.activePropsTab;

    if (tab === 'vars') {
      body.innerHTML = renderVarBrowser();
      bindVarBrowserEvents();
      return;
    }

    if (!hasBlock) {
      renderCommandProps(body);
    } else {
      renderBlockProps(body, idx);
    }
  }

  function renderCommandProps(body) {
    const c = _state.conditions || {};
    body.innerHTML = `
      <div class="cb-field-group">
        <label class="cb-label">Command Name</label>
        <input id="cp-name" class="cb-input" type="text" value="${escAttr(_state.name)}" placeholder="my-command" maxlength="50">
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Description <span class="cb-label-optional">(optional)</span></label>
        <textarea id="cp-desc" class="cb-textarea cb-textarea-sm" placeholder="Describe what this command does...">${escHtml(_state.description || '')}</textarea>
      </div>
      <div class="cb-divider"></div>
      <div class="cb-section-head">
        <span class="cb-section-title">Conditions</span>
        <button class="cb-btn cb-btn-ghost cb-btn-xs" id="cp-cond-edit-btn">Edit</button>
      </div>
      <div class="cb-conditions-section">
        <div class="cb-condition-badges">
          ${(c.requiredRoles || []).map(r => { const role = _guilds.roles.find(x => x.id === r); return `<span class="cb-cond-badge cb-cond-badge-role">@${escHtml(role?.name || r)}</span>`; }).join('')}
          ${(c.allowedChannels || []).map(ch => { const chan = _guilds.channels.find(x => x.id === ch); return `<span class="cb-cond-badge cb-cond-badge-channel">#${escHtml(chan?.name || ch)}</span>`; }).join('')}
          ${c.cooldown?.value ? `<span class="cb-cond-badge">⏱ ${c.cooldown.value}s ${c.cooldown.scope || 'user'}</span>` : ''}
          ${c.permissions ? `<span class="cb-cond-badge">🔒 ${escHtml(c.permissions)}</span>` : ''}
          ${!(c.requiredRoles?.length || c.allowedChannels?.length || c.cooldown?.value || c.permissions) ? '<span style="font-size:12px;color:var(--text-4)">No conditions set</span>' : ''}
        </div>
      </div>
      <div class="cb-divider"></div>
      <div class="cb-field-group">
        <div class="cb-toggle-field">
          <div class="cb-toggle-info"><span class="cb-toggle-field-label">Enabled</span><span class="cb-toggle-field-hint">Command is active</span></div>
          <label class="cb-toggle-switch"><input id="cp-enabled" type="checkbox"${_state.enabled ? ' checked' : ''}><span class="cb-toggle-track"></span><span class="cb-toggle-thumb"></span></label>
        </div>
      </div>`;

    // Bind
    const nameEl = body.querySelector('#cp-name');
    const descEl = body.querySelector('#cp-desc');
    const enabledEl = body.querySelector('#cp-enabled');
    if (nameEl) nameEl.addEventListener('input', (e) => {
      const cleaned = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
      _state.name = cleaned;
      document.getElementById('cb-cmd-name').value = cleaned;
      // For slash commands, keep trigger.value in sync
      if (_state.trigger.type === 'slash') {
        _state.trigger.value = cleaned;
        const trigVal = document.querySelector('.cb-trigger-field-input[data-field="value"]');
        if (trigVal) trigVal.value = cleaned;
        updateTriggerBadge();
      }
      markDirty();
    });
    if (descEl) descEl.addEventListener('input', (e) => { _state.description = e.target.value; markDirty(); });
    if (enabledEl) enabledEl.addEventListener('change', (e) => { _state.enabled = e.target.checked; markDirty(); });
    const condBtn = body.querySelector('#cp-cond-edit-btn');
    if (condBtn) condBtn.addEventListener('click', () => openModal('cb-conditions-modal', populateConditionsModal));
  }

  function renderBlockProps(body, idx) {
    const block = _state.blocks[idx];
    const def = BLOCK_DEFS[block.type];
    if (!def) { body.innerHTML = '<div style="padding:16px;color:var(--text-4)">Unknown block type</div>'; return; }

    let html = `<div style="padding:8px 0 12px;font-size:12px;color:var(--text-3)">${escHtml(def.description || '')}</div>`;
    for (const [key, schema] of Object.entries(def.schema || {})) {
      html += renderSchemaField(key, schema, block.data[key], idx);
    }
    body.innerHTML = html;
    bindBlockPropsEvents(body, idx);
  }

  function renderSchemaField(key, schema, value, blockIdx) {
    const id = `bp-${blockIdx}-${key}`;
    const label = schema.label + (schema.required ? ' <span style="color:var(--red)">*</span>' : '');

    if (schema.type === 'toggle') {
      return `<div class="cb-field-group">
        <div class="cb-toggle-field">
          <div class="cb-toggle-info"><span class="cb-toggle-field-label">${label}</span>${schema.hint ? `<span class="cb-toggle-field-hint">${escHtml(schema.hint)}</span>` : ''}</div>
          <label class="cb-toggle-switch"><input id="${id}" type="checkbox" class="cb-block-field" data-key="${key}"${value ? ' checked' : ''}><span class="cb-toggle-track"></span><span class="cb-toggle-thumb"></span></label>
        </div>
      </div>`;
    }

    if (schema.type === 'select') {
      return `<div class="cb-field-group">
        <label class="cb-label" for="${id}">${label}</label>
        <select id="${id}" class="cb-select cb-block-field" data-key="${key}">
          ${!schema.required ? '<option value="">— None —</option>' : ''}
          ${(schema.options || []).map(o => `<option value="${escAttr(o.value)}"${value === o.value ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('')}
        </select>
      </div>`;
    }

    if (schema.type === 'number') {
      return `<div class="cb-field-group">
        <label class="cb-label" for="${id}">${label}</label>
        <input id="${id}" type="number" class="cb-input cb-block-field" data-key="${key}" value="${value !== undefined ? value : ''}" placeholder="${escAttr(schema.placeholder || '')}">
      </div>`;
    }

    if (schema.type === 'textarea') {
      return `<div class="cb-field-group">
        <label class="cb-label" for="${id}">${label}${schema.hint ? ` <span class="cb-label-hint">${escHtml(schema.hint)}</span>` : ''}</label>
        <textarea id="${id}" class="cb-textarea cb-block-field" data-key="${key}" placeholder="${escAttr(schema.placeholder || '')}">${escHtml(value || '')}</textarea>
        <button class="cb-var-insert-btn" data-insert-target="${id}">{ } Insert Variable</button>
      </div>`;
    }

    if (schema.type === 'role_picker') {
      const roleOpts = _guilds.roles.map(r => `<option value="${escAttr(r.id)}"${value === r.id ? ' selected' : ''}>${escHtml(r.name)}</option>`).join('');
      return `<div class="cb-field-group">
        <label class="cb-label" for="${id}">${label}</label>
        <select id="${id}" class="cb-select cb-block-field" data-key="${key}">
          <option value="">Select role...</option>${roleOpts}
        </select>
        <input type="text" class="cb-input" placeholder="Or enter role ID / variable" style="margin-top:4px" id="${id}-raw" data-key="${key}" data-override-id="${id}" value="${!_guilds.roles.find(r => r.id === value) && value ? value : ''}">
      </div>`;
    }

    if (schema.type === 'channel_picker') {
      const chanOpts = _guilds.channels.map(c => `<option value="${escAttr(c.id)}"${value === c.id ? ' selected' : ''}>${escHtml('#' + c.name)}</option>`).join('');
      return `<div class="cb-field-group">
        <label class="cb-label" for="${id}">${label}</label>
        <select id="${id}" class="cb-select cb-block-field" data-key="${key}">
          <option value="">Current channel / enter below</option>${chanOpts}
        </select>
        <input type="text" class="cb-input" placeholder="${escAttr(schema.placeholder || '{channel.id}')}" style="margin-top:4px" id="${id}-raw" data-key="${key}-raw" value="${value && !_guilds.channels.find(c => c.id === value) ? value : ''}">
      </div>`;
    }

    if (schema.type === 'embed_list') {
      const embeds = Array.isArray(value) ? value : [];
      return `<div class="cb-field-group">
        <div class="cb-section-head"><span class="cb-label">${label}</span>
          <button class="cb-add-row-btn cb-embed-add-btn" data-key="${key}" data-block-idx="${blockIdx}">+ Add Embed</button>
        </div>
        ${embeds.map((e, i) => `
          <div class="cb-embed-preview" style="border-left-color:${e.color ? '#' + e.color.toString(16).padStart(6,'0') : '#5865f2'};margin-bottom:6px;cursor:pointer" data-embed-edit="${i}" data-key="${key}" data-block-idx="${blockIdx}">
            ${e.title ? `<div class="cb-embed-title-prev">${escHtml(e.title)}</div>` : ''}
            ${e.description ? `<div class="cb-embed-desc-prev">${escHtml(String(e.description).slice(0, 60))}${e.description.length > 60 ? '...' : ''}</div>` : ''}
            ${!e.title && !e.description ? '<div style="color:var(--text-4);font-size:12px">Empty embed</div>' : ''}
          </div>`).join('')}
      </div>`;
    }

    if (schema.type === 'button_list') {
      const buttons = Array.isArray(value) ? value : [];
      return `<div class="cb-field-group">
        <div class="cb-section-head"><span class="cb-label">${label}</span>
          <button class="cb-add-row-btn cb-btn-add-btn" data-key="${key}" data-block-idx="${blockIdx}">+ Add Button</button>
        </div>
        <div class="cb-button-list" id="${id}-list">
          ${buttons.map((btn, i) => `
            <div class="cb-button-item">
              <span class="cb-button-item-label">${escHtml(btn.label || '(no label)')}</span>
              <span style="font-size:10px;color:var(--text-4)">${escHtml(btn.style || 'Primary')}</span>
              <button class="cb-icon-btn cb-btn-edit-btn" data-btn-idx="${i}" data-key="${key}" data-block-idx="${blockIdx}" style="margin-left:auto">✏️</button>
              <button class="cb-icon-btn cb-btn-del-btn" data-btn-idx="${i}" data-key="${key}" data-block-idx="${blockIdx}" style="color:var(--red)">✕</button>
            </div>`).join('')}
        </div>
      </div>`;
    }

    if (schema.type === 'tags') {
      const arr = Array.isArray(value) ? value : (value ? [value] : []);
      return `<div class="cb-field-group">
        <label class="cb-label" for="${id}">${label}</label>
        <div class="cb-tags-wrap" id="${id}-wrap">
          ${arr.map(tag => `<span class="cb-tag">${escHtml(tag)}<button class="cb-tag-remove" data-tag="${escAttr(tag)}" data-key="${key}" data-block-idx="${blockIdx}">×</button></span>`).join('')}
          <input type="text" class="cb-tag-input" id="${id}" data-key="${key}" placeholder="Type and press Enter...">
        </div>
      </div>`;
    }

    if (schema.type === 'nested_blocks') {
      return `<div class="cb-field-group">
        <div class="cb-section-head">
          <span class="cb-label">${label}</span>
          <span style="font-size:11px;color:var(--text-4)">(nested blocks — edit in canvas)</span>
        </div>
      </div>`;
    }

    // Default: text
    return `<div class="cb-field-group">
      <label class="cb-label" for="${id}">${label}${schema.hint ? ` <span class="cb-label-hint">${escHtml(schema.hint)}</span>` : ''}</label>
      <input id="${id}" type="text" class="cb-input cb-block-field" data-key="${key}" value="${escAttr(value !== undefined ? String(value) : '')}" placeholder="${escAttr(schema.placeholder || '')}">
      <button class="cb-var-insert-btn" data-insert-target="${id}">{ } Insert Variable</button>
    </div>`;
  }

  function bindBlockPropsEvents(body, idx) {
    // Text/number/select/textarea fields
    body.querySelectorAll('.cb-block-field').forEach(el => {
      const key = el.dataset.key;
      const update = () => {
        const val = el.type === 'checkbox' ? el.checked : el.value;
        _state.blocks[idx].data[key] = val;
        markDirty();
        // Re-render canvas preview
        const blockEl = document.querySelector(`.cb-block[data-block-idx="${idx}"] .cb-block-preview`);
        if (blockEl) blockEl.textContent = getBlockPreview(_state.blocks[idx], BLOCK_DEFS[_state.blocks[idx].type] || {});
      };
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', update);
    });

    // Variable insert buttons
    body.querySelectorAll('.cb-var-insert-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _state._insertTarget = btn.dataset.insertTarget;
        _state.activePropsTab = 'vars';
        document.querySelectorAll('.cb-props-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'vars'));
        renderPropsPanel();
      });
    });

    // Embed add
    body.querySelectorAll('.cb-embed-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const bIdx = parseInt(btn.dataset.blockIdx);
        const block = _state.blocks[bIdx];
        if (!Array.isArray(block.data[key])) block.data[key] = [];
        block.data[key].push({});
        openEmbedEditor(bIdx, key, block.data[key].length - 1);
      });
    });

    // Embed edit
    body.querySelectorAll('[data-embed-edit]').forEach(el => {
      el.addEventListener('click', () => {
        const bIdx = parseInt(el.dataset.blockIdx);
        const key = el.dataset.key;
        const eIdx = parseInt(el.dataset.embedEdit);
        openEmbedEditor(bIdx, key, eIdx);
      });
    });

    // Button add
    body.querySelectorAll('.cb-btn-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const bIdx = parseInt(btn.dataset.blockIdx);
        const block = _state.blocks[bIdx];
        if (!Array.isArray(block.data[key])) block.data[key] = [];
        block.data[key].push({ label: 'Button', style: 'Primary', customId: 'btn_' + Date.now() });
        markDirty();
        renderPropsPanel();
      });
    });

    // Button delete
    body.querySelectorAll('.cb-btn-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const bIdx = parseInt(btn.dataset.blockIdx);
        const btnIdx = parseInt(btn.dataset.btnIdx);
        _state.blocks[bIdx].data[key].splice(btnIdx, 1);
        markDirty();
        renderPropsPanel();
      });
    });

    // Tag input
    body.querySelectorAll('.cb-tag-input').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ',') return;
        e.preventDefault();
        const val = el.value.trim();
        if (!val) return;
        const key = el.dataset.key;
        if (!Array.isArray(_state.blocks[idx].data[key])) _state.blocks[idx].data[key] = [];
        _state.blocks[idx].data[key].push(val);
        el.value = '';
        markDirty();
        renderPropsPanel();
      });
    });
    body.querySelectorAll('.cb-tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const bIdx = parseInt(btn.dataset.blockIdx);
        const arr = _state.blocks[bIdx].data[key];
        if (Array.isArray(arr)) {
          _state.blocks[bIdx].data[key] = arr.filter(t => t !== btn.dataset.tag);
        }
        markDirty();
        renderPropsPanel();
      });
    });

    // Role picker raw override
    body.querySelectorAll('[data-override-id]').forEach(el => {
      el.addEventListener('input', () => {
        const key = el.dataset.key.replace('-raw', '');
        _state.blocks[idx].data[key] = el.value;
        markDirty();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     VARIABLE BROWSER
  ══════════════════════════════════════════════════════════════ */
  function renderVarBrowser() {
    const vars = getSystemVars(_state.trigger.type);
    const groups = {};
    for (const v of vars.base) { (groups[v.group] = groups[v.group] || []).push(v); }
    if (vars.trigger.length) groups['Trigger'] = vars.trigger;

    // Add set_var variables from blocks
    const flowVars = [];
    for (let i = 0; i < _state.blocks.length; i++) {
      const b = _state.blocks[i];
      if (b.type === 'set_var' && b.data.name) flowVars.push({ name: `{var.${b.data.name}}`, desc: `Set in block ${i + 1}` });
      if (b.type === 'math' && b.data.result_var) flowVars.push({ name: `{var.${b.data.result_var}}`, desc: `Math result` });
      if (b.type === 'format_text' && b.data.result_var) flowVars.push({ name: `{var.${b.data.result_var}}`, desc: `Text format result` });
      if (b.type === 'random_number' && b.data.result_var) flowVars.push({ name: `{var.${b.data.result_var}}`, desc: `Random number` });
    }
    if (flowVars.length) groups['Flow Variables'] = flowVars;

    let html = '<div class="cb-var-browser">';
    if (_state._insertTarget) {
      html += `<div style="padding:4px 4px 10px;font-size:12px;color:var(--accent)">Click a variable to insert</div>`;
    }
    for (const [group, items] of Object.entries(groups)) {
      html += `<div class="cb-var-section">
        <div class="cb-var-section-title">${escHtml(group)}</div>
        <div class="cb-var-chips">
          ${items.map(v => `<span class="cb-var-chip" data-var="${escAttr(v.name)}" title="${escAttr(v.desc)}">${escHtml(v.name)}</span>`).join('')}
        </div>
      </div>`;
    }
    html += '</div>';
    return html;
  }

  function bindVarBrowserEvents() {
    document.querySelectorAll('.cb-var-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const varName = chip.dataset.var;
        if (_state._insertTarget) {
          const target = document.getElementById(_state._insertTarget);
          if (target) {
            const pos = target.selectionStart || target.value.length;
            target.value = target.value.slice(0, pos) + varName + target.value.slice(pos);
            target.focus();
            target.selectionStart = target.selectionEnd = pos + varName.length;
            // Trigger input event to update state
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }
          _state._insertTarget = null;
          _state.activePropsTab = 'config';
          document.querySelectorAll('.cb-props-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'config'));
          renderPropsPanel();
        } else {
          navigator.clipboard?.writeText(varName).then(() => showToast(`Copied ${varName}`, 'info')).catch(() => {});
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     EMBED EDITOR
  ══════════════════════════════════════════════════════════════ */
  function openEmbedEditor(blockIdx, key, embedIdx) {
    const block = _state.blocks[blockIdx];
    if (!Array.isArray(block.data[key])) block.data[key] = [];
    const embed = block.data[key][embedIdx] || {};

    const body = document.getElementById('cb-embed-modal-body');
    body.innerHTML = `
      <div class="cb-field-group">
        <label class="cb-label">Author</label>
        <input id="em-author" class="cb-input" placeholder="Author name" value="${escAttr(embed.author?.name || '')}">
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Title</label>
        <input id="em-title" class="cb-input" placeholder="Embed title" maxlength="256" value="${escAttr(embed.title || '')}">
      </div>
      <div class="cb-field-group">
        <label class="cb-label">URL <span class="cb-label-optional">(title becomes a link)</span></label>
        <input id="em-url" class="cb-input" placeholder="https://..." value="${escAttr(embed.url || '')}">
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Description</label>
        <textarea id="em-desc" class="cb-textarea" placeholder="Embed description... supports {variables}">${escHtml(embed.description || '')}</textarea>
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Color <span class="cb-label-hint">(hex)</span></label>
        <div class="cb-color-field">
          <input type="color" id="em-color-picker" value="#${(embed.color || 5592575).toString(16).padStart(6,'0')}" class="cb-color-preview" style="cursor:pointer">
          <input id="em-color" class="cb-input cb-color-input" placeholder="#5865f2" value="#${(embed.color || 5592575).toString(16).padStart(6,'0')}">
        </div>
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Thumbnail URL</label>
        <input id="em-thumb" class="cb-input" placeholder="https://i.imgur.com/..." value="${escAttr(embed.thumbnail?.url || '')}">
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Image URL</label>
        <input id="em-image" class="cb-input" placeholder="https://i.imgur.com/..." value="${escAttr(embed.image?.url || '')}">
      </div>
      <div id="em-fields-section">
        <div class="cb-section-head"><span class="cb-section-title">Fields</span><button id="em-add-field" class="cb-add-row-btn">+ Add Field</button></div>
        <div id="em-fields-list">
          ${(embed.fields || []).map((f, i) => `
            <div class="cb-embed-field-row" data-field-idx="${i}">
              <input class="cb-input em-field-name" placeholder="Field name" value="${escAttr(f.name || '')}">
              <input class="cb-input em-field-value" placeholder="Field value" value="${escAttr(f.value || '')}">
              <label class="cb-toggle-switch" title="Inline">
                <input type="checkbox" class="em-field-inline"${f.inline ? ' checked' : ''}>
                <span class="cb-toggle-track"></span><span class="cb-toggle-thumb"></span>
              </label>
              <button class="cb-icon-btn em-field-del" style="color:var(--red)">✕</button>
            </div>`).join('')}
        </div>
      </div>
      <div class="cb-field-group" style="margin-top:8px">
        <label class="cb-label">Footer</label>
        <input id="em-footer" class="cb-input" placeholder="Footer text" value="${escAttr(embed.footer?.text || '')}">
      </div>
      <div class="cb-field-group">
        <div class="cb-toggle-field">
          <div class="cb-toggle-info"><span class="cb-toggle-field-label">Show Timestamp</span></div>
          <label class="cb-toggle-switch"><input id="em-timestamp" type="checkbox"${embed.timestamp ? ' checked' : ''}><span class="cb-toggle-track"></span><span class="cb-toggle-thumb"></span></label>
        </div>
      </div>`;

    // Add field button
    body.querySelector('#em-add-field').addEventListener('click', () => {
      const list = body.querySelector('#em-fields-list');
      const idx2 = list.children.length;
      const row = document.createElement('div');
      row.className = 'cb-embed-field-row';
      row.dataset.fieldIdx = idx2;
      row.innerHTML = `<input class="cb-input em-field-name" placeholder="Field name"><input class="cb-input em-field-value" placeholder="Field value"><label class="cb-toggle-switch" title="Inline"><input type="checkbox" class="em-field-inline"><span class="cb-toggle-track"></span><span class="cb-toggle-thumb"></span></label><button class="cb-icon-btn em-field-del" style="color:var(--red)">✕</button>`;
      row.querySelector('.em-field-del').addEventListener('click', () => row.remove());
      list.appendChild(row);
    });
    body.querySelectorAll('.em-field-del').forEach(btn => btn.addEventListener('click', () => btn.closest('.cb-embed-field-row').remove()));

    // Color sync
    const picker = body.querySelector('#em-color-picker');
    const colorIn = body.querySelector('#em-color');
    picker.addEventListener('input', () => { colorIn.value = picker.value; });
    colorIn.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(colorIn.value)) picker.value = colorIn.value; });

    _embedCallback = () => {
      const fields = [];
      body.querySelectorAll('.cb-embed-field-row').forEach(row => {
        const name = row.querySelector('.em-field-name').value;
        const value = row.querySelector('.em-field-value').value;
        if (name || value) fields.push({ name, value, inline: row.querySelector('.em-field-inline').checked });
      });
      const colorHex = colorIn.value.replace('#', '');
      const colorInt = parseInt(colorHex, 16) || 5592575;
      const updated = {
        author: body.querySelector('#em-author').value ? { name: body.querySelector('#em-author').value } : undefined,
        title: body.querySelector('#em-title').value || undefined,
        url: body.querySelector('#em-url').value || undefined,
        description: body.querySelector('#em-desc').value || undefined,
        color: colorInt,
        thumbnail: body.querySelector('#em-thumb').value ? { url: body.querySelector('#em-thumb').value } : undefined,
        image: body.querySelector('#em-image').value ? { url: body.querySelector('#em-image').value } : undefined,
        footer: body.querySelector('#em-footer').value ? { text: body.querySelector('#em-footer').value } : undefined,
        fields,
        timestamp: body.querySelector('#em-timestamp').checked || undefined,
      };
      block.data[key][embedIdx] = updated;
      markDirty();
      renderPropsPanel();
    };

    openModal('cb-embed-modal');
  }

  /* ══════════════════════════════════════════════════════════════
     SLASH OPTIONS MODAL
  ══════════════════════════════════════════════════════════════ */
  const SLASH_OPTION_TYPES = [
    { value: 3, label: 'STRING - Text' }, { value: 4, label: 'INTEGER - Integer' },
    { value: 5, label: 'BOOLEAN - True/False' }, { value: 6, label: 'USER - User' },
    { value: 7, label: 'CHANNEL - Channel' }, { value: 8, label: 'ROLE - Role' },
    { value: 10, label: 'NUMBER - Number' },
  ];

  let _editingOptionIdx = null;

  function renderOptionsModal() {
    const list = document.getElementById('cb-options-list');
    if (!list) return;
    const opts = _state.trigger.options || [];
    list.innerHTML = opts.map((o, i) => `
      <div class="cb-opt-item" data-opt-idx="${i}">
        <div class="cb-opt-header" data-opt-toggle="${i}">
          <svg class="cb-opt-expand-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="cb-opt-type-badge">${SLASH_OPTION_TYPES.find(t => t.value === o.type)?.label.split(' - ')[0] || o.type}</span>
          <span class="cb-opt-name-badge">${escHtml(o.name || '(unnamed)')}</span>
          <span class="cb-opt-desc">${escHtml(o.description || '')}</span>
          ${o.required ? '<span class="cb-opt-required">Required</span>' : ''}
          <button class="cb-icon-btn" data-opt-edit="${i}" style="margin-left:auto">✏️</button>
          <button class="cb-icon-btn" data-opt-del="${i}" style="color:var(--red)">✕</button>
        </div>
      </div>`).join('') || '<div style="color:var(--text-4);font-size:13px;padding:8px 0">No options added yet</div>';

    list.querySelectorAll('[data-opt-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openOptionEditor(parseInt(btn.dataset.optEdit));
      });
    });
    list.querySelectorAll('[data-opt-del]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _state.trigger.options.splice(parseInt(btn.dataset.optDel), 1);
        markDirty();
        renderOptionsModal();
        renderTriggerBar();
      });
    });

    const addBtn = document.getElementById('cb-options-add');
    if (addBtn) {
      addBtn.onclick = () => {
        if (!_state.trigger.options) _state.trigger.options = [];
        _state.trigger.options.push({ name: '', description: '', type: 3, required: false, choices: [] });
        markDirty();
        openOptionEditor(_state.trigger.options.length - 1);
      };
    }
  }

  function openOptionEditor(idx) {
    _editingOptionIdx = idx;
    const opt = (_state.trigger.options || [])[idx] || {};
    const body = document.getElementById('cb-option-edit-body');
    const title = document.getElementById('cb-option-edit-title');
    if (title) title.textContent = idx === (_state.trigger.options?.length - 1) && !opt.name ? 'New Option' : 'Edit Option';

    body.innerHTML = `
      <div class="cb-field-group">
        <label class="cb-label">Name <span style="color:var(--red)">*</span></label>
        <input id="oe-name" class="cb-input" value="${escAttr(opt.name || '')}" placeholder="option-name" maxlength="32">
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Description <span style="color:var(--red)">*</span></label>
        <input id="oe-desc" class="cb-input" value="${escAttr(opt.description || '')}" placeholder="What is this option?" maxlength="100">
      </div>
      <div class="cb-field-group">
        <label class="cb-label">Type</label>
        <select id="oe-type" class="cb-select">
          ${SLASH_OPTION_TYPES.map(t => `<option value="${t.value}"${opt.type === t.value ? ' selected' : ''}>${escHtml(t.label)}</option>`).join('')}
        </select>
      </div>
      <div class="cb-field-group">
        <div class="cb-toggle-field">
          <span class="cb-toggle-field-label">Required</span>
          <label class="cb-toggle-switch"><input id="oe-req" type="checkbox"${opt.required ? ' checked' : ''}><span class="cb-toggle-track"></span><span class="cb-toggle-thumb"></span></label>
        </div>
      </div>
      <div class="cb-field-group" id="oe-choices-section" style="${opt.type === 3 || opt.type === 4 ? '' : 'display:none'}">
        <div class="cb-section-head"><span class="cb-label">Choices <span class="cb-label-optional">(optional)</span></span><button id="oe-add-choice" class="cb-add-row-btn">+ Add</button></div>
        <div id="oe-choices-list">
          ${(opt.choices || []).map((c, i) => `
            <div class="oe-choice-row" style="display:flex;gap:6px;margin-bottom:4px">
              <input class="cb-input oe-choice-name" placeholder="Label" value="${escAttr(c.name || '')}">
              <input class="cb-input oe-choice-value" placeholder="Value" value="${escAttr(String(c.value || ''))}">
              <button class="cb-icon-btn oe-choice-del" style="color:var(--red)">✕</button>
            </div>`).join('')}
        </div>
      </div>`;

    body.querySelector('#oe-type').addEventListener('change', (e) => {
      const v = parseInt(e.target.value);
      body.querySelector('#oe-choices-section').style.display = (v === 3 || v === 4) ? '' : 'none';
    });
    body.querySelector('#oe-add-choice').addEventListener('click', () => {
      const list = body.querySelector('#oe-choices-list');
      const row = document.createElement('div');
      row.className = 'oe-choice-row';
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
      row.innerHTML = `<input class="cb-input oe-choice-name" placeholder="Label"><input class="cb-input oe-choice-value" placeholder="Value"><button class="cb-icon-btn oe-choice-del" style="color:var(--red)">✕</button>`;
      row.querySelector('.oe-choice-del').addEventListener('click', () => row.remove());
      list.appendChild(row);
    });
    body.querySelectorAll('.oe-choice-del').forEach(btn => btn.addEventListener('click', () => btn.closest('.oe-choice-row').remove()));

    closeModal('cb-options-modal');
    openModal('cb-option-edit-modal');
  }

  function saveOption() {
    const idx = _editingOptionIdx;
    if (idx === null) return;
    const body = document.getElementById('cb-option-edit-body');
    const name = body.querySelector('#oe-name').value.trim().toLowerCase().replace(/\s+/g, '-');
    const description = body.querySelector('#oe-desc').value.trim();
    if (!name || !description) { showToast('Name and description are required', 'error'); return; }
    if (!/^[\w-]{1,32}$/.test(name)) { showToast('Invalid option name (letters, numbers, hyphens only)', 'error'); return; }

    const choices = [];
    body.querySelectorAll('.oe-choice-row').forEach(row => {
      const n = row.querySelector('.oe-choice-name').value;
      const v = row.querySelector('.oe-choice-value').value;
      if (n) choices.push({ name: n, value: v });
    });

    if (!_state.trigger.options) _state.trigger.options = [];
    _state.trigger.options[idx] = {
      name, description,
      type: parseInt(body.querySelector('#oe-type').value),
      required: body.querySelector('#oe-req').checked,
      choices,
    };
    markDirty();
    closeModal('cb-option-edit-modal');
    openModal('cb-options-modal', renderOptionsModal);
    renderTriggerBar();
  }

  /* ══════════════════════════════════════════════════════════════
     CONDITIONS MODAL
  ══════════════════════════════════════════════════════════════ */
  function populateConditionsModal() {
    const c = _state.conditions || {};

    // Cooldown
    const cdVal = document.getElementById('cb-cooldown-val');
    const cdScope = document.getElementById('cb-cooldown-scope');
    if (cdVal) cdVal.value = c.cooldown?.value || '';
    if (cdScope) cdScope.value = c.cooldown?.scope || 'user';

    // Permissions
    const perms = document.getElementById('cb-cond-perms');
    const botPerms = document.getElementById('cb-cond-bot-perms');
    if (perms) perms.value = c.permissions || '';
    if (botPerms) botPerms.value = c.botPermissions || '';

    // Roles tags
    _renderConditionTags('cb-cond-roles-wrap', 'cb-cond-roles-input', 'cb-cond-roles-dropdown', c.requiredRoles || [], _guilds.roles, 'role');
    _renderConditionTags('cb-cond-blackroles-wrap', 'cb-cond-blackroles-input', 'cb-cond-blackroles-dropdown', c.blacklistedRoles || [], _guilds.roles, 'blackrole');
    _renderConditionTags('cb-cond-channels-wrap', 'cb-cond-channels-input', 'cb-cond-channels-dropdown', c.allowedChannels || [], _guilds.channels, 'channel');
  }

  function _renderConditionTags(wrapId, inputId, dropdownId, ids, items, type) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    // Remove existing tags (not the input)
    wrap.querySelectorAll('.cb-tag').forEach(t => t.remove());
    for (const id of ids) {
      const item = items.find(x => x.id === id);
      const tag = document.createElement('span');
      tag.className = 'cb-tag';
      tag.innerHTML = `${escHtml(item?.name || id)} <button class="cb-tag-remove" data-remove-id="${escAttr(id)}" data-type="${type}">×</button>`;
      wrap.insertBefore(tag, document.getElementById(inputId));
    }

    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      const filtered = items.filter(x => x.name?.toLowerCase().includes(q)).slice(0, 8);
      dropdown.innerHTML = filtered.map(x =>
        `<div class="cb-picker-item-row" data-id="${escAttr(x.id)}" data-name="${escAttr(x.name)}" style="padding:6px 10px;cursor:pointer;font-size:13px;border-radius:4px;margin:2px">${escHtml(x.name || x.id)}</div>`
      ).join('');
      dropdown.style.display = filtered.length ? '' : 'none';
      dropdown.querySelectorAll('.cb-picker-item-row').forEach(row => {
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          addConditionItem(wrapId, inputId, dropdownId, row.dataset.id, row.dataset.name, ids, type);
        });
      });
    });
    input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 150));
    wrap.querySelectorAll('[data-remove-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = ids.indexOf(btn.dataset.removeId);
        if (idx >= 0) ids.splice(idx, 1);
        _renderConditionTags(wrapId, inputId, dropdownId, ids, items, type);
      });
    });
  }

  function addConditionItem(wrapId, inputId, dropdownId, id, name, ids, type) {
    if (!ids.includes(id)) ids.push(id);
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (input) input.value = '';
    if (dropdown) dropdown.style.display = 'none';
    const items = type === 'channel' ? _guilds.channels : _guilds.roles;
    _renderConditionTags(wrapId, inputId, dropdownId, ids, items, type);
  }

  function saveConditions() {
    const requiredRoles = [];
    document.querySelectorAll('#cb-cond-roles-wrap .cb-tag-remove[data-remove-id]').forEach(btn => { requiredRoles.push(btn.dataset.removeId); });
    const blacklistedRoles = [];
    document.querySelectorAll('#cb-cond-blackroles-wrap .cb-tag-remove[data-remove-id]').forEach(btn => { blacklistedRoles.push(btn.dataset.removeId); });
    const allowedChannels = [];
    document.querySelectorAll('#cb-cond-channels-wrap .cb-tag-remove[data-remove-id]').forEach(btn => { allowedChannels.push(btn.dataset.removeId); });
    const cdVal = parseInt(document.getElementById('cb-cooldown-val')?.value || '0') || 0;

    _state.conditions = {
      requiredRoles, blacklistedRoles, allowedChannels,
      cooldown: cdVal ? { value: cdVal, scope: document.getElementById('cb-cooldown-scope')?.value || 'user' } : undefined,
      permissions: document.getElementById('cb-cond-perms')?.value || undefined,
      botPermissions: document.getElementById('cb-cond-bot-perms')?.value || undefined,
    };
    markDirty();
    closeModal('cb-conditions-modal');
    if (_state.selectedBlockIdx === null) renderPropsPanel();
    showToast('Conditions saved', 'info');
  }

  /* ══════════════════════════════════════════════════════════════
     SAVE / LOAD / SYNC / EXPORT
  ══════════════════════════════════════════════════════════════ */
  async function saveCommand(silent) {
    if (_state.saving) return;
    const errors = validateCommand();
    renderValidationBar(errors);
    if (errors.length && !silent) { showToast('Fix errors before saving', 'error'); return; }
    if (errors.length && silent) return;

    _state.saving = true;
    setStatus('saving', 'Saving...');
    document.getElementById('cb-save-btn').disabled = true;

    const payload = buildPayload();
    const isNew = !_state._id;
    const url = isNew
      ? `/api/guild/${GUILD_ID}/guild-commands`
      : `/api/guild/${GUILD_ID}/guild-commands/${_state._id}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      _state._id = data.command._id || data.command.id;
      if (!silent) {
        markClean();
        showToast('Command saved!', 'success');
        if (isNew) {
          history.replaceState(null, '', `/dashboard/${GUILD_ID}/commands/builder/${_state._id}`);
        }
      } else {
        markClean();
      }
    } catch (err) {
      setStatus('error', 'Error');
      if (!silent) showToast(err.message || 'Save failed', 'error');
    } finally {
      _state.saving = false;
      document.getElementById('cb-save-btn').disabled = false;
    }
  }

  function buildPayload() {
    return {
      name: (_state.name || '').trim(),
      description: _state.description || '',
      trigger: _state.trigger,
      conditions: _state.conditions || {},
      blocks: _state.blocks,
      enabled: _state.enabled !== false,
    };
  }

  async function syncCommand() {
    if (!_state._id) { showToast('Save command first', 'error'); return; }
    if (_state.trigger.type !== 'slash') { showToast('Sync only applies to slash commands', 'info'); return; }
    const btn = document.getElementById('cb-sync-btn');
    if (btn) btn.disabled = true;
    setStatus('saving', 'Syncing...');
    try {
      const res = await fetch(`/api/guild/${GUILD_ID}/guild-commands/${_state._id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      showToast('Slash command synced with Discord!', 'success');
      setStatus('saved', 'Saved');
    } catch (err) {
      showToast(err.message || 'Sync failed', 'error');
      setStatus('saved', 'Saved');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function loadCommand(data) {
    _state._id = data._id || data.id || null;
    _state.trigger = data.trigger || { type: 'slash', value: '', options: [] };
    if (!_state.trigger.options) _state.trigger.options = [];
    // For slash commands, fall back to trigger.value if name is not stored separately
    _state.name = data.name || (_state.trigger.type === 'slash' ? _state.trigger.value : '') || '';
    _state.description = data.description || '';
    _state.conditions = data.conditions || {};
    _state.blocks = (data.blocks || []).map(b => ({ type: b.type, data: b.data || {} }));
    _state.enabled = data.enabled !== false;
    _state.selectedBlockIdx = null;
    _state.dirty = false;

    const nameEl = document.getElementById('cb-cmd-name');
    if (nameEl) nameEl.value = _state.name;
    markClean();
    renderAll();
  }

  function exportCommand() {
    const payload = buildPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${_state.name || 'command'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importFromJSON(json) {
    try {
      const data = JSON.parse(json);
      if (!data.trigger || !Array.isArray(data.blocks)) throw new Error('Invalid command JSON format');
      pushUndo();
      _state._id = null; // treat as new
      loadCommand(data);
      markDirty();
      showToast('Command imported!', 'info');
    } catch (e) {
      showToast('Invalid JSON: ' + e.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL HELPERS
  ══════════════════════════════════════════════════════════════ */
  function openModal(id, onOpen) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('cb-open');
    if (onOpen) setTimeout(onOpen, 50);
    el.addEventListener('click', (e) => { if (e.target === el) closeModal(id); }, { once: true });
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('cb-open');
  }

  /* ══════════════════════════════════════════════════════════════
     BLOCK PICKER MODAL
  ══════════════════════════════════════════════════════════════ */
  function openBlockPicker() {
    openModal('cb-picker-modal');
    renderBlockPickerGrid('');
    const search = document.getElementById('cb-picker-search');
    if (search) { search.value = ''; search.focus(); }
  }

  function renderBlockPickerGrid(filter) {
    const grid = document.getElementById('cb-picker-grid');
    if (!grid) return;
    const q = filter.toLowerCase();
    let html = '';

    for (const cat of BLOCK_CATEGORIES) {
      const items = Object.entries(BLOCK_DEFS).filter(([, d]) =>
        d.category === cat.key && (!q || d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q))
      );
      if (!items.length) continue;
      html += `<div class="cb-picker-cat-head">${escHtml(cat.icon)} ${escHtml(cat.label)}</div>`;
      html += items.map(([type, def]) =>
        `<div class="cb-picker-item" data-add-block="${escAttr(type)}" title="${escAttr(def.description || '')}">
          <span class="cb-picker-icon" style="color:${def.color}">${escHtml(def.icon)}</span>
          <span class="cb-picker-label">${escHtml(def.label)}</span>
          <span class="cb-picker-desc">${escHtml(def.description || '')}</span>
        </div>`
      ).join('');
    }
    grid.innerHTML = html || '<div style="padding:16px;color:var(--text-4);text-align:center">No blocks match</div>';

    grid.querySelectorAll('[data-add-block]').forEach(el => {
      el.addEventListener('click', () => {
        closeModal('cb-picker-modal');
        addBlock(el.dataset.addBlock);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════════════ */
  function showToast(msg, type) {
    const container = document.getElementById('cb-toasts');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `cb-toast cb-toast-${type || 'info'}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  /* ══════════════════════════════════════════════════════════════
     UTILITY
  ══════════════════════════════════════════════════════════════ */
  function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function escAttr(s) { return escHtml(s); }

  function renderAll() {
    renderTriggerBar();
    renderPalette();
    renderCanvas();
    renderPropsPanel();
    _refreshUndoButtons();
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  async function init() {
    await loadGuildData();

    // Load existing command if provided
    const cmdData = _srv.cmd ? (typeof _srv.cmd === 'string' ? JSON.parse(_srv.cmd) : _srv.cmd) : null;
    if (cmdData) {
      loadCommand(cmdData);
    } else {
      renderAll();
    }

    /* ── Unsaved Changes Warning ────────────────────────── */
    window.addEventListener('beforeunload', (e) => {
      if (_state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    const backBtn = document.querySelector('.cb-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        if (_state.dirty && !confirm('You have unsaved changes. Are you sure you want to go back?')) {
          e.preventDefault();
        }
      });
    }

    /* ── Topbar name input ──────────────────────────────── */
    const nameInput = document.getElementById('cb-cmd-name');
    if (nameInput) {
      nameInput.value = _state.name;
      nameInput.addEventListener('input', () => {
        const cleaned = nameInput.value.toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (nameInput.value !== cleaned) { nameInput.value = cleaned; }
        _state.name = cleaned;
        const propsName = document.getElementById('cp-name');
        if (propsName) propsName.value = cleaned;
        // For slash commands, keep trigger.value in sync with the topbar name
        if (_state.trigger.type === 'slash') {
          _state.trigger.value = cleaned;
          const trigVal = document.querySelector('.cb-trigger-field-input[data-field="value"]');
          if (trigVal) trigVal.value = cleaned;
          updateTriggerBadge();
        }
        markDirty();
      });
    }

    /* ── Save button ────────────────────────────────────── */
    document.getElementById('cb-save-btn')?.addEventListener('click', () => saveCommand(false));
    document.getElementById('cb-unsaved-save-btn')?.addEventListener('click', () => saveCommand(false));

    /* ── Discard ────────────────────────────────────────── */
    document.getElementById('cb-discard-btn')?.addEventListener('click', () => {
      if (cmdData) { loadCommand(cmdData); } else {
        _state.blocks = []; _state.name = ''; _state.trigger = { type: 'slash', value: '', options: [] }; _state.conditions = {};
        if (nameInput) nameInput.value = '';
        renderAll();
      }
      markClean();
    });

    /* ── Sync button ────────────────────────────────────── */
    document.getElementById('cb-sync-btn')?.addEventListener('click', syncCommand);

    /* ── Undo/redo ──────────────────────────────────────── */
    document.getElementById('cb-undo-btn')?.addEventListener('click', undo);
    document.getElementById('cb-redo-btn')?.addEventListener('click', redo);

    /* ── Conditions ─────────────────────────────────────── */
    document.getElementById('cb-conditions-btn')?.addEventListener('click', () => openModal('cb-conditions-modal', populateConditionsModal));
    document.getElementById('cb-conditions-save-btn')?.addEventListener('click', saveConditions);

    /* ── Add block ──────────────────────────────────────── */
    document.getElementById('cb-add-block-btn')?.addEventListener('click', openBlockPicker);

    /* ── Palette item click ─────────────────────────────── */
    document.getElementById('cb-palette-body')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-block-type]');
      if (item) addBlock(item.dataset.blockType);
      const toggle = e.target.closest('[data-toggle-cat]');
      if (toggle) {
        const cat = toggle.dataset.toggleCat;
        _paletteCollapsed[cat] = !_paletteCollapsed[cat];
        toggle.closest('.cb-category').classList.toggle('collapsed');
      }
    });

    /* ── Palette search ─────────────────────────────────── */
    document.getElementById('cb-palette-search')?.addEventListener('input', (e) => renderPalette(e.target.value));

    /* ── Picker search ──────────────────────────────────── */
    document.getElementById('cb-picker-search')?.addEventListener('input', (e) => renderBlockPickerGrid(e.target.value));

    /* ── Props panel tabs ───────────────────────────────── */
    document.getElementById('cb-props-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      _state.activePropsTab = tab.dataset.tab;
      document.querySelectorAll('.cb-props-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab.dataset.tab));
      renderPropsPanel();
    });

    /* ── JSON toggle ────────────────────────────────────── */
    document.getElementById('cb-json-toggle')?.addEventListener('click', () => {
      const panel = document.getElementById('cb-json-panel');
      if (!panel) return;
      panel.classList.add('cb-open');
      const ta = document.getElementById('cb-json-textarea');
      if (ta) ta.value = JSON.stringify(buildPayload(), null, 2);
    });
    document.getElementById('cb-json-close')?.addEventListener('click', () => {
      document.getElementById('cb-json-panel')?.classList.remove('cb-open');
    });
    document.getElementById('cb-json-apply')?.addEventListener('click', () => {
      const ta = document.getElementById('cb-json-textarea');
      if (!ta) return;
      importFromJSON(ta.value);
      document.getElementById('cb-json-panel')?.classList.remove('cb-open');
    });

    /* ── Export ─────────────────────────────────────────── */
    document.getElementById('cb-export-btn')?.addEventListener('click', exportCommand);

    /* ── Import ─────────────────────────────────────────── */
    document.getElementById('cb-import-btn')?.addEventListener('click', () => openModal('cb-import-modal'));
    document.getElementById('cb-import-apply-btn')?.addEventListener('click', () => {
      const ta = document.getElementById('cb-import-textarea');
      if (!ta) return;
      importFromJSON(ta.value);
      closeModal('cb-import-modal');
    });

    /* ── Embed save ─────────────────────────────────────── */
    document.getElementById('cb-embed-save-btn')?.addEventListener('click', () => {
      if (_embedCallback) { _embedCallback(); _embedCallback = null; }
      closeModal('cb-embed-modal');
    });

    /* ── Option save ────────────────────────────────────── */
    document.getElementById('cb-option-save-btn')?.addEventListener('click', saveOption);

    /* ── Option delete ──────────────────────────────────── */
    document.getElementById('cb-option-delete-btn')?.addEventListener('click', () => {
      if (_editingOptionIdx !== null && _state.trigger.options) {
        _state.trigger.options.splice(_editingOptionIdx, 1);
        markDirty();
      }
      closeModal('cb-option-edit-modal');
      openModal('cb-options-modal', renderOptionsModal);
      renderTriggerBar();
    });

    /* ── Modal close buttons ────────────────────────────── */
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-close-modal]');
      if (btn) closeModal(btn.dataset.closeModal);
    });

    /* ── Keyboard shortcuts ─────────────────────────────── */
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCommand(false); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === 'Escape') {
        document.querySelectorAll('.cb-modal-overlay.cb-open, .cb-json-panel.cb-open').forEach(m => m.classList.remove('cb-open'));
        if (_state.selectedBlockIdx !== null) { _state.selectedBlockIdx = null; renderCanvas(); renderPropsPanel(); }
      }
    });

  }

  /* Start */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
