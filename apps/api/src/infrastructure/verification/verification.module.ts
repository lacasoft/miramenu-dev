import { Module } from '@nestjs/common';
import { TwilioVerificationSender } from './twilio-verification-sender';
import { VerificationSender } from './verification-sender';

@Module({
  providers: [
    { provide: VerificationSender, useClass: TwilioVerificationSender },
  ],
  exports: [VerificationSender],
})
export class VerificationModule {}
