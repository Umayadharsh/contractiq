import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  counterparty: { type: String, required: true, trim: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileUrl: { type: String, required: true },
  status: { type: String, enum: ['Uploaded', 'Processing', 'Reviewed', 'NeedsReview', 'Failed'], default: 'Uploaded' },
  workspaceId: { type: String, required: true, trim: true },
  extractedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
  extractionError: { type: String, default: '' },
  rawExtractionOutput: { type: mongoose.Schema.Types.Mixed, default: null },
  extractionLogs: [{ type: mongoose.Schema.Types.Mixed }],
  complianceReport: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now }
});

contractSchema.index({ workspaceId: 1, createdAt: -1 });

export default mongoose.model('Contract', contractSchema);