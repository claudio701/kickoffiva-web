// Diagnóstico de carga fino: rampas de concurrencia con códigos de error.
const SITIO = 'https://www.kickoffiva.cl/';
const API = 'https://api.kickoffiva.cl/api/health';

async function hit(url) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 LoadTest' } });
    await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status };
  } catch (e) {
    return { ms: performance.now() - t0, status: 0, code: e?.cause?.code ?? e?.message };
  }
}

async function ronda(url, total, conc) {
  const rs = [];
  const t0 = performance.now();
  for (let i = 0; i < total; i += conc) {
    rs.push(...(await Promise.all(Array.from({ length: Math.min(conc, total - i) }, () => hit(url)))));
  }
  const s = (performance.now() - t0) / 1000;
  const ok = rs.filter((r) => r.status >= 200 && r.status < 400).length;
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const errs = {};
  for (const r of rs) if (!(r.status >= 200 && r.status < 400)) errs[r.code ?? r.status] = (errs[r.code ?? r.status] ?? 0) + 1;
  console.log(
    `conc=${String(conc).padStart(3)} | ${ok}/${total} OK | ${(total / s).toFixed(1)} req/s | p50=${Math.round(ms[Math.floor(ms.length * 0.5)])}ms p95=${Math.round(ms[Math.floor(ms.length * 0.95)])}ms` +
      (Object.keys(errs).length ? ` | ⚠️ ${JSON.stringify(errs)}` : '')
  );
}

// Baseline: 1 request sola
const b = await hit(SITIO);
console.log(`Baseline 1 visita sola: ${Math.round(b.ms)}ms status=${b.status}`);
const b2 = await hit(API);
console.log(`Baseline API sola: ${Math.round(b2.ms)}ms status=${b2.status}\n`);

console.log('Sitio web (200 por ronda):');
await ronda(SITIO, 200, 5);
await ronda(SITIO, 200, 10);
await ronda(SITIO, 200, 25);
await ronda(SITIO, 200, 50);

console.log('\nAPI (200 por ronda):');
await ronda(API, 200, 5);
await ronda(API, 200, 10);
await ronda(API, 200, 25);
