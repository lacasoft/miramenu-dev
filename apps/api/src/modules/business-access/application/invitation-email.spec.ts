import { invitationEmail } from './invitation-email';

describe('invitationEmail', () => {
  const email = invitationEmail({
    to: 'ana@example.test',
    name: 'Ana',
    link: 'https://admin.mirame.nu/invitation#token=example_token',
    expiresAt: new Date('2026-11-12T23:20:00Z'),
  });

  it('greets the person and carries the link with the token after #', () => {
    expect(email.to).toBe('ana@example.test');
    expect(email.text).toContain('Hola, Ana:');
    expect(email.text).toContain(
      'https://admin.mirame.nu/invitation#token=example_token',
    );
  });

  it('states the expiry in Mexico City time, without a doubled period', () => {
    expect(email.text).toContain('12 de noviembre de 2026');
    expect(email.text).not.toContain('..');
  });

  it('keeps personal data out of the subject', () => {
    expect(email.subject).toBe('Tu acceso a Miramenu');
  });
});
