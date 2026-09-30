const http = require("http");
const mongoose = require("mongoose");

async function req(path, method, data, token) {
  return new Promise((resolve, reject) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    const request = http.request("http://localhost:4000/api" + path, { method, headers }, res => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    request.on("error", reject);
    if (data) request.write(JSON.stringify(data));
    request.end();
  });
}

async function run() {
  let passed = 0, failed = 0;
  function assertCheck(cond, msg, res) {
    if (cond) {
      passed++;
      console.log("PASS:", msg);
    } else {
      failed++;
      console.error("FAIL:", msg, res ? JSON.stringify(res.body || res) : "");
    }
  }

  const rand = Date.now();
  const adminRes = await req("/auth/register", "POST", { name: "Admin", email: "admin" + rand + "@test.com", password: "password123", selectedRole: "Admin" });
  let adminToken = adminRes.body.token;

  const reviewerRes = await req("/auth/register", "POST", { name: "Reviewer", email: "rev" + rand + "@test.com", password: "password123", selectedRole: "Reviewer" });
  let reviewerToken = reviewerRes.body.token;

  const viewerRes = await req("/auth/register", "POST", { name: "Viewer", email: "view" + rand + "@test.com", password: "password123", selectedRole: "Viewer" });
  const viewerToken = viewerRes.body.token;

  await mongoose.connect("mongodb+srv://umaya:umaya%401234@cluster0.0ylwoff.mongodb.net/test");
  
  const User = mongoose.model("User", new mongoose.Schema({}, { strict: false, collection: "users" }));
  await User.findByIdAndUpdate(adminRes.body.user.id, { role: "Admin" });
  await User.findByIdAndUpdate(reviewerRes.body.user.id, { role: "Reviewer" });
  await User.findByIdAndUpdate(viewerRes.body.user.id, { role: "Viewer" });

  const adminLogin = await req("/auth/login", "POST", { email: adminRes.body.user.email, password: "password123", selectedRole: "Admin" });
  adminToken = adminLogin.body.token;
  const reviewerLogin = await req("/auth/login", "POST", { email: reviewerRes.body.user.email, password: "password123", selectedRole: "Reviewer" });
  reviewerToken = reviewerLogin.body.token;

  const WorkspaceMembership = mongoose.model("WorkspaceMembership", new mongoose.Schema({}, { strict: false, collection: "workspacememberships" }));
  const workspaceId = adminRes.body.user.id;
  const setMembership = (userId, role) => WorkspaceMembership.updateOne(
    { workspaceId, userId: new mongoose.Types.ObjectId(userId) },
    { $set: { role, createdAt: new Date() } },
    { upsert: true }
  );
  await setMembership(reviewerRes.body.user.id, "Reviewer");
  await setMembership(viewerRes.body.user.id, "Viewer");

  const AgentAction = mongoose.model("AgentAction", new mongoose.Schema({}, { strict: false, collection: "agentActions" }));
  const AgentRun = mongoose.model("AgentRun", new mongoose.Schema({}, { strict: false, collection: "agentRuns" }));
  const Contract = mongoose.model("Contract", new mongoose.Schema({}, { strict: false, collection: "contracts" }));
  const AuditLog = mongoose.model("AuditLog", new mongoose.Schema({}, { strict: false, collection: "auditLogs" }));
  
  async function createAction(proposerId, contractUploaderId) {
    const actionId = "act_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
    const evalId = "eval_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
    
    const contract = await Contract.create({
      title: "Test Contract " + actionId,
      counterparty: "Acme Corp",
      fileUrl: "/uploads/test.pdf",
      workspaceId,
      status: "NeedsReview",
      uploadedBy: contractUploaderId || adminRes.body.user.id
    });
    
    await AgentRun.create({
      evaluationRunId: evalId,
      workspaceId,
      status: "waiting_for_approval",
      state: {
        evaluationRunId: evalId,
        actionId,
        requestedBy: { userId: proposerId }
      }
    });
    
    const doc = await AgentAction.create({
      actionId,
      workspaceId,
      contractId: contract._id,
      evaluationRunId: evalId,
      type: "update_contract",
      status: "pending_approval",
      requestFingerprint: actionId,
      proposal: {
        proposedBy: proposerId || null,
        requestedChanges: {
          complianceReport: {
            overallRiskScore: 85,
            overallStatus: "NeedsReview",
            flaggedClauses: []
          }
        }
      },
      createdBy: proposerId || null,
      policySnapshot: { approval: { approverRoles: ["Reviewer", "Admin"] } },
      evaluatorResponse: {}
    });
    return { _id: doc._id.toString(), actionId, contractId: contract._id.toString() };
  }

  console.log("=== Scenario 1: Admin-created action -> Reviewer can approve ===");
  const sc1 = await createAction(adminRes.body.user.id, adminRes.body.user.id);
  const app1 = await req(`/agentguard/actions/${sc1.actionId}/approve?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(app1.status === 200, "1. Admin-created action -> Reviewer can approve", app1);
  const sc1Doc = await AgentAction.findOne({ actionId: sc1.actionId });
  assertCheck(sc1Doc && ["approved", "completed"].includes(sc1Doc.status), "1b. Action status updated to approved/completed in DB");

  console.log("=== Scenario 2: Admin-created action -> Reviewer can reject ===");
  const sc2 = await createAction(adminRes.body.user.id, adminRes.body.user.id);
  const rej2 = await req(`/agentguard/actions/${sc2.actionId}/reject?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(rej2.status === 200, "2. Admin-created action -> Reviewer can reject", rej2);
  const sc2Doc = await AgentAction.findOne({ actionId: sc2.actionId });
  assertCheck(sc2Doc && sc2Doc.status === "rejected", "2b. Action status updated to rejected in DB");

  console.log("=== Scenario 3: AI-created action -> Reviewer can approve ===");
  const sc3 = await createAction(null, null);
  const app3 = await req(`/agentguard/actions/${sc3.actionId}/approve?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(app3.status === 200, "3. AI-created action -> Reviewer can approve", app3);
  const sc3Doc = await AgentAction.findOne({ actionId: sc3.actionId });
  assertCheck(sc3Doc && ["approved", "completed"].includes(sc3Doc.status), "3b. AI action status updated to approved/completed in DB");

  console.log("=== Scenario 4: Reviewer-created action -> same Reviewer gets 403 ===");
  const sc4 = await createAction(reviewerRes.body.user.id, reviewerRes.body.user.id);
  const app4 = await req(`/agentguard/actions/${sc4.actionId}/approve?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(app4.status === 403 && (app4.body?.message?.includes("proposer") || app4.body?.message?.includes("own action")), "4a. Reviewer cannot approve own action (403)", app4);
  const rej4 = await req(`/agentguard/actions/${sc4.actionId}/reject?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(rej4.status === 403 && (rej4.body?.message?.includes("proposer") || rej4.body?.message?.includes("own action")), "4b. Reviewer cannot reject own action (403)", rej4);
  const sc4Doc = await AgentAction.findOne({ actionId: sc4.actionId });
  assertCheck(sc4Doc && sc4Doc.status === "pending_approval", "4c. Action remains pending_approval");

  console.log("=== Scenario 5: Viewer -> gets 403 ===");
  const sc5 = await createAction(adminRes.body.user.id, adminRes.body.user.id);
  const app5 = await req(`/agentguard/actions/${sc5.actionId}/approve?workspaceId=${workspaceId}`, "POST", {}, viewerToken);
  assertCheck(app5.status === 403, "5a. Viewer cannot approve (403)", app5);
  const rej5 = await req(`/agentguard/actions/${sc5.actionId}/reject?workspaceId=${workspaceId}`, "POST", {}, viewerToken);
  assertCheck(rej5.status === 403, "5b. Viewer cannot reject (403)", rej5);

  console.log("=== Scenario 6: Both MongoDB _id and actionId UUID work ===");
  const sc6a = await createAction(adminRes.body.user.id, adminRes.body.user.id);
  const app6a = await req(`/agentguard/actions/${sc6a._id}/approve?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(app6a.status === 200, "6a. MongoDB ObjectId lookup works for approve", app6a);

  const sc6b = await createAction(adminRes.body.user.id, adminRes.body.user.id);
  const rej6b = await req(`/agentguard/actions/${sc6b.actionId}/reject?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(rej6b.status === 200, "6b. actionId UUID lookup works for reject", rej6b);

  console.log("=== Scenario 7: Successful approval creates the human_approve audit log ===");
  const auditApprove = await AuditLog.findOne({ actionType: "human_approve", "details.actionId": sc1.actionId });
  assertCheck(!!auditApprove, "7a. Audit log exists for human_approve", auditApprove);
  assertCheck(auditApprove && auditApprove.decision === "approved", "7b. Audit log decision is approved");
  assertCheck(auditApprove && String(auditApprove.actor) === String(reviewerRes.body.user.id), "7c. Audit log actor matches Reviewer");

  console.log("=== Scenario 8: Successful rejection creates the human_reject audit log ===");
  const auditReject = await AuditLog.findOne({ actionType: "human_reject", "details.actionId": sc2.actionId });
  assertCheck(!!auditReject, "8a. Audit log exists for human_reject", auditReject);
  assertCheck(auditReject && auditReject.decision === "rejected", "8b. Audit log decision is rejected");
  assertCheck(auditReject && String(auditReject.actor) === String(reviewerRes.body.user.id), "8c. Audit log actor matches Reviewer");

  console.log("=== Additional Guard Rails ===");
  const alreadyApproved = await req(`/agentguard/actions/${sc1.actionId}/approve?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(alreadyApproved.status === 409, "Already approved action cannot be processed (409)", alreadyApproved);

  const invalidAction = await req(`/agentguard/actions/invalid123/approve?workspaceId=${workspaceId}`, "POST", {}, reviewerToken);
  assertCheck(invalidAction.status === 404, "Invalid action ID returns 404", invalidAction);

  console.log(`\n============================`);
  console.log(`Summary: Passed: ${passed}, Failed: ${failed}`);
  console.log(`============================\n`);
  
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
