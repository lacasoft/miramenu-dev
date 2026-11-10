import { Injectable } from '@nestjs/common';
import { deviceIdSchema, secretTokenSchema } from '@miramenu/contracts';
import { DinerSessions } from './diner-sessions';

/** Who is behind a request of the PWA: always a device, and a diner if registered. */
export interface IdentifiedDiner {
  /** The anonymous device id, or null if the request carries none. */
  deviceId: string | null;
  diner: { id: string; name: string } | null;
}

/**
 * "Identificar al comensal, anónimo o registrado" (design): the contract other contexts
 * use, through DinerIdentityGuard and RegisteredDinerGuard. An unknown, revoked or
 * expired session is simply anonymous.
 */
@Injectable()
export class DinerIdentity {
  constructor(private readonly sessions: DinerSessions) {}

  async identify(
    sessionToken: string | undefined,
    deviceHeader: string | undefined,
    now: Date,
  ): Promise<IdentifiedDiner> {
    const session =
      sessionToken !== undefined &&
      secretTokenSchema.safeParse(sessionToken).success
        ? await this.sessions.authenticate(sessionToken, now)
        : null;
    const device =
      deviceHeader !== undefined &&
      deviceIdSchema.safeParse(deviceHeader).success
        ? deviceHeader.toLowerCase()
        : null;
    return {
      deviceId: device ?? session?.deviceId ?? null,
      diner: session ? { id: session.dinerId, name: session.name } : null,
    };
  }
}
