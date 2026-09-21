import mongoose from 'mongoose';

const playbookRuleSchema = new mongoose.Schema(
  {
    ruleId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    expectedRequirement: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: ['Critical', 'Major', 'Minor'],
      default: 'Major',
      required: true,
    },
    fallbackText: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

playbookRuleSchema.index({ workspaceId: 1, category: 1, isActive: 1 });
playbookRuleSchema.index({ workspaceId: 1, ruleId: 1 }, { unique: true });

export default mongoose.model('PlaybookRule', playbookRuleSchema);
