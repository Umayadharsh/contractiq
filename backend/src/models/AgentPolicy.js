import mongoose from 'mongoose';

const triggerSchema = new mongoose.Schema({
  event: { type: String, trim: true },
  riskFlags: [{ type: String, trim: true }],
  severities: [{ type: String, trim: true }],
  ruleIds: [{ type: String, trim: true, uppercase: true }],
  categories: [{ type: String, trim: true, lowercase: true }],
}, { _id: false });

const actionSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true },
  payloadTemplate: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const approvalSchema = new mongoose.Schema({
  required: { type: Boolean, default: false },
  approverRoles: [{ type: String, enum: ['Admin', 'Reviewer', 'Viewer'] }],
  minApprovals: { type: Number, default: 1, min: 1 },
}, { _id: false });

const agentPolicySchema = new mongoose.Schema({
  policyId: { type: String, required: true, trim: true, uppercase: true },
  workspaceId: { type: String, required: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true, index: true },
  priority: { type: Number, required: true, default: 0 },
  trigger: { type: triggerSchema, required: true },
  decision: { type: String, enum: ['auto_approve', 'escalate', 'deny'], required: true },
  action: { type: actionSchema, required: true },
  approval: { type: approvalSchema, default: () => ({}) },
  version: { type: Number, required: true, default: 1, min: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'agentPolicies' });

agentPolicySchema.index({ workspaceId: 1, policyId: 1, version: 1 }, { unique: true });
agentPolicySchema.index({ workspaceId: 1, isActive: 1 });

export default mongoose.model('AgentPolicy', agentPolicySchema);
