/**
 * Role visibility and authorization tests.
 *
 * Covers the 16 required checks: contract visibility per role, the pending
 * request queue, approve/reject authorization, approval propagation to
 * Viewers, the fixed system accounts, and data preservation.
 *
 * Credentials come from the gitignored backend/.env (SEED_ADMIN_PASSWORD and
 * friends) and MONGO_URI -- nothing secret is written into this file, and
 * nothing secret is printed.
 */
require("dotenv").config();
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const FormData = require("form-data");
const mongoose = require("mongoose");

const API = process.env.VISIBILITY_TEST_API || "http://localhost:4000/api";
const ADMIN_EMAIL = "admin@gmail.com";
const REVIEWER_EMAIL = "reviewer@gmail.com";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD;
const REVIEWER_PASSWORD = process.env.SEED_REVIEWER_PASSWORD;

let passed = 0;
let failed = 0;
const failures = [];

function check(ok, label, detail = "") {
  if (ok) { passed++; console.log(`PASS  ${label}${detail ? "  " + detail : ""}`); }
  else { failed++; failures.push(label); console.log(`FAIL  ${label}  ${detail}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

const oid = (v) => new mongoose.Types.ObjectId(String(v));

async function req(pathname, method, data, token, formData = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers["Authorization"] = "Bearer " + token;
    let requestOpts = { method, headers };
    if (formData) Object.assign(headers, formData.getHeaders());
    else headers["Content-Type"] = "application/json";
    const request = http.request(API + pathname, requestOpts, (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    request.on("error", reject);
    if (formData) formData.pipe(request);
    else if (data) { request.write(JSON.stringify(data)); request.end(); }
    else request.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  if (!PASSWORD || !REVIEWER_PASSWORD) {
    console.log("ABORTED EARLY: SEED_ADMIN_PASSWORD / SEED_REVIEWER_PASSWORD are not set in backend/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const contracts = db.collection("contracts");
  const actions = db.collection("agentActions");

  section("Setup");
  const adminLogin = await req("/auth/login", "POST", { email: ADMIN_EMAIL, password: PASSWORD, selectedRole: "Admin" });
  if (adminLogin.status !== 200) { console.log("ABORTED EARLY: cannot log in as admin:", adminLogin); process.exit(1); }
  const adminToken = adminLogin.body.token;
  const workspaceId = adminLogin.body.user.id;
  console.log(`  logged in as Admin, workspace=${workspaceId}`);

  const reviewerLogin = await req("/auth/login", "POST", { email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD, selectedRole: "Reviewer" });
  if (reviewerLogin.status !== 200) { console.log("ABORTED EARLY: cannot log in as reviewer:", reviewerLogin); process.exit(1); }
  const reviewerToken = reviewerLogin.body.token;
  console.log("  logged in as Reviewer");

  const rand = Date.now();
  const idsFor = async (status) => (await actions.distinct("contractId", { workspaceId, status })).filter(Boolean).map(oid);
  const pendingIds = await idsFor("pending_approval");
  const approvedIds = await idsFor("completed");
  const rejectedIds = await idsFor("rejected");
  const baselineContractIds = (await contracts.find({}, { projection: { _id: 1 } }).toArray()).map((c) => String(c._id));
  console.log(`  workspace has ${baselineContractIds.length} contracts; ${pendingIds.length} pending, ${approvedIds.length} approved, ${rejectedIds.length} rejected`);

  // ---- 12 & 13: registration is always Viewer --------------------------------
  section("12/13. Registration role");
  const regAdmin = await req("/auth/register", "POST", { name: "Probe Admin", email: `pa${rand}@test.com`, password: "password123", selectedRole: "Admin" });
  check(regAdmin.status === 201 && regAdmin.body.user?.role === "Viewer",
    "a registration requesting Admin still receives Viewer", `status=${regAdmin.status} role=${regAdmin.body.user?.role}`);
  const regReviewer = await req("/auth/register", "POST", { name: "Probe Reviewer", email: `pr${rand}@test.com`, password: "password123", selectedRole: "Reviewer" });
  check(regReviewer.status === 201 && regReviewer.body.user?.role === "Viewer",
    "a registration requesting Reviewer still receives Viewer", `status=${regReviewer.status} role=${regReviewer.body.user?.role}`);
  const regPlain = await req("/auth/register", "POST", { name: "Probe Plain", email: `pp${rand}@test.com`, password: "password123" });
  check(regPlain.status === 201 && regPlain.body.user?.role === "Viewer",
    "a registration with no role receives Viewer", `status=${regPlain.status} role=${regPlain.body.user?.role}`);

  // ---- 14 & 15: the fixed system accounts -----------------------------------
  section("14/15. Fixed system accounts");
  check(await users.countDocuments({ email: ADMIN_EMAIL }) === 1, "exactly one admin@gmail.com exists");
  check(await users.countDocuments({ email: ADMIN_EMAIL, role: "Admin" }) === 1, "admin@gmail.com holds the Admin role");
  check(await users.countDocuments({ email: REVIEWER_EMAIL }) === 1, "exactly one reviewer@gmail.com exists");
  check(await users.countDocuments({ email: REVIEWER_EMAIL, role: "Reviewer" }) === 1, "reviewer@gmail.com holds the Reviewer role");
  check(await users.countDocuments({ role: "Admin" }) === 1, "no second Admin account exists", `admins=${await users.countDocuments({ role: "Admin" })}`);
  check(await users.countDocuments({ role: "Reviewer" }) === 1, "no second Reviewer account exists", `reviewers=${await users.countDocuments({ role: "Reviewer" })}`);

  // A newly registered account is enrolled in the shared workspace as a Viewer
  // by the registration handler. Without that row it resolves to its own empty
  // personal workspace and could never read an approved contract, so the
  // enrolment itself is part of what has to hold.
  const viewerUser = regPlain.body.user;
  const makerUser = regReviewer.body.user;
  const memberships = db.collection("workspacememberships");
  const enrolled = await memberships.countDocuments({ workspaceId, userId: oid(viewerUser.id), role: "Viewer" });
  check(enrolled === 1, "registration enrols the new account in the shared workspace as a Viewer", `rows=${enrolled}`);

  // The maker needs the Reviewer role, which registration can no longer grant,
  // so it is set directly and the account is re-authenticated (the role is
  // baked into the JWT at login).
  await users.updateOne({ _id: oid(makerUser.id) }, { $set: { role: "Reviewer" } });
  await memberships.updateOne({ workspaceId, userId: oid(makerUser.id) }, { $set: { role: "Reviewer" } }, { upsert: true });
  const makerLogin = await req("/auth/login", "POST", { email: makerUser.email, password: "password123", selectedRole: "Reviewer" });
  check(makerLogin.status === 200 && makerLogin.body.user?.role === "Reviewer", "maker re-authenticated as Reviewer", `status=${makerLogin.status}`);
  const makerToken = makerLogin.body.token;

  const viewerToken = regPlain.body.token;

  // ---- 1, 2, 3, 4, 5, 6: the visibility matrix ------------------------------
  section("1-6. Contract list visibility");
  const adminList = (await req("/contracts", "GET", null, adminToken)).body;
  const reviewerList = (await req("/contracts", "GET", null, reviewerToken)).body;
  const viewerList = (await req("/contracts", "GET", null, viewerToken)).body;
  const idSet = (list) => new Set(list.map((c) => String(c._id)));

  check(Array.isArray(adminList) && adminList.length === baselineContractIds.length,
    "1/2. Admin sees every contract in the workspace", `admin=${adminList?.length} allContracts=${baselineContractIds.length}`);
  const adminIds = idSet(adminList);
  check(pendingIds.some((id) => adminIds.has(String(id))), "1. Admin can see a contract with a pending approval");
  check(approvedIds.some((id) => adminIds.has(String(id))), "2. Admin can see an approved contract");
  check(rejectedIds.length === 0 || rejectedIds.some((id) => adminIds.has(String(id))), "3. Admin can see a rejected contract");
  const failedContract = (await contracts.findOne({ workspaceId, status: "Failed" }, { projection: { _id: 1 } }));
  check(!failedContract || adminIds.has(String(failedContract._id)), "3. Admin can see a Failed contract");

  const reviewerIds = idSet(reviewerList);
  check(reviewerList.length > 0, "4. Reviewer sees pending review items", `reviewer=${reviewerList.length}`);
  check(reviewerList.every((c) => pendingIds.some((id) => String(id) === String(c._id))),
    "4. everything the Reviewer sees is pending approval");
  // A contract can carry an older approved action and still be awaiting a fresh
  // decision (the workspace has one: two auto-approved low-risk actions, then an
  // escalation left pending). Such a contract belongs in the Reviewer's queue.
  // What must never happen is a settled approval reaching the Reviewer, so the
  // check is on approved contracts that have nothing left to decide.
  const approvedAndSettled = approvedIds.filter((id) => !pendingIds.some((p) => String(p) === String(id)));
  check(approvedAndSettled.length > 0 && approvedAndSettled.every((id) => !reviewerIds.has(String(id))),
    "4. Reviewer cannot see settled approved contracts in the contract list",
    `settledApproved=${approvedAndSettled.length} leaked=${approvedAndSettled.filter((id) => reviewerIds.has(String(id))).length}`);

  check(viewerList.length > 0, "5. Viewer sees approved contracts", `viewer=${viewerList.length}`);
  check(viewerList.every((c) => approvedIds.some((id) => String(id) === String(c._id))),
    "5. everything the Viewer sees is approved");
  check(approvedIds.every((id) => idSet(viewerList).has(String(id))),
    "5. Viewer sees every approved contract, including ones approved earlier");
  const viewerIds = idSet(viewerList);
  check(!pendingIds.some((id) => !approvedIds.some((a) => String(a) === String(id)) && viewerIds.has(String(id))),
    "6. Viewer sees no contract that is only pending approval");
  check(!rejectedIds.some((id) => viewerIds.has(String(id))), "7. Viewer does not see rejected contracts as approved");

  // ---- 6: the pending queue is refused to a Viewer --------------------------
  section("6. Pending request queue");
  const viewerPending = await req("/agentguard/pending", "GET", null, viewerToken);
  check(viewerPending.status === 403, "Viewer is refused the pending request queue", `status=${viewerPending.status}`);
  const reviewerPending = (await req("/agentguard/pending", "GET", null, reviewerToken)).body;
  const adminPending = (await req("/agentguard/pending", "GET", null, adminToken)).body;
  check(Array.isArray(reviewerPending) && reviewerPending.length > 0, "Reviewer can see pending requests", `pending=${reviewerPending.length}`);
  check(Array.isArray(adminPending) && adminPending.length > 0, "Admin can see pending requests", `pending=${adminPending.length}`);

  // ---- 7: a Viewer cannot approve or reject ---------------------------------
  section("7. Viewer cannot approve or reject");
  const targetAction = (await req("/agentguard/pending", "GET", null, adminToken)).body[0];
  check(!!targetAction, "found a pending action to test against");
  if (targetAction) {
    for (const decision of ["approve", "reject"]) {
      const res = await req(`/agentguard/actions/${targetAction._id}/${decision}?workspaceId=${workspaceId}`, "POST", {}, viewerToken);
      check(res.status === 403, `Viewer gets 403 trying to ${decision}`, `status=${res.status}`);
    }
  }

  // ---- 8, 9, 10, 11: a real approval propagates -----------------------------
  section("8-11. Reviewer approval and propagation");
  const text = "This is a Service Agreement between Test Client LLC and Provider Corp. \n\n1. Services. The Provider shall provide consulting services as requested by the Client.\n\n2. Payment Terms. The Client shall pay all invoices within sixty (60) days of receiving the invoice. All payments shall be made in USD.\n\n3. Term and Termination. This Agreement shall commence on the Effective Date and continue until terminated by either party with thirty (30) days written notice.\n\n4. Governing Law. The law of California governs this Agreement.";
  const tmpFile = path.join(os.tmpdir(), `ciq-visibility-${rand}.txt`);
  fs.writeFileSync(tmpFile, text);
  const form = new FormData();
  form.append("title", `Visibility probe ${rand}`);
  form.append("counterparty", "Test Client LLC");
  form.append("file", fs.createReadStream(tmpFile), "contract.txt");
  form.append("workspaceId", workspaceId);
  const upload = await req("/contracts", "POST", null, makerToken, form);
  check(upload.status === 201, "maker uploaded a contract", `status=${upload.status}`);
  fs.unlinkSync(tmpFile);
  const probeId = upload.body?._id;

  if (probeId) {
    // The maker is a Reviewer, and a contract with no action yet is not in a
    // Reviewer's list, so it must not be readable by id either.
    const makerRead = await req(`/contracts/${probeId}?workspaceId=${workspaceId}`, "GET", null, makerToken);
    check(makerRead.status === 404, "a Reviewer cannot read a contract that has no pending approval", `status=${makerRead.status}`);
    const viewerReadEarly = await req(`/contracts/${probeId}?workspaceId=${workspaceId}`, "GET", null, viewerToken);
    check(viewerReadEarly.status === 404, "a Viewer cannot read an unapproved contract", `status=${viewerReadEarly.status}`);

    const evaluation = await req(`/contracts/${probeId}/evaluate-compliance?workspaceId=${workspaceId}`, "POST", {}, makerToken);
    check(evaluation.status === 200, "compliance evaluation ran", `status=${evaluation.status}`);

    let pending = [];
    for (let i = 0; i < 20 && !pending.length; i++) {
      pending = (await req("/agentguard/pending", "GET", null, adminToken)).body.filter((a) => String(a.contractId?._id ?? a.contractId) === String(probeId));
      if (!pending.length) await sleep(1000);
    }
    check(pending.length === 1, "the new action appears in the pending requests", `found=${pending.length}`);

    if (pending.length) {
      const action = pending[0];
      const inReviewerList = idSet((await req("/contracts", "GET", null, reviewerToken)).body).has(String(probeId));
      const inAdminListNow = idSet((await req("/contracts", "GET", null, adminToken)).body).has(String(probeId));
      const inViewerListNow = idSet((await req("/contracts", "GET", null, viewerToken)).body).has(String(probeId));
      check(inReviewerList, "4. the pending contract is in the Reviewer's contract list");
      check(inAdminListNow, "1. the pending contract is in the Admin's contract list");
      check(!inViewerListNow, "6. the pending contract is not in the Viewer's contract list");

      // maker-checker: the proposer must not decide its own action
      const selfApprove = await req(`/agentguard/actions/${action._id}/approve?workspaceId=${workspaceId}`, "POST", {}, makerToken);
      check(selfApprove.status === 403, "8. the proposing Reviewer cannot approve its own action", `status=${selfApprove.status}`);

      // 8: the standing Reviewer is authorized and approves
      const approve = await req(`/agentguard/actions/${action._id}/approve?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
      check(approve.status === 200, "8. an authorized Reviewer can approve", `status=${approve.status}`);

      // 9, 10, 11 after approval
      const viewerAfter = await req(`/contracts/${probeId}?workspaceId=${workspaceId}`, "GET", null, viewerToken);
      check(viewerAfter.status === 200, "9. the approved contract is immediately visible to the Viewer", `status=${viewerAfter.status}`);
      const viewerListAfter = (await req("/contracts", "GET", null, viewerToken)).body;
      check(idSet(viewerListAfter).has(String(probeId)), "9. the approved contract is in the Viewer's contract list");
      check(!!viewerAfter.body?.extractedFields && Object.keys(viewerAfter.body.extractedFields).length > 0,
        "5. the Viewer can open the approved contract and read its extracted information");
      const viewerPendingAfter = await req("/agentguard/pending", "GET", null, viewerToken);
      check(viewerPendingAfter.status === 403, "6. the Viewer is still refused the pending queue after approval");

      const adminAfter = await req(`/contracts/${probeId}?workspaceId=${workspaceId}`, "GET", null, adminToken);
      check(adminAfter.status === 200, "10. the approved contract is still visible to the Admin", `status=${adminAfter.status}`);

      const reviewerListAfter = (await req("/contracts", "GET", null, reviewerToken)).body;
      check(!idSet(reviewerListAfter).has(String(probeId)), "11. the approved contract left the Reviewer's contract list");
      const reviewerPendingAfter = (await req("/agentguard/pending", "GET", null, reviewerToken)).body;
      check(!reviewerPendingAfter.some((a) => String(a._id) === String(action._id)), "11. the action left the Reviewer's pending requests");

      // 7: rejection behaviour, on a second probe
      section("7. Rejection behaviour");
      const rejForm = new FormData();
      const tmpFile2 = path.join(os.tmpdir(), `ciq-visibility-rej-${rand}.txt`);
      fs.writeFileSync(tmpFile2, text);
      rejForm.append("title", `Visibility reject probe ${rand}`);
      rejForm.append("counterparty", "Test Client LLC");
      rejForm.append("file", fs.createReadStream(tmpFile2), "contract.txt");
      rejForm.append("workspaceId", workspaceId);
      const upload2 = await req("/contracts", "POST", null, makerToken, rejForm);
      fs.unlinkSync(tmpFile2);
      const probe2 = upload2.body?._id;
      check(!!probe2, "second contract uploaded for the rejection path", `status=${upload2.status}`);
      if (probe2) {
        await req(`/contracts/${probe2}/evaluate-compliance?workspaceId=${workspaceId}`, "POST", {}, makerToken);
        let pending2 = [];
        for (let i = 0; i < 20 && !pending2.length; i++) {
          pending2 = (await req("/agentguard/pending", "GET", null, adminToken)).body.filter((a) => String(a.contractId?._id ?? a.contractId) === String(probe2));
          if (!pending2.length) await sleep(1000);
        }
        check(pending2.length === 1, "second action reached the pending queue", `found=${pending2.length}`);
        if (pending2.length) {
          const reject = await req(`/agentguard/actions/${pending2[0]._id}/reject?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
          check(reject.status === 200, "an authorized Reviewer can reject", `status=${reject.status}`);
          const afterReject = await req("/agentguard/pending", "GET", null, reviewerToken);
          check(!afterReject.body.some((a) => String(a._id) === String(pending2[0]._id)), "7. the rejected action left the pending queue");
          const adminSees = await req(`/contracts/${probe2}?workspaceId=${workspaceId}`, "GET", null, adminToken);
          check(adminSees.status === 200, "7. the rejected contract is still visible to the Admin", `status=${adminSees.status}`);
          const viewerSees = await req(`/contracts/${probe2}?workspaceId=${workspaceId}`, "GET", null, viewerToken);
          check(viewerSees.status === 404, "7. the rejected contract is not exposed to the Viewer as approved", `status=${viewerSees.status}`);
        }
      }
    }
  }

  // ---- 16: nothing was lost -------------------------------------------------
  section("16. Data preservation");
  const after = await contracts.find({}, { projection: { _id: 1 } }).toArray();
  const afterIds = new Set(after.map((c) => String(c._id)));
  const lost = baselineContractIds.filter((id) => !afterIds.has(id));
  check(lost.length === 0, "every contract that existed before the test still exists", `lost=${lost.length}`);
  check(await db.collection("workspacememberships").countDocuments({ workspaceId }) > 0, "the workspace and its memberships are intact");
  check((await contracts.countDocuments({ workspaceId: "6aa8e57d8c1f45585b1385d7" })) >= baselineContractIds.length, "workspace contract data preserved");

  console.log("");
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  if (failed) { console.log("Failed checks:"); failures.forEach((f) => console.log("  - " + f)); }
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
}

run().catch(async (error) => {
  console.log("UNEXPECTED ERROR:", error && error.message);
  console.log(error && error.stack);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
