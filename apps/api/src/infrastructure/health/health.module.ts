import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [RedisModule, StorageModule, MailModule],
  controllers: [HealthController],
})
export class HealthModule {}
