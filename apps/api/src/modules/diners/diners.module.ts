import { Module } from '@nestjs/common';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { VerificationModule } from '../../infrastructure/verification/verification.module';
import { DinerAccounts } from './application/diner-accounts';
import { DinerDirectory } from './application/diner-directory';
import { DinerIdentity } from './application/diner-identity';
import { DinerRegistrations } from './application/diner-registrations';
import { DinerSessions } from './application/diner-sessions';
import { RegistrationLimits } from './application/registration-limits';
import { RegistrationService } from './application/registration.service';
import { SendTracking } from './application/send-tracking';
import { VerificationCodeStore } from './application/verification-code-store';
import { DeliveryReportController } from './http/delivery-report.controller';
import { DinerSessionController } from './http/diner-session.controller';
import { RegistrationController } from './http/registration.controller';

/**
 * Diners: registration with a code by WhatsApp or SMS, the global account, its devices,
 * consents and sessions (ADR-0007, ADR-0039). It uses no other context.
 */
@Module({
  imports: [RedisModule, VerificationModule],
  controllers: [
    RegistrationController,
    DinerSessionController,
    DeliveryReportController,
  ],
  providers: [
    VerificationCodeStore,
    RegistrationLimits,
    SendTracking,
    RegistrationService,
    DinerAccounts,
    DinerSessions,
    DinerRegistrations,
    DinerDirectory,
    DinerIdentity,
  ],
  // What the guards of other contexts need, and the contracts the design lists.
  exports: [DinerIdentity, DinerDirectory, DinerRegistrations],
})
export class DinersModule {}
