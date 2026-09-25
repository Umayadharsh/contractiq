
const http = require('http');

async function req(path, data) {
  return new Promise((resolve) => {
    const request = http.request('http://localhost:4000/api/auth' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    request.write(JSON.stringify(data));
    request.end();
  });
}

async function run() {
  console.log('Registering accounts...');
  const res1 = await req('/register', { name: 'Admin', email: 'admin@test.com', password: 'password123' });
  // Since first user is Admin
  
  const res2 = await req('/register', { name: 'Reviewer', email: 'reviewer@test.com', password: 'password123', selectedRole: 'Reviewer' });
  const res3 = await req('/register', { name: 'Viewer', email: 'viewer@test.com', password: 'password123', selectedRole: 'Viewer' });

  // For existing users like 'umaya', let's test their login instead.
  // Wait, I will just test using these 3 new accounts!

  console.log('Testing: Viewer account + Viewer selection');
  const t1 = await req('/login', { email: 'viewer@test.com', password: 'password123', selectedRole: 'Viewer' });
  console.log(t1.status === 200 ? 'SUCCESS' : 'FAILED', t1.body.message || 'Logged in');

  console.log('Testing: Viewer account + Reviewer selection');
  const t2 = await req('/login', { email: 'viewer@test.com', password: 'password123', selectedRole: 'Reviewer' });
  console.log(t2.status === 403 ? 'SUCCESS' : 'FAILED', t2.body.message || 'Logged in');

  console.log('Testing: Viewer account + Admin selection');
  const t3 = await req('/login', { email: 'viewer@test.com', password: 'password123', selectedRole: 'Admin' });
  console.log(t3.status === 403 ? 'SUCCESS' : 'FAILED', t3.body.message || 'Logged in');

  console.log('Testing: Admin account + Admin selection');
  const t4 = await req('/login', { email: 'admin@test.com', password: 'password123', selectedRole: 'Admin' });
  console.log(t4.status === 200 ? 'SUCCESS' : 'FAILED', t4.body.message || 'Logged in');

  console.log('Testing: Reviewer account + Reviewer selection');
  const t5 = await req('/login', { email: 'reviewer@test.com', password: 'password123', selectedRole: 'Reviewer' });
  console.log(t5.status === 200 ? 'SUCCESS' : 'FAILED', t5.body.message || 'Logged in');
}
run();

