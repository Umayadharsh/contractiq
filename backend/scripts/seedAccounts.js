/**
 * Idempotent account seed for the two standing workspace accounts.
 *
 * Passwords are NEVER stored in this file. They are read from the
 * environment (see SEED_ADMIN_PASSWORD / SEED_REVIEWER_PASSWORD), which
 * dotenv loads from backend/.env — a gitignored path.
 *
 * Hashing uses the same mechanism and cost as the registration flow
 * (bcryptjs, 12 rounds — see src/routes/auth.js).
 *
 * Roles are written directly because src/routes/auth.js only ever grants
 * 'Admin' to the first registered user and never accepts 'Admin' as a
 * self-requested role. This script does not modify that logic; it writes
 * the same fields the User model already defines.
 *
 * Usage:  npm run seed:accounts      (from backend/)
 *         node scripts/seedAccounts.js --verify
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import WorkspaceMembership from '../src/models/WorkspaceMembership.js';

const BCRYPT_COST = 12; // keep in sync with src/routes/auth.js register handler

const ACCOUNTS = [
  { email: 'admin@gmail.com', name: 'Admin', role: 'Admin', passwordEnvKey: 'SEED_ADMIN_PASSWORD' },
  { email: 'reviewer@gmail.com', name: 'Reviewer', role: 'Reviewer', passwordEnvKey: 'SEED_REVIEWER_PASSWORD' },
];

const verifyOnly = process.argv.includes('--verify');

const missing = ACCOUNTS.filter((a) => !process.env[a.passwordEnvKey]);
if (!verifyOnly && missing.length) {
  console.error(
    'Missing required environment variable(s):\n' +
      missing.map((a) => `  - ${a.passwordEnvKey} (for ${a.email})`).join('\n') +
      '\n\nSet them in backend/.env (gitignored) or export them before running.'
  );
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

try {
  const target = `${mongoose.connection.name} @ ${new URL(process.env.MONGO_URI).host}`;
  console.log(`Target database: ${target}`);
  console.log(`Mode: ${verifyOnly ? 'verify only (no writes)' : 'upsert'}`);
  console.log('');

  for (const account of ACCOUNTS) {
    const existing = await User.findOne({ email: account.email });

    if (verifyOnly) {
      const stored = existing?.password ?? '';
      console.log(
        `${account.email.padEnd(20)} ${existing ? 'EXISTS' : 'MISSING'}  role=${existing?.role ?? '-'}  ` +
          `hashed=${/^\$2[aby]\$/.test(stored)}  bcryptCost=${stored.split('$')[2] ?? '-'}`
      );
      continue;
    }

    const password = process.env[account.passwordEnvKey];
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const user = await User.findOneAndUpdate(
      { email: account.email },
      { $set: { name: account.name, role: account.role, password: passwordHash } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    const roundTrips = await bcrypt.compare(password, user.password);
    const leaksPlaintext = user.password.includes(password);

    console.log(
      `${account.email.padEnd(20)} ${existing ? 'updated' : 'created'}  role=${user.role}  ` +
        `passwordLength=${password.length}  bcryptVerify=${roundTrips}  plaintextStored=${leaksPlaintext}`
    );
  }

  // Guard against duplicates without touching any other user.
  const counts = await User.aggregate([
    { $match: { email: { $in: ACCOUNTS.map((a) => a.email) } } },
    { $group: { _id: '$email', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const duplicated = counts.filter((c) => c.n > 1);
  console.log('');
  console.log(
    `Documents per seeded email: ${counts.map((c) => `${c._id}=${c.n}`).join(', ')}` +
      (duplicated.length ? `  DUPLICATES: ${JSON.stringify(duplicated)}` : '  (no duplicates)')
  );

  // Workspace membership is what makes the shared documents reachable.
  //
  // src/routes/contracts.js resolves a request to: an explicit ?workspaceId
  // (honoured only when the caller owns that workspace or holds a membership in
  // it), otherwise the caller's own workspace when they have content there,
  // otherwise their most recent workspace membership.
  //
  // Every existing contract lives in the workspace owned by the first
  // registered Admin, so BOTH standing accounts need a membership row for that
  // workspace. Without one they resolve to their own empty personal workspace
  // and the UI reports zero documents.
  //
  // Override with SEED_WORKSPACE_ID. The fallback is the earliest Admin, which
  // is the original workspace owner holding the shared documents.
  const admin = await User.findOne({ email: 'admin@gmail.com' });
  const reviewer = await User.findOne({ email: 'reviewer@gmail.com' });

  let workspaceId = process.env.SEED_WORKSPACE_ID;
  if (!workspaceId) {
    const owner = await User.findOne({ role: 'Admin' }).sort({ createdAt: 1 }).lean();
    workspaceId = owner._id.toString();
    console.log(`SEED_WORKSPACE_ID not set; using earliest Admin (original workspace owner) ${workspaceId}`);
  }
  console.log(`Shared workspace: ${workspaceId}`);
  console.log('');

  for (const { user, role } of [{ user: admin, role: 'Admin' }, { user: reviewer, role: 'Reviewer' }]) {
    if (verifyOnly) {
      const membership = await WorkspaceMembership.findOne({ workspaceId, userId: user._id }).lean();
      console.log(
        `${user.email.padEnd(20)} membership: ${membership ? `EXISTS role=${membership.role}` : 'MISSING (cannot reach shared documents)'}`
      );
      continue;
    }

    const membership = await WorkspaceMembership.findOneAndUpdate(
      { workspaceId, userId: user._id },
      { $set: { role } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    const total = await WorkspaceMembership.countDocuments({ workspaceId, userId: user._id });
    console.log(`${user.email.padEnd(20)} membership: ensured role=${membership.role}  documents=${total}`);
  }

  if (!verifyOnly && workspaceId !== admin._id.toString()) {
    // Remove the vestigial "Reviewer is a member of the Admin's personal
    // workspace" row created by an earlier run, so workspace resolution is
    // unambiguous. Only rows belonging to the two seeded accounts are touched.
    const stale = await WorkspaceMembership.deleteMany({
      workspaceId: admin._id.toString(),
      userId: { $in: [admin._id, reviewer._id] },
    });
    if (stale.deletedCount) {
      console.log(`Removed ${stale.deletedCount} stale membership row(s) in the Admin's personal workspace ${admin._id}`);
    }
  }
} finally {
  await mongoose.disconnect();
}
