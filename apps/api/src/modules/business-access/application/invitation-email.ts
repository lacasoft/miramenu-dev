import type { MailMessage } from '../../../infrastructure/mail/mailer';

/** Languages the invitation is written in; es-MX is the only market today (RNF-06). */
export type Locale = 'es-MX';
export const DEFAULT_LOCALE: Locale = 'es-MX';

interface InvitationParams {
  to: string;
  name: string;
  link: string;
  expiresAt: Date;
}

const catalog: Record<
  Locale,
  {
    subject: string;
    timeZone: string;
    body: (params: InvitationParams, expires: string) => string;
  }
> = {
  'es-MX': {
    subject: 'Tu acceso a Miramenu',
    timeZone: 'America/Mexico_City',
    body: (params, expires) =>
      [
        `Hola, ${params.name}:`,
        '',
        'Te dieron acceso al administrador de Miramenu. Para entrar, define tu contraseña en este enlace:',
        '',
        params.link,
        '',
        // The formatted time may end in "p.m.", so the sentence continues after a semicolon.
        `El enlace sirve una sola vez y vence el ${expires}; si vence, pide que te lo reenvíen.`,
        'Si no esperabas este correo, puedes ignorarlo.',
      ].join('\n'),
  },
};

/** The invitation email (ADR-0023). The link carries the token after #, never in the path (ADR-0033). */
export function invitationEmail(
  params: InvitationParams,
  locale: Locale = DEFAULT_LOCALE,
): MailMessage {
  const messages = catalog[locale];
  const expires = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: messages.timeZone,
  }).format(params.expiresAt);
  return {
    to: params.to,
    subject: messages.subject,
    text: messages.body(params, expires),
  };
}
