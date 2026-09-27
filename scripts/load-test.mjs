// Prueba de carga KickoffIVA — visitas simultáneas a web y API.
// Uso: node scripts/load-test.mjs
const SITIO = 'https://www.kickoffiva.cl/';
const API = 'https://api.kickoffiva.cl/api/health';

async function hit(url) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'KickoffIVA-LoadTest/1.0' } });
    await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status };
  } catch (e) {
    return { ms: performance.now() - t0, status: 0, error: String(e) };
  }
}

async function fase(nombre, url, total, concurrencia) {
  const resultados = [];
  const t0 = performance.now();
  for (let i = 0; i < total; i += concurrencia) {
    const lote = await Promise.all(
      Array.from({ length: Math.min(concurrencia, total - i) }, () => hit(url))
    );
    resultados.push(...lote);
    process.stdout.write(`\r${nombre}: ${resultados.length}/${total}`);
  }
  const segundos = (performance.now() - t0) / 1000;
  const ms = resultados.map((r) => r.ms).sort((a, b) => a - b);
  const ok = resultados.filter((r) => r.status >= 200 && r.status < 400).length;
  const errores = resultados.filter((r) => r.status >= 400 || r.status === 0);
  const p = (q) => Math.round(ms[Math.min(ms.length - 1, Math.floor(ms.length * q))]);
  console.log(
    `\n✅ ${nombre}: ${ok}/${total} OK en ${segundos.toFixed(1)}s (${Math.round(total / segundos)} req/s)` +
      ` | p50=${p(0.5)}ms p95=${p(0.95)}ms p99=${p(0.99)}ms max=${Math.round(ms[ms.length - 1])}ms`
  );
  if (errores.length > 0) {
    const porStatus = {};
    for (const e of errores) porStatus[e.status] = (porStatus[e.status] ?? 0) + 1;
    console.log(`   ⚠️ Errores: ${JSON.stringify(porStatus)}`);
  }
  return { total, ok, segundos };
}

// Ráfaga simultánea pura: 100 a la vez en el mismo instante
async function rafaga(nombre, url, n) {
  const t0 = performance.now();
  const resultados = await Promise.all(Array.from({ length: n }, () => hit(url)));
  const segundos = (performance.now() - t0) / 1000;
  const ok = resultados.filter((r) => r.status >= 200 && r.status < 400).length;
  console.log(`✅ ${nombre}: ${ok}/${n} OK en ${segundos.toFixed(2)}s (100 simultáneas)`);
}

console.log('── Prueba de carga KickoffIVA ──\n');

await fase('Sitio web (1.000 visitas, 50 simultáneas)', SITIO, 1000, 50);
await fase('API health (1.000 llamadas, 50 simultáneas)', API, 1000, 50);
await rafaga('Ráfaga 100 visitantes al mismo segundo', SITIO, 100);

// Proyección: 100.000 visitas/hora ≈ 28 por segundo sostenido
console.log('\n── Sostenido: ~28 req/s durante 30s (equivale al ritmo de 100.000 visitas/hora) ──');
const t0 = performance.now();
let total = 0, ok = 0;
while (performance.now() - t0 < 30000) {
  const lote = await Promise.all(Array.from({ length: 28 }, () => hit(SITIO)));
  total += lote.length;
  ok += lote.filter((r) => r.status >= 200 && r.status < 400).length;
  process.stdout.write(`\r${total} requests...`);
  await new Promise((r) => setTimeout(r, 1000 - ((performance.now() - t0) % 1000) > 0 ? Math.max(0, 1000 - ((performance.now() - t0) % 1000)) : 0));
}
console.log(`\n✅ Ritmo sostenido: ${ok}/${total} OK en 30s (${Math.round((total / 30) * 3600).toLocaleString('es-CL')} visitas/hora equivalentes)`);
