import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  counterparty: { type: String, required: true, trim: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fileUrl: { type: String, required: true },
  status: { type: String, enum: ['Uploaded', 'Processing', 'Reviewed'], default: 'Uploaded' },
  workspaceId: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Contract', contractSchema);