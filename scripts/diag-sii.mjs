const BASE = 'https://api.kickoffiva.cl';
const email = `diag.${Date.now()}@kickoffiva.cl`;

async function j(path, { m = 'GET', t, b } = {}) {
  const r = await fetch(BASE + '/api' + path, {
    method: m,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { s: r.status, json, html: json ? null : text.slice(0, 80) };
}

const reg = await j('/auth/register', {
  m: 'POST',
  b: { email, password: 'PruebaSegura2026!', nombreEmpresa: 'Diag SpA', rutEmpresa: '76.123.456-0' },
});
console.log('reg:', reg.s);
const token = reg.json?.token;

const s1 = await j('/sii/sincronizar', { m: 'POST', t: token, b: { periodo: '202609' } });
console.log('sync sin creds:', s1.s, s1.json ?? s1.html);

const s2 = await j('/empresa/sii', { m: 'PUT', t: token, b: { rutSii: '76.123.456-0', claveSii: 'clave-falsa' } });
console.log('put sii:', s2.s, s2.json ?? s2.html);

const t0 = Date.now();
const s3 = await j('/sii/sincronizar', { m: 'POST', t: token, b: { periodo: '202609' } });
console.log('sync con creds:', s3.s, s3.json ?? s3.html, `(${Date.now() - t0}ms)`);
