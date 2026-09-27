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
import { useEffect } from "react";

export default function Home() {
  // El contenido se renderiza con JS: al llegar con un anchor (#calculadora,
  // #plan...) el navegador intenta hacer scroll antes de que exista el
  // elemento. Lo hacemos nosotros una vez montada la página.
  useEffect(() => {
    if (window.location.hash) {
      const ir = () => {
        const el = document.querySelector(window.location.hash);
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
        <Calculadora />
        <MiIva />
        <ComoFunciona />
        <Timeline />
        <Garantia />
        <Plan />
        <Servicios />
        <Equipo />
        <Faq />
        <CtaFinal />
      </main>
      <Footer />
      <StickyCta />
    </div>
  );
}
