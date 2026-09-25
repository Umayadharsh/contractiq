
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
  console.log('Testing: umaya account + Admin selection');
  const t = await req('/login', { email: 'umaya@gmail.com', password: 'password123', selectedRole: 'Admin' });
  console.log(t.status === 200 ? 'SUCCESS' : 'FAILED', t.body.message || 'Logged in');
}
run();

