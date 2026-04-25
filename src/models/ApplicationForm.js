const mongoose = require('mongoose');

const applicationFieldSchema = new mongoose.Schema(
  {
    fieldId: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    helpText: { type: String, default: '', maxlength: 280 },
    type: {
      type: String,
      enum: ['text', 'textarea', 'select', 'number', 'boolean'],
      default: 'text',
    },
    required: { type: Boolean, default: true },
    placeholder: { type: String, default: '', maxlength: 120 },
    options: { type: [String], default: [] },
    minLength: { type: Number, default: null },
    maxLength: { type: Number, default: null },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const applicationFormSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 1200 },
    isActive: { type: Boolean, default: true },

    recipient: {
      type: {
        type: String,
        enum: ['channel', 'user'],
        default: 'channel',
      },
      targetId: { type: String, default: null },
    },

    reviewerRoleIds: { type: [String], default: [] },

    abuseProtection: {
      oneSubmissionPerUser: { type: Boolean, default: true },
      blockIfPendingExists: { type: Boolean, default: true },
      cooldownMinutes: { type: Number, default: 60, min: 0, max: 10080 },
      maxSubmissionsPerUser: { type: Number, default: 3, min: 1, max: 1000 },
      autoCloseAt: { type: Date, default: null },
    },

    identity: {
      requireOAuth: { type: Boolean, default: true },
      askUsernameAgain: { type: Boolean, default: false },
      askUserIdAgain: { type: Boolean, default: false },
    },

    style: {
      accent: { type: String, default: '#22d3ee' },
      gradientA: { type: String, default: '#0b1028' },
      gradientB: { type: String, default: '#172554' },
      animationPreset: {
        type: String,
        enum: ['pulse', 'wave', 'float'],
        default: 'wave',
      },
      cardRadius: { type: Number, default: 18, min: 8, max: 40 },
    },

    submitButtonText: { type: String, default: 'Submit Application', maxlength: 60 },
    successMessage: { type: String, default: 'Application submitted successfully.', maxlength: 280 },
    fields: { type: [applicationFieldSchema], default: [] },

    createdBy: {
      id: { type: String, default: null },
      username: { type: String, default: null },
    },
    updatedBy: {
      id: { type: String, default: null },
      username: { type: String, default: null },
    },
  },
  { timestamps: true, minimize: false }
);

applicationFormSchema.index({ guildId: 1, name: 1 }, { unique: true });

const ApplicationForm =
  mongoose.models.ApplicationForm || mongoose.model('ApplicationForm', applicationFormSchema);

module.exports = { ApplicationForm };
