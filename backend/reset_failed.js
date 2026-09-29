import 'dotenv/config';
import mongoose from 'mongoose';
import Contract from './src/models/Contract.js';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/contractiq';

async function run() {
  await mongoose.connect(uri);
  const result = await Contract.updateMany(
    {
      status: 'NeedsReview',
      complianceReport: null
    },
    { $set: { status: 'Waiting for Evaluation' } }
  );
  console.log(`Modified ${result.modifiedCount} documents.`);
  process.exit(0);
}
run();
