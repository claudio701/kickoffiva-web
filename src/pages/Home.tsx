import Header from "../sections/Header";
import Hero from "../sections/Hero";
import Respaldo from "../sections/Respaldo";
import Problemas from "../sections/Problemas";
import Calculadora from "../sections/Calculadora";
import MiIva from "../sections/MiIva";
import ComoFunciona from "../sections/ComoFunciona";
import Timeline from "../sections/Timeline";
import Garantia from "../sections/Garantia";
import Plan from "../sections/Plan";
import Servicios from "../sections/Servicios";
import Equipo from "../sections/Equipo";
import Faq from "../sections/Faq";
import CtaFinal from "../sections/CtaFinal";
import Footer from "../sections/Footer";
import StickyCta from "../sections/StickyCta";
import Asistente from "../components/Asistente";
import { BandaEntrar } from "../components/Botones";
import { useEffect } from "react";

export default function Home() {
  // El contenido se renderiza con JS: al llegar con un anchor (#calculadora,
  // #plan...) el navegador intenta hacer scroll antes de que exista el
  // elemento. Lo hacemos nosotros una vez montada la página.
  useEffect(() => {
    if (window.location.hash) {
      const ir = () => {
        // El hash puede traer parámetros de campaña (#plan?utm_source=mail):
        // querySelector("#plan?utm…") lanza SyntaxError y dejaba la página en
        // blanco. Se toma solo el id y se busca con getElementById.
        let id = window.location.hash.slice(1).split(/[?&]/)[0] ?? "";
        try {
          id = decodeURIComponent(id);
        } catch {
          /* % mal formado: se usa tal cual */
        }
        const el = id ? document.getElementById(id) : null;
        if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
      };
      ir();
      // re-intento tras la carga de fuentes (el layout se mueve un poco)
      const t = setTimeout(ir, 400);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div id="top" className="min-h-screen bg-tinta text-papel">
      <Header />
      <main>
        <Hero />
        <Respaldo />
        <Problemas />
        <BandaEntrar frase="¿Te pasa alguna de estas? Entra y mira tu IVA de este mes." />
        <Calculadora />
        <MiIva />
        <ComoFunciona />
        <Timeline />
        <BandaEntrar frase="Son 3 pasos y toma 2 minutos." />
        <Garantia />
        <Plan />
        <Servicios />
        <Equipo />
        <Faq />
        <BandaEntrar frase="¿Listo para probar? No necesitas saber de impuestos." />
        <CtaFinal />
      </main>
      <Footer />
      <StickyCta />
      <Asistente />
    </div>
  );
}
