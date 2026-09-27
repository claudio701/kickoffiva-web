#!/usr/bin/env node
/**
 * e2e-local.mjs — Simulación E2E de la lógica pura de KickoffIVA (sin dependencias,
 * sin servidor, sin D1). Prueba los módulos espejo (*.logic.mjs) que las Pages
 * Functions comparten con Node:
 *
 *   functions/_lib/iva.logic.mjs    — cálculo de IVA / cierre mensual
 *   functions/_sii/parse.logic.mjs  — parsing de CSV del SII
 *   functions/_lib/rut.logic.mjs    — validación / dígito verificador de RUT
 *
 * Los módulos pueden no existir aún (otros agentes los están escribiendo): cada
 * uno se sondea con fs.existsSync y se omite con WARN si falta — nunca FAIL.
 *
 * Simulación: 10 ventas + 6 compras (IVA 19%), parse de un CSV fixture y
 * calcCierre; los totales se comparan contra valores calculados a mano.
 *
 * Uso:  node tests/e2e-local.mjs        (desde kickoffiva-web/)
 * Exit: 0 si todo PASS o solo WARNs; 1 si alguna aserción falla.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const MIRRORS = {
  iva: "functions/_lib/iva.logic.mjs",
  parse: "functions/_sii/parse.logic.mjs",
  rut: "functions/_lib/rut.logic.mjs",
};

let failures = 0;
let warnings = 0;

function pass(name, detail = "") {
  console.log(`[PASS] ${name}${detail ? "  — " + detail : ""}`);
}
function warn(name, detail = "") {
  warnings++;
  console.log(`[WARN] ${name}${detail ? "  — " + detail : ""}`);
}
function fail(name, err) {
  failures++;
  console.log(`[FAIL] ${name}  — ${err?.message ?? err}`);
}

/** Resuelve el primer export callable entre varios nombres candidatos. */
function pickFn(mod, candidates) {
  for (const c of candidates) {
    if (typeof mod?.[c] === "function") return { name: c, fn: mod[c] };
  }
  if (typeof mod?.default === "function") return { name: "default", fn: mod.default };
  return null;
}

async function loadMirror(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return import(pathToFileURL(abs).href);
}

// ── Fixtures: 10 ventas neto 100.000 c/u + 6 compras neto 50.000 c/u ─────────
// Valores calculados a mano (IVA 19%):
const TASA_IVA = 0.19;
const VENTAS = Array.from({ length: 10 }, (_, i) => ({
  tipo: 33, // factura electrónica
  folio: 1000 + i,
  rutEmisor: "76.987.654-5",
  neto: 100_000,
  iva: 19_000,
}));
const COMPRAS = Array.from({ length: 6 }, (_, i) => ({
  tipo: 33,
  folio: 2000 + i,
  rutEmisor: "76.123.456-0",
  neto: 50_000,
  iva: 9_500,
}));
// CSV fixture estilo SII/RCV (delimitador ';', columnas reconocibles)
const CSV_FIXTURE = [
  "rut;tipo;folio;neto;iva;total",
  ...VENTAS.map((v) => `${v.rutEmisor};${v.tipo};${v.folio};${v.neto};${v.iva};${v.neto + v.iva}`),
  ...COMPRAS.map((c) => `${c.rutEmisor};${c.tipo};${c.folio};${c.neto};${c.iva};${c.neto + c.iva}`),
].join("\n");

const EXP = {
  netoVentas: 1_000_000,
  ivaDebito: 190_000,
  netoCompras: 300_000,
  ivaCredito: 57_000,
  saldoAPagar: 133_000, // 190.000 - 57.000
  ivaTotalCsv: 247_000, // 190.000 + 57.000
  docs: 16,
};

async function testRut() {
  const mod = await loadMirror(MIRRORS.rut);
  if (!mod) return warn("rut.logic.mjs", "no existe aún — omitido");
  const dv = pickFn(mod, ["dvModulo11", "dvRut", "digitoVerificador", "calcDv", "computeDv"]);
  const valida = pickFn(mod, ["rutValido", "validarRut", "esRutValido", "validateRut", "isValidRut"]);
  if (!dv && !valida) return warn("rut.logic.mjs", "sin export reconocido (dvModulo11/rutValido/…) — omitido");
  try {
    // DVs verificados a mano con módulo 11: 76123456 → "0", 76987654 → "5"
    if (dv) {
      assert.equal(String(dv.fn("76123456")).toUpperCase(), "0", "dv de 76123456 debe ser 0");
      assert.equal(String(dv.fn("76987654")).toUpperCase(), "5", "dv de 76987654 debe ser 5");
      pass(`rut ${dv.name}()`, "76123456 → 0 / 76987654 → 5");
    }
    if (valida) {
      assert.equal(valida.fn("76.123.456-0"), true, "RUT válido debe pasar");
      assert.equal(valida.fn("76.123.456-7"), false, "RUT con DV malo debe fallar");
      assert.equal(valida.fn("76.987.654-5"), true, "segundo RUT válido debe pasar");
      pass(`rut ${valida.name}()`, "76.123.456-0 y 76.987.654-5 ok / 76.123.456-7 rechazado");
    }
  } catch (e) {
    fail("rut.logic.mjs", e);
  }
}

