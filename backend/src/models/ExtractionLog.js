import mongoose from 'mongoose';

const extractionLogSchema = new mongoose.Schema({
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', required: true },
  level: { type: String, enum: ['info', 'warning', 'error'], required: true },
  message: { type: String, required: true, trim: true },
  rawOutput: { type: mongoose.Schema.Types.Mixed, default: null },
  confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
  needsReview: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('ExtractionLog', extractionLogSchema);
