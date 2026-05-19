'use strict';

/**
 * workflow/types.js — Shared constants, enums, and type contracts
 * for the FlynnBot workflow engine.
 *
 * Both the dashboard (validation/API) and the bot (execution) import from here
 * via their respective package paths.
 */

// ── Trigger Types ─────────────────────────────────────────────
const TRIGGER_TYPES = Object.freeze({
  SLASH:           'slash',            // /command
  PREFIX:          'prefix',           // !command
  CONTAINS:        'contains',         // message contains text
  EXACT:           'exact',            // message exactly matches
  REGEX:           'regex',            // regex pattern
  BUTTON:          'button',           // button interaction (customId match)
  SELECT_MENU:     'select_menu',      // select menu interaction
  REACTION_ADD:    'reaction_add',     // reaction added
  REACTION_REMOVE: 'reaction_remove',  // reaction removed
  MEMBER_JOIN:     'member_join',      // member joins guild
  MEMBER_LEAVE:    'member_leave',     // member leaves guild
  MESSAGE_DELETE:  'message_delete',   // message deleted
  VOICE_JOIN:      'voice_join',       // member joins voice channel
  VOICE_LEAVE:     'voice_leave',      // member leaves voice channel
  SCHEDULED:       'scheduled',        // interval-based schedule (5m, 1h, 1d)
  // Legacy alias
  REACTION:        'reaction_add',
});

// ── Block Categories ──────────────────────────────────────────
const BLOCK_CATEGORIES = Object.freeze({
  RESPOND:    'respond',
  MESSAGES:   'messages',
  COMPONENTS: 'components',
  AWAIT:      'await',
  CHANNELS:   'channels',
  ROLES:      'roles',
  MEMBERS:    'members',
  VARIABLES:  'variables',
  MATH_TEXT:  'math_text',
  FLOW:       'flow',
});

// ── Variable Scopes ───────────────────────────────────────────
const VARIABLE_SCOPES = Object.freeze({
  FLOW:   'flow',   // Temporary — lives only during current execution
  USER:   'user',   // Per-user per-guild — persisted in MongoDB
  GUILD:  'guild',  // Per-guild — persisted in MongoDB
});

// ── Field Types (used in block definitions) ───────────────────
const FIELD_TYPES = Object.freeze({
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
  BRANCH_LABEL:  'branch_label', // UI-only separator
});

// ── Condition Types ───────────────────────────────────────────
const CONDITION_TYPES = Object.freeze({
  HAS_ROLE:         'has_role',
  NOT_HAS_ROLE:     'not_has_role',
  IN_CHANNEL:       'in_channel',
  NOT_IN_CHANNEL:   'not_in_channel',
  VAR_EQUALS:       'var_equals',
  VAR_NOT_EQUALS:   'var_not_equals',
  VAR_GREATER:      'var_greater',
  VAR_LESS:         'var_less',
  VAR_CONTAINS:     'var_contains',
  VAR_IS_EMPTY:     'var_is_empty',
  VAR_NOT_EMPTY:    'var_not_empty',
  VAR_STARTS_WITH:  'var_starts_with',
  VAR_ENDS_WITH:    'var_ends_with',
  USER_HAS_PERM:    'user_has_perm',
  USER_NOT_PERM:    'user_not_perm',
  MESSAGE_CONTAINS: 'message_contains',
  MENTIONED_USER:   'mentioned_user',
  RANDOM_CHANCE:    'random_chance',
  ARG_EQUALS:       'arg_equals',
  USER_IS_BOT:      'user_is_bot',
  USER_IS_HUMAN:    'user_is_human',
  USER_EQUALS:      'user_equals',
  NUMBER_BETWEEN:   'number_between',
});

// ── Discord Permissions (safe subset) ────────────────────────
const DISCORD_PERMISSIONS = Object.freeze([
  'Administrator',
  'ManageGuild',
  'ManageChannels',
  'ManageRoles',
  'ManageMessages',
  'ManageNicknames',
  'ManageWebhooks',
  'KickMembers',
  'BanMembers',
  'ModerateMembers',
  'MentionEveryone',
  'SendMessages',
  'ViewChannel',
]);

// ── Execution Limits ──────────────────────────────────────────
const LIMITS = Object.freeze({
  MAX_BLOCKS:           50,   // total blocks in a workflow
  MAX_NESTING_DEPTH:    5,    // nested condition/loop depth
  MAX_LOOP_ITERATIONS:  10,   // maximum loop_times value
  MAX_DELAY_MS:         10000, // 10s per delay block
  MAX_AWAIT_TIMEOUT_S:  300,  // 5 min per await block
  MAX_WORKFLOWS_PER_GUILD: 100,
  MAX_VAR_NAME_LEN:     32,
  MAX_VAR_VALUE_LEN:    500,
  MAX_EMBED_FIELDS:     25,
  MAX_BUTTONS:          5,
  MAX_SELECT_OPTIONS:   25,
  MAX_MODAL_FIELDS:     5,
  EXECUTION_TIMEOUT_MS: 30000, // hard timeout per workflow run
});

// ── Built-in Variable Names (reserved, cannot be overwritten) ─
// Must be a Set so validator can call .has()
const BUILTIN_VARS = new Set([
  // Author / executor
  'user', 'username', 'displayname', 'userid', 'tag', 'avatar', 'executor',
  // Server
  'server', 'guild', 'serverid', 'guildid', 'membercount',
  // Channel
  'channel', 'channelname', 'channelid',
  // Message / command
  'message', 'command_name', 'args', 'trigger_value',
  // Mentions
  'mentioned', 'mentioned_id', 'mentioned_name',
  // Loop
  'loop_index', 'loop_count', 'item', 'item_index',
  // Date/time
  'timestamp', 'date', 'time',
  // Target
  'targetUser', 'targetuser', 'reason',
  // Reaction trigger
  'reaction_emoji', 'reaction_emoji_id', 'reactor', 'reactor_id', 'reactor_name', 'reacted_message',
  // Member join/leave
  'new_member', 'new_member_id', 'new_member_name', 'new_member_avatar',
  'account_age_days', 'account_created',
  'left_member_name', 'left_member_id',
  // Button / select / modal
  'button_id', 'button_user', 'button_user_id', 'button_user_name',
  'selected_values', 'selected_count',
  'modal_1', 'modal_2', 'modal_3', 'modal_4', 'modal_5',
  // Voice
  'voice_channel', 'voice_channel_id', 'voice_channel_name',
  // Scheduled
  'scheduled_name', 'scheduled_time',
  // Error handling
  '_error_message',
]);

// ── Block Execution Status ────────────────────────────────────
const EXEC_STATUS = Object.freeze({
  PENDING:   'pending',
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  STOPPED:   'stopped',
  TIMEOUT:   'timeout',
});

module.exports = {
  TRIGGER_TYPES,
  BLOCK_CATEGORIES,
  VARIABLE_SCOPES,
  FIELD_TYPES,
  CONDITION_TYPES,
  DISCORD_PERMISSIONS,
  LIMITS,
  BUILTIN_VARS,
  EXEC_STATUS,
};
