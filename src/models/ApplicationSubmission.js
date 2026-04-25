const mongoose = require('mongoose');

const submissionAnswerSchema = new mongoose.Schema(
  {
    fieldId: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    value: { type: String, default: '' },
  },
  { _id: false }
);

const applicationSubmissionSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    applicationId: { type: String, required: true, index: true },

    applicantUserId: { type: String, required: true, index: true },
    applicantUsername: { type: String, required: true },
    applicantDisplayTag: { type: String, default: null },

    answers: { type: [submissionAnswerSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'in_review', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    reviewNote: { type: String, default: '', maxlength: 2000 },
    reviewedByUserId: { type: String, default: null },
    reviewedByUsername: { type: String, default: null },
    reviewedAt: { type: Date, default: null },

    delivery: {
      recipientType: { type: String, enum: ['channel', 'user'], default: 'channel' },
      recipientTargetId: { type: String, default: null },
      messageId: { type: String, default: null },
      deliveredAt: { type: Date, default: null },
    },
  },
  { timestamps: true, minimize: false }
);

applicationSubmissionSchema.index({ guildId: 1, applicationId: 1, applicantUserId: 1, createdAt: -1 });

const ApplicationSubmission =
  mongoose.models.ApplicationSubmission ||
  mongoose.model('ApplicationSubmission', applicationSubmissionSchema);

module.exports = { ApplicationSubmission };
