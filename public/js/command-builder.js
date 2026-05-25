/* global */
(function () {
  'use strict';

  // ── Server data ───────────────────────────────────────────────
  const serverDataEl = document.getElementById('cb-server-data');
  const serverData   = serverDataEl ? JSON.parse(serverDataEl.textContent) : {};
  const GUILD_ID     = serverData.guildId;
  let   CMD_ID       = serverData.cmdId || null;

  // ── Block definitions ─────────────────────────────────────────
  // Front-end schema: used to render fields for each block type.
  const BLOCK_DEFS = {
    // ── Response ────────────────────────────────────────────────
    reply: {
      category: 'response', label: 'Reply', icon: '↩️', color: '#5865f2',
      description: 'Reply to the triggering interaction or message',
      schema: [
        { key: 'content',   type: 'textarea', label: 'Content',    placeholder: 'Hello {user}!' },
        { key: 'ephemeral', type: 'toggle',   label: 'Ephemeral (only visible to triggering user)' },
      ],
    },
    send_ephemeral: {
      category: 'response', label: 'Send Ephemeral Reply', icon: '👁️', color: '#5865f2',
      schema: [{ key: 'content', type: 'textarea', label: 'Content' }],
    },
    send_message: {
      category: 'response', label: 'Send Message', icon: '💬', color: '#5865f2',
      schema: [
        { key: 'channelId', type: 'text',     label: 'Channel ID', placeholder: '{channel.id}' },
        { key: 'content',   type: 'textarea', label: 'Content' },
      ],
    },
    send_dm: {
      category: 'response', label: 'Send DM', icon: '📨', color: '#5865f2',
      schema: [
        { key: 'userId',  type: 'text',     label: 'User ID', placeholder: '{user.id}' },
        { key: 'content', type: 'textarea', label: 'Content' },
      ],
    },
    edit_reply: {
      category: 'response', label: 'Edit Reply', icon: '✏️', color: '#5865f2',
      schema: [{ key: 'content', type: 'textarea', label: 'New Content' }],
    },
    edit_message: {
      category: 'response', label: 'Edit Message', icon: '✏️', color: '#5865f2',
      schema: [
        { key: 'channelId', type: 'text',     label: 'Channel ID' },
        { key: 'messageId', type: 'text',     label: 'Message ID' },
        { key: 'content',   type: 'textarea', label: 'New Content' },
      ],
    },
    delete_message: {
      category: 'response', label: 'Delete Message', icon: '🗑️', color: '#ed4245',
      schema: [
        { key: 'channelId', type: 'text', label: 'Channel ID (optional)' },
        { key: 'messageId', type: 'text', label: 'Message ID' },
      ],
    },
    pin_message: {
      category: 'response', label: 'Pin Message', icon: '📌', color: '#fee75c',
      schema: [
        { key: 'channelId', type: 'text', label: 'Channel ID (optional)' },
        { key: 'messageId', type: 'text', label: 'Message ID (optional)' },
      ],
    },
    add_reaction: {
      category: 'response', label: 'Add Reaction', icon: '😀', color: '#fee75c',
      schema: [
        { key: 'emoji',     type: 'text', label: 'Emoji', placeholder: '⭐ or <:name:id>' },
        { key: 'messageId', type: 'text', label: 'Message ID (optional)' },
      ],
    },
    show_modal: {
      category: 'response', label: 'Show Modal', icon: '📋', color: '#5865f2',
      schema: [
        { key: 'customId', type: 'text', label: 'Custom ID', placeholder: 'my_modal' },
        { key: 'title',    type: 'text', label: 'Modal Title', placeholder: 'Enter Details' },
      ],
    },
    // ── Flow ────────────────────────────────────────────────────
    condition: {
      category: 'flow', label: 'Condition (If / Else)', icon: '⚡', color: '#f0b429',
      schema: [
        { key: 'left',     type: 'text',   label: 'Left Value',  placeholder: '{user.id}' },
        { key: 'operator', type: 'select', label: 'Operator',
          options: ['==','!=','>','<','>=','<=','contains','not_contains','starts_with','ends_with','exists','not_exists','matches','is_number','is_empty','not_empty'] },
        { key: 'right',    type: 'text',   label: 'Right Value', placeholder: 'value' },
      ],
    },
    multi_condition: {
      category: 'flow', label: 'Multi-Condition', icon: '🔀', color: '#f0b429',
      schema: [
        { key: 'logic', type: 'select', label: 'Logic', options: ['AND','OR'] },
      ],
    },
    loop: {
      category: 'flow', label: 'Repeat Loop', icon: '🔄', color: '#f0b429',
      schema: [
        { key: 'count',       type: 'number', label: 'Repeat Count (max 100)', min: 1, max: 100 },
        { key: 'counter_var', type: 'text',   label: 'Counter Variable Name (optional)', placeholder: 'i' },
      ],
    },
    foreach: {
      category: 'flow', label: 'For Each', icon: '🔁', color: '#f0b429',
      schema: [
        { key: 'collection', type: 'text', label: 'Collection', placeholder: '{stored.myList}' },
        { key: 'item_var',   type: 'text', label: 'Item Variable', placeholder: 'item' },
        { key: 'index_var',  type: 'text', label: 'Index Variable (optional)', placeholder: 'i' },
      ],
    },
    stop: {
      category: 'flow', label: 'Stop Execution', icon: '🛑', color: '#ed4245',
      schema: [{ key: 'reason', type: 'text', label: 'Reason (optional)' }],
    },
    wait: {
      category: 'flow', label: 'Wait / Delay', icon: '⏱️', color: '#b5bac1',
      schema: [{ key: 'ms', type: 'number', label: 'Delay (ms, max 10000)', min: 0, max: 10000 }],
    },
    // ── Variables ────────────────────────────────────────────────
    set_var: {
      category: 'variables', label: 'Set Variable', icon: '📦', color: '#57f287',
      schema: [
        { key: 'name',  type: 'text', label: 'Variable Name', placeholder: 'myVar' },
        { key: 'value', type: 'text', label: 'Value',          placeholder: '{user.id}' },
      ],
    },
    delete_var: {
      category: 'variables', label: 'Delete Variable', icon: '🗑️', color: '#57f287',
      schema: [{ key: 'name', type: 'text', label: 'Variable Name' }],
    },
    math: {
      category: 'variables', label: 'Math Operation', icon: '🔢', color: '#57f287',
      schema: [
        { key: 'result_var', type: 'text',   label: 'Result Variable', placeholder: 'result' },
        { key: 'left',       type: 'text',   label: 'Left Operand',    placeholder: '{myVar}' },
        { key: 'operator',   type: 'select', label: 'Operator', options: ['+','-','*','/','%','**','min','max','abs','floor','ceil','round','sqrt'] },
        { key: 'right',      type: 'text',   label: 'Right Operand',   placeholder: '1' },
      ],
    },
    random_number: {
      category: 'variables', label: 'Random Number', icon: '🎲', color: '#57f287',
      schema: [
        { key: 'result_var', type: 'text',   label: 'Result Variable', placeholder: 'rand' },
        { key: 'min',        type: 'number', label: 'Min', default: 1 },
        { key: 'max',        type: 'number', label: 'Max', default: 100 },
        { key: 'float',      type: 'toggle', label: 'Allow Decimals' },
      ],
    },
    random_choice: {
      category: 'variables', label: 'Random Choice', icon: '🎰', color: '#57f287',
      schema: [
        { key: 'result_var', type: 'text',     label: 'Result Variable' },
        { key: 'choices',    type: 'textarea', label: 'Choices (one per line)', placeholder: 'Option 1\nOption 2\nOption 3' },
      ],
    },
    concat: {
      category: 'variables', label: 'Concatenate Strings', icon: '🔗', color: '#57f287',
      schema: [
        { key: 'result_var', type: 'text',     label: 'Result Variable' },
        { key: 'parts',      type: 'textarea', label: 'Parts (one per line)', placeholder: 'Hello \n{user.name}' },
        { key: 'separator',  type: 'text',     label: 'Separator (optional)' },
      ],
    },
    string_op: {
      category: 'variables', label: 'String Operation', icon: '🔤', color: '#57f287',
      schema: [
        { key: 'result_var', type: 'text',   label: 'Result Variable' },
        { key: 'input',      type: 'text',   label: 'Input', placeholder: '{myVar}' },
        { key: 'operation',  type: 'select', label: 'Operation', options: ['upper','lower','trim','length','reverse','slice','replace','split'] },
        { key: 'arg1',       type: 'text',   label: 'Arg 1' },
        { key: 'arg2',       type: 'text',   label: 'Arg 2' },
      ],
    },
    // ── Stored ──────────────────────────────────────────────────
    stored_get: {
      category: 'stored', label: 'Get Stored Variable', icon: '💾', color: '#eb459e',
      schema: [
        { key: 'ref',        type: 'text', label: 'Variable Reference Name', placeholder: 'userPoints' },
        { key: 'result_var', type: 'text', label: 'Store Result In',         placeholder: 'points' },
      ],
    },
    stored_set: {
      category: 'stored', label: 'Set Stored Variable', icon: '💾', color: '#eb459e',
      schema: [
        { key: 'ref',   type: 'text', label: 'Variable Reference Name' },
        { key: 'value', type: 'text', label: 'New Value' },
      ],
    },
    stored_add: {
      category: 'stored', label: 'Add to Stored Number', icon: '➕', color: '#eb459e',
      schema: [
        { key: 'ref',        type: 'text', label: 'Variable Reference Name' },
        { key: 'amount',     type: 'text', label: 'Amount', placeholder: '10' },
        { key: 'result_var', type: 'text', label: 'Store New Value In (optional)' },
      ],
    },
    stored_subtract: {
      category: 'stored', label: 'Subtract from Stored Number', icon: '➖', color: '#eb459e',
      schema: [
        { key: 'ref',        type: 'text', label: 'Variable Reference Name' },
        { key: 'amount',     type: 'text', label: 'Amount' },
        { key: 'result_var', type: 'text', label: 'Store New Value In (optional)' },
      ],
    },
    stored_delete: {
      category: 'stored', label: 'Delete Stored Value', icon: '🗑️', color: '#eb459e',
      schema: [{ key: 'ref', type: 'text', label: 'Variable Reference Name' }],
    },
    stored_push: {
      category: 'stored', label: 'Push to Collection', icon: '📎', color: '#eb459e',
      schema: [
        { key: 'ref',   type: 'text', label: 'Collection Reference Name' },
        { key: 'value', type: 'text', label: 'Item to Push' },
      ],
    },
    stored_pop: {
      category: 'stored', label: 'Pop from Collection', icon: '📤', color: '#eb459e',
      schema: [
        { key: 'ref',        type: 'text', label: 'Collection Reference Name' },
        { key: 'result_var', type: 'text', label: 'Store Popped Value In', placeholder: 'item' },
      ],
    },
    stored_collection_remove: {
      category: 'stored', label: 'Remove from Collection', icon: '✂️', color: '#eb459e',
      schema: [
        { key: 'ref',      type: 'text',   label: 'Collection Reference Name' },
        { key: 'value',    type: 'text',   label: 'Value or Index to Remove' },
        { key: 'is_index', type: 'toggle', label: 'Remove by Index' },
      ],
    },
    stored_get_object_prop: {
      category: 'stored', label: 'Get Object Property', icon: '🔑', color: '#eb459e',
      schema: [
        { key: 'ref',        type: 'text', label: 'Object Reference Name' },
        { key: 'prop',       type: 'text', label: 'Property Name', placeholder: 'score' },
        { key: 'result_var', type: 'text', label: 'Store Result In', placeholder: 'score' },
      ],
    },
    // ── Roles ───────────────────────────────────────────────────
    add_role: {
      category: 'roles', label: 'Add Role', icon: '🏷️', color: '#3ba55c',
      schema: [
        { key: 'roleId', type: 'text', label: 'Role ID', placeholder: '123456789' },
        { key: 'userId', type: 'text', label: 'User ID (optional)' },
        { key: 'reason', type: 'text', label: 'Reason (optional)' },
      ],
    },
    remove_role: {
      category: 'roles', label: 'Remove Role', icon: '🏷️', color: '#3ba55c',
      schema: [
        { key: 'roleId', type: 'text', label: 'Role ID' },
        { key: 'userId', type: 'text', label: 'User ID (optional)' },
      ],
    },
    toggle_role: {
      category: 'roles', label: 'Toggle Role', icon: '🔀', color: '#3ba55c',
      schema: [
        { key: 'roleId',     type: 'text', label: 'Role ID' },
        { key: 'userId',     type: 'text', label: 'User ID (optional)' },
        { key: 'result_var', type: 'text', label: 'Result Variable (added/removed)' },
      ],
    },
    check_role: {
      category: 'roles', label: 'Check Has Role', icon: '🔍', color: '#3ba55c',
      schema: [
        { key: 'roleId',     type: 'text', label: 'Role ID' },
        { key: 'userId',     type: 'text', label: 'User ID (optional)' },
        { key: 'result_var', type: 'text', label: 'Result Variable (true/false)', placeholder: 'hasRole' },
      ],
    },
    // ── Members ─────────────────────────────────────────────────
    timeout_member: {
      category: 'members', label: 'Timeout Member', icon: '⏰', color: '#ed4245',
      schema: [
        { key: 'userId',  type: 'text',   label: 'User ID' },
        { key: 'seconds', type: 'number', label: 'Duration (seconds)', min: 1, max: 2419200 },
        { key: 'reason',  type: 'text',   label: 'Reason (optional)' },
      ],
    },
    remove_timeout: {
      category: 'members', label: 'Remove Timeout', icon: '✅', color: '#3ba55c',
      schema: [
        { key: 'userId', type: 'text', label: 'User ID' },
        { key: 'reason', type: 'text', label: 'Reason (optional)' },
      ],
    },
    kick_member: {
      category: 'members', label: 'Kick Member', icon: '👢', color: '#ed4245',
      schema: [
        { key: 'userId', type: 'text', label: 'User ID' },
        { key: 'reason', type: 'text', label: 'Reason (optional)' },
      ],
    },
    ban_member: {
      category: 'members', label: 'Ban Member', icon: '🔨', color: '#ed4245',
      schema: [
        { key: 'userId',            type: 'text',   label: 'User ID' },
        { key: 'reason',            type: 'text',   label: 'Reason (optional)' },
        { key: 'deleteMessageDays', type: 'number', label: 'Delete Messages (days, 0-7)', min: 0, max: 7 },
      ],
    },
    set_nickname: {
      category: 'members', label: 'Set Nickname', icon: '✍️', color: '#5865f2',
      schema: [
        { key: 'userId',   type: 'text', label: 'User ID (optional)' },
        { key: 'nickname', type: 'text', label: 'Nickname (empty = reset)' },
      ],
    },
    get_member_info: {
      category: 'members', label: 'Get Member Info', icon: '👤', color: '#5865f2',
      schema: [
        { key: 'userId',       type: 'text', label: 'User ID', placeholder: '{user.id}' },
        { key: 'name_var',     type: 'text', label: 'Name Variable' },
        { key: 'id_var',       type: 'text', label: 'ID Variable' },
        { key: 'joindate_var', type: 'text', label: 'Join Date Variable' },
        { key: 'joined_var',   type: 'text', label: 'In Server Variable (true/false)' },
      ],
    },
    // ── Channels ────────────────────────────────────────────────
    set_channel_topic: {
      category: 'channels', label: 'Set Channel Topic', icon: '📝', color: '#5865f2',
      schema: [
        { key: 'channelId', type: 'text', label: 'Channel ID (optional)' },
        { key: 'topic',     type: 'text', label: 'Topic' },
      ],
    },
    set_slowmode: {
      category: 'channels', label: 'Set Slowmode', icon: '🐢', color: '#5865f2',
      schema: [
        { key: 'channelId', type: 'text',   label: 'Channel ID (optional)' },
        { key: 'seconds',   type: 'number', label: 'Seconds (0 = disable)', min: 0, max: 21600 },
      ],
    },
    lock_channel: {
      category: 'channels', label: 'Lock Channel', icon: '🔒', color: '#ed4245',
      schema: [
        { key: 'channelId', type: 'text', label: 'Channel ID (optional)' },
        { key: 'reason',    type: 'text', label: 'Reason (optional)' },
      ],
    },
    unlock_channel: {
      category: 'channels', label: 'Unlock Channel', icon: '🔓', color: '#3ba55c',
      schema: [{ key: 'channelId', type: 'text', label: 'Channel ID (optional)' }],
    },
    create_thread: {
      category: 'channels', label: 'Create Thread', icon: '🧵', color: '#5865f2',
      schema: [
        { key: 'name',                  type: 'text',   label: 'Thread Name' },
        { key: 'channelId',             type: 'text',   label: 'Parent Channel ID (optional)' },
        { key: 'auto_archive_duration', type: 'select', label: 'Auto-archive', options: ['60','1440','4320','10080'] },
        { key: 'result_var',            type: 'text',   label: 'Store Thread ID In (optional)' },
      ],
    },
    get_channel_info: {
      category: 'channels', label: 'Get Channel Info', icon: '#️⃣', color: '#5865f2',
      schema: [
        { key: 'channelId',  type: 'text', label: 'Channel ID' },
        { key: 'name_var',   type: 'text', label: 'Name Variable' },
        { key: 'topic_var',  type: 'text', label: 'Topic Variable' },
        { key: 'exists_var', type: 'text', label: 'Exists Variable (true/false)' },
      ],
    },
    // ── Utility ─────────────────────────────────────────────────
    log: {
      category: 'utility', label: 'Log', icon: '📋', color: '#b5bac1',
      schema: [
        { key: 'message',   type: 'text', label: 'Message', placeholder: 'User {user.id} did...' },
        { key: 'channelId', type: 'text', label: 'Log to Channel ID (optional)' },
      ],
    },
    format_number: {
      category: 'utility', label: 'Format Number', icon: '🔢', color: '#b5bac1',
      schema: [
        { key: 'value',      type: 'text',   label: 'Number', placeholder: '{myVar}' },
        { key: 'decimals',   type: 'number', label: 'Decimal Places', min: 0, max: 20 },
        { key: 'result_var', type: 'text',   label: 'Result Variable' },
      ],
    },
    format_date: {
      category: 'utility', label: 'Format Date', icon: '📅', color: '#b5bac1',
      schema: [
        { key: 'timestamp',  type: 'text',   label: 'Timestamp (ms, s, or ISO)', placeholder: '{timestamp}' },
        { key: 'format',     type: 'select', label: 'Format', options: ['locale','date','time','datetime','relative','iso','discord'] },
        { key: 'result_var', type: 'text',   label: 'Result Variable' },
      ],
    },
    http_get: {
      category: 'utility', label: 'HTTP GET', icon: '🌐', color: '#b5bac1',
      schema: [
        { key: 'url',        type: 'text', label: 'URL (allowlisted only)', placeholder: 'https://api.example.com/...' },
        { key: 'path',       type: 'text', label: 'JSON Path (optional)', placeholder: 'data.title' },
        { key: 'result_var', type: 'text', label: 'Result Variable' },
        { key: 'error_var',  type: 'text', label: 'Error Variable (optional)' },
      ],
    },
    parse_json: {
      category: 'utility', label: 'Parse JSON', icon: '{}', color: '#b5bac1',
      schema: [
        { key: 'input',      type: 'text', label: 'JSON String', placeholder: '{apiResult}' },
        { key: 'path',       type: 'text', label: 'JSON Path', placeholder: 'data.title' },
        { key: 'result_var', type: 'text', label: 'Result Variable' },
      ],
    },
    send_webhook: {
      category: 'utility', label: 'Send Webhook', icon: '🔗', color: '#b5bac1',
      schema: [
        { key: 'url',      type: 'text',     label: 'Webhook URL' },
        { key: 'content',  type: 'textarea', label: 'Content' },
        { key: 'username', type: 'text',     label: 'Username Override (optional)' },
      ],
    },
  };

  const CATEGORY_META = {
    response:  { label: 'Response',   icon: '💬', color: '#5865f2' },
    flow:      { label: 'Flow',       icon: '⚡', color: '#f0b429' },
    variables: { label: 'Variables',  icon: '📦', color: '#57f287' },
    stored:    { label: 'Stored Vars',icon: '💾', color: '#eb459e' },
    roles:     { label: 'Roles',      icon: '🏷️', color: '#3ba55c' },
    members:   { label: 'Members',    icon: '👤', color: '#5865f2' },
    channels:  { label: 'Channels',   icon: '#️⃣', color: '#5865f2' },
    utility:   { label: 'Utility',    icon: '🛠️', color: '#b5bac1' },
  };

  const TRIGGER_TYPES = [
    { type: 'slash',          icon: '/',  label: 'Slash',        description: '/commandname' },
    { type: 'prefix',         icon: '!',  label: 'Prefix',       description: '!trigger' },
    { type: 'contains',       icon: '~',  label: 'Contains',     description: 'msg includes text' },
    { type: 'exact',          icon: '=',  label: 'Exact',        description: 'exact message match' },
    { type: 'startsWith',     icon: '^',  label: 'Starts With',  description: 'message starts with' },
    { type: 'regex',          icon: '.*', label: 'Regex',        description: 'regex match' },
    { type: 'button',         icon: '🔘', label: 'Button',       description: 'button click' },
    { type: 'select_menu',    icon: '📋', label: 'Select Menu',  description: 'select menu' },
    { type: 'modal_submit',   icon: '📝', label: 'Modal Submit', description: 'modal form' },
    { type: 'member_join',    icon: '➕', label: 'Member Join',  description: 'user joins server' },
    { type: 'member_leave',   icon: '➖', label: 'Member Leave', description: 'user leaves server' },
    { type: 'reaction_add',   icon: '😀', label: 'Reaction Add', description: 'reaction added' },
    { type: 'reaction_remove',icon: '😶', label: 'Reaction Remove',description:'reaction removed'},
    { type: 'voice_join',     icon: '🔊', label: 'Voice Join',   description: 'user joins voice' },
    { type: 'voice_leave',    icon: '🔕', label: 'Voice Leave',  description: 'user leaves voice' },
    { type: 'scheduled',      icon: '⏰', label: 'Scheduled',    description: 'run on interval' },
    { type: 'message_delete', icon: '🗑️', label: 'Msg Delete',   description: 'message deleted' },
    { type: 'message_edit',   icon: '✏️', label: 'Msg Edit',     description: 'message edited' },
  ];

  // ── State ─────────────────────────────────────────────────────
  let state = {
    name:        '',
    description: '',
    enabled:     true,
    trigger: {
      type:    'slash',
      value:   '',
      options: [],
      config:  {},
    },
    conditions:  {},
    blocks:      [],
  };
  let _dirty    = false;
  let _inserting = null; // index to insert block at (null = append)

  // ── DOM refs ──────────────────────────────────────────────────
  const $cmdName      = document.getElementById('cb-cmd-name');
  const $triggerBadge = document.getElementById('cb-trigger-badge');
  const $status       = document.getElementById('cb-status');
  const $saveBtn      = document.getElementById('cb-save-btn');
  const $syncBtn      = document.getElementById('cb-sync-btn');
  const $jsonToggle   = document.getElementById('cb-json-toggle');
  const $jsonPanel    = document.getElementById('cb-json-panel');
  const $jsonEditor   = document.getElementById('cb-json-editor');
  const $jsonCopy     = document.getElementById('cb-json-copy');
  const $jsonApply    = document.getElementById('cb-json-apply');
  const $blocksContainer = document.getElementById('cb-blocks-container');
  const $addFirstBlock   = document.getElementById('cb-add-first-block');
  const $blockSearch     = document.getElementById('cb-block-search');
  const $blockCategories = document.getElementById('cb-block-categories');

  // Picker modal
  const $pickerModal  = document.getElementById('cb-picker-modal');
  const $pickerSearch = document.getElementById('cb-picker-search');
  const $pickerList   = document.getElementById('cb-picker-list');
  const $pickerClose  = document.getElementById('cb-picker-close');

  // Conditions modal
  const $condModal    = document.getElementById('cb-conditions-modal');
  const $condClose    = document.getElementById('cb-cond-close');
  const $condSave     = document.getElementById('cb-cond-save');

  // Import / Export
  const $importBtn    = document.getElementById('cb-import-btn');
  const $exportBtn    = document.getElementById('cb-export-btn');
  const $importModal  = document.getElementById('cb-import-modal');
  const $importClose  = document.getElementById('cb-import-close');
  const $importText   = document.getElementById('cb-import-text');
  const $importConfirm = document.getElementById('cb-import-confirm');

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    if (serverData.cmd) {
      loadState(serverData.cmd);
    } else {
      render();
    }
    buildSidebar();
    bindEvents();
  }

  function loadState(cmd) {
    state = {
      name:        cmd.name        || '',
      description: cmd.description || '',
      enabled:     cmd.enabled !== false,
      trigger:     cmd.trigger || { type: 'slash', value: '', options: [], config: {} },
      conditions:  cmd.conditions || {},
      blocks:      Array.isArray(cmd.blocks) ? cmd.blocks : [],
    };
    $cmdName.value = state.name;
    render();
    setDirty(false);
  }

  function setDirty(dirty) {
    _dirty = dirty;
    $status.textContent  = dirty ? 'Unsaved Changes' : 'Saved';
    $status.className    = 'cb-status ' + (dirty ? 'cb-status-dirty' : 'cb-status-saved');
  }

  // ── Sidebar ───────────────────────────────────────────────────
  function buildSidebar() {
    $blockCategories.innerHTML = '';
    const categories = {};
    for (const [type, def] of Object.entries(BLOCK_DEFS)) {
      if (!categories[def.category]) categories[def.category] = [];
      categories[def.category].push({ type, ...def });
    }
    for (const [cat, defs] of Object.entries(CATEGORY_META)) {
      if (!categories[cat]) continue;
      const group = document.createElement('div');
      group.className = 'cb-cat-group';
      const header = document.createElement('div');
      header.className = 'cb-cat-header';
      header.innerHTML = `<span>${defs.icon}</span><span>${defs.label}</span><svg class="cb-cat-header-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`;
      header.addEventListener('click', () => group.classList.toggle('cb-cat-collapsed'));
      const items = document.createElement('div');
      items.className = 'cb-cat-items';
      for (const def of categories[cat]) {
        const item = document.createElement('div');
        item.className = 'cb-cat-item';
        item.innerHTML = `<span class="cb-cat-item-icon" style="background:color-mix(in srgb,${def.color} 20%,transparent)">${def.icon}</span><span class="cb-cat-item-name">${def.label}</span>`;
        item.addEventListener('click', () => addBlock(def.type));
        items.appendChild(item);
      }
      group.appendChild(header);
      group.appendChild(items);
      $blockCategories.appendChild(group);
    }
  }

  function filterSidebar(q) {
    const lower = q.toLowerCase();
    const groups = $blockCategories.querySelectorAll('.cb-cat-group');
    groups.forEach(group => {
      let anyVisible = false;
      group.querySelectorAll('.cb-cat-item').forEach(item => {
        const name = item.querySelector('.cb-cat-item-name').textContent.toLowerCase();
        const visible = !q || name.includes(lower);
        item.style.display = visible ? '' : 'none';
        if (visible) anyVisible = true;
      });
      group.style.display = anyVisible ? '' : 'none';
      if (q && anyVisible) group.classList.remove('cb-cat-collapsed');
    });
  }

  // ── Block Picker Modal ────────────────────────────────────────
  function openPicker(insertIdx = null) {
    _inserting = insertIdx;
    $pickerSearch.value = '';
    renderPickerList('');
    $pickerModal.classList.remove('cb-modal-hidden');
    $pickerSearch.focus();
  }
  function closePicker() {
    $pickerModal.classList.add('cb-modal-hidden');
    _inserting = null;
  }

  function renderPickerList(q) {
    $pickerList.innerHTML = '';
    const lower = q.toLowerCase();
    let lastCat = null;
    for (const [type, def] of Object.entries(BLOCK_DEFS)) {
      if (q && !def.label.toLowerCase().includes(lower) && !def.category.includes(lower)) continue;
      if (def.category !== lastCat) {
        const sep = document.createElement('div');
        sep.className = 'cb-picker-sep';
        sep.textContent = CATEGORY_META[def.category]?.label || def.category;
        $pickerList.appendChild(sep);
        lastCat = def.category;
      }
      const item = document.createElement('div');
      item.className = 'cb-picker-item';
      item.innerHTML = `
        <div class="cb-picker-item-icon" style="background:color-mix(in srgb,${def.color} 20%,transparent)">${def.icon}</div>
        <div class="cb-picker-item-info">
          <div class="cb-picker-item-name">${def.label}</div>
          <div class="cb-picker-item-cat">${CATEGORY_META[def.category]?.label || def.category}</div>
        </div>`;
      item.addEventListener('click', () => { addBlock(type, _inserting); closePicker(); });
      $pickerList.appendChild(item);
    }
    if (!$pickerList.children.length) {
      $pickerList.innerHTML = '<div style="padding:16px;color:var(--text-4);text-align:center;font-size:13px">No blocks match</div>';
    }
  }

  // ── State mutations ───────────────────────────────────────────
  function addBlock(type, insertIdx = null) {
    const id = 'block_' + Math.random().toString(36).slice(2, 8);
    const block = { id, type, data: {} };
    if (insertIdx !== null && insertIdx >= 0) {
      state.blocks.splice(insertIdx, 0, block);
    } else {
      state.blocks.push(block);
    }
    render();
    setDirty(true);
  }

  function removeBlock(id) {
    state.blocks = state.blocks.filter(b => b.id !== id);
    render();
    setDirty(true);
  }

  function moveBlock(id, dir) {
    const idx = state.blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= state.blocks.length) return;
    [state.blocks[idx], state.blocks[newIdx]] = [state.blocks[newIdx], state.blocks[idx]];
    render();
    setDirty(true);
  }

  function updateBlockData(id, key, value) {
    const block = state.blocks.find(b => b.id === id);
    if (block) block.data[key] = value;
    setDirty(true);
    updateJsonPreview();
    updateBlockSubtitle(id);
  }

  function updateBlockSubtitle(id) {
    const el = document.querySelector(`[data-block-id="${id}"] .cb-block-subtitle`);
    if (el) el.textContent = getBlockSubtitle(id);
  }

  function getBlockSubtitle(id) {
    const block = state.blocks.find(b => b.id === id);
    if (!block) return '';
    const def = BLOCK_DEFS[block.type];
    if (!def) return '';
    // First text field value as subtitle
    const firstText = def.schema?.find(f => f.type === 'text' || f.type === 'textarea');
    if (firstText && block.data[firstText.key]) {
      return String(block.data[firstText.key]).slice(0, 40);
    }
    return '';
  }

  // ── Render ────────────────────────────────────────────────────
  function render() {
    // Update trigger badge
    const ttype = state.trigger?.type || 'slash';
    $triggerBadge.textContent = ttype;
    $triggerBadge.className   = `cb-trigger-badge cb-type-${ttype}`;
    $cmdName.value = state.name;

    // Render blocks
    $blocksContainer.innerHTML = '';

    // Trigger block
    $blocksContainer.appendChild(renderTriggerBlock());

    // Action blocks
    if (state.blocks.length === 0) {
      $addFirstBlock.style.display = '';
    } else {
      $addFirstBlock.style.display = 'none';
      state.blocks.forEach((block, idx) => {
        // Add block row before this block (after index 0)
        if (idx > 0) {
          $blocksContainer.appendChild(renderAddRow(idx));
        }
        $blocksContainer.appendChild(renderBlock(block, idx));
      });
      // Add row after last block
      $blocksContainer.appendChild(renderAddRow(state.blocks.length));
    }

    updateJsonPreview();
  }

  function renderTriggerBlock() {
    const div = document.createElement('div');
    div.className = 'cb-block cb-block-trigger cb-block-expanded';
    div.style.setProperty('--cb-block-color', 'var(--accent)');

    const ttype = state.trigger?.type || 'slash';
    const tdef  = TRIGGER_TYPES.find(t => t.type === ttype);

    div.innerHTML = `
      <div class="cb-block-header">
        <span class="cb-block-icon">⚡</span>
        <div class="cb-block-title">Trigger</div>
        <span class="cb-block-subtitle">${tdef?.label || ttype}</span>
        <div class="cb-block-actions">
          <button class="cb-conditions-btn" id="cb-open-conditions" title="Command Conditions">
            ⚙️ Conditions
            ${hasConditions() ? `<span class="cb-conditions-badge">✓</span>` : ''}
          </button>
        </div>
      </div>
      <div class="cb-block-body" style="display:flex;">
        <div class="cb-field-group">
          <label class="cb-label">Trigger Type</label>
          <div class="cb-trigger-type-grid" id="cb-trigger-type-grid"></div>
        </div>
        <div id="cb-trigger-value-wrap" class="cb-field-group" style="display:${['slash','prefix','contains','exact','startsWith','regex'].includes(ttype)?'':'none'}">
          <label class="cb-label">${getTriggerValueLabel(ttype)}</label>
          <input id="cb-trigger-value" class="cb-input" type="text" value="${escHtml(state.trigger?.value||'')}" placeholder="${getTriggerValuePlaceholder(ttype)}" maxlength="100" />
        </div>
        <div id="cb-trigger-desc-wrap" class="cb-field-group">
          <label class="cb-label">Description</label>
          <input id="cb-trigger-desc" class="cb-input" type="text" value="${escHtml(state.description||'')}" placeholder="What this command does..." maxlength="200" />
        </div>
        <div id="cb-slash-options-wrap" style="display:${ttype==='slash'?'':'none'}">
          <div class="cb-field-group">
            <label class="cb-label">Slash Command Options</label>
            <div id="cb-slash-options" class="cb-slash-options"></div>
            <button id="cb-add-option" class="cb-add-option-btn">+ Add Option</button>
          </div>
        </div>
      </div>`;

    // Trigger type buttons
    const grid = div.querySelector('#cb-trigger-type-grid');
    TRIGGER_TYPES.forEach(t => {
      const btn = document.createElement('button');
      btn.className = `cb-trigger-type-btn${t.type === ttype ? ' cb-active' : ''}`;
      btn.setAttribute('data-ttype', t.type);
      btn.innerHTML = `<span class="cb-trigger-type-icon">${t.icon}</span><span>${t.label}</span>`;
      btn.addEventListener('click', () => {
        state.trigger.type = t.type;
        render();
        setDirty(true);
      });
      grid.appendChild(btn);
    });

    // Conditions button
    div.querySelector('#cb-open-conditions')?.addEventListener('click', openConditions);

    // Trigger value
    const triggerValueInput = div.querySelector('#cb-trigger-value');
    if (triggerValueInput) {
      triggerValueInput.addEventListener('input', e => {
        state.trigger.value = e.target.value;
        setDirty(true);
        updateJsonPreview();
      });
    }

    // Description
    const descInput = div.querySelector('#cb-trigger-desc');
    if (descInput) {
      descInput.addEventListener('input', e => {
        state.description = e.target.value;
        setDirty(true);
        updateJsonPreview();
      });
    }

    // Slash options
    if (ttype === 'slash') {
      renderSlashOptions(div.querySelector('#cb-slash-options'));
      div.querySelector('#cb-add-option')?.addEventListener('click', () => {
        if (!state.trigger.options) state.trigger.options = [];
        state.trigger.options.push({ name: '', type: 3, description: '', required: false });
        render();
        setDirty(true);
      });
    }

    return div;
  }

  function getTriggerValueLabel(type) {
    switch (type) {
      case 'slash': return 'Command Name (no spaces, lowercase)';
      case 'prefix': return 'Prefix + Command (e.g. !ping)';
      case 'contains': return 'Text to Match (contains)';
      case 'exact': return 'Exact Message to Match';
      case 'startsWith': return 'Text Message Starts With';
      case 'regex': return 'Regex Pattern (no slashes)';
      default: return 'Trigger Value';
    }
  }
  function getTriggerValuePlaceholder(type) {
    switch (type) {
      case 'slash': return 'ping';
      case 'prefix': return '!ping';
      case 'contains': return 'help me';
      case 'exact': return 'hello bot';
      case 'startsWith': return '!';
      case 'regex': return '^hello|^hi';
      default: return '';
    }
  }

  function renderSlashOptions(container) {
    if (!container) return;
    container.innerHTML = '';
    const options = state.trigger?.options || [];
    const OPTION_TYPES = [
      { v: '3', l: 'String' }, { v: '4', l: 'Integer' }, { v: '10', l: 'Number' },
      { v: '5', l: 'Boolean' }, { v: '6', l: 'User' }, { v: '7', l: 'Channel' },
      { v: '8', l: 'Role' }, { v: '9', l: 'Mentionable' },
    ];
    options.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'cb-slash-option';
      row.innerHTML = `
        <input class="cb-input opt-name" type="text" value="${escHtml(opt.name||'')}" placeholder="name" maxlength="32" />
        <select class="cb-select opt-type">
          ${OPTION_TYPES.map(t => `<option value="${t.v}"${String(opt.type)===t.v?' selected':''}>${t.l}</option>`).join('')}
        </select>
        <input class="cb-input opt-desc" type="text" value="${escHtml(opt.description||'')}" placeholder="description" maxlength="100" />
        <label class="cb-toggle-label" title="Required">
          <input type="checkbox" class="cb-toggle-input opt-req"${opt.required?' checked':''}/>
          <span class="cb-toggle-track"></span>
        </label>
        <button class="cb-slash-option-del" data-idx="${idx}">✕</button>`;
      row.querySelector('.opt-name').addEventListener('input', e => { state.trigger.options[idx].name = e.target.value; setDirty(true); });
      row.querySelector('.opt-type').addEventListener('change', e => { state.trigger.options[idx].type = parseInt(e.target.value); setDirty(true); });
      row.querySelector('.opt-desc').addEventListener('input', e => { state.trigger.options[idx].description = e.target.value; setDirty(true); });
      row.querySelector('.opt-req').addEventListener('change', e => { state.trigger.options[idx].required = e.target.checked; setDirty(true); });
      row.querySelector('.cb-slash-option-del').addEventListener('click', () => {
        state.trigger.options.splice(idx, 1);
        render();
        setDirty(true);
      });
      container.appendChild(row);
    });
  }

  function renderBlock(block, idx) {
    const def = BLOCK_DEFS[block.type];
    if (!def) {
      const unknown = document.createElement('div');
      unknown.className = 'cb-block';
      unknown.innerHTML = `<div class="cb-block-header"><span class="cb-block-title">Unknown block: ${escHtml(block.type)}</span></div>`;
      return unknown;
    }

    const div = document.createElement('div');
    div.className = 'cb-block';
    div.setAttribute('data-block-id', block.id);
    div.style.setProperty('--cb-block-color', def.color || 'var(--accent)');

    const subtitle = getBlockSubtitle(block.id);

    div.innerHTML = `
      <div class="cb-block-header">
        <span class="cb-block-icon">${def.icon || '📦'}</span>
        <div>
          <div class="cb-block-title">${escHtml(def.label)}</div>
          ${subtitle ? `<div class="cb-block-subtitle">${escHtml(subtitle)}</div>` : ''}
        </div>
        <div class="cb-block-actions">
          <button class="cb-block-action" data-action="up" title="Move up">↑</button>
          <button class="cb-block-action" data-action="down" title="Move down">↓</button>
          <button class="cb-block-action cb-action-delete" data-action="delete" title="Delete">✕</button>
        </div>
        <svg class="cb-block-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="cb-block-body">${renderBlockFields(block, def)}</div>`;

    // Toggle expand
    div.querySelector('.cb-block-header').addEventListener('click', e => {
      if (e.target.closest('.cb-block-action')) return;
      div.classList.toggle('cb-block-expanded');
    });

    // Actions
    div.querySelectorAll('.cb-block-action').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        if (action === 'delete') removeBlock(block.id);
        else if (action === 'up') moveBlock(block.id, 'up');
        else if (action === 'down') moveBlock(block.id, 'down');
      });
    });

    // Field change listeners
    div.querySelectorAll('[data-field-key]').forEach(input => {
      const key = input.getAttribute('data-field-key');
      const evName = (input.type === 'checkbox') ? 'change' : 'input';
      input.addEventListener(evName, e => {
        updateBlockData(block.id, key, input.type === 'checkbox' ? input.checked : input.value);
      });
    });

    return div;
  }

  function renderBlockFields(block, def) {
    if (!def.schema) return '';
    return def.schema.map(field => {
      const val = block.data[field.key];
      const valStr = val !== undefined && val !== null ? String(val) : (field.default !== undefined ? String(field.default) : '');

      switch (field.type) {
        case 'textarea':
          return `<div class="cb-field-group">
            <label class="cb-label">${escHtml(field.label)}</label>
            <textarea class="cb-textarea" data-field-key="${escHtml(field.key)}" placeholder="${escHtml(field.placeholder||'')}">${escHtml(valStr)}</textarea>
          </div>`;
        case 'toggle':
          return `<label class="cb-toggle-label">
            <input type="checkbox" class="cb-toggle-input" data-field-key="${escHtml(field.key)}"${(val===true||val==='true')?' checked':''}/>
            <span class="cb-toggle-track"></span>
            ${escHtml(field.label)}
          </label>`;
        case 'select':
          return `<div class="cb-field-group">
            <label class="cb-label">${escHtml(field.label)}</label>
            <select class="cb-select" data-field-key="${escHtml(field.key)}">
              ${(field.options||[]).map(o => `<option value="${escHtml(o)}"${valStr===o?' selected':''}>${escHtml(o)}</option>`).join('')}
            </select>
          </div>`;
        case 'number':
          return `<div class="cb-field-group">
            <label class="cb-label">${escHtml(field.label)}</label>
            <input type="number" class="cb-input" data-field-key="${escHtml(field.key)}" value="${escHtml(valStr)}" ${field.min!==undefined?`min="${field.min}"`:''}${field.max!==undefined?` max="${field.max}"`:''}/>
          </div>`;
        default: // text
          return `<div class="cb-field-group">
            <label class="cb-label">${escHtml(field.label)}</label>
            <input type="text" class="cb-input" data-field-key="${escHtml(field.key)}" value="${escHtml(valStr)}" placeholder="${escHtml(field.placeholder||'')}"/>
          </div>`;
      }
    }).join('');
  }

  function renderAddRow(idx) {
    const div = document.createElement('div');
    div.className = 'cb-add-row';
    const btn = document.createElement('button');
    btn.className = 'cb-add-block-btn';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Block`;
    btn.addEventListener('click', () => openPicker(idx));
    div.appendChild(btn);
    return div;
  }

  // ── Conditions helpers ────────────────────────────────────────
  function hasConditions() {
    const c = state.conditions || {};
    return !!(
      (c.allowedRoles?.length) ||
      (c.ignoredRoles?.length) ||
      (c.allowedChannels?.length) ||
      (c.ignoredChannels?.length) ||
      (c.cooldown?.seconds > 0) ||
      c.ephemeralReply
    );
  }

  function openConditions() {
    const c = state.conditions || {};
    document.getElementById('cond-allowed-roles').value     = (c.allowedRoles || []).join(', ');
    document.getElementById('cond-ignored-roles').value     = (c.ignoredRoles || []).join(', ');
    document.getElementById('cond-allowed-channels').value  = (c.allowedChannels || []).join(', ');
    document.getElementById('cond-ignored-channels').value  = (c.ignoredChannels || []).join(', ');
    document.getElementById('cond-cooldown-seconds').value  = c.cooldown?.seconds || '';
    document.getElementById('cond-cooldown-scope').value    = c.cooldown?.scope || 'user';
    document.getElementById('cond-ephemeral').checked       = !!c.ephemeralReply;
    $condModal.classList.remove('cb-modal-hidden');
  }

  function parseIdList(str) {
    return str.split(',').map(s => s.trim()).filter(s => /^\d{17,20}$/.test(s));
  }

  function saveConditions() {
    const seconds = parseInt(document.getElementById('cond-cooldown-seconds').value) || 0;
    state.conditions = {
      allowedRoles:    parseIdList(document.getElementById('cond-allowed-roles').value),
      ignoredRoles:    parseIdList(document.getElementById('cond-ignored-roles').value),
      allowedChannels: parseIdList(document.getElementById('cond-allowed-channels').value),
      ignoredChannels: parseIdList(document.getElementById('cond-ignored-channels').value),
      cooldown: seconds > 0 ? {
        seconds,
        scope: document.getElementById('cond-cooldown-scope').value,
      } : undefined,
      ephemeralReply: document.getElementById('cond-ephemeral').checked,
    };
    $condModal.classList.add('cb-modal-hidden');
    render();
    setDirty(true);
  }

  // ── JSON ──────────────────────────────────────────────────────
  function buildPayload() {
    return {
      name:        $cmdName.value.trim() || state.name,
      description: state.description,
      enabled:     state.enabled,
      trigger:     state.trigger,
      conditions:  state.conditions,
      blocks:      state.blocks,
    };
  }

  function updateJsonPreview() {
    if ($jsonPanel.classList.contains('cb-json-hidden')) return;
    $jsonEditor.value = JSON.stringify(buildPayload(), null, 2);
  }

  // ── API calls ─────────────────────────────────────────────────
  async function save() {
    const name = $cmdName.value.trim();
    if (!name) { showToast('Command name is required', 'error'); return; }

    state.name = name;
    const payload = buildPayload();

    $status.textContent = 'Saving…';
    $status.className   = 'cb-status cb-status-saving';
    $saveBtn.disabled   = true;

    try {
      const url    = CMD_ID
        ? `/api/guild/${GUILD_ID}/guild-commands/${CMD_ID}`
        : `/api/guild/${GUILD_ID}/guild-commands`;
      const method = CMD_ID ? 'PUT' : 'POST';
      const resp   = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Failed to save');

      if (!CMD_ID && json.command?._id) {
        CMD_ID = json.command._id;
        history.replaceState({}, '', `/dashboard/${GUILD_ID}/commands/builder/${CMD_ID}`);
      }
      setDirty(false);
      showToast('Command saved', 'success');
    } catch (err) {
      $status.textContent = 'Error saving';
      $status.className   = 'cb-status cb-status-error';
      showToast(err.message || 'Save failed', 'error');
    } finally {
      $saveBtn.disabled = false;
    }
  }

  async function syncSlash() {
    if (!CMD_ID) { showToast('Save the command first', 'error'); return; }
    if (state.trigger?.type !== 'slash') { showToast('Only slash commands can be synced', 'error'); return; }
    $syncBtn.disabled = true;
    try {
      const resp = await fetch(`/api/guild/${GUILD_ID}/guild-commands/${CMD_ID}/sync`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Sync failed');
      showToast('Slash command synced with Discord ✓', 'success');
    } catch (err) {
      showToast(err.message || 'Sync failed', 'error');
    } finally {
      $syncBtn.disabled = false;
    }
  }

  // ── Events ────────────────────────────────────────────────────
  function bindEvents() {
    $saveBtn.addEventListener('click', save);
    $syncBtn.addEventListener('click', syncSlash);

    // Name input
    $cmdName.addEventListener('input', () => setDirty(true));

    // JSON toggle
    $jsonToggle.addEventListener('click', () => {
      $jsonPanel.classList.toggle('cb-json-hidden');
      updateJsonPreview();
    });
    $jsonCopy.addEventListener('click', () => {
      navigator.clipboard.writeText($jsonEditor.value).catch(() => null);
      showToast('JSON copied', 'success');
    });
    $jsonApply.addEventListener('click', () => {
      try {
        const parsed = JSON.parse($jsonEditor.value);
        loadState(parsed);
        setDirty(true);
        showToast('JSON applied', 'success');
      } catch {
        showToast('Invalid JSON', 'error');
      }
    });

    // Add first block
    $addFirstBlock.addEventListener('click', () => openPicker(null));

    // Sidebar search
    $blockSearch.addEventListener('input', e => filterSidebar(e.target.value));

    // Picker
    $pickerSearch.addEventListener('input', e => renderPickerList(e.target.value));
    $pickerClose.addEventListener('click', closePicker);
    $pickerModal.querySelector('.cb-modal-backdrop').addEventListener('click', closePicker);

    // Conditions
    $condClose.addEventListener('click', () => $condModal.classList.add('cb-modal-hidden'));
    $condModal.querySelector('.cb-modal-backdrop').addEventListener('click', () => $condModal.classList.add('cb-modal-hidden'));
    $condSave.addEventListener('click', saveConditions);

    // Import / Export
    $importBtn.addEventListener('click', () => {
      $importText.value = '';
      $importModal.classList.remove('cb-modal-hidden');
    });
    $importClose.addEventListener('click', () => $importModal.classList.add('cb-modal-hidden'));
    $importModal.querySelector('.cb-modal-backdrop').addEventListener('click', () => $importModal.classList.add('cb-modal-hidden'));
    $importConfirm.addEventListener('click', () => {
      try {
        const parsed = JSON.parse($importText.value);
        loadState(parsed);
        setDirty(true);
        $importModal.classList.add('cb-modal-hidden');
        showToast('Command imported', 'success');
      } catch { showToast('Invalid JSON', 'error'); }
    });

    $exportBtn.addEventListener('click', () => {
      const json = JSON.stringify(buildPayload(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${state.name || 'command'}.json`; a.click();
      URL.revokeObjectURL(url);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
      if (e.key === 'Escape') {
        $pickerModal.classList.add('cb-modal-hidden');
        $condModal.classList.add('cb-modal-hidden');
        $importModal.classList.add('cb-modal-hidden');
      }
    });

    // Warn on unload when dirty
    window.addEventListener('beforeunload', e => {
      if (_dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ── Toast ─────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;color:#fff;background:${type==='error'?'#ed4245':type==='success'?'#3ba55c':'#5865f2'};box-shadow:0 4px 16px rgba(0,0,0,.3);transition:opacity .3s;pointer-events:none;max-width:320px;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ── Helpers ───────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Start ─────────────────────────────────────────────────────
  init();

})();
