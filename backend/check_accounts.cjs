const mongoose = require('mongoose');
async function run() {
  await mongoose.connect('mongodb+srv://umaya:umaya%401234@cluster0.0ylwoff.mongodb.net/test');
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
  const WorkspaceMembership = mongoose.model('WorkspaceMembership', new mongoose.Schema({}, { strict: false, collection: 'workspacememberships' }));
  const users = await User.find({ role: { $in: ['Viewer', 'Reviewer', 'Admin'] } });
  
  for (const u of users) {
    const mems = await WorkspaceMembership.find({ userId: u._id });
    console.log(u.email, u.role, u._id, mems.map(m => m.workspaceId));
  }
  process.exit(0);
}
run();
