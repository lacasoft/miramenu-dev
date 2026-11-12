/** Texts of the diner's PWA, in Mexican Spanish. Screens read them with t(), never inline. */
export const dinerMessages = {
  "app.title": "Miramenu",
  "menu.loading": "Cargando el menú",
  "menu.dishUnavailable": "No disponible",
  "status.notFound.title": "No encontramos este restaurante",
  "status.notFound.description":
    "Revisa el enlace o vuelve a escanear el código QR de tu mesa.",
  "status.notPublished.title": "Este restaurante todavía no publica su menú",
  "status.notPublished.description":
    "Vuelve a escanear el código QR en un rato o pregunta en el restaurante.",
  "status.unavailable.title": "El menú no está disponible en este momento",
  "status.unavailable.description":
    "Revisa tu conexión e intenta de nuevo en un momento.",
  "status.retry": "Intentar de nuevo",
} as const;

export type DinerMessageKey = keyof typeof dinerMessages;
