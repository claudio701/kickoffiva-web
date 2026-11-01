import { useEffect, useMemo, useState } from "react";
import { clp } from "../config";
import { BotonEntrar, BotonConversar } from "../components/Botones";
import { calcularMultas, MULTA_TOPE, TASA_PENAL, tasaDesactualizada } from "../lib/multas";

export const CALC_STORAGE_KEY = "kickoffiva_calc";

export interface CalcGuardada {
  ventas: number;
  compras?: number;
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

// El cálculo y su base legal (art. 97 N°11 y art. 53 del Código Tributario, Ley 21.713)
// están en ../lib/multas.ts.

/** Botones − / + grandes: deslizar con el dedo un valor exacto es difícil en el celular. */
function Ajustar({
  valor,
  min,
  max,
  paso,
  onChange,
  etiqueta,
}: {
  valor: number;
  min: number;
  max: number;
  paso: number;
  onChange: (v: number) => void;
  etiqueta: string;
}) {
  const btn =
    "h-12 w-12 shrink-0 rounded-full border-2 border-humo/60 text-2xl font-semibold text-papel hover:border-cancha disabled:opacity-40";
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label={`Bajar ${etiqueta}`} disabled={valor <= min} onClick={() => onChange(Math.max(min, valor - paso))} className={btn}>
        −
      </button>
      <button type="button" aria-label={`Subir ${etiqueta}`} disabled={valor >= max} onClick={() => onChange(Math.min(max, valor + paso))} className={btn}>
        +
      </button>
    </div>
  );
}

export default function Calculadora() {
  const [ventas, setVentas] = useState(3000000);
  const [compras, setCompras] = useState(1500000);
  const [meses, setMeses] = useState(2);
  const [pagadas, setPagadas] = useState(150000);

  const r = useMemo(() => {
    const m = calcularMultas(ventas, compras, meses);
    return { ...m, iva: m.ivaMes, total: m.estimado + pagadas };
  }, [ventas, compras, meses, pagadas]);

  // Guardar los valores para que Mi IVA los retome al registrarse, solo si la
  // persona movió algo (si no, le atribuiríamos números que nunca escribió).
  const [tocado, setTocado] = useState(false);
  useEffect(() => {
    if (!tocado) return;
    try {
      const data: CalcGuardada = { ventas, compras, meses, pagadas, ts: Date.now() };
      localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage no disponible */
    }
  }, [ventas, compras, meses, pagadas, tocado]);

  const cambiarVentas = (v: number) => { setTocado(true); setVentas(v); };
  const cambiarCompras = (v: number) => { setTocado(true); setCompras(v); };
  const cambiarMeses = (v: number) => { setTocado(true); setMeses(v); };
  const cambiarPagadas = (v: number) => { setTocado(true); setPagadas(v); };

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
                <span className="text-base font-semibold">Ventas mensuales aprox. (sin IVA)</span>
                <span className="font-mono text-lg text-cancha">{clp(ventas)}</span>
              </span>
              <input
                type="range"
                min={500000}
                max={40000000}
                step={100000}
                value={ventas}
                onChange={(e) => cambiarVentas(+e.target.value)}
                className="mt-3 w-full accent-cancha"
                aria-label="Ventas mensuales aproximadas"
              />
              <Ajustar valor={ventas} min={500000} max={40000000} paso={500000} onChange={cambiarVentas} etiqueta="ventas mensuales aprox." />
            </label>

            <label className="block">
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-base font-semibold">Compras mensuales con factura (sin IVA)</span>
                <span className="font-mono text-lg text-cancha">{clp(compras)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={40000000}
                step={100000}
                value={compras}
                onChange={(e) => cambiarCompras(+e.target.value)}
                className="mt-3 w-full accent-cancha"
                aria-label="Compras mensuales con factura"
              />
              <Ajustar valor={compras} min={0} max={40000000} paso={500000} onChange={cambiarCompras} etiqueta="compras mensuales con factura" />
              <p className="mt-2 text-sm text-humo">El IVA de tus compras se descuenta del IVA de tus ventas.</p>
            </label>

            <label className="block">
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-base font-semibold">Meses con F29 atrasado este año</span>
                <span className="font-mono text-lg text-cancha">{meses}</span>
              </span>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={meses}
                onChange={(e) => cambiarMeses(+e.target.value)}
                className="mt-3 w-full accent-cancha"
                aria-label="Meses con F29 atrasado"
              />
              <Ajustar valor={meses} min={0} max={12} paso={1} onChange={cambiarMeses} etiqueta="meses con f29 atrasado este año" />
            </label>

            <label className="block">
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-base font-semibold">Multas que ya pagaste</span>
                <span className="font-mono text-lg text-cancha">{clp(pagadas)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={5000000}
                step={10000}
                value={pagadas}
                onChange={(e) => cambiarPagadas(+e.target.value)}
                className="mt-3 w-full accent-cancha"
                aria-label="Multas ya pagadas"
              />
              <Ajustar valor={pagadas} min={0} max={5000000} paso={50000} onChange={cambiarPagadas} etiqueta="multas que ya pagaste" />
            </label>

            <p className="text-base text-humo leading-relaxed">
              Mueve la barra o usa los botones − y +. Tu número aparece al tiro, sin registrarte.
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
                <dt className="text-humo">Tu IVA a pagar al mes (ventas − compras)</dt>
                <dd className="font-mono text-papel">{clp(r.iva)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-humo">Multas por {meses} {meses === 1 ? "F29 atrasado" : "F29 atrasados"}</dt>
                <dd className="font-mono text-papel">{clp(r.multas)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-humo">Intereses</dt>
                <dd className="font-mono text-papel">{clp(r.intereses)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-humo">Multas ya pagadas</dt>
                <dd className="font-mono text-papel">{clp(pagadas)}</dd>
              </div>
            </dl>

            <BotonEntrar texto="Entrar y ver mi IVA real →" className="mt-8" />
            <BotonConversar className="mt-3" />
            <p className="mt-3 text-center text-sm text-humo">
              Estimación referencial, no constituye asesoría tributaria. Al entrar, tus datos se retoman automáticamente.
            </p>
            <details className="mt-4 text-sm text-humo">
              <summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-papel">¿Cómo se calcula?</summary>
              <ul className="mt-2 space-y-2 leading-relaxed">
                <li>
                  <strong className="text-papel">Multa:</strong> 10% del IVA adeudado, más 2% por cada mes de atraso, con tope de{" "}
                  {Math.round(MULTA_TOPE * 100)}% (art. 97 N°11 del Código Tributario). Si el atraso lo detecta el SII en una
                  fiscalización, la multa parte en 20%.
                </li>
                <li>
                  <strong className="text-papel">Intereses:</strong> interés penal diario del art. 53 del Código Tributario (Ley
                  21.713): {(TASA_PENAL.diaria * 100).toLocaleString("es-CL", { maximumFractionDigits: 4 })}% por día, tasa del SII
                  para el {TASA_PENAL.texto}.
                  {tasaDesactualizada() && " El SII ya publicó una tasa nueva: el resultado puede variar levemente."}
                </li>
                <li>No incluye el reajuste por IPC, que también cobra el SII.</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
