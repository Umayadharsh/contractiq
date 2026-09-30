const { MongoClient } = require('mongodb');

async function checkDb() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/contractiq';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  
  const contracts = await db.collection('contracts').find().toArray();
  console.log('Contracts:', contracts.map(c => ({ id: c._id, title: c.title, status: c.status, uploader: c.uploadedBy })));
  
  const actions = await db.collection('agentactions').find().toArray();
  console.log('Actions:', actions.map(a => ({ id: a.actionId, contractId: a.contractId, status: a.status, proposer: a.proposal?.proposedBy })));
  
  await client.close();
}

checkDb().catch(console.error);
