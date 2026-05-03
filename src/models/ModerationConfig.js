const mongoose = require('mongoose');

// ── Sub-schemas ──────────────────────────────────────────────

const predefinedReasonSchema = new mongoose.Schema({
  aliases:  { type: [String], default: [] },
  reason:   { type: String, required: true },
}, { _id: true });

const punishTypeSchema = new mongoose.Schema({
  defaultReason:    { type: String, default: '' },
  defaultDuration:  { type: String, default: '' },
  actionsOnPunish:  { type: [String], default: [] },
  forceReason:      { type: Boolean, default: false },
  alwaysReview:     { type: Boolean, default: false },
  deleteProofMsg:   { type: Boolean, default: false },
  allowMultiple:    { type: Boolean, default: false },
  linkWithTimeouts: { type: Boolean, default: false },
  extendTimeouts:   { type: Boolean, default: false },
}, { _id: false });

const userReportConfigSchema = new mongoose.Schema({
  enabled:           { type: Boolean, default: false },
  reportChannelId:   { type: String, default: null },
  pingRoles:         { type: [String], default: [] },
  rolesAllowed:      { type: [String], default: [] },
  rolesImmune:       { type: [String], default: [] },
  slashCommand:      { type: Boolean, default: false },
  slashCommandName:  { type: String, default: 'report' },
  userContext:       { type: Boolean, default: false },
  userContextName:   { type: String, default: 'Report user' },
  msgContext:        { type: Boolean, default: false },
  msgContextName:    { type: String, default: 'Report message' },
  reactions:         { type: Boolean, default: false },
  forceReason:       { type: Boolean, default: true },
  forceComment:      { type: Boolean, default: false },
  forceAttachment:   { type: Boolean, default: false },
  cooldownMinutes:   { type: Number, default: 1 },
  notifyOnCreate:    { type: Boolean, default: false },
  notifyOnUpdate:    { type: Boolean, default: true },
  maxOpenPerServer:  { type: Number, default: 20 },
  maxPerUser:        { type: Number, default: 5 },
  predefinedReasons: { type: [{ label: String, order: Number }], default: [] },
  allowCustomReason: { type: Boolean, default: true },
}, { _id: false });

const appealConfigSchema = new mongoose.Schema({
  enabled:          { type: Boolean, default: false },
  channelId:        { type: String, default: null },
  pingRoles:        { type: [String], default: [] },
  allowBanAppeals:  { type: Boolean, default: true },
  allowMuteAppeals: { type: Boolean, default: true },
  questions: [{
    id:          { type: String },
    label:       { type: String },
    type:        { type: String, enum: ['text', 'textarea', 'select'], default: 'textarea' },
    required:    { type: Boolean, default: false },
    options:     { type: [String], default: [] },
    placeholder: { type: String, default: '' },
  }],
  cooldownDays:     { type: Number, default: 7 },
  notifyUser:       { type: Boolean, default: true },
}, { _id: false });

// ── Main schema ──────────────────────────────────────────────

const moderationConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },

  // Purge pinned messages
  purgePinned: { type: Boolean, default: false },

  // Privacy
  privacy: {
    cmdOutputVisible: { type: [String], default: [] }, // 'author','proof','verifiedProof'
    dmDetailsVisible: { type: [String], default: ['author','proof','verifiedProof'] },
  },

  // Channel locking
  channelLock: {
    ignoredRoles:    { type: [String], default: [] },
    lockAllChannels: { type: [String], default: [] },
  },

  // Predefined reasons
  predefinedReasons: { type: [predefinedReasonSchema], default: [] },

  // User notifications
  userNotifications: {
    enabled:                 { type: Boolean, default: true },
    onPunish:                { type: Boolean, default: true },
    onUnpunish:              { type: Boolean, default: true },
    onPunishByOther:         { type: Boolean, default: false },
    onUnpunishByOther:       { type: Boolean, default: false },
    sendAttachments:         { type: Boolean, default: false },
  },

  // Immune roles
  immuneRoles: {
    useHierarchy: { type: Boolean, default: false },
    global:       { type: [String], default: [] },
    ban:          { type: [String], default: [] },
    kick:         { type: [String], default: [] },
    mute:         { type: [String], default: [] },
    warn:         { type: [String], default: [] },
  },

  // Punish settings
  punishSettings: {
    replyToMsg:          { type: Boolean, default: true },
    confirmRecentCase:   { type: Boolean, default: true },
    confirmWindowMins:   { type: Number,  default: 5 },
    logExpiredOutside:   { type: Boolean, default: true },
    cacheDeletedMsgs:    { type: Boolean, default: false },
    ban:  { type: punishTypeSchema, default: () => ({}) },
    kick: { type: punishTypeSchema, default: () => ({}) },
    mute: { type: punishTypeSchema, default: () => ({}) },
    warn: { type: punishTypeSchema, default: () => ({}) },
  },

  // User reports
  userReports: { type: userReportConfigSchema, default: () => ({}) },

  // Appeals
  appeals: { type: appealConfigSchema, default: () => ({}) },

}, { timestamps: true, minimize: false });

const ModerationConfig =
  mongoose.models.ModerationConfig ||
  mongoose.model('ModerationConfig', moderationConfigSchema);

module.exports = { ModerationConfig };
