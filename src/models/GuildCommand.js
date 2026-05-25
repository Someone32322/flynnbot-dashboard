'use strict';

const mongoose = require('mongoose');

// ─────────────────────────────────────────────
// Shared with bot: must remain in sync with
//   flynnbot 2.0/apps/bot/src/models/GuildCommand.js
// ─────────────────────────────────────────────

const TRIGGER_TYPES = [
  'slash', 'prefix', 'contains', 'exact', 'startsWith', 'regex',
  'button', 'select_menu', 'modal_submit',
  'member_join', 'member_leave',
  'reaction_add', 'reaction_remove',
  'voice_join', 'voice_leave',
  'message_delete', 'message_edit',
  'scheduled',
];

const slashChoiceSchema = new mongoose.Schema({
  name:  { type: String, required: true, maxlength: 100 },
  value: { type: String, required: true, maxlength: 100 },
}, { _id: false });

const slashOptionSchema = new mongoose.Schema({
  name:         { type: String, required: true, maxlength: 32 },
  type:         { type: Number, required: true },
  description:  { type: String, default: '', maxlength: 100 },
  required:     { type: Boolean, default: false },
  autocomplete: { type: Boolean, default: false },
  choices:      { type: [slashChoiceSchema], default: [] },
  minValue:     { type: Number, default: null },
  maxValue:     { type: Number, default: null },
  minLength:    { type: Number, default: null },
  maxLength:    { type: Number, default: null },
  channelTypes: { type: [Number], default: [] },
}, { _id: false });

const triggerSchema = new mongoose.Schema({
  type:    { type: String, enum: TRIGGER_TYPES, required: true },
  value:   { type: String, default: '', maxlength: 200 },
  options: { type: [slashOptionSchema], default: [] },
  config:  { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const cooldownSchema = new mongoose.Schema({
  seconds: { type: Number, default: 0, min: 0, max: 86400 },
  scope:   { type: String, enum: ['user', 'guild', 'channel'], default: 'user' },
}, { _id: false });

const conditionsSchema = new mongoose.Schema({
  allowedRoles:        { type: [String], default: [] },
  ignoredRoles:        { type: [String], default: [] },
  allowedChannels:     { type: [String], default: [] },
  ignoredChannels:     { type: [String], default: [] },
  requiredPermissions: { type: [String], default: [] },
  cooldown:            { type: cooldownSchema, default: () => ({}) },
  caseSensitive:       { type: Boolean, default: false },
  deleteUserMessage:   { type: Boolean, default: false },
  ephemeralReply:      { type: Boolean, default: false },
}, { _id: false });

const blockSchema = new mongoose.Schema({
  id:   { type: String, default: '' },
  type: { type: String, required: true, maxlength: 64 },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const metadataSchema = new mongoose.Schema({
  executionCount:      { type: Number, default: 0 },
  lastExecutedAt:      { type: Date,   default: null },
  lastExecutionStatus: { type: String, default: null },
  avgExecutionTimeMs:  { type: Number, default: 0 },
  errorCount:          { type: Number, default: 0 },
}, { _id: false });

const guildCommandSchema = new mongoose.Schema({
  guildId:     { type: String, required: true, index: true },
  name:        { type: String, required: true, maxlength: 50 },
  description: { type: String, default: '', maxlength: 100 },
  enabled:     { type: Boolean, default: true },
  tags:        { type: [String], default: [] },

  trigger:    { type: triggerSchema, required: true },
  conditions: { type: conditionsSchema, default: () => ({}) },
  blocks:     { type: [blockSchema], default: [] },

  storedVars: { type: mongoose.Schema.Types.Mixed, default: {} },

  discordCommandId: { type: String, default: null },
  metadata: { type: metadataSchema, default: () => ({}) },
}, {
  timestamps: true,
  collection: 'guildcommands',
});

guildCommandSchema.index({ guildId: 1, name: 1 }, { unique: true });
guildCommandSchema.index({ guildId: 1, 'trigger.type': 1, enabled: 1 });

const GuildCommand = mongoose.model('GuildCommand', guildCommandSchema);

module.exports = { GuildCommand, TRIGGER_TYPES };
