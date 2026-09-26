const http = require("http");

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
    if (cond) { passed++; console.log("PASS:", msg); }
    else { failed++; console.error("FAIL:", msg, res); }
  }

  const rand = Date.now();
  const adminRes = await req("/auth/register", "POST", { name: "Admin", email: "admin" + rand + "@test.com", password: "password123", selectedRole: "Admin" });
  let adminToken = adminRes.body.token;

  const reviewerRes = await req("/auth/register", "POST", { name: "Reviewer", email: "rev" + rand + "@test.com", password: "password123", selectedRole: "Reviewer" });
  let reviewerToken = reviewerRes.body.token;

  const viewerRes = await req("/auth/register", "POST", { name: "Viewer", email: "view" + rand + "@test.com", password: "password123", selectedRole: "Viewer" });
  const viewerToken = viewerRes.body.token;

  const mongoose = require("mongoose");
  await mongoose.connect("mongodb+srv://umaya:umaya%401234@cluster0.0ylwoff.mongodb.net/test");
  
  const User = mongoose.model("User", new mongoose.Schema({}, { strict: false, collection: "users" }));
  // Registration assigns Viewer to everyone and ignores selectedRole, so the
  // Admin and Reviewer this test needs are granted here instead.
  await User.findByIdAndUpdate(adminRes.body.user.id, { role: "Admin" });
  await User.findByIdAndUpdate(reviewerRes.body.user.id, { role: "Reviewer" });
  await User.findByIdAndUpdate(viewerRes.body.user.id, { role: "Viewer" });

  // The role is baked into the JWT at login, so the tokens minted at
  // registration still carry Viewer. Re-authenticate to pick up the new roles;
  // without this every request below is refused as a Viewer.
  const adminLogin = await req("/auth/login", "POST", { email: adminRes.body.user.email, password: "password123", selectedRole: "Admin" });
  assertCheck(adminLogin.status === 200 && adminLogin.body.user?.role === "Admin", "provisioned Admin can authenticate as Admin", adminLogin);
  adminToken = adminLogin.body.token;
  const reviewerLogin = await req("/auth/login", "POST", { email: reviewerRes.body.user.email, password: "password123", selectedRole: "Reviewer" });
  assertCheck(reviewerLogin.status === 200 && reviewerLogin.body.user?.role === "Reviewer", "provisioned Reviewer can authenticate as Reviewer", reviewerLogin);
  reviewerToken = reviewerLogin.body.token;

  const WorkspaceMembership = mongoose.model("WorkspaceMembership", new mongoose.Schema({}, { strict: false, collection: "workspacememberships" }));
  const workspaceId = adminRes.body.user.id;
  // userId must be stored as an ObjectId: the route reads memberships through the
  // real WorkspaceMembership model, whose userId is an ObjectId, so a string here
  // is never matched and the reviewer is refused as "not configured".
  // Registration enrols every new account in the shared workspace as a Viewer,
  // so a membership row normally already exists and a plain insert would violate
  // the unique (workspaceId, userId) index. Set the intended role idempotently.
  const setMembership = (userId, role) => WorkspaceMembership.updateOne(
    { workspaceId, userId: new mongoose.Types.ObjectId(userId) },
    { $set: { role } },
    { upsert: true }
  );
  await setMembership(reviewerRes.body.user.id, "Reviewer");
  await setMembership(viewerRes.body.user.id, "Viewer");

  const AgentAction = mongoose.model("AgentAction", new mongoose.Schema({}, { strict: false, collection: "agentActions" }));
  
  async function createAction(proposerId) {
    const actionId = "act_" + Date.now() + Math.random();
    const doc = await AgentAction.create({
      actionId, workspaceId, contractId: new mongoose.Types.ObjectId(), evaluationRunId: "eval_" + Date.now(),
      type: "update_contract", status: "pending_approval", requestFingerprint: actionId,
      proposal: { proposedBy: proposerId },
      policySnapshot: { approval: { approverRoles: ["Reviewer", "Admin"] } }
    });
    return doc._id.toString();
  }

  const act1 = await createAction(adminRes.body.user.id);
  const app1 = await req("/agentguard/actions/" + act1 + "/approve?workspaceId=" + workspaceId, "POST", {}, adminToken);
  assertCheck(app1.status === 403 && app1.body.message.includes("proposer"), "proposer cannot approve own action", app1);

  const rej1 = await req("/agentguard/actions/" + act1 + "/reject?workspaceId=" + workspaceId, "POST", {}, adminToken);
  assertCheck(rej1.status === 403 && rej1.body.message.includes("proposer"), "proposer cannot reject own action", rej1);

  const appViewer = await req("/agentguard/actions/" + act1 + "/approve?workspaceId=" + workspaceId, "POST", {}, viewerToken);
  assertCheck(appViewer.status === 403, "Viewer cannot approve", appViewer);

  const rejViewer = await req("/agentguard/actions/" + act1 + "/reject?workspaceId=" + workspaceId, "POST", {}, viewerToken);
  assertCheck(rejViewer.status === 403, "Viewer cannot reject", rejViewer);

  const act2 = await createAction(reviewerRes.body.user.id);
  const rejAdmin = await req("/agentguard/actions/" + act2 + "/reject?workspaceId=" + workspaceId, "POST", {}, adminToken);
  assertCheck(rejAdmin.status === 200, "Admin can reject another users action", rejAdmin);

  const act3 = await createAction(adminRes.body.user.id);
  const appReviewer = await req("/agentguard/actions/" + act3 + "/approve?workspaceId=" + workspaceId, "POST", {}, reviewerToken);
  assertCheck(appReviewer.status === 200, "Reviewer can approve another users action", appReviewer);
  
  console.log("Passed: " + passed + ", Failed: " + failed);
  process.exit(failed > 0 ? 1 : 0);
}
run();
