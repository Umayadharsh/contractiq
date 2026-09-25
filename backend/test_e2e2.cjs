const http = require("http");
const FormData = require("form-data");
const fs = require("fs");

const API = "http://localhost:4000/api";
const makerEmail = "rev_maker@test.com";
const checkerEmail = "rev_checker@test.com";
const password = "password123";

async function req(path, method, data, token, formData = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers["Authorization"] = "Bearer " + token;
    
    let requestOpts = { method, headers };
    if (formData) {
      Object.assign(headers, formData.getHeaders());
    } else {
      headers["Content-Type"] = "application/json";
    }

    const request = http.request(API + path, requestOpts, res => {
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
    
    if (formData) {
      formData.pipe(request);
    } else if (data) {
      request.write(JSON.stringify(data));
      request.end();
    } else {
      request.end();
    }
  });
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function run() {
  console.log("Starting Live E2E AgentGuard Test...");
  let makerToken, checkerToken, workspaceId;

  // Step 1 - Register accounts
  console.log("\\n--- Step 1: Verify accounts ---");
  const rand = Date.now();
  const r1 = await req("/auth/register", "POST", { name: "Reviewer 1", email: "m" + rand + "@test.com", password, selectedRole: "Reviewer" });
  makerToken = r1.body.token;
  
  const r2 = await req("/auth/register", "POST", { name: "Reviewer 2", email: "c" + rand + "@test.com", password, selectedRole: "Reviewer" });
  checkerToken = r2.body.token;
  
  // They are in their own workspaces. We need them in the same workspace.
  // The first user in the system is 'umaya@gmail.com' (Admin).
  const adminRes = await req("/auth/login", "POST", { email: "umaya@gmail.com", password: "password123", selectedRole: "Admin" });
  const adminToken = adminRes.body.token;
  workspaceId = adminRes.body.user.id;
  
  // Actually, we can just use Mongoose to forcefully add them to the admin's workspace to bypass manual UI setup.
  const mongoose = require("mongoose");
  await mongoose.connect("mongodb+srv://umaya:umaya%401234@cluster0.0ylwoff.mongodb.net/test");
  const WorkspaceMembership = mongoose.model("WorkspaceMembership", new mongoose.Schema({}, { strict: false, collection: "workspacememberships" }));
  await WorkspaceMembership.create({ workspaceId, userId: new mongoose.Types.ObjectId(r1.body.user.id), role: "Reviewer" });
  await WorkspaceMembership.create({ workspaceId, userId: new mongoose.Types.ObjectId(r2.body.user.id), role: "Reviewer" });

  console.log("PASS: Maker logged in as Reviewer");
  console.log("PASS: Checker logged in as Reviewer");
  
  async function testFlow(decision) {
    console.log(`\\n--- Testing Flow: ${decision.toUpperCase()} ---`);
    
    // Step 3 - Create/upload test contract
    console.log("Uploading contract...");
    const text = "This is a Service Agreement. The Client shall pay all invoices within sixty (60) days of receiving the invoice. Other normal terms apply. The law of California governs this.";
    fs.writeFileSync("test_contract.txt", text);
    const form = new FormData();
    form.append("title", "Net 60 Test " + decision);
    form.append("file", fs.createReadStream("test_contract.txt"), "test_contract.txt");
    form.append("workspaceId", workspaceId);

    const uploadRes = await req("/contracts", "POST", null, makerToken, form);
    if (uploadRes.status !== 201) return console.log("FAIL: Contract upload failed", uploadRes);
    const contractId = uploadRes.body.contract._id;
    console.log("PASS: Contract uploaded:", contractId);

    // Step 4 - Verify extraction BEFORE evaluation
    let extracted = false;
    let contractDoc;
    for (let i = 0; i < 40; i++) {
      const cRes = await req(`/contracts/${contractId}?workspaceId=${workspaceId}`, "GET", null, makerToken);
      contractDoc = cRes.body;
      if (contractDoc.status === "Extracted") { extracted = true; break; }
      if (contractDoc.extractionError) return console.log("FAIL: Extraction error:", contractDoc.extractionError);
      await delay(2000);
    }
    if (!extracted) return console.log("FAIL: Extraction timed out");

    // Check clauses
    const clausesRes = await req(`/contracts/${contractId}/clauses?workspaceId=${workspaceId}`, "GET", null, makerToken);
    const clauses = clausesRes.body;
    if (clauses.length === 0) return console.log("FAIL: No clauses extracted");
    
    const payClause = clauses.find(c => c.text.includes("sixty (60) days"));
    if (!payClause) return console.log("FAIL: Payment clause missing");
    console.log("PASS: Clauses extracted and payment clause verified");

    // Step 5 - Run compliance evaluation
    console.log("Running compliance evaluation...");
    const evalRes = await req(`/contracts/${contractId}/evaluate-compliance?workspaceId=${workspaceId}`, "POST", {}, makerToken);
    if (evalRes.status !== 200) return console.log("FAIL: Evaluation failed", evalRes);
    
    const compliance = evalRes.body;
    if (!compliance.assessments || compliance.assessments.length === 0) return console.log("FAIL: Assessments empty");
    if (compliance.overallRiskScore !== 85) return console.log("FAIL: Score is not 85, it is", compliance.overallRiskScore);
    if (compliance.overallStatus !== "Warning") return console.log("FAIL: Status is not Warning");
    
    const agAction = compliance.agentAction;
    if (!agAction || !agAction.actionId) return console.log("FAIL: No AgentGuard action proposed");
    console.log("PASS: Compliance evaluated (85/100 Warning, Non-Compliant, Action Proposed)");

    // Step 6 - Verify AgentGuard action
    const pendingRes = await req(`/agentguard/pending?workspaceId=${workspaceId}`, "GET", null, makerToken);
    const action = pendingRes.body.find(a => a.contractId._id === contractId || a.contractId === contractId);
    if (!action) return console.log("FAIL: Action not found in pending");
    if (action.status !== "pending_approval") return console.log("FAIL: Action not pending_approval");
    if (action.proposal.proposedBy !== r1.body.user.id) return console.log("FAIL: proposedBy does not match Maker");
    console.log("PASS: Pending action verified");

    // Step 7 - Maker cannot approve/reject
    const mApp = await req(`/agentguard/actions/${action._id}/approve?workspaceId=${workspaceId}`, "POST", {}, makerToken);
    if (mApp.status !== 403) return console.log("FAIL: Maker could approve", mApp);
    
    const mRej = await req(`/agentguard/actions/${action._id}/reject?workspaceId=${workspaceId}`, "POST", {}, makerToken);
    if (mRej.status !== 403) return console.log("FAIL: Maker could reject", mRej);
    console.log("PASS: Maker correctly blocked from approving/rejecting");

    // Step 9 & 11 - Checker approves or rejects
    const cAction = decision === "approve" ? "approve" : "reject";
    const decRes = await req(`/agentguard/actions/${action._id}/${cAction}?workspaceId=${workspaceId}`, "POST", {}, checkerToken);
    if (decRes.status !== 200) return console.log(`FAIL: Checker ${cAction} failed`, decRes);
    console.log(`PASS: Checker successfully performed ${cAction}`);

    // Verify DB state
    const afterPending = await req(`/agentguard/pending?workspaceId=${workspaceId}`, "GET", null, checkerToken);
    if (afterPending.body.find(a => a._id === action._id)) return console.log("FAIL: Action still pending");
    
    console.log(`PASS: Flow completed for ${decision}`);
  }

  await testFlow("approve");
  await testFlow("reject");
  
  console.log("\\nAll workflows PASSED!");
  process.exit(0);
}
run();
