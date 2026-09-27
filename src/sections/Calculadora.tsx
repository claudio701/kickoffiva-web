import { useEffect, useMemo, useState } from "react";
import { clp, waCalculadoraUrl } from "../config";

export const CALC_STORAGE_KEY = "kickoffiva_calc";

export interface CalcGuardada {
  ventas: number;
  meses: number;
  pagadas: number;
  ts: number;
}

/** Lee los últimos valores usados en la calculadora pública (si existen). */
export function leerCalcGuardada(): CalcGuardada | null {
  try {
    const raw = localStorage.getItem(CALC_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CalcGuardada;
    return typeof data?.ventas === "number" ? data : null;
  } catch {
    return null;
  }
}

// Modelo referencial y transparente:
// - IVA débito estimado: 19% de las ventas del mes (simplificación, sin crédito fiscal)
// - Multa por atraso F29: 10% del impuesto el primer mes + 2% por cada mes adicional (tope legal real)
// - Intereses: 1,5% mensual sobre el impuesto, acumulándose por cada mes de atraso
const IVA_TASA = 0.19;
const MULTA_BASE = 0.10;
const MULTA_MES_EXTRA = 0.02;
const INTERES_MES = 0.015;

export default function Calculadora() {
  const [ventas, setVentas] = useState(3000000);
  const [meses, setMeses] = useState(2);
  const [pagadas, setPagadas] = useState(150000);

  const r = useMemo(() => {
    const iva = ventas * IVA_TASA;
    const multaPorMes = iva * (MULTA_BASE + Math.max(0, meses - 1) * MULTA_MES_EXTRA);
    const intereses = iva * INTERES_MES * (meses * (meses + 1)) / 2;
    const estimado = multaPorMes * meses + intereses;
    const total = estimado + pagadas;
    return { iva, estimado, total };
  }, [ventas, meses, pagadas]);

  // Guardar los valores para que Mi IVA los retome al registrarse.
  useEffect(() => {
    try {
      const data: CalcGuardada = { ventas, meses, pagadas, ts: Date.now() };
      localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage no disponible */
    }
  }, [ventas, meses, pagadas]);

  return (
    <section id="calculadora" className="border-b border-linea bg-panel/40">
      <div className="wrap py-14 sm:py-20">
        <p className="kicker mb-4">Haz la prueba — 30 segundos</p>
        <h2 className="headline text-3xl sm:text-4xl lg:text-5xl max-w-3xl">
          ¿Cuánto te ha costado el SII este año?
        </h2>

        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Inputs */}
          <div className="space-y-8">
            <label className="block">
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">Ventas mensuales aprox.</span>
                <span className="font-mono text-lg text-cancha">{clp(ventas)}</span>
              </span>
              <input
                type="range"
                min={500000}
                max={40000000}
                step={100000}
                value={ventas}
                onChange={(e) => setVentas(+e.target.value)}
                className="mt-3 w-full accent-cancha"
                aria-label="Ventas mensuales aproximadas"
              />
            </label>

            <label className="block">
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">Meses con F29 atrasado este año</span>
                <span className="font-mono text-lg text-cancha">{meses}</span>
              </span>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={meses}
                onChange={(e) => setMeses(+e.target.value)}
                className="mt-3 w-full accent-cancha"
                aria-label="Meses con F29 atrasado"
              />
            </label>

            <label className="block">
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium">Multas que ya pagaste</span>
                <span className="font-mono text-lg text-cancha">{clp(pagadas)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={5000000}
                step={10000}
                value={pagadas}
                onChange={(e) => setPagadas(+e.target.value)}
                className="mt-3 w-full accent-cancha"
                aria-label="Multas ya pagadas"
              />
            </label>

            <p className="font-mono text-[11px] text-humo leading-relaxed">
              ← Mueve los 3 datos y mira tu número. Sin registro, sin correo.
            </p>
          </div>

          {/* Resultado */}
          <div className="rounded-2xl border border-linea bg-tinta p-6 sm:p-8 flex flex-col">
            <p className="kicker">Tu número estimado</p>
            <p className="mt-4 font-display font-bold text-4xl sm:text-6xl text-multa leading-none">
              {clp(r.total)}
            </p>
            <p className="mt-3 text-sm text-humo">te ha costado el SII este año (referencial)</p>

            <dl className="mt-7 space-y-3 border-t border-linea pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-humo">Tu IVA mensual estimado</dt>
                <dd className="font-mono text-papel">{clp(r.iva)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-humo">Multas e intereses estimados por {meses} {meses === 1 ? "mes" : "meses"} atrasado{meses === 1 ? "" : "s"}</dt>
                <dd className="font-mono text-papel">{clp(r.estimado)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-humo">Multas ya pagadas</dt>
                <dd className="font-mono text-papel">{clp(pagadas)}</dd>
              </div>
            </dl>

            <a
              href={waCalculadoraUrl(r.total)}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex justify-center rounded-full bg-cancha px-7 py-3.5 text-base font-semibold text-tinta hover:bg-cancha-dim transition-colors"
            >
              Ordenar mi IVA →
            </a>
            <a
              href="#mi-iva"
              className="mt-3 inline-flex justify-center rounded-full border border-cancha/50 px-7 py-3 text-sm font-semibold text-cancha hover:bg-cancha/10 transition-colors"
            >
              Quiero mi número real, no estimado →
            </a>
            <p className="mt-3 text-center font-mono text-[11px] text-humo">
              Estimación referencial, no constituye asesoría tributaria. En Mi IVA tus datos se retoman automáticamente.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
