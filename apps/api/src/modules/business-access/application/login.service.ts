import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { BUSINESS_ACCESS_ERROR_CODES } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { ApiException } from '../../../infrastructure/http/api-exception';
import { verifyAgainstDecoy, verifyPassword } from '../domain/password';
import { AdminSessionService } from './admin-session.service';
import { LoginThrottle } from './login-throttle';
import { selectRows } from './sql';

interface Credentials {
  email: string;
  password: string;
}

/**
 * Admin login (ADR-0021): limited attempts, and the same answer, in the same time, for an
 * unknown email, a wrong password or an invitation not yet accepted.
 */
@Injectable()
export class LoginService {
  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
    private readonly throttle: LoginThrottle,
    private readonly sessions: AdminSessionService,
  ) {}

  async login(
    credentials: Credentials,
    ip: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const keys = this.throttle.keysFor(credentials.email, ip);
    await this.throttle.assertAllowed(keys, Date.now());

    const [user] = await selectRows<{
      id: string;
      password_hash: string | null;
    }>(
      this.dataSource.manager,
      `SELECT id, password_hash FROM business_access.admin_user WHERE email = $1`,
      [credentials.email],
    );
    const valid = user?.password_hash
      ? await verifyPassword(credentials.password, user.password_hash)
      : await verifyAgainstDecoy(credentials.password);

    if (!user || !valid) {
      await this.throttle.recordFailure(keys, Date.now());
      throw new ApiException(
        401,
        BUSINESS_ACCESS_ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    await this.throttle.reset(keys);
    return this.sessions.open(user.id, new Date());
  }
}
