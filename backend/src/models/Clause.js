import mongoose from 'mongoose';

const clauseSchema = new mongoose.Schema({
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', required: true },
  type: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  summary: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Clause', clauseSchema);
