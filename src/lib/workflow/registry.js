'use strict';

/**
 * workflow/registry.js — Server-side Block Registry
 *
 * Single source of truth for all block type definitions.
 * Used by the validator (to check field types/constraints) and
 * the API sanitizer (to whitelist/normalize block data).
 *
 * Each entry defines:
 *   category  — one of BLOCK_CATEGORIES
 *   label     — human-readable name
 *   fields[]  — ordered list of configurable fields
 *   defaults  — safe default values for all fields
 *   maxNested — whether this block can contain nested blocks
 *   validate  — optional extra validation function(data) → string|null
 */

const { BLOCK_CATEGORIES, FIELD_TYPES, LIMITS } = require('./types');

// ── Field helper constructors ─────────────────────────────────
const f = {
  text:     (key, label, opts = {}) => ({ key, type: FIELD_TYPES.TEXT,     label, ...opts }),
  area:     (key, label, opts = {}) => ({ key, type: FIELD_TYPES.TEXTAREA, label, ...opts }),
  num:      (key, label, opts = {}) => ({ key, type: FIELD_TYPES.NUMBER,   label, ...opts }),
  toggle:   (key, label, opts = {}) => ({ key, type: FIELD_TYPES.TOGGLE,   label, ...opts }),
  select:   (key, label, options, opts = {}) => ({ key, type: FIELD_TYPES.SELECT, label, options, ...opts }),
  role:     (key, label, opts = {}) => ({ key, type: FIELD_TYPES.ROLE,     label, ...opts }),
  channel:  (key, label, opts = {}) => ({ key, type: FIELD_TYPES.CHANNEL,  label, ...opts }),
  color:    (key, label, opts = {}) => ({ key, type: FIELD_TYPES.COLOR,    label, ...opts }),
  branch:   (key, label)            => ({ key, type: FIELD_TYPES.BRANCH_LABEL, label }),
};

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
  { v: 'Administrator',    l: 'Administrator' },
  { v: 'ManageGuild',      l: 'Manage Server' },
  { v: 'ManageChannels',   l: 'Manage Channels' },
  { v: 'ManageRoles',      l: 'Manage Roles' },
  { v: 'ManageMessages',   l: 'Manage Messages' },
  { v: 'ManageNicknames',  l: 'Manage Nicknames' },
  { v: 'KickMembers',      l: 'Kick Members' },
  { v: 'BanMembers',       l: 'Ban Members' },
  { v: 'ModerateMembers',  l: 'Timeout Members' },
];

/* ============================================================
   REGISTRY
   ============================================================ */
