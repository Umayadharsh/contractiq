import mongoose from 'mongoose';

const agentActionSchema = new mongoose.Schema({
  actionId: { type: String, required: true, unique: true, trim: true },
  workspaceId: { type: String, required: true, trim: true, index: true },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', required: true, index: true },
  policyId: { type: String, default: null },
  policyVersion: { type: Number, default: null },
  evaluationRunId: { type: String, required: true, index: true },
  type: { type: String, required: true, trim: true },
  status: { type: String, enum: ['proposed', 'pending_approval', 'approved', 'ready_for_execution', 'rejected', 'executing', 'completed', 'failed', 'cancelled', 'blocked'], required: true },
  requestFingerprint: { type: String, required: true },
  proposal: {
    title: String,
    reason: String,
    riskAssessmentIds: [String],
    requestedChanges: mongoose.Schema.Types.Mixed,
    target: mongoose.Schema.Types.Mixed,
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  policySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  approval: {
    required: { type: Boolean, default: false },
    decision: { type: String, enum: ['pending', 'approved', 'rejected', 'not_required'], default: 'not_required' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    comment: { type: String, default: '' },
  },
  execution: {
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
  },
}, { timestamps: true, collection: 'agentActions' });

agentActionSchema.index({ workspaceId: 1, createdAt: -1 });
agentActionSchema.index({ evaluationRunId: 1 });
agentActionSchema.index({ workspaceId: 1, status: 1 });

export default mongoose.model('AgentAction', agentActionSchema);
