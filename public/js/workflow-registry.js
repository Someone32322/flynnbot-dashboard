/**
 * workflow-registry.js — Frontend Block Registry (IIFE)
 *
 * Provides window.WORKFLOW_REGISTRY — the client-side mirror of the server registry.
 * Used by the workflow editor to:
 *   - Render the block palette (left panel)
 *   - Build dynamic property forms (right panel)
 *   - Display block cards on the canvas (centre panel)
 *
 * CSP-compliant: no eval, no inline scripts.
 * Loaded before workflow-editor.js.
 */

(function () {
  'use strict';

  // ── Field type constants (mirrors server types.js) ──────────
  const FT = {
    TEXT:          'text',
    TEXTAREA:      'textarea',
    NUMBER:        'number',
    TOGGLE:        'toggle',
    SELECT:        'select',
    ROLE:          'role',
    CHANNEL:       'channel',
    COLOR:         'color',
    EMBED_FIELDS:  'embed_fields',
    MODAL_FIELDS:  'modal_fields',
    BUTTON_ARRAY:  'button_array',
    OPTION_ARRAY:  'option_array',
    BRANCH_LABEL:  'branch_label',
  };

  // ── Shared option sets ─────────────────────────────────────
  const TARGET_OPTS = [
    { v: 'author',    l: 'Command Author' },
    { v: 'mentioned', l: 'Mentioned User ({mentioned})' },
  ];

  const ON_TIMEOUT_OPTS = [
    { v: 'stop',     l: 'Stop workflow' },
    { v: 'continue', l: 'Continue anyway' },
  ];

  const CONDITION_TYPE_OPTS = [
    { v: 'has_role',         l: 'User has role' },
    { v: 'not_has_role',     l: 'User does NOT have role' },
    { v: 'in_channel',       l: 'Command used in channel' },
    { v: 'not_in_channel',   l: 'Command NOT in channel' },
    { v: 'var_equals',       l: 'Variable equals value' },
    { v: 'var_not_equals',   l: 'Variable does not equal' },
    { v: 'var_greater',      l: 'Variable is greater than' },
    { v: 'var_less',         l: 'Variable is less than' },
    { v: 'var_contains',     l: 'Variable contains text' },
    { v: 'var_is_empty',     l: 'Variable is empty / unset' },
    { v: 'user_has_perm',    l: 'User has Discord permission' },
    { v: 'user_not_perm',    l: 'User is missing permission' },
    { v: 'message_contains', l: 'Message contains text' },
    { v: 'mentioned_user',   l: 'A user was @mentioned' },
    { v: 'random_chance',    l: 'Random chance (X%)' },
    { v: 'arg_equals',       l: 'Command argument equals value' },
  ];

  const PERM_OPTS = [
    { v: 'Administrator',   l: 'Administrator' },
    { v: 'ManageGuild',     l: 'Manage Server' },
    { v: 'ManageChannels',  l: 'Manage Channels' },
    { v: 'ManageRoles',     l: 'Manage Roles' },
    { v: 'ManageMessages',  l: 'Manage Messages' },
    { v: 'ManageNicknames', l: 'Manage Nicknames' },
    { v: 'KickMembers',     l: 'Kick Members' },
    { v: 'BanMembers',      l: 'Ban Members' },
    { v: 'ModerateMembers', l: 'Timeout Members' },
  ];

  // Field builder helpers
  const f = {
    text:    (key, label, opts = {}) => ({ key, type: FT.TEXT,     label, ...opts }),
    area:    (key, label, opts = {}) => ({ key, type: FT.TEXTAREA, label, ...opts }),
    num:     (key, label, opts = {}) => ({ key, type: FT.NUMBER,   label, ...opts }),
    toggle:  (key, label, opts = {}) => ({ key, type: FT.TOGGLE,   label, ...opts }),
    select:  (key, label, options, opts = {}) => ({ key, type: FT.SELECT, label, options, ...opts }),
    role:    (key, label, opts = {}) => ({ key, type: FT.ROLE,     label, ...opts }),
    channel: (key, label, opts = {}) => ({ key, type: FT.CHANNEL,  label, ...opts }),
    color:   (key, label, opts = {}) => ({ key, type: FT.COLOR,    label, ...opts }),
    branch:  (key, label)            => ({ key, type: FT.BRANCH_LABEL, label }),
  };

  // ── Category metadata ──────────────────────────────────────
  const CATEGORIES = [
    { id: 'respond',    label: 'Discord Responses',         icon: 'corner-down-right', color: '#57f287' },
    { id: 'messages',   label: 'Discord Message Actions',   icon: 'message-square',    color: '#60a5fa' },
    { id: 'components', label: 'Discord Interactions',      icon: 'square',            color: '#818cf8' },
    { id: 'await',      label: 'Interaction Wait/Collect',  icon: 'mouse-pointer',     color: '#34d399' },
    { id: 'channels',   label: 'Channel Automation',        icon: 'hash',              color: '#38bdf8' },
    { id: 'roles',      label: 'Role Management',           icon: 'shield',            color: '#4ade80' },
    { id: 'members',    label: 'Moderation & Member Ops',   icon: 'users',             color: '#fb923c' },
    { id: 'variables',  label: 'Variables & Storage',       icon: 'database',          color: '#38bdf8' },
    { id: 'math_text',  label: 'Utilities',                 icon: 'hash',              color: '#a78bfa' },
    { id: 'flow',       label: 'Logic & Automation',        icon: 'git-branch',        color: '#f472b6' },
  ];

  // ── Block definitions ──────────────────────────────────────
  const BLOCKS = {

    // RESPOND
    reply: {
      category: 'respond', label: 'Reply', description: 'Reply to the trigger message or interaction.',
      fields: [
        f.area('content', 'Reply Content', { required: true, max: 2000,
          placeholder: '{user} {username} {server} {channel} {membercount}' }),
        f.toggle('ephemeral', 'Ephemeral (only visible to the triggering user)'),
        f.toggle('ping_user', 'Mention / ping the user'),
      ],
      defaults: { content: '', ephemeral: false, ping_user: false },
    },

    followup: {
      category: 'respond', label: 'Follow-up Message', description: 'Send an additional message after the reply.',
      fields: [
        f.area('content', 'Message Content', { required: true, max: 2000 }),
        f.toggle('ephemeral', 'Ephemeral (slash commands only)'),
      ],
      defaults: { content: '', ephemeral: false },
    },

    edit_reply: {
      category: 'respond', label: 'Edit Reply', description: "Edit a message the bot previously sent.",
      fields: [
        f.select('target', 'Edit Which Message', [
          { v: 'last',     l: "Bot's last sent message" },
          { v: 'original', l: 'Original reply / response' },
          { v: 'by_id',    l: 'Specific message (by stored ID)' },
        ]),
        f.text('message_id_var', 'Message ID Variable',
          { max: 32, placeholder: 'msg_id', showIf: { key: 'target', value: 'by_id' } }),
        f.area('new_content', 'New Content', { required: true, max: 2000 }),
      ],
      defaults: { target: 'last', message_id_var: '', new_content: '' },
    },

    // MESSAGES
    send_message: {
      category: 'messages', label: 'Send Message', description: 'Send a plain text message to a channel.',
      fields: [
        f.area('content', 'Message Content', { required: true, max: 2000,
          placeholder: '{user} {username} {server}' }),
        f.channel('channel_id', 'Send To Channel', { hint: 'Blank = current channel' }),
        f.text('store_id_as', 'Store Message ID As', { max: 32, placeholder: 'sent_msg' }),
        f.toggle('ephemeral', 'Ephemeral (slash commands only)'),
      ],
      defaults: { content: '', channel_id: '', store_id_as: '', ephemeral: false },
    },

    send_embed: {
      category: 'messages', label: 'Send Embed', description: 'Send a richly-formatted Discord embed.',
      fields: [
        f.text('title',       'Title',       { max: 256 }),
        f.area('description', 'Description', { max: 4096 }),
        f.color('color', 'Colour'),
        f.text('footer',    'Footer Text', { max: 2048 }),
        f.text('thumbnail', 'Thumbnail URL', { max: 512, placeholder: 'https://…' }),
        f.text('image',     'Image URL',    { max: 512, placeholder: 'https://…' }),
        f.text('url',       'Title Link',   { max: 512, placeholder: 'https://…' }),
        f.toggle('timestamp',   'Show Timestamp'),
        f.toggle('show_author', 'Show triggering user as author'),
        f.channel('channel_id', 'Send To Channel', { hint: 'Blank = current channel' }),
        f.text('store_id_as', 'Store Message ID As', { max: 32 }),
        { key: 'fields', type: FT.EMBED_FIELDS, label: 'Embed Fields' },
      ],
      defaults: { title: '', description: '', color: '#5865f2', footer: '', thumbnail: '',
                  image: '', url: '', timestamp: false, show_author: false,
                  channel_id: '', store_id_as: '', fields: [] },
    },

    dm_user: {
      category: 'messages', label: 'DM User', description: 'Send a direct message to the user.',
      fields: [
        f.area('content', 'DM Content', { required: true, max: 2000 }),
        f.toggle('fail_silent', 'Silently ignore if DMs are closed'),
      ],
      defaults: { content: '', fail_silent: true },
    },

    edit_message: {
      category: 'messages', label: 'Edit Message', description: 'Edit a previously sent message.',
      fields: [
        f.text('message_id_var', 'Message ID Variable', { max: 32 }),
        f.area('new_content', 'New Content', { required: true, max: 2000 }),
        f.channel('channel_id', 'Channel (if different)'),
      ],
      defaults: { message_id_var: '', new_content: '', channel_id: '' },
    },

    delete_message: {
      category: 'messages', label: 'Delete Message', description: 'Delete a specific message.',
      fields: [
        f.select('target', 'Delete Which Message', [
          { v: 'trigger',  l: 'The trigger message' },
          { v: 'bot_last', l: "Bot's last response" },
          { v: 'by_id',    l: 'Specific message by stored ID' },
        ]),
        f.text('message_id_var', 'Message ID Variable', { max: 32,
          showIf: { key: 'target', value: 'by_id' } }),
        f.num('delay_ms', 'Delay (ms)', { min: 0, max: 60000 }),
      ],
      defaults: { target: 'trigger', message_id_var: '', delay_ms: 0 },
    },

    pin_message: {
      category: 'messages', label: 'Pin / Unpin Message', description: 'Pin or unpin a message.',
      fields: [
        f.select('action', 'Action', [
          { v: 'pin',   l: 'Pin message' },
          { v: 'unpin', l: 'Unpin message' },
        ]),
        f.select('target', 'Which Message', [
          { v: 'trigger', l: 'The trigger message' },
          { v: 'by_id',   l: 'Specific message by stored ID' },
        ]),
        f.text('message_id_var', 'Message ID Variable', { max: 32,
          showIf: { key: 'target', value: 'by_id' } }),
      ],
      defaults: { action: 'pin', target: 'trigger', message_id_var: '' },
    },

    add_reaction: {
      category: 'messages', label: 'Add Reaction', description: 'React to a message with an emoji.',
      fields: [
        f.text('emoji', 'Emoji', { required: true, max: 100, placeholder: '👍 or :thumbsup:' }),
        f.select('target', 'React to Which Message', [
          { v: 'trigger',  l: 'The trigger message' },
          { v: 'bot_last', l: "Bot's last response" },
        ]),
      ],
      defaults: { emoji: '', target: 'trigger' },
    },

    purge_messages: {
      category: 'messages', label: 'Purge Messages', description: 'Bulk-delete recent messages.',
      fields: [
        f.num('count', 'Number of Messages', { required: true, min: 1, max: 100 }),
        f.select('filter', 'Filter', [
          { v: 'all',  l: 'All messages' },
          { v: 'bots', l: 'Bot messages only' },
          { v: 'user', l: "Author's messages only" },
        ]),
      ],
      defaults: { count: 5, filter: 'all' },
    },

    // COMPONENTS
    send_buttons: {
      category: 'components', label: 'Send Button Row', description: 'Send a message with up to 5 buttons.',
      fields: [
        f.area('message', 'Message Above Buttons', { max: 2000 }),
        { key: 'buttons', type: FT.BUTTON_ARRAY, label: 'Buttons' },
        f.channel('channel_id', 'Channel'),
        f.text('store_id_as', 'Store Message ID As', { max: 32 }),
      ],
      defaults: { message: '', buttons: [], channel_id: '', store_id_as: '' },
    },

    send_select_menu: {
      category: 'components', label: 'Send Select Menu', description: 'Send a dropdown selection menu.',
      fields: [
        f.text('placeholder', 'Placeholder Text', { max: 150, placeholder: 'Choose an option…' }),
        f.area('message', 'Message Above Menu', { max: 2000 }),
        { key: 'options', type: FT.OPTION_ARRAY, label: 'Options' },
        f.num('min_values', 'Min Selections', { min: 1, max: 25 }),
        f.num('max_values', 'Max Selections', { min: 1, max: 25 }),
        f.channel('channel_id', 'Channel'),
        f.text('store_id_as', 'Store Message ID As', { max: 32 }),
      ],
      defaults: { placeholder: 'Choose an option…', message: '', options: [],
                  min_values: 1, max_values: 1, channel_id: '', store_id_as: '' },
    },

    show_modal: {
      category: 'components', label: 'Show Modal (Form)', description: 'Display a pop-up form dialog.',
      fields: [
        f.text('title', 'Modal Title', { required: true, max: 45 }),
        { key: 'fields', type: FT.MODAL_FIELDS, label: 'Input Fields', hint: 'Up to 5 text inputs' },
        f.text('store_prefix', 'Variable Prefix', { max: 20, placeholder: 'modal' }),
      ],
      defaults: { title: '', fields: [], store_prefix: 'modal' },
    },

    // AWAIT
    await_button: {
      category: 'await', label: 'Await Button Click', description: 'Pause and wait for a button click.',
      fields: [
        f.text('button_id', 'Button Custom ID', { required: true, max: 100, placeholder: 'btn_confirm' }),
        f.num('timeout_seconds', 'Timeout (seconds)', { min: 5, max: 300 }),
        f.select('on_timeout', 'On Timeout', ON_TIMEOUT_OPTS),
        f.text('store_user_as', "Store clicking user's ID as", { max: 32, placeholder: 'clicker_id' }),
      ],
      defaults: { button_id: '', timeout_seconds: 60, on_timeout: 'stop', store_user_as: '' },
    },

    await_select: {
      category: 'await', label: 'Await Select Choice', description: 'Pause and wait for a menu selection.',
      fields: [
        f.num('timeout_seconds', 'Timeout (seconds)', { min: 5, max: 300 }),
        f.select('on_timeout', 'On Timeout', ON_TIMEOUT_OPTS),
        f.text('store_values_as', 'Store Selected Values As', { max: 32, placeholder: 'selection' }),
      ],
      defaults: { timeout_seconds: 60, on_timeout: 'stop', store_values_as: 'selection' },
    },

    await_message: {
      category: 'await', label: 'Await User Message', description: 'Pause and wait for the user to type.',
      fields: [
        f.num('timeout_seconds', 'Timeout (seconds)', { min: 5, max: 300 }),
        f.select('on_timeout', 'On Timeout', ON_TIMEOUT_OPTS),
        f.text('store_as', 'Store Message Content As', { max: 32, placeholder: 'user_response' }),
        f.toggle('delete_response', "Delete the user's response after collecting"),
      ],
      defaults: { timeout_seconds: 60, on_timeout: 'stop', store_as: 'user_response', delete_response: false },
    },

    // CHANNELS
    create_thread: {
      category: 'channels', label: 'Create Thread', description: 'Create a new thread on the trigger message.',
      fields: [
        f.text('name', 'Thread Name', { required: true, max: 100, placeholder: "{username}'s thread" }),
        f.select('auto_archive', 'Auto-archive After', [
          { v: '60',    l: '1 hour'  },
          { v: '1440',  l: '1 day'   },
          { v: '4320',  l: '3 days'  },
          { v: '10080', l: '1 week'  },
        ]),
        f.text('store_id_as', 'Store Thread ID As', { max: 32, placeholder: 'thread_id' }),
      ],
      defaults: { name: '', auto_archive: '1440', store_id_as: '' },
    },

    set_channel_topic: {
      category: 'channels', label: 'Set Channel Topic', description: 'Update a channel topic.',
      fields: [
        f.area('topic', 'New Topic', { max: 1024 }),
        f.channel('channel_id', 'Channel', { hint: 'Blank = current channel' }),
      ],
      defaults: { topic: '', channel_id: '' },
    },

    set_slowmode: {
      category: 'channels', label: 'Set Slowmode', description: 'Set or remove slowmode on a channel.',
      fields: [
        f.num('seconds', 'Slowmode (seconds)', { min: 0, max: 21600, hint: '0 = disabled' }),
        f.channel('channel_id', 'Channel', { hint: 'Blank = current channel' }),
      ],
      defaults: { seconds: 5, channel_id: '' },
    },

    lock_channel: {
      category: 'channels', label: 'Lock / Unlock Channel', description: 'Lock or unlock a channel.',
      fields: [
        f.select('action', 'Action', [
          { v: 'lock',   l: 'Lock (deny @everyone from sending)' },
          { v: 'unlock', l: 'Unlock (restore @everyone)' },
        ]),
        f.channel('channel_id', 'Channel', { hint: 'Blank = current channel' }),
        f.text('reason', 'Audit Log Reason', { max: 512 }),
      ],
      defaults: { action: 'lock', channel_id: '', reason: '' },
    },

    // ROLES
    add_role: {
      category: 'roles', label: 'Add Role', description: 'Give a role to a member.',
      fields: [
        f.role('role_id', 'Role', { required: true }),
        f.select('target', 'Target', TARGET_OPTS),
        f.text('reason', 'Audit Log Reason', { max: 512 }),
      ],
      defaults: { role_id: '', target: 'author', reason: '' },
    },

    remove_role: {
      category: 'roles', label: 'Remove Role', description: 'Remove a role from a member.',
      fields: [
        f.role('role_id', 'Role', { required: true }),
        f.select('target', 'Target', TARGET_OPTS),
        f.text('reason', 'Audit Log Reason', { max: 512 }),
      ],
      defaults: { role_id: '', target: 'author', reason: '' },
    },

    toggle_role: {
      category: 'roles', label: 'Toggle Role', description: 'Add if absent, remove if present.',
      fields: [
        f.role('role_id', 'Role', { required: true }),
        f.select('target', 'Target', TARGET_OPTS),
        f.text('store_action_as', 'Store Action As', { max: 32, placeholder: 'role_action' }),
      ],
      defaults: { role_id: '', target: 'author', store_action_as: '' },
    },

    // MEMBERS
    set_nickname: {
      category: 'members', label: 'Set Nickname', description: "Change a member's display name.",
      fields: [
        f.text('nickname', 'New Nickname', { max: 32, placeholder: '{username} — blank to reset' }),
        f.select('target', 'Target', TARGET_OPTS),
      ],
      defaults: { nickname: '', target: 'author' },
    },

    kick_member: {
      category: 'members', label: 'Kick Member', description: 'Kick a member from the server.',
      fields: [
        f.select('target', 'Target', TARGET_OPTS),
        f.text('reason', 'Reason', { required: true, max: 512 }),
        f.toggle('dm_before', 'DM user before kick'),
        f.area('dm_message', 'DM Message', { max: 2000, showIf: { key: 'dm_before', value: true } }),
      ],
      defaults: { target: 'mentioned', reason: '', dm_before: false, dm_message: '' },
    },

    ban_member: {
      category: 'members', label: 'Ban Member', description: 'Permanently ban a member.',
      fields: [
        f.select('target', 'Target', TARGET_OPTS),
        f.text('reason', 'Reason', { required: true, max: 512 }),
        f.num('delete_days', 'Delete Message History (days)', { min: 0, max: 7 }),
        f.toggle('dm_before', 'DM user before ban'),
      ],
      defaults: { target: 'mentioned', reason: '', delete_days: 0, dm_before: false },
    },

    timeout_member: {
      category: 'members', label: 'Timeout Member', description: 'Temporarily restrict a member.',
      fields: [
        f.select('target', 'Target', TARGET_OPTS),
        f.num('duration_minutes', 'Duration (minutes)', { required: true, min: 1, max: 40320 }),
        f.text('reason', 'Reason', { max: 512 }),
      ],
      defaults: { target: 'mentioned', duration_minutes: 10, reason: '' },
    },

    remove_timeout: {
      category: 'members', label: 'Remove Timeout', description: 'Remove an active timeout.',
      fields: [ f.select('target', 'Target', TARGET_OPTS) ],
      defaults: { target: 'mentioned' },
    },

    get_member_info: {
      category: 'members', label: 'Get Member Info → Vars', description: 'Fetch member details into variables.',
      fields: [
        f.select('target', 'Target', TARGET_OPTS),
        f.text('var_prefix', 'Variable Prefix', { max: 20, placeholder: 'member',
          hint: 'Stores {prefix}_id, {prefix}_username, {prefix}_nickname, {prefix}_roles, etc.' }),
      ],
      defaults: { target: 'author', var_prefix: 'member' },
    },

    warn_member: {
      category: 'members', label: 'Warn Member', description: 'Log a warning and optionally DM.',
      fields: [
        f.select('target', 'Target', TARGET_OPTS),
        f.text('reason', 'Reason', { required: true, max: 512 }),
        f.toggle('dm_user', 'DM the user their warning'),
      ],
      defaults: { target: 'mentioned', reason: '', dm_user: true },
    },

    // VARIABLES
    set_variable: {
      category: 'variables', label: 'Set Variable', description: 'Store a value in a named variable.',
      fields: [
        f.text('var_name', 'Variable Name', { required: true, max: 32, placeholder: 'my_var' }),
        f.text('value', 'Value', { required: true, max: 500, placeholder: 'value or {another_var}' }),
        f.select('scope', 'Scope', [
          { v: 'flow',  l: 'This execution only (temporary)' },
          { v: 'user',  l: 'Per-user persistent (DB)' },
          { v: 'guild', l: 'Per-server persistent (DB)' },
        ]),
      ],
      defaults: { var_name: '', value: '', scope: 'flow' },
    },

    get_variable: {
      category: 'variables', label: 'Get Variable', description: 'Read a persistent variable into a flow var.',
      fields: [
        f.text('var_name', 'Variable Name', { required: true, max: 32 }),
        f.select('scope', 'Scope', [
          { v: 'user',  l: 'Per-user (DB)' },
          { v: 'guild', l: 'Per-server (DB)' },
        ]),
        f.text('default_value', 'Default If Not Found', { max: 500 }),
        f.text('store_as', 'Store Result As', { max: 32 }),
      ],
      defaults: { var_name: '', scope: 'user', default_value: '0', store_as: '' },
    },

    increment_variable: {
      category: 'variables', label: 'Increment Variable', description: 'Add or subtract from a persistent variable.',
      fields: [
        f.text('var_name', 'Variable Name', { required: true, max: 32 }),
        f.num('amount', 'Amount (negative to decrement)', { min: -99999, max: 99999 }),
        f.select('scope', 'Scope', [
          { v: 'user',  l: 'Per-user (DB)' },
          { v: 'guild', l: 'Per-server (DB)' },
        ]),
      ],
      defaults: { var_name: '', amount: 1, scope: 'user' },
    },

    delete_variable: {
      category: 'variables', label: 'Delete Variable', description: 'Permanently delete a persistent variable.',
      fields: [
        f.text('var_name', 'Variable Name', { required: true, max: 32 }),
        f.select('scope', 'Scope', [
          { v: 'user',  l: 'Per-user (DB)' },
          { v: 'guild', l: 'Per-server (DB)' },
        ]),
      ],
      defaults: { var_name: '', scope: 'user' },
    },

    random_number: {
      category: 'variables', label: 'Random Number → Var', description: 'Generate a random integer.',
      fields: [
        f.num('min', 'Minimum', { min: 0, max: 999999 }),
        f.num('max', 'Maximum', { min: 1, max: 999999 }),
        f.text('store_as', 'Store As', { max: 32, placeholder: 'random' }),
      ],
      defaults: { min: 1, max: 100, store_as: 'random' },
    },

    random_choice: {
      category: 'variables', label: 'Random Choice → Var', description: 'Randomly pick from a list.',
      fields: [
        f.text('choices', 'Choices (comma-separated)', { required: true, max: 1000,
          placeholder: 'option1, option2, option3' }),
        f.text('store_as', 'Store As', { max: 32, placeholder: 'choice' }),
      ],
      defaults: { choices: '', store_as: 'choice' },
    },

    // MATH & TEXT
    math: {
      category: 'math_text', label: 'Math Expression', description: 'Evaluate arithmetic and store the result.',
      fields: [
        f.text('expression', 'Expression', { required: true, max: 200,
          placeholder: '{wallet} + 100', hint: 'Supports +, -, *, /, %, floor(), ceil(), round()' }),
        f.text('store_as', 'Store Result As', { required: true, max: 32, placeholder: 'result' }),
      ],
      defaults: { expression: '', store_as: 'result' },
    },

    format_text: {
      category: 'math_text', label: 'Format Text → Var', description: 'Fill a template with variables.',
      fields: [
        f.area('template', 'Text Template', { required: true, max: 2000,
          placeholder: 'Hello {username}, you have {coins} coins!' }),
        f.text('store_as', 'Store As', { required: true, max: 32, placeholder: 'formatted' }),
      ],
      defaults: { template: '', store_as: 'formatted' },
    },

    string_operation: {
      category: 'math_text', label: 'String Operation', description: 'Transform or inspect a text value.',
      fields: [
        f.text('text', 'Input Text', { required: true, max: 2000, placeholder: '{my_var} or literal text' }),
        f.select('operation', 'Operation', [
          { v: 'uppercase', l: 'UPPERCASE' },
          { v: 'lowercase', l: 'lowercase' },
          { v: 'trim',      l: 'Trim whitespace' },
          { v: 'reverse',   l: 'Reverse characters' },
          { v: 'length',    l: 'Get length → variable' },
          { v: 'replace',   l: 'Find & Replace' },
          { v: 'contains',  l: 'Contains? (→ "true"/"false")' },
        ]),
        f.text('find',         'Find',         { max: 100, showIf: { key: 'operation', value: 'replace' } }),
        f.text('replace_with', 'Replace With', { max: 100, showIf: { key: 'operation', value: 'replace' } }),
        f.text('search',       'Search For',   { max: 200, showIf: { key: 'operation', value: 'contains' } }),
        f.text('store_as', 'Store Result As', { required: true, max: 32, placeholder: 'result' }),
      ],
      defaults: { text: '', operation: 'uppercase', find: '', replace_with: '', search: '', store_as: 'result' },
    },

    number_format: {
      category: 'math_text', label: 'Number Format → Var', description: 'Format a number as thousands, ordinal, etc.',
      fields: [
        f.text('value', 'Number Value', { required: true, max: 100, placeholder: '{coins} or 1500000' }),
        f.select('format', 'Format', [
          { v: 'thousands', l: 'Thousands separator (1,500,000)' },
          { v: 'fixed_2',   l: 'Fixed 2 decimal places'          },
          { v: 'ordinal',   l: 'Ordinal (1st, 2nd, 3rd…)'        },
          { v: 'compact',   l: 'Compact (1.5M, 1.5K…)'           },
        ]),
        f.text('store_as', 'Store Result As', { required: true, max: 32, placeholder: 'formatted_num' }),
      ],
      defaults: { value: '', format: 'thousands', store_as: 'formatted_num' },
    },

    log_to_channel: {
      category: 'math_text', label: 'Log to Channel', description: 'Send a log entry to a designated channel.',
      fields: [
        f.channel('channel_id', 'Log Channel', { required: true }),
        f.area('message', 'Log Message', { required: true, max: 2000,
          placeholder: '{user} ran the command in {channel}' }),
        f.toggle('as_embed', 'Send as embed'),
        f.color('embed_color', 'Embed Colour', { showIf: { key: 'as_embed', value: true } }),
      ],
      defaults: { channel_id: '', message: '', as_embed: false, embed_color: '#5865f2' },
    },

    // FLOW CONTROL
    condition_if: {
      category: 'flow', label: 'Condition (If / Else)', description: 'Branch based on a condition.',
      maxNested: true,
      fields: [
        f.select('condition_type', 'Check Type', CONDITION_TYPE_OPTS),
        f.role('role_id', 'Role', { showIf: { key: 'condition_type', value: ['has_role','not_has_role'] } }),
        f.channel('channel_id', 'Channel', { showIf: { key: 'condition_type', value: ['in_channel','not_in_channel'] } }),
        f.text('var_name', 'Variable Name', { max: 32,
          showIf: { key: 'condition_type', value: ['var_equals','var_not_equals','var_greater','var_less','var_contains','var_is_empty'] } }),
        f.text('compare_value', 'Compare To Value', { max: 500,
          showIf: { key: 'condition_type', value: ['var_equals','var_not_equals','var_greater','var_less','var_contains','arg_equals','message_contains'] } }),
        f.select('permission', 'Permission', PERM_OPTS,
          { showIf: { key: 'condition_type', value: ['user_has_perm','user_not_perm'] } }),
        f.num('chance_percent', 'Chance (%)', { min: 1, max: 99,
          showIf: { key: 'condition_type', value: ['random_chance'] } }),
        f.branch('else_blocks', 'ELSE branch'),
      ],
      defaults: {
        condition_type: 'has_role', role_id: '', channel_id: '',
        var_name: '', compare_value: '', permission: 'ManageMessages', chance_percent: 50,
        if_blocks: [], else_blocks: [],
      },
    },

    stop_if: {
      category: 'flow', label: 'Stop If (Guard)', description: 'Stop the workflow if a condition is true.',
      fields: [
        f.select('condition_type', 'Stop When', CONDITION_TYPE_OPTS.filter((o) => o.v !== 'arg_equals')),
        f.role('role_id', 'Role', { showIf: { key: 'condition_type', value: ['has_role','not_has_role'] } }),
        f.channel('channel_id', 'Channel', { showIf: { key: 'condition_type', value: ['in_channel','not_in_channel'] } }),
        f.text('var_name', 'Variable Name', { max: 32,
          showIf: { key: 'condition_type', value: ['var_equals','var_not_equals','var_greater','var_less','var_contains','var_is_empty'] } }),
        f.text('compare_value', 'Value to Compare', { max: 500,
          showIf: { key: 'condition_type', value: ['var_equals','var_not_equals','var_greater','var_less','var_contains','message_contains'] } }),
        f.select('permission', 'Permission', PERM_OPTS,
          { showIf: { key: 'condition_type', value: ['user_has_perm','user_not_perm'] } }),
        f.num('chance_percent', 'Chance (%)', { min: 1, max: 99,
          showIf: { key: 'condition_type', value: ['random_chance'] } }),
        f.area('reply_msg', 'Reply with Error Message (optional)', { max: 2000 }),
        f.toggle('reply_ephemeral', 'Make error reply ephemeral'),
      ],
      defaults: {
        condition_type: 'not_has_role', role_id: '', channel_id: '',
        var_name: '', compare_value: '', permission: 'ManageMessages', chance_percent: 50,
        reply_msg: '', reply_ephemeral: true,
      },
    },

    loop_times: {
      category: 'flow', label: 'Loop (Repeat N Times)', description: 'Execute inner blocks N times.',
      maxNested: true,
      fields: [
        f.num('times', 'Repeat Count', { required: true, min: 1, max: 10,
          hint: 'Max 10 iterations. {loop_index} (0-based), {loop_count} (1-based) available inside.' }),
      ],
      defaults: { times: 3, loop_blocks: [] },
    },

    delay: {
      category: 'flow', label: 'Wait / Delay', description: 'Pause the workflow.',
      fields: [
        f.num('ms', 'Delay (milliseconds)', { required: true, min: 100, max: 10000,
          hint: '100ms – 10000ms max' }),
      ],
      defaults: { ms: 1000 },
    },

    stop_flow: {
      category: 'flow', label: 'Stop Workflow', description: 'Immediately stop all further blocks.',
      fields: [],
      defaults: {},
    },
  };

  // ── Public API ───────────────────────────────────────────────

  window.WORKFLOW_REGISTRY = {
    CATEGORIES,
    BLOCKS,
    FT,

    /** Get a block definition by type */
    getBlock(type) {
      return BLOCKS[type] || null;
    },

    /** Get all blocks for a category id */
    getByCategory(categoryId) {
      return Object.entries(BLOCKS)
        .filter(([, def]) => def.category === categoryId)
        .map(([type, def]) => ({ type, ...def }));
    },

    /** Deep-copy of default data for a type */
    getDefaults(type) {
      const def = BLOCKS[type];
      return def ? JSON.parse(JSON.stringify(def.defaults)) : {};
    },

    /** Category meta for a block type */
    getCategoryMeta(type) {
      const def = BLOCKS[type];
      if (!def) return null;
      return CATEGORIES.find((c) => c.id === def.category) || null;
    },
  };

}());
