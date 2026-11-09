import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnvironment } from '../src/infrastructure/config/environment';
import { SmtpMailer } from '../src/infrastructure/mail/smtp-mailer';

const config = parseEnvironment(process.env);
// Mailpit's HTTP API: a test-only endpoint, so it is not part of the API configuration.
const mailpit = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? ''}/api/v1`;

interface MailpitMessage {
  ID: string;
  Subject: string;
  From: { Address: string; Name: string };
  To: { Address: string }[];
}

async function findBySubject(
  subject: string,
): Promise<MailpitMessage | undefined> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(
      `${mailpit}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
    );
    const { messages } = (await response.json()) as {
      messages: MailpitMessage[];
    };
    if (messages.length > 0) return messages[0];
    await sleep(250);
  }
  return undefined;
}

describe('SMTP mailer against Mailpit (integration)', () => {
  const mailer = new SmtpMailer(config);
  const subject = `Miramenu e2e ${randomBytes(6).toString('hex')}`;
  let deliveredId: string | undefined;

  afterAll(async () => {
    mailer.onApplicationShutdown();
    if (deliveredId) {
      await fetch(`${mailpit}/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: [deliveredId] }),
      });
    }
  });

  it('connects to the mail server', async () => {
    await expect(mailer.verify()).resolves.toBeUndefined();
  });

  it('delivers a message from the configured sender', async () => {
    await mailer.send({
      to: 'new-admin@example.test',
      subject,
      text: 'Set your password',
    });

    const delivered = await findBySubject(subject);
    deliveredId = delivered?.ID;
    expect(delivered).toMatchObject({
      Subject: subject,
      From: { Address: 'no-reply@miramenu.localhost', Name: 'Miramenu' },
      To: [{ Address: 'new-admin@example.test' }],
    });
  });
});
