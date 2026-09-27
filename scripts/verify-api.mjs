// E2E en vivo contra la API de KickoffIVA.
// Uso: node scripts/verify-api.mjs https://api.kickoffiva.cl
const BASE = process.argv[2] ?? 'https://api.kickoffiva.cl';
const periodo = new Date().toISOString().slice(0, 7);
const email = `prueba.${Date.now()}@kickoffiva.cl`;
const password = 'PruebaSegura2026!';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name} ${detail}`); }
}

async function api(path, { method = 'GET', token, body, companyId, raw = false } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { 'x-company-id': companyId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* CSV u otro */ }
  return { status: res.status, json, text };
}

// 0. Preflight CORS con x-company-id (lo que hace el navegador desde www.kickoffiva.cl)
{
  const pre = await fetch(`${BASE}/api/cierre/actual`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://www.kickoffiva.cl',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,x-company-id',
    },
  });
  const allowed = (pre.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  check('preflight CORS permite x-company-id', pre.status < 400 && allowed.includes('x-company-id'), `status=${pre.status} allow-headers=${allowed}`);
}

// 1. Registro
const reg = await api('/auth/register', {
  method: 'POST',
  body: { email, password, nombreEmpresa: 'Empresa de Prueba SpA', rutEmpresa: '76.123.456-0' },
});
check('registro 201 + token', reg.status === 201 && reg.json?.token, `status=${reg.status} body=${reg.text.slice(0, 200)}`);
const token = reg.json?.token;

// 2. Registro duplicado → 409
const dup = await api('/auth/register', {
  method: 'POST',
  body: { email, password, nombreEmpresa: 'X', rutEmpresa: '76.123.456-0' },
});
check('email duplicado → 409', dup.status === 409, `status=${dup.status}`);

// 3. Login
const login = await api('/auth/login', { method: 'POST', body: { email, password } });
check('login 200 + token', login.status === 200 && login.json?.token, `status=${login.status}`);

// 4. Login incorrecto → 401
const badLogin = await api('/auth/login', { method: 'POST', body: { email, password: 'mala12345' } });
check('login incorrecto → 401', badLogin.status === 401, `status=${badLogin.status}`);

// 5. Me
const me = await api('/auth/me', { token });
check('me 200 + email', me.status === 200 && (me.json?.user?.email ?? me.json?.email) === email, `status=${me.status} body=${me.text.slice(0, 200)}`);

// 6. Sin token → 401
const noAuth = await api('/cierre/actual');
check('cierre sin token → 401', noAuth.status === 401, `status=${noAuth.status}`);

// 7. Upload documentos del periodo actual
const up1 = await api('/libros/upload', {
  method: 'POST', token,
  body: { periodo, tipo: 'venta', documentos: [
    { folio: 'F-1001', rutEmisor: '76.123.456-0', fecha: `${periodo}-05`, neto: 100000, iva: 19000, total: 119000, razonSocial: 'Cliente Uno Ltda' },
    { folio: 'F-1002', rutEmisor: '76.123.456-0', fecha: `${periodo}-12`, neto: 50000, iva: 9500, total: 59500, razonSocial: 'Cliente Dos SA' },
  ] },
});
check('upload ventas: 2 insertados', up1.status === 200 && up1.json?.insertados === 2, `status=${up1.status} body=${up1.text.slice(0, 200)}`);

const up2 = await api('/libros/upload', {
  method: 'POST', token,
  body: { periodo, tipo: 'compra', documentos: [
    { folio: 'C-900', rutEmisor: '77.555.444-3', fecha: `${periodo}-08`, neto: 60000, iva: 11400, total: 71400, razonSocial: 'Proveedor SA' },
  ] },
});
check('upload compras: 1 insertado', up2.status === 200 && up2.json?.insertados === 1, `status=${up2.status} body=${up2.text.slice(0, 200)}`);

// 8. Upload duplicado → duplicados=2
const up3 = await api('/libros/upload', {
  method: 'POST', token,
  body: { periodo, tipo: 'venta', documentos: [
    { folio: 'F-1001', rutEmisor: '76.123.456-0', fecha: `${periodo}-05`, neto: 100000, iva: 19000 },
    { folio: 'F-1002', rutEmisor: '76.123.456-0', fecha: `${periodo}-12`, neto: 50000, iva: 9500 },
  ] },
});
check('upload duplicado → 2 duplicados', up3.status === 200 && up3.json?.duplicados === 2, `status=${up3.status} body=${up3.text.slice(0, 200)}`);

// 9. Cierre actual: ventas 150.000, débito 28.500, crédito 11.400, IVA 17.100
const cierre = await api('/cierre/actual', { token });
const c = cierre.json ?? {};
check('cierre 200 estado listo', cierre.status === 200 && c.estado === 'listo', `status=${cierre.status} body=${cierre.text.slice(0, 300)}`);
check('ventasNetas = 150000', c.ventasNetas === 150000, `got=${c.ventasNetas}`);
check('debitoFiscal = 28500', c.debitoFiscal === 28500, `got=${c.debitoFiscal}`);
check('creditoFiscal = 11400', c.creditoFiscal === 11400, `got=${c.creditoFiscal}`);
check('ivaAPagar = 17100', c.ivaAPagar === 17100, `got=${c.ivaAPagar}`);
check('totalAPagar = iva + ppm', typeof c.totalAPagar === 'number' && c.totalAPagar >= c.ivaAPagar, `got=${c.totalAPagar}`);

// 10. Cierre por periodo explícito
const cierreP = await api(`/cierre/${periodo}`, { token });
check('cierre/:periodo coincide', cierreP.status === 200 && cierreP.json?.ivaAPagar === c.ivaAPagar, `status=${cierreP.status}`);

// 11. Libros CSV
const csvC = await api(`/libros/compra?periodo=${periodo}`, { token });
check('libro compras CSV', csvC.status === 200 && csvC.text.includes('Proveedor SA') && csvC.text.includes('60000'), `status=${csvC.status} body=${csvC.text.slice(0, 200)}`);
const csvV = await api(`/libros/venta?periodo=${periodo}`, { token });
check('libro ventas CSV', csvV.status === 200 && csvV.text.includes('Cliente Uno Ltda'), `status=${csvV.status}`);

// 12. Empresa
const emp = await api('/empresa', { token });
check('empresa 200 + nombre', emp.status === 200 && emp.json?.nombre === 'Empresa de Prueba SpA', `status=${emp.status} body=${emp.text.slice(0, 200)}`);

// 13. PPM
const ppm = await api('/empresa/ppm', { method: 'PUT', token, body: { tasaPpm: 0.02 } });
check('ppm 0.02 ok', ppm.status === 200 && ppm.json?.ok === true, `status=${ppm.status} body=${ppm.text.slice(0, 200)}`);

// 14. Cierre refleja nuevo ppm (150000*0.02 = 3000 → total 20100)
const cierre2 = await api('/cierre/actual', { token });
check('ppm aplicado: totalAPagar = 20100', cierre2.json?.totalAPagar === 20100, `got=${cierre2.json?.totalAPagar} ppm=${cierre2.json?.ppm}`);

// 15. Credenciales SII cifradas
const sii = await api('/empresa/sii', { method: 'PUT', token, body: { rutSii: '76.123.456-0', claveSii: 'clave-falsa-prueba' } });
check('guardar credenciales SII', sii.status === 200 && sii.json?.siiConfigurado === true, `status=${sii.status} body=${sii.text.slice(0, 200)}`);
const emp2 = await api('/empresa', { token });
check('empresa refleja siiConfigurado', emp2.json?.siiConfigurado === true, `body=${emp2.text.slice(0, 200)}`);

// 16. Sincronizar SII con clave falsa → error controlado (400 o 502), no 500
const sync = await api('/sii/sincronizar', { method: 'POST', token, body: { periodo: periodo.replace('-', '') } });
check('sincronizar SII → error controlado', [400, 503].includes(sync.status) && !!sync.json?.error, `status=${sync.status} body=${sync.text.slice(0, 200)}`);

// ── Multiempresa: cuenta persona + N empresas ────────────────────────────────

// 17. Registro persona SIN empresa → 201, nombreEmpresa null
const email2 = `persona.${Date.now()}@kickoffiva.cl`;
const reg2 = await api('/auth/register', {
  method: 'POST',
  body: { email: email2, password, nombre: 'Persona Prueba' },
});
check('registro persona sin empresa 201', reg2.status === 201 && reg2.json?.user?.nombre === 'Persona Prueba' && reg2.json?.user?.nombreEmpresa === null, `status=${reg2.status} body=${reg2.text.slice(0, 250)}`);
const token2 = reg2.json?.token;

// 18. Cierre sin empresa → 400 "Primero agrega tu empresa"
const cierreVacio = await api('/cierre/actual', { token: token2 });
check('cierre sin empresa → 400', cierreVacio.status === 400 && /empresa/i.test(cierreVacio.json?.error ?? ''), `status=${cierreVacio.status} body=${cierreVacio.text.slice(0, 150)}`);

// 18b. GET /empresa sin empresa → 404 "Sin empresa" (NUNCA 401: la sesión sigue válida)
const empVacia = await api('/empresa', { token: token2 });
check('empresa sin empresa → 404 (no 401)', empVacia.status === 404 && /sin empresa/i.test(empVacia.json?.error ?? ''), `status=${empVacia.status} body=${empVacia.text.slice(0, 150)}`);

// 18c. Registro sin nombre → 400
const regSinNombre = await api('/auth/register', {
  method: 'POST',
  body: { email: `sinnombre.${Date.now()}@kickoffiva.cl`, password },
});
check('registro sin nombre → 400', regSinNombre.status === 400, `status=${regSinNombre.status} body=${regSinNombre.text.slice(0, 150)}`);

// 19. Agregar primera empresa → 201
const empA = await api('/empresas', {
  method: 'POST', token: token2,
  body: { nombre: 'Empresa Uno SpA', rut: '76.123.456-0' },
});
check('agregar empresa 1 → 201', empA.status === 201 && !!empA.json?.id, `status=${empA.status} body=${empA.text.slice(0, 200)}`);

// 20. RUT inválido → 400
const empBad = await api('/empresas', {
  method: 'POST', token: token2,
  body: { nombre: 'Mala SpA', rut: '76.123.456-7' },
});
check('empresa RUT inválido → 400', empBad.status === 400, `status=${empBad.status} body=${empBad.text.slice(0, 150)}`);

// 20b. Misma empresa otra vez (RUT con otro formato) → 409
const empDup = await api('/empresas', {
  method: 'POST', token: token2,
  body: { nombre: 'Empresa Uno Repetida', rut: '761234560' },
});
check('empresa duplicada → 409', empDup.status === 409 && /ya tienes/i.test(empDup.json?.error ?? ''), `status=${empDup.status} body=${empDup.text.slice(0, 150)}`);

// 20c. Nombre con HTML se guarda sanitizado
const empXss = await api('/empresas', {
  method: 'POST', token: token2,
  body: { nombre: '  <script>alert(1)</script>Comercial   Prueba ', rut: '12.345.678-5' },
});
check('nombre sanitizado (sin < >)', empXss.status === 201 && empXss.json?.nombre === 'scriptalert(1)/scriptComercial Prueba', `status=${empXss.status} body=${empXss.text.slice(0, 200)}`);

// 21. Agregar segunda empresa y listar → 3 (Uno + sanitizada + Dos)
const empB = await api('/empresas', {
  method: 'POST', token: token2,
  body: { nombre: 'Empresa Dos Ltda', rut: '77.555.444-4' },
});
const lista = await api('/empresas', { token: token2 });
check('tres empresas en la cuenta', empB.status === 201 && lista.json?.empresas?.length === 3, `status=${empB.status} n=${lista.json?.empresas?.length}`);

// 22. Subir venta a empresa 2 vía x-company-id y ver su cierre aislado
const upEB = await api('/libros/upload', {
  method: 'POST', token: token2, companyId: empB.json?.id,
  body: { periodo, tipo: 'venta', documentos: [
    { folio: 'EB-1', rutEmisor: '77.555.444-3', fecha: `${periodo}-10`, neto: 200000, iva: 38000, total: 238000 },
  ] },
});
const cierreEB = await api('/cierre/actual', { token: token2, companyId: empB.json?.id });
check('empresa 2 aislada: ivaAPagar = 38000', upEB.status === 200 && cierreEB.json?.ivaAPagar === 38000, `up=${upEB.status} iva=${cierreEB.json?.ivaAPagar}`);

// 23. Empresa 1 sin datos (no se contamina con empresa 2)
const cierreEA = await api('/cierre/actual', { token: token2, companyId: empA.json?.id });
check('empresa 1 sin datos', cierreEA.json?.estado === 'sin_datos', `estado=${cierreEA.json?.estado}`);

// 24. x-company-id ajeno → 400 (no filtra datos de otro usuario)
const cierreAjeno = await api('/cierre/actual', { token: token2, companyId: 'empresa-inexistente' });
check('empresa ajena → 400', cierreAjeno.status === 400, `status=${cierreAjeno.status}`);

console.log(`\n${passed} pasados, ${failed} fallados`);
process.exit(failed > 0 ? 1 : 0);
