with open("backend/src/utils/workspace.js", "r", encoding="utf-8") as f:
    text = f.read()

import re

target = "import WorkspaceMembership from '../models/WorkspaceMembership.js';"
replacement = """import WorkspaceMembership from '../models/WorkspaceMembership.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

export async function getNotificationRecipients(workspaceId, excludeUserId = null) {
  const memberships = await WorkspaceMembership.find({ workspaceId }).lean();
  const userIds = memberships.map(m => String(m.userId));
  
  if (mongoose.isValidObjectId(workspaceId)) {
    userIds.push(String(workspaceId));
  }

  const users = await User.find({
    _id: { $in: userIds },
    role: { $in: ['Admin', 'Viewer'] }
  }).lean();

  const recipients = users
    .filter(u => String(u._id) !== String(excludeUserId))
    .map(u => u.email);

  return [...new Set(recipients)];
}"""

if target in text:
    text = text.replace(target, replacement)
    with open("backend/src/utils/workspace.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
