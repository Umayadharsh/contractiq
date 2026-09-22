import mongoose from 'mongoose';

const workspaceMembershipSchema = new mongoose.Schema({
  workspaceId: { type: String, required: true, trim: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['Admin', 'Reviewer', 'Viewer'], required: true },
}, { timestamps: true });

workspaceMembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export default mongoose.model('WorkspaceMembership', workspaceMembershipSchema);
