import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { VerificationModule } from '../verification/verification.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RedisModule, StorageModule, MailModule, VerificationModule],
  controllers: [HealthController],
})
export class HealthModule {}
