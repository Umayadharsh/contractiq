/**
 * Reconciles the users collection down to exactly the two standing accounts.
 *
 * This script is DESTRUCTIVE: it deletes every user that is not
 * admin@gmail.com or reviewer@gmail.com. It is therefore a dry run unless
 * --apply is passed.
 *
 * Why the Admin is converted rather than recreated:
 *   The shared workspace is identified by the _id of the user who created it
 *   (umaya@gmail.com, 6aa8e57d8c1f45585b1385d7). Every contract, playbook rule
 *   and AgentGuard policy stores that value in its workspaceId field. Creating a
 *   brand new Admin would orphan all of them, so the existing document is
 *   renamed in place and keeps its _id.
 *
 * No application logic is touched: no auth, JWT, bcrypt, role, maker-checker or
 * AgentGuard code. Hashing uses the same library and cost as the registration
 * flow (bcryptjs, 12 rounds — see src/routes/auth.js).
 *
 * Passwords are never stored in this file or printed. They come from
 * SEED_ADMIN_PASSWORD / SEED_REVIEWER_PASSWORD in backend/.env (gitignored).
 *
 * Usage:
 *   npm run users:cleanup           # dry run, prints the plan, changes nothing
 *   npm run users:cleanup:apply     # perform the reconciliation
 *   npm run users:cleanup:verify    # assert the end state, changes nothing
 *
 * Safe to run repeatedly: the result is the same two accounts every time.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import WorkspaceMembership from '../src/models/WorkspaceMembership.js';

const BCRYPT_COST = 12; // keep in sync with src/routes/auth.js and seedAccounts.js

const ADMIN_EMAIL = 'admin@gmail.com';
const REVIEWER_EMAIL = 'reviewer@gmail.com';
const SOURCE_EMAIL = 'umaya@gmail.com'; // original workspace owner, renamed in place

const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');

const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const reviewerPassword = process.env.SEED_REVIEWER_PASSWORD;

if (!VERIFY) {
  const missing = [];
  if (!adminPassword) missing.push('SEED_ADMIN_PASSWORD');
  if (!reviewerPassword) missing.push('SEED_REVIEWER_PASSWORD');
  if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
    console.error('Set them in backend/.env (gitignored) or export them before running.');
    process.exit(1);
  }
}

const log = (...a) => console.log(...a);

await mongoose.connect(process.env.MONGO_URI);

try {
  const source = await User.findOne({ email: SOURCE_EMAIL });
  const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
  const reviewer = await User.findOne({ email: REVIEWER_EMAIL });

  // ---- decide which document survives as the Admin -----------------------------
  let adminId;
  let duplicateId = null;
  let rename = false;

  if (source && existingAdmin && String(source._id) === String(existingAdmin._id)) {
    adminId = source._id;
  } else if (source) {
    // Preserve the original owner's _id: it IS the shared workspace id.
    adminId = source._id;
    rename = true;
    if (existingAdmin) duplicateId = existingAdmin._id;
  } else if (existingAdmin) {
    adminId = existingAdmin._id; // already converted by an earlier run
  } else {
    console.error(`Neither ${SOURCE_EMAIL} nor ${ADMIN_EMAIL} exists.`);
    console.error('Refusing to invent a new Admin, because a fresh _id would orphan the shared workspace.');
    process.exitCode = 1;
  }

  const workspaceId = process.env.SEED_WORKSPACE_ID || String(adminId);

  if (VERIFY) {
    log('=== verify (read only) ===');
    const total = await User.countDocuments({});
    const a = await User.findOne({ email: ADMIN_EMAIL });
    const r = await User.findOne({ email: REVIEWER_EMAIL });
    const others = await User.countDocuments({ email: { $nin: [ADMIN_EMAIL, REVIEWER_EMAIL] } });
    const byRole = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
    let bad = 0;
    const check = (cond, label, extra = '') => { log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) bad++; };

    check(total === 2, 'total users is exactly 2', `actual=${total}`);
    check(others === 0, 'no other users remain', `actual=${others}`);
    check(!!a, `${ADMIN_EMAIL} exists`);
    check(a?.role === 'Admin', `${ADMIN_EMAIL} role is Admin`, `actual=${a?.role}`);
    check(!!r, `${REVIEWER_EMAIL} exists`);
    check(r?.role === 'Reviewer', `${REVIEWER_EMAIL} role is Reviewer`, `actual=${r?.role}`);
    check(/^\$2[aby]\$/.test(a?.password ?? ''), `${ADMIN_EMAIL} password is bcrypt`, `cost=${(a?.password ?? '').split('$')[2] ?? '-'}`);
    check(/^\$2[aby]\$/.test(r?.password ?? ''), `${REVIEWER_EMAIL} password is bcrypt`, `cost=${(r?.password ?? '').split('$')[2] ?? '-'}`);
    check(await bcrypt.compare(adminPassword, a?.password ?? ''), `${ADMIN_EMAIL} password verifies`);
    check(await bcrypt.compare(reviewerPassword, r?.password ?? ''), `${REVIEWER_EMAIL} password verifies`);
    check(byRole.filter((x) => x._id === 'Admin').length === 1 && byRole.filter((x) => x._id === 'Admin')[0]?.n === 1, 'exactly 1 Admin');
    check(byRole.filter((x) => x._id === 'Reviewer')[0]?.n === 1, 'exactly 1 Reviewer');
    check(String(a?._id) === workspaceId, 'Admin _id is the shared workspace id', `admin=${a?._id} workspace=${workspaceId}`);

    const adminMem = await WorkspaceMembership.find({ userId: a?._id }).lean();
    const revMem = await WorkspaceMembership.find({ workspaceId, userId: r?._id }).lean();
    check(adminMem.length === 0 || adminMem.every((m) => m.workspaceId === workspaceId), 'Admin has no foreign workspace membership', `rows=${adminMem.length}`);
    check(revMem.length === 1, `${REVIEWER_EMAIL} has exactly 1 membership in the workspace`, `rows=${revMem.length}`);
    check(revMem[0]?.role === 'Reviewer', 'Reviewer membership role is Reviewer', `actual=${revMem[0]?.role}`);

    const liveIds = (await User.find({}, { projection: { _id: 1 } }).lean()).map((u) => u._id);
    const orphans = await WorkspaceMembership.countDocuments({ userId: { $nin: liveIds } });
    check(orphans === 0, 'no orphaned workspace memberships', `actual=${orphans}`);

    const contractCount = await mongoose.connection.db.collection('contracts').countDocuments({});
    check(contractCount > 0, 'contracts preserved', `count=${contractCount}`);
    const inWorkspace = await mongoose.connection.db.collection('contracts').countDocuments({ workspaceId });
    check(inWorkspace === contractCount, 'every contract still in the shared workspace', `${inWorkspace}/${contractCount}`);

    log('');
    log(`VERIFY RESULT: ${bad === 0 ? 'all checks passed' : bad + ' check(s) failed'}`);
    process.exitCode = bad === 0 ? 0 : 1;
  } else {
    // ---- plan / apply ----------------------------------------------------------
    const doomed = await User.countDocuments({ _id: { $nin: [adminId, reviewer?._id].filter(Boolean) } });
    const roleCounts = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
    const allIds = (await User.find({}, { projection: { _id: 1 } }).lean()).map((u) => u._id);
    const orphanMemberships = await WorkspaceMembership.countDocuments({ userId: { $nin: allIds } });

    log(`Target database: ${mongoose.connection.name} @ ${new URL(process.env.MONGO_URI).host}`);
    log(`Mode: ${APPLY ? 'APPLY (destructive)' : 'DRY RUN (nothing will be written)'}`);
    log('');
    log('Plan:');
    log(`  users now              : ${await User.countDocuments({})}  (${roleCounts.map((r) => `${r._id}=${r.n}`).join(' ')})`);
    if (rename) log(`  rename ${SOURCE_EMAIL} -> ${ADMIN_EMAIL} (keeping _id ${adminId})`);
    else log(`  ${ADMIN_EMAIL} already present, no rename needed`);
    if (duplicateId) log(`  remove duplicate ${ADMIN_EMAIL} (_id ${duplicateId})`);
    else log('  no duplicate Admin to reconcile');
    if (!reviewer) log(`  create ${REVIEWER_EMAIL} (no existing document)`);
    else log(`  keep ${REVIEWER_EMAIL} (_id ${reviewer._id}), reset role/password`);
    log(`  workspace              : ${workspaceId}`);
    log(`  delete every other user: ${doomed}`);
    log(`  delete orphaned memberships (belonging to deleted users): ${orphanMemberships}`);
    log('  contracts, policies, AgentGuard actions and all other collections: untouched');
    log('');

    if (!APPLY) {
      log('Dry run complete. Re-run with --apply to execute.');
    } else {
      // 1. Reconcile a duplicate Admin before renaming, because email is unique.
      if (duplicateId) {
        const mems = await WorkspaceMembership.find({ userId: duplicateId }).lean();
        for (const m of mems) {
          if (m.workspaceId === String(adminId)) {
            await WorkspaceMembership.deleteOne({ _id: m._id }); // survivor owns it; row is redundant
          } else if (await WorkspaceMembership.exists({ workspaceId: m.workspaceId, userId: adminId })) {
            await WorkspaceMembership.deleteOne({ _id: m._id });
          } else {
            await WorkspaceMembership.updateOne({ _id: m._id }, { $set: { userId: adminId } });
          }
        }
        await User.deleteOne({ _id: duplicateId });
        log(`  removed duplicate Admin _id=${duplicateId} (reconciled ${mems.length} membership row(s))`);
      }

      // 2. Rename in place, preserving _id so the workspace keeps resolving.
      if (rename) {
        await User.updateOne({ _id: adminId }, { $set: { email: ADMIN_EMAIL } });
        log(`  renamed ${SOURCE_EMAIL} -> ${ADMIN_EMAIL} (_id ${adminId} preserved)`);
      }

      // 3. Role + password for the Admin, same hashing as the app.
      await User.updateOne(
        { _id: adminId },
        { $set: { name: 'Admin', role: 'Admin', password: await bcrypt.hash(adminPassword, BCRYPT_COST) } }
      );

      // 4. The Admin owns the workspace implicitly; drop any membership that
      //    would otherwise point it at a different workspace.
      const stray = await WorkspaceMembership.find({ userId: adminId, workspaceId: { $ne: String(adminId) } }).lean();
      for (const m of stray) await WorkspaceMembership.deleteOne({ _id: m._id });
      if (stray.length) log(`  removed ${stray.length} foreign-workspace membership row(s) from the Admin`);

      // 5. Reviewer, keeping its existing _id.
      let reviewerId;
      if (reviewer) {
        reviewerId = reviewer._id;
        await User.updateOne(
          { _id: reviewer._id },
          { $set: { name: 'Reviewer', role: 'Reviewer', password: await bcrypt.hash(reviewerPassword, BCRYPT_COST) } }
        );
        log(`  kept ${REVIEWER_EMAIL} _id=${reviewer._id}, role=Reviewer`);
      } else {
        const created = await User.create({
          name: 'Reviewer', email: REVIEWER_EMAIL, role: 'Reviewer',
          password: await bcrypt.hash(reviewerPassword, BCRYPT_COST),
        });
        reviewerId = created._id;
        log(`  created ${REVIEWER_EMAIL} _id=${created._id}`);
      }

      // 6. Reviewer membership in the shared workspace (required by
      //    requireWorkspace in src/routes/agentGuard.js before it can approve).
      const membership = await WorkspaceMembership.findOneAndUpdate(
        { workspaceId, userId: reviewerId },
        { $set: { role: 'Reviewer' } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
      log(`  Reviewer membership in ${workspaceId}: role=${membership.role} documents=${await WorkspaceMembership.countDocuments({ workspaceId, userId: reviewerId })}`);

      // 7. Delete every other user.
      const removed = await User.deleteMany({ _id: { $nin: [adminId, reviewerId] } });
      log(`  deleted ${removed.deletedCount} other user account(s)`);

      // 7b. Drop workspace memberships that belonged to the deleted users, so no
      //     orphaned rows are left pointing at users that no longer exist.
      //     Memberships of the two surviving accounts are untouched.
      const liveIds = [adminId, reviewerId];
      const orphanRows = await WorkspaceMembership.deleteMany({ userId: { $nin: liveIds } });
      log(`  deleted ${orphanRows.deletedCount} orphaned workspace membership row(s)`);

      // 8. Report without echoing secrets.
      const a = await User.findOne({ email: ADMIN_EMAIL });
      const r = await User.findOne({ email: REVIEWER_EMAIL });
      log('');
      log(`  ${ADMIN_EMAIL.padEnd(20)} _id=${a._id} role=${a.role} passwordLength=${adminPassword.length} bcryptVerify=${await bcrypt.compare(adminPassword, a.password)}`);
      log(`  ${REVIEWER_EMAIL.padEnd(20)} _id=${r._id} role=${r.role} passwordLength=${reviewerPassword.length} bcryptVerify=${await bcrypt.compare(reviewerPassword, r.password)}`);
      log(`  total users: ${await User.countDocuments({})}`);
    }
  }
} finally {
  await mongoose.disconnect();
}
