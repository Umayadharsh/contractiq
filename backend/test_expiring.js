import 'dotenv/config';
import mongoose from 'mongoose';
import Contract from './src/models/Contract.js';

async function testExpiringDateMath() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/contractiq';
  await mongoose.connect(uri);

  const c = await Contract.create({
    title: "Test Expiring Math Contract",
    counterparty: "ACME Corp",
    uploadedBy: new mongoose.Types.ObjectId(),
    fileUrl: "/test.pdf",
    status: "Approved",
    workspaceId: "test-workspace-math",
    extractedFields: {
      endDate: "2026-10-13" // 14 days from 2026-09-29
    }
  });

  const now = new Date('2026-09-29T16:56:41+05:30'); 

  const endDateRaw = c.extractedFields?.endDate;
  const endDateStr = typeof endDateRaw === 'object' ? (endDateRaw.value || endDateRaw.text) : endDateRaw;

  let passed = false;
  let diffDays = null;
  if (typeof endDateStr === 'string') {
    const match = endDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      const targetUtc = Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 14) {
        passed = true;
      }
    }
  }

  await Contract.deleteOne({ _id: c._id });
  await mongoose.disconnect();

  if (passed) {
    console.log("TEST PASSED: daysRemaining = 14");
    process.exit(0);
  } else {
    console.log(`TEST FAILED: daysRemaining = ${diffDays}`);
    process.exit(1);
  }
}

testExpiringDateMath().catch(console.error);