const REGISTRY = {

  // ── RESPOND ───────────────────────────────────────────────
  reply: {
    category: BLOCK_CATEGORIES.RESPOND,
    label: 'Reply',
    description: 'Reply to the message or interaction that triggered this workflow.',
    fields: [
      f.area('content', 'Reply Content', { required: true, max: 2000,
        placeholder: 'Your reply… {user} {username} {server} {channel} {membercount}' }),
      f.toggle('ephemeral', 'Ephemeral (only visible to the triggering user)'),
      f.toggle('ping_user', 'Mention / ping the user'),
    ],
    defaults: { content: '', ephemeral: false, ping_user: false },
    validate: (d) => !d.content ? 'Reply content is required.' : null,
  },

  followup: {
    category: BLOCK_CATEGORIES.RESPOND,
    label: 'Follow-up Message',
    description: 'Send an additional message after the initial reply.',
    fields: [
      f.area('content', 'Message Content', { required: true, max: 2000 }),
      f.toggle('ephemeral', 'Ephemeral (slash commands only)'),
    ],
    defaults: { content: '', ephemeral: false },
    validate: (d) => !d.content ? 'Follow-up content is required.' : null,
  },

  edit_reply: {
    category: BLOCK_CATEGORIES.RESPOND,
    label: 'Edit Reply',
    description: 'Edit a message the bot previously sent.',
    fields: [
      f.select('target', 'Edit Which Message', [
        { v: 'last',     l: "Bot's last sent message" },
        { v: 'original', l: 'Original reply / response' },
        { v: 'by_id',    l: 'Specific message (by stored ID)' },
      ]),
      f.text('message_id_var', 'Message ID Variable', { max: 32, placeholder: 'msg_id',
        showIf: { key: 'target', value: 'by_id' },
        hint: 'Variable key holding the message ID to edit' }),
      f.area('new_content', 'New Content', { required: true, max: 2000 }),
    ],
    defaults: { target: 'last', message_id_var: '', new_content: '' },
    validate: (d) => !d.new_content ? 'New content is required.' : null,
  },

  // ── MESSAGES ──────────────────────────────────────────────
  send_message: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'Send Message',
    description: 'Send a plain text message to a channel.',
    fields: [
      f.area('content', 'Message Content', { required: true, max: 2000,
        placeholder: '{user} {username} {server} {channel} {membercount}' }),
      f.channel('channel_id', 'Send To Channel', { hint: 'Blank = current channel' }),
      f.text('store_id_as', 'Store Message ID As', { max: 32, placeholder: 'sent_msg',
        hint: 'Save the message ID to a flow variable (lets you edit/delete it later)' }),
      f.toggle('ephemeral', 'Ephemeral (slash commands only)'),
    ],
    defaults: { content: '', channel_id: '', store_id_as: '', ephemeral: false },
    validate: (d) => !d.content ? 'Message content is required.' : null,
  },

  send_embed: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'Send Embed',
    description: 'Send a richly-formatted Discord embed.',
    fields: [
      f.text('title',       'Title',       { max: 256, placeholder: 'Embed title' }),
      f.area('description', 'Description', { max: 4096, placeholder: 'Embed body…' }),
      f.color('color', 'Colour'),
      f.text('footer',    'Footer Text', { max: 2048 }),
      f.text('thumbnail', 'Thumbnail URL', { max: 512, placeholder: 'https://…' }),
      f.text('image',     'Image URL',    { max: 512, placeholder: 'https://…' }),
      f.text('url',       'Title Link',   { max: 512, placeholder: 'https://…' }),
      f.toggle('timestamp',   'Show Timestamp'),
      f.toggle('show_author', 'Show triggering user as author'),
      f.channel('channel_id', 'Send To Channel', { hint: 'Blank = current channel' }),
      f.text('store_id_as', 'Store Message ID As', { max: 32, placeholder: 'embed_msg' }),
      { key: 'fields', type: FIELD_TYPES.EMBED_FIELDS, label: 'Embed Fields' },
    ],
    defaults: { title: '', description: '', color: '#5865f2', footer: '', thumbnail: '',
                image: '', url: '', timestamp: false, show_author: false,
                channel_id: '', store_id_as: '', fields: [] },
    validate: (d) => (!d.title && !d.description) ? 'Embed needs a title or description.' : null,
  },

  dm_user: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'DM User',
    description: 'Send a private direct message to the user.',
    fields: [
      f.area('content', 'DM Content', { required: true, max: 2000,
        placeholder: 'Private message… {user} {server}' }),
      f.toggle('fail_silent', 'Silently ignore if DMs are closed'),
    ],
    defaults: { content: '', fail_silent: true },
    validate: (d) => !d.content ? 'DM content is required.' : null,
  },

  edit_message: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'Edit Message',
    description: 'Edit a previously sent message using a stored message ID.',
    fields: [
      f.text('message_id_var', 'Message ID Variable', { max: 32, placeholder: 'sent_msg',
        hint: 'Flow variable containing the message ID' }),
      f.area('new_content', 'New Content', { required: true, max: 2000 }),
      f.channel('channel_id', 'Channel (if different)'),
    ],
    defaults: { message_id_var: '', new_content: '', channel_id: '' },
    validate: (d) => !d.new_content ? 'New content is required.' : null,
  },

  delete_message: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'Delete Message',
    description: 'Delete a specific message from a channel.',
    fields: [
      f.select('target', 'Delete Which Message', [
        { v: 'trigger',  l: 'The trigger message' },
        { v: 'bot_last', l: "Bot's last response" },
        { v: 'by_id',    l: 'Specific message by stored ID' },
      ]),
      f.text('message_id_var', 'Message ID Variable', { max: 32, placeholder: 'sent_msg',
        showIf: { key: 'target', value: 'by_id' } }),
      f.num('delay_ms', 'Delay (ms)', { min: 0, max: 60000, hint: '0 = immediate' }),
    ],
    defaults: { target: 'trigger', message_id_var: '', delay_ms: 0 },
  },

  pin_message: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'Pin / Unpin Message',
    description: 'Pin or unpin a message in the current channel.',
    fields: [
      f.select('action', 'Action', [
        { v: 'pin',   l: 'Pin message' },
        { v: 'unpin', l: 'Unpin message' },
      ]),
      f.select('target', 'Which Message', [
        { v: 'trigger', l: 'The trigger message' },
        { v: 'by_id',   l: 'Specific message by stored ID' },
      ]),
      f.text('message_id_var', 'Message ID Variable', { max: 32, placeholder: 'sent_msg',
        showIf: { key: 'target', value: 'by_id' } }),
    ],
    defaults: { action: 'pin', target: 'trigger', message_id_var: '' },
  },

  add_reaction: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'Add Reaction',
    description: 'React to a message with an emoji.',
    fields: [
      f.text('emoji', 'Emoji', { required: true, max: 100,
        placeholder: '👍 or :thumbsup: or <:name:12345>' }),
      f.select('target', 'React to Which Message', [
        { v: 'trigger',  l: 'The trigger message' },
        { v: 'bot_last', l: "Bot's last response" },
      ]),
    ],
    defaults: { emoji: '', target: 'trigger' },
    validate: (d) => !d.emoji ? 'Emoji is required.' : null,
  },

  purge_messages: {
    category: BLOCK_CATEGORIES.MESSAGES,
    label: 'Purge Messages',
    description: 'Bulk-delete recent messages from a channel.',
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

  // ── COMPONENTS ────────────────────────────────────────────
  send_buttons: {
    category: BLOCK_CATEGORIES.COMPONENTS,
    label: 'Send Button Row',
    description: 'Send a message with up to 5 interactive buttons.',
    fields: [
      f.area('message', 'Message Above Buttons', { max: 2000 }),
      { key: 'buttons', type: FIELD_TYPES.BUTTON_ARRAY, label: 'Buttons' },
      f.channel('channel_id', 'Channel', { hint: 'Blank = current channel' }),
      f.text('store_id_as', 'Store Message ID As', { max: 32, placeholder: 'btn_msg' }),
    ],
    defaults: { message: '', buttons: [], channel_id: '', store_id_as: '' },
  },

  send_select_menu: {
    category: BLOCK_CATEGORIES.COMPONENTS,
    label: 'Send Select Menu',
    description: 'Send a message with a dropdown selection menu.',
    fields: [
      f.text('placeholder', 'Placeholder Text', { max: 150, placeholder: 'Choose an option…' }),
      f.area('message', 'Message Above Menu', { max: 2000 }),
      { key: 'options', type: FIELD_TYPES.OPTION_ARRAY, label: 'Options' },
      f.num('min_values', 'Min Selections', { min: 1, max: 25 }),
      f.num('max_values', 'Max Selections', { min: 1, max: 25 }),
      f.channel('channel_id', 'Channel'),
      f.text('store_id_as', 'Store Message ID As', { max: 32, placeholder: 'sel_msg' }),
    ],
    defaults: { placeholder: 'Choose an option…', message: '', options: [],
                min_values: 1, max_values: 1, channel_id: '', store_id_as: '' },
  },

  show_modal: {
    category: BLOCK_CATEGORIES.COMPONENTS,
    label: 'Show Modal (Form)',
    description: 'Display a pop-up form dialog (slash commands / button interactions only).',
    fields: [
      f.text('title', 'Modal Title', { required: true, max: 45 }),
      { key: 'fields', type: FIELD_TYPES.MODAL_FIELDS, label: 'Input Fields',
        hint: 'Up to 5 text inputs' },
      f.text('store_prefix', 'Variable Prefix for Responses', { max: 20, placeholder: 'modal',
        hint: 'Answers stored as {modal_1}, {modal_2}, etc.' }),
    ],
    defaults: { title: '', fields: [], store_prefix: 'modal' },
    validate: (d) => !d.title ? 'Modal title is required.' : null,
  },

  // ── AWAIT INPUT ───────────────────────────────────────────
  await_button: {
    category: BLOCK_CATEGORIES.AWAIT,
    label: 'Await Button Click',
    description: 'Pause and wait for the user to click a specific button.',
    fields: [
      f.text('button_id', 'Button Custom ID', { required: true, max: 100, placeholder: 'btn_confirm',
        hint: 'Must match the customId of a button from a Send Buttons block' }),
      f.num('timeout_seconds', 'Timeout (seconds)', { min: 5, max: LIMITS.MAX_AWAIT_TIMEOUT_S }),
      f.select('on_timeout', 'On Timeout', ON_TIMEOUT_OPTS),
      f.text('store_user_as', "Store clicking user's ID as", { max: 32, placeholder: 'clicker_id' }),
    ],
    defaults: { button_id: '', timeout_seconds: 60, on_timeout: 'stop', store_user_as: '' },
    validate: (d) => !d.button_id ? 'Button custom ID is required.' : null,
  },

  await_select: {
    category: BLOCK_CATEGORIES.AWAIT,
    label: 'Await Select Choice',
    description: 'Pause and wait for the user to pick from a select menu.',
    fields: [
      f.num('timeout_seconds', 'Timeout (seconds)', { min: 5, max: LIMITS.MAX_AWAIT_TIMEOUT_S }),
      f.select('on_timeout', 'On Timeout', ON_TIMEOUT_OPTS),
      f.text('store_values_as', 'Store Selected Values As', { max: 32, placeholder: 'selection',
        hint: 'Multiple selections joined with ", "' }),
    ],
    defaults: { timeout_seconds: 60, on_timeout: 'stop', store_values_as: 'selection' },
  },

  await_message: {
    category: BLOCK_CATEGORIES.AWAIT,
    label: 'Await User Message',
    description: 'Pause and wait for the user to type a message.',
    fields: [
      f.num('timeout_seconds', 'Timeout (seconds)', { min: 5, max: LIMITS.MAX_AWAIT_TIMEOUT_S }),
      f.select('on_timeout', 'On Timeout', ON_TIMEOUT_OPTS),
      f.text('store_as', 'Store Message Content As', { max: 32, placeholder: 'user_response' }),
      f.toggle('delete_response', "Delete the user's response after collecting"),
    ],
    defaults: { timeout_seconds: 60, on_timeout: 'stop', store_as: 'user_response', delete_response: false },
  },

  // ── CHANNELS ──────────────────────────────────────────────
  create_thread: {
    category: BLOCK_CATEGORIES.CHANNELS,
    label: 'Create Thread',
    description: 'Create a new thread on the current message.',
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
    validate: (d) => !d.name ? 'Thread name is required.' : null,
  },

  set_channel_topic: {
    category: BLOCK_CATEGORIES.CHANNELS,
    label: 'Set Channel Topic',
    description: 'Update the topic / description of a text channel.',
    fields: [
      f.area('topic', 'New Topic', { max: 1024, placeholder: 'Channel topic… {server} {membercount}' }),
      f.channel('channel_id', 'Channel', { hint: 'Blank = current channel' }),
    ],
    defaults: { topic: '', channel_id: '' },
  },

  set_slowmode: {
    category: BLOCK_CATEGORIES.CHANNELS,
    label: 'Set Slowmode',
    description: 'Set or remove the slowmode rate limit on a channel.',
    fields: [
      f.num('seconds', 'Slowmode (seconds)', { min: 0, max: 21600, hint: '0 = disabled. Max 21600 (6h)' }),
      f.channel('channel_id', 'Channel', { hint: 'Blank = current channel' }),
    ],
    defaults: { seconds: 5, channel_id: '' },
  },

  lock_channel: {
    category: BLOCK_CATEGORIES.CHANNELS,
    label: 'Lock / Unlock Channel',
    description: 'Lock or unlock a channel by modifying @everyone send permissions.',
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

  // ── ROLES ─────────────────────────────────────────────────
  add_role: {
    category: BLOCK_CATEGORIES.ROLES,
    label: 'Add Role',
    description: 'Give a role to a member.',
    fields: [
      f.role('role_id',  'Role',   { required: true }),
      f.select('target', 'Target', TARGET_OPTS),
      f.text('reason', 'Audit Log Reason', { max: 512 }),
    ],
    defaults: { role_id: '', target: 'author', reason: '' },
    validate: (d) => !d.role_id ? 'A role must be selected.' : null,
  },

  remove_role: {
    category: BLOCK_CATEGORIES.ROLES,
    label: 'Remove Role',
    description: 'Remove a role from a member.',
    fields: [
      f.role('role_id',  'Role',   { required: true }),
      f.select('target', 'Target', TARGET_OPTS),
      f.text('reason', 'Audit Log Reason', { max: 512 }),
    ],
    defaults: { role_id: '', target: 'author', reason: '' },
    validate: (d) => !d.role_id ? 'A role must be selected.' : null,
  },

  toggle_role: {
    category: BLOCK_CATEGORIES.ROLES,
    label: 'Toggle Role',
    description: 'Add the role if absent, remove it if present.',
    fields: [
      f.role('role_id',  'Role',   { required: true, hint: 'Adds if absent, removes if present' }),
      f.select('target', 'Target', TARGET_OPTS),
      f.text('store_action_as', 'Store Action As (optional)', { max: 32, placeholder: 'role_action',
        hint: 'Stores "added" or "removed" in this variable' }),
    ],
    defaults: { role_id: '', target: 'author', store_action_as: '' },
    validate: (d) => !d.role_id ? 'A role must be selected.' : null,
  },

  // ── MEMBERS ───────────────────────────────────────────────
  set_nickname: {
    category: BLOCK_CATEGORIES.MEMBERS,
    label: 'Set Nickname',
    description: "Change a member's display name in this server.",
    fields: [
      f.text('nickname', 'New Nickname', { max: 32, placeholder: '{username} — blank to reset' }),
      f.select('target', 'Target', TARGET_OPTS),
    ],
    defaults: { nickname: '', target: 'author' },
  },

  kick_member: {
    category: BLOCK_CATEGORIES.MEMBERS,
    label: 'Kick Member',
    description: 'Kick a member from the server.',
    fields: [
      f.select('target', 'Target', TARGET_OPTS),
      f.text('reason', 'Reason', { required: true, max: 512 }),
      f.toggle('dm_before', 'DM user before kick'),
      f.area('dm_message', 'DM Message', { max: 2000, placeholder: 'You were kicked from {server}.',
        showIf: { key: 'dm_before', value: true } }),
    ],
    defaults: { target: 'mentioned', reason: '', dm_before: false, dm_message: '' },
    validate: (d) => !d.reason ? 'Kick reason is required.' : null,
  },

  ban_member: {
    category: BLOCK_CATEGORIES.MEMBERS,
    label: 'Ban Member',
    description: 'Permanently ban a member from the server.',
    fields: [
      f.select('target', 'Target', TARGET_OPTS),
      f.text('reason', 'Reason', { required: true, max: 512 }),
      f.num('delete_days', 'Delete Message History (days)', { min: 0, max: 7 }),
      f.toggle('dm_before', 'DM user before ban'),
    ],
    defaults: { target: 'mentioned', reason: '', delete_days: 0, dm_before: false },
    validate: (d) => !d.reason ? 'Ban reason is required.' : null,
  },

  timeout_member: {
    category: BLOCK_CATEGORIES.MEMBERS,
    label: 'Timeout Member',
    description: 'Temporarily restrict a member from interacting.',
    fields: [
      f.select('target', 'Target', TARGET_OPTS),
      f.num('duration_minutes', 'Duration (minutes)', { required: true, min: 1, max: 40320 }),
      f.text('reason', 'Reason', { max: 512 }),
    ],
    defaults: { target: 'mentioned', duration_minutes: 10, reason: '' },
  },

  remove_timeout: {
    category: BLOCK_CATEGORIES.MEMBERS,
    label: 'Remove Timeout',
    description: 'Remove an active timeout from a member.',
    fields: [ f.select('target', 'Target', TARGET_OPTS) ],
    defaults: { target: 'mentioned' },
  },

  get_member_info: {
    category: BLOCK_CATEGORIES.MEMBERS,
    label: 'Get Member Info → Vars',
    description: 'Fetch member details and store them as flow variables.',
    fields: [
      f.select('target', 'Target', TARGET_OPTS),
      f.text('var_prefix', 'Variable Prefix', { max: 20, placeholder: 'member',
        hint: 'Stores {prefix_id}, {prefix_username}, {prefix_nickname}, {prefix_joined}, {prefix_roles}, {prefix_avatar}' }),
    ],
    defaults: { target: 'author', var_prefix: 'member' },
  },

  warn_member: {
    category: BLOCK_CATEGORIES.MEMBERS,
    label: 'Warn Member',
    description: 'Log a warning and optionally DM the member.',
    fields: [
      f.select('target', 'Target', TARGET_OPTS),
      f.text('reason', 'Reason', { required: true, max: 512 }),
      f.toggle('dm_user', 'DM the user their warning'),
    ],
    defaults: { target: 'mentioned', reason: '', dm_user: true },
    validate: (d) => !d.reason ? 'Warning reason is required.' : null,
  },

  // ── VARIABLES ─────────────────────────────────────────────
  set_variable: {
    category: BLOCK_CATEGORIES.VARIABLES,
    label: 'Set Variable',
    description: 'Store a value in a named variable.',
    fields: [
      f.text('var_name', 'Variable Name', { required: true, max: 32, placeholder: 'my_var',
        hint: 'Access later as {my_var}. Alphanumeric + underscore.' }),
      f.text('value', 'Value', { required: true, max: 500, placeholder: 'value or {another_var}' }),
      f.select('scope', 'Scope', [
        { v: 'flow',  l: 'This execution only (temporary)' },
        { v: 'user',  l: 'Per-user persistent (DB)' },
        { v: 'guild', l: 'Per-server persistent (DB)' },
      ]),
    ],
    defaults: { var_name: '', value: '', scope: 'flow' },
    validate: (d) => {
      if (!d.var_name) return 'Variable name is required.';
      if (!/^[a-z0-9_]{1,32}$/i.test(d.var_name)) return 'Variable name: a-z, 0-9, underscore, max 32.';
      return null;
    },
  },

  get_variable: {
    category: BLOCK_CATEGORIES.VARIABLES,
    label: 'Get Variable',
    description: 'Read a persistent variable from the database into a flow variable.',
    fields: [
      f.text('var_name', 'Variable Name', { required: true, max: 32 }),
      f.select('scope', 'Scope', [
        { v: 'user',  l: 'Per-user (DB)' },
        { v: 'guild', l: 'Per-server (DB)' },
      ]),
      f.text('default_value', 'Default If Not Found', { max: 500 }),
      f.text('store_as', 'Store Result As (flow var)', { max: 32 }),
    ],
    defaults: { var_name: '', scope: 'user', default_value: '0', store_as: '' },
  },

  increment_variable: {
    category: BLOCK_CATEGORIES.VARIABLES,
    label: 'Increment Variable',
    description: 'Add or subtract a number from a persistent variable.',
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
    category: BLOCK_CATEGORIES.VARIABLES,
    label: 'Delete Variable',
    description: 'Permanently delete a persistent variable from the database.',
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
    category: BLOCK_CATEGORIES.VARIABLES,
    label: 'Random Number → Var',
    description: 'Generate a random integer and store it.',
    fields: [
      f.num('min', 'Minimum', { min: 0, max: 999999 }),
      f.num('max', 'Maximum', { min: 1, max: 999999 }),
      f.text('store_as', 'Store As', { max: 32, placeholder: 'random' }),
    ],
    defaults: { min: 1, max: 100, store_as: 'random' },
  },

  random_choice: {
    category: BLOCK_CATEGORIES.VARIABLES,
    label: 'Random Choice → Var',
    description: 'Randomly pick one item from a comma-separated list.',
    fields: [
      f.text('choices', 'Choices (comma-separated)', { required: true, max: 1000,
        placeholder: 'option1, option2, option3' }),
      f.text('store_as', 'Store As', { max: 32, placeholder: 'choice' }),
    ],
    defaults: { choices: '', store_as: 'choice' },
  },

  // ── MATH & TEXT ───────────────────────────────────────────
  math: {
    category: BLOCK_CATEGORIES.MATH_TEXT,
    label: 'Math Expression',
    description: 'Evaluate a safe arithmetic expression and store the result.',
    fields: [
      f.text('expression', 'Expression', { required: true, max: 200,
        placeholder: '{wallet} + 100',
        hint: 'Supports +, -, *, /, %, floor(), ceil(), round(), min(), max(). No code execution.' }),
      f.text('store_as', 'Store Result As', { required: true, max: 32, placeholder: 'result' }),
    ],
    defaults: { expression: '', store_as: 'result' },
    validate: (d) => !d.expression ? 'Expression is required.' : null,
  },

  format_text: {
    category: BLOCK_CATEGORIES.MATH_TEXT,
    label: 'Format Text → Var',
    description: 'Fill a text template with variable values and store the result.',
    fields: [
      f.area('template', 'Text Template', { required: true, max: 2000,
        placeholder: 'Hello {username}, you have {coins} coins!' }),
      f.text('store_as', 'Store As', { required: true, max: 32, placeholder: 'formatted' }),
    ],
    defaults: { template: '', store_as: 'formatted' },
    validate: (d) => !d.template ? 'Template is required.' : null,
  },

  string_operation: {
    category: BLOCK_CATEGORIES.MATH_TEXT,
    label: 'String Operation',
    description: 'Transform or inspect a text value.',
    fields: [
      f.text('text', 'Input Text / Variable', { required: true, max: 2000, placeholder: '{my_var} or literal text' }),
      f.select('operation', 'Operation', [
        { v: 'uppercase', l: 'UPPERCASE'                   },
        { v: 'lowercase', l: 'lowercase'                   },
        { v: 'trim',      l: 'Trim whitespace'             },
        { v: 'reverse',   l: 'Reverse characters'          },
        { v: 'length',    l: 'Get length → variable'       },
        { v: 'replace',   l: 'Find & Replace'              },
        { v: 'contains',  l: 'Contains? (→ "true"/"false")'},
      ]),
      f.text('find',         'Find',         { max: 100, showIf: { key: 'operation', value: 'replace' } }),
      f.text('replace_with', 'Replace With', { max: 100, showIf: { key: 'operation', value: 'replace' } }),
      f.text('search',       'Search For',   { max: 200, showIf: { key: 'operation', value: 'contains' } }),
      f.text('store_as', 'Store Result As', { required: true, max: 32, placeholder: 'result' }),
    ],
    defaults: { text: '', operation: 'uppercase', find: '', replace_with: '', search: '', store_as: 'result' },
  },

  number_format: {
    category: BLOCK_CATEGORIES.MATH_TEXT,
    label: 'Number Format → Var',
    description: 'Format a number as thousands, ordinal, compact, etc.',
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
    category: BLOCK_CATEGORIES.MATH_TEXT,
    label: 'Log to Channel',
    description: 'Send a log entry to a designated channel.',
    fields: [
      f.channel('channel_id', 'Log Channel', { required: true }),
      f.area('message', 'Log Message', { required: true, max: 2000,
        placeholder: '{user} ran /{command_name} in {channel}' }),
      f.toggle('as_embed', 'Send as embed'),
      f.color('embed_color', 'Embed Colour', { showIf: { key: 'as_embed', value: true } }),
    ],
    defaults: { channel_id: '', message: '', as_embed: false, embed_color: '#5865f2' },
    validate: (d) => !d.channel_id ? 'Log channel is required.' : null,
  },

  // ── FLOW CONTROL ──────────────────────────────────────────
  condition_if: {
    category: BLOCK_CATEGORIES.FLOW,
    label: 'Condition (If / Else)',
    description: 'Branch your workflow based on a condition.',
    maxNested: true,
    fields: [
      f.select('condition_type', 'Check Type', CONDITION_TYPE_OPTS),
      f.role('role_id', 'Role', { showIf: { key: 'condition_type', value: ['has_role', 'not_has_role'] } }),
      f.channel('channel_id', 'Channel', { showIf: { key: 'condition_type', value: ['in_channel', 'not_in_channel'] } }),
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
    category: BLOCK_CATEGORIES.FLOW,
    label: 'Stop If (Guard)',
    description: 'Immediately stop the workflow if a condition is true.',
    fields: [
      f.select('condition_type', 'Stop When', CONDITION_TYPE_OPTS.filter(o => o.v !== 'arg_equals')),
      f.role('role_id', 'Role', { showIf: { key: 'condition_type', value: ['has_role', 'not_has_role'] } }),
      f.channel('channel_id', 'Channel', { showIf: { key: 'condition_type', value: ['in_channel', 'not_in_channel'] } }),
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
    category: BLOCK_CATEGORIES.FLOW,
    label: 'Loop (Repeat N Times)',
    description: 'Execute inner blocks a set number of times.',
    maxNested: true,
    fields: [
      f.num('times', 'Repeat Count', { required: true, min: 1, max: LIMITS.MAX_LOOP_ITERATIONS,
        hint: `Max ${LIMITS.MAX_LOOP_ITERATIONS} iterations. Inside loop: {loop_index} (0-based), {loop_count} (1-based).` }),
    ],
    defaults: { times: 3, loop_blocks: [] },
  },

  delay: {
    category: BLOCK_CATEGORIES.FLOW,
    label: 'Wait / Delay',
    description: 'Pause the workflow for a set amount of time.',
    fields: [
      f.num('ms', 'Delay (milliseconds)', { required: true, min: 100, max: LIMITS.MAX_DELAY_MS,
        hint: `100ms – ${LIMITS.MAX_DELAY_MS}ms max` }),
    ],
    defaults: { ms: 1000 },
  },

  stop_flow: {
    category: BLOCK_CATEGORIES.FLOW,
    label: 'Stop Workflow',
    description: 'Immediately stop all further blocks from executing.',
    fields: [],
    defaults: {},
  },

}; // END REGISTRY

// ── Public API ────────────────────────────────────────────────

/** All valid block type names */
const ALLOWED_TYPES = new Set(Object.keys(REGISTRY));

/** Ordered list of categories with display metadata */
const CATEGORY_META = [
  { id: 'respond',    label: 'Respond',      icon: 'corner-down-right', color: '#57f287' },
  { id: 'messages',   label: 'Messages',     icon: 'message-square',    color: '#60a5fa' },
  { id: 'components', label: 'Components',   icon: 'square',            color: '#818cf8' },
  { id: 'await',      label: 'Await Input',  icon: 'mouse-pointer',     color: '#34d399' },
  { id: 'channels',   label: 'Channels',     icon: 'hash',              color: '#38bdf8' },
  { id: 'roles',      label: 'Roles',        icon: 'shield',            color: '#4ade80' },
  { id: 'members',    label: 'Members',      icon: 'users',             color: '#fb923c' },
  { id: 'variables',  label: 'Variables',    icon: 'database',          color: '#38bdf8' },
  { id: 'math_text',  label: 'Math & Text',  icon: 'hash',              color: '#a78bfa' },
  { id: 'flow',       label: 'Flow Control', icon: 'git-branch',        color: '#f472b6' },
];

/**
 * Get block definition by type.
 * Returns null for unknown types (never throws).
 */
function getBlock(type) {
  return REGISTRY[type] || null;
}

/**
 * Get all blocks for a given category.
 */
function getByCategory(categoryId) {
  return Object.entries(REGISTRY)
    .filter(([, def]) => def.category === categoryId)
    .map(([type, def]) => ({ type, ...def }));
}

/**
 * Safe defaults for a block type.
 * Returns a deep copy to prevent mutation.
 */
function getDefaults(type) {
  const def = REGISTRY[type];
  return def ? JSON.parse(JSON.stringify(def.defaults)) : {};
}

module.exports = { REGISTRY, ALLOWED_TYPES, CATEGORY_META, getBlock, getByCategory, getDefaults };
