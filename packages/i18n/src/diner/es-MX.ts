/** Texts of the diner's PWA, in Mexican Spanish. Screens read them with t(), never inline. */
export const dinerMessages = {
  "app.title": "Miramenu",
  "menu.loading": "Cargando el menú",
  "menu.dishUnavailable": "No disponible",
  "menu.empty.title": "Este menú todavía no tiene platillos",
  "menu.empty.description":
    "Vuelve a escanear el código QR en un rato o pregunta en el restaurante.",
  "menu.density": "Vista del menú",
  "menu.density.feed": "Un platillo por pantalla",
  "menu.density.grid2": "Dos columnas",
  "menu.density.grid3": "Tres columnas",
  "menu.categories": "Filtrar por categoría",
  "menu.allCategories": "Todo",
  "menu.dishes": "Platillos del menú",
  "menu.openDish": "Ver {name}",
  "menu.videoDuration": "Video de {duration}",
  "menu.previous": "Platillo anterior",
  "menu.next": "Platillo siguiente",
  "dish.seeDetail": "Ver detalle",
  "dish.seeDetailOf": "Ver detalle de {name}",
  "dish.close": "Cerrar",
  "video.play": "Reproducir",
  "video.pause": "Pausar",
  "video.soundOn": "Activar sonido",
  "video.soundOff": "Silenciar",
  "video.failed":
    "No pudimos cargar el video. Puedes ver los detalles del platillo.",
  "media.unavailable": "Imagen no disponible",
  "profile.links": "Redes del restaurante",
  "profile.close": "Cerrar",
  "social.instagram": "Instagram",
  "social.facebook": "Facebook",
  "social.tiktok": "TikTok",
  "social.x": "X",
  "social.youtube": "YouTube",
  "social.whatsapp": "WhatsApp",
  "social.website": "Sitio web",
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
