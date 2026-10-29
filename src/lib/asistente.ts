/** Evento para abrir a Kiko (el asistente) desde cualquier parte del sitio. */
export const EVENTO_ABRIR_ASISTENTE = "abrir-asistente";
export const abrirAsistente = () => window.dispatchEvent(new Event(EVENTO_ABRIR_ASISTENTE));