async function testParse() {
  const mod = await loadMirror(MIRRORS.parse);
  if (!mod) return warn("parse.logic.mjs", "no existe aún — omitido");
  const p = pickFn(mod, ["parseRcvCsv", "parseSiiCsv", "parseCsv", "parseLibroCsv", "parseDocumentos"]);
  if (!p) return warn("parse.logic.mjs", "sin export reconocido (parseRcvCsv/parseCsv/…) — omitido");
  try {
    const docs = p.fn(CSV_FIXTURE);
    assert.ok(Array.isArray(docs), "parse debe devolver un array");
    assert.equal(docs.length, EXP.docs, `deben parsearse ${EXP.docs} documentos`);
    const sumNeto = docs.reduce((s, d) => s + Number(d.neto ?? d.montoNeto ?? 0), 0);
    assert.equal(sumNeto, EXP.netoVentas + EXP.netoCompras, "suma de netos del CSV");
    const sumIva = docs.reduce((s, d) => s + Number(d.iva ?? d.montoIva ?? 0), 0);
    if (sumIva !== 0) {
      assert.equal(sumIva, EXP.ivaTotalCsv, "suma de IVA del CSV");
    }
    pass(`parse ${p.name}()`, `${EXP.docs} docs, neto total ${sumNeto.toLocaleString("es-CL")}, IVA ${sumIva.toLocaleString("es-CL")}`);
  } catch (e) {
    fail("parse.logic.mjs", e);
  }
}

async function testIva() {
  const mod = await loadMirror(MIRRORS.iva);
  if (!mod) return warn("iva.logic.mjs", "no existe aún — omitido");
  const calcCierre = pickFn(mod, ["calcCierre", "calcularCierre", "cierreMensual", "resumenCierre"]);
  const calcIva = pickFn(mod, ["calcIva", "ivaDesdeNeto", "calcularIva"]);
  try {
    if (calcIva) {
      const r = calcIva.fn(100_000);
      const iva = typeof r === "number" ? r : Number(r?.iva ?? r?.monto ?? NaN);
      assert.equal(iva, 19_000, "IVA de 100.000 al 19%");
      pass(`iva ${calcIva.name}()`, "100.000 → 19.000");
    }
    if (!calcCierre) {
      if (!calcIva) return warn("iva.logic.mjs", "sin export reconocido (calcCierre/calcIva/…) — omitido");
      return warn("iva calcCierre()", "no exportado — solo se verificó calcIva");
    }
    // tasaPpm = 0 para aislar el IVA: totalAPagar debe igualar ivaAPagar
    const cierre = calcCierre.fn(VENTAS, COMPRAS, 0);
    assert.ok(cierre && typeof cierre === "object", "calcCierre debe devolver un objeto");
    const num = (obj, keys) => {
      for (const k of keys) if (obj?.[k] !== undefined) return Number(obj[k]);
      return NaN;
    };
    const netoV = num(cierre, ["ventasNetas", "netoVentas"]);
    const netoC = num(cierre, ["comprasNetas", "netoCompras"]);
    const debito = num(cierre, ["debitoFiscal", "ivaDebito", "debito", "ivaVentas"]);
    const credito = num(cierre, ["creditoFiscal", "ivaCredito", "credito", "ivaCompras"]);
    const saldo = num(cierre, ["ivaAPagar", "saldo", "saldoAPagar", "total"]);
    if (!Number.isNaN(netoV)) assert.equal(netoV, EXP.netoVentas, `ventas netas = ${EXP.netoVentas}`);
    if (!Number.isNaN(netoC)) assert.equal(netoC, EXP.netoCompras, `compras netas = ${EXP.netoCompras}`);
    assert.equal(debito, EXP.ivaDebito, `débito fiscal = ${EXP.ivaDebito}`);
    assert.equal(credito, EXP.ivaCredito, `crédito fiscal = ${EXP.ivaCredito}`);
    assert.equal(saldo, EXP.saldoAPagar, `saldo a pagar = ${EXP.saldoAPagar}`);
    const total = num(cierre, ["totalAPagar"]);
    if (!Number.isNaN(total)) assert.equal(total, EXP.saldoAPagar, "totalAPagar = ivaAPagar con ppm 0");
    pass(
      `iva ${calcCierre.name}()`,
      `débito ${debito.toLocaleString("es-CL")} − crédito ${credito.toLocaleString("es-CL")} = ${saldo.toLocaleString("es-CL")}`
    );
  } catch (e) {
    fail("iva.logic.mjs", e);
  }
}

// ── Sanity local (siempre corre, no depende de los mirrors) ─────────────────
function testFixturesLocales() {
  try {
    const netoV = VENTAS.reduce((s, d) => s + d.neto, 0);
    const netoC = COMPRAS.reduce((s, d) => s + d.neto, 0);
    assert.equal(VENTAS.length, 10);
    assert.equal(COMPRAS.length, 6);
    assert.equal(netoV, EXP.netoVentas);
    assert.equal(netoC, EXP.netoCompras);
    assert.equal(Math.round(netoV * TASA_IVA), EXP.ivaDebito);
    assert.equal(Math.round(netoC * TASA_IVA), EXP.ivaCredito);
    assert.equal(EXP.ivaDebito - EXP.ivaCredito, EXP.saldoAPagar);
    const lineas = CSV_FIXTURE.trim().split("\n").length - 1;
    assert.equal(lineas, EXP.docs, "CSV fixture tiene header + 16 líneas");
    pass("fixtures locales", `10 ventas + 6 compras, saldo esperado ${EXP.saldoAPagar.toLocaleString("es-CL")}`);
  } catch (e) {
    fail("fixtures locales", e);
  }
}

async function main() {
  console.log("\nE2E local (lógica pura) — KickoffIVA");
  console.log(`raíz: ${ROOT}\n`);
  testFixturesLocales();
  await testRut();
  await testParse();
  await testIva();
  console.log(
    `\nResultado: ${failures === 0 ? "TODO OK ✅" : `${failures} FALLA(S) ❌`}${warnings ? `, ${warnings} warning(s) ⚠️` : ""}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Error inesperado:", e);
  process.exit(1);
});
