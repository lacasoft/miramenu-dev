/** Texts of the admin app, in Mexican Spanish. Screens read them with t(), never inline. */
export const adminMessages = {
  "app.title": "Administración de Miramenu",
  "app.loading": "Cargando",
  "signIn.title": "Entra a Miramenu",
  "signIn.email": "Correo",
  "signIn.password": "Contraseña",
  "signIn.submit": "Entrar",
  "signIn.submitting": "Entrando…",
  "signIn.invalidCredentials": "El correo o la contraseña no coinciden.",
  "signIn.wait": "Demasiados intentos. Vuelve a intentar en {seconds} s.",
  "signIn.invalid": "Revisa el correo y la contraseña.",
  "signIn.unavailable":
    "No pudimos iniciar sesión en este momento. Intenta de nuevo en unos minutos.",
  "signIn.ended": "Tu sesión terminó. Vuelve a entrar para seguir.",
  "signIn.invited": "Tu contraseña quedó lista. Entra con tu correo.",
  "invitation.title": "Define tu contraseña",
  "invitation.description":
    "Con ella entrarás a Miramenu. Usa de 12 a 128 caracteres: una frase que recuerdes funciona bien.",
  "invitation.password": "Contraseña nueva",
  "invitation.confirmation": "Repite la contraseña",
  "invitation.submit": "Guardar contraseña",
  "invitation.submitting": "Guardando…",
  "invitation.tooShort": "Usa al menos 12 caracteres.",
  "invitation.tooLong": "Usa como máximo 128 caracteres.",
  "invitation.mismatch": "Las contraseñas no coinciden.",
  "invitation.used":
    "Esta invitación ya se usó o la reemplazó una más nueva. Busca el correo más reciente o pide que te la reenvíen.",
  "invitation.expired":
    "Esta invitación venció: cada una dura 48 horas. Pide que te la reenvíen.",
  "invitation.missing":
    "Este enlace no trae una invitación válida. Ábrelo desde el correo que recibiste.",
  "invitation.invalid": "Revisa la contraseña e intenta de nuevo.",
  "invitation.unavailable":
    "No pudimos guardar tu contraseña en este momento. Intenta de nuevo en unos minutos.",
  "invitation.toSignIn": "Ir a entrar",
  "shell.navigation": "Secciones",
  "shell.home": "Inicio",
  "shell.signOut": "Cerrar sesión",
  "shell.greeting": "Hola, {name}",
  "shell.signOutFailed": "No pudimos cerrar tu sesión. Intenta de nuevo.",
  "role.superadmin": "Superadmin",
  "home.title": "Tus negocios",
  "home.loading": "Cargando tus negocios",
  "home.superadmin": "Como superadmin ves todos los negocios de Miramenu.",
  "home.administers": "Administras el restaurante y sus sucursales",
  "home.branches.one": "Administras 1 sucursal",
  "home.branches.other": "Administras {count} sucursales",
  "home.empty": "Todavía no hay negocios en Miramenu.",
  "home.failed": "No pudimos cargar tus negocios.",
  "home.loadMore": "Ver más",
  "noAccess.title": "Todavía no tienes acceso a ningún negocio",
  "noAccess.description":
    "Pide a quien administra el restaurante que te asigne un rol.",
  "notFound.title": "Esta página no existe",
  "notFound.description": "Revisa el enlace o vuelve al inicio.",
  "notFound.home": "Ir al inicio",
  "status.unavailable.title": "No pudimos cargar la administración",
  "status.unavailable.description":
    "Revisa tu conexión e intenta de nuevo en un momento.",
  "status.retry": "Intentar de nuevo",
} as const;

export type AdminMessageKey = keyof typeof adminMessages;
