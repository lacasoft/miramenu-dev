import { Module } from '@nestjs/common';
import { DinersModule } from '../diners';
import { LikeTransfer } from './application/like-transfer';
import { LikeTransferRunner } from './worker/like-transfer.runner';

/** The worker's part of Interactions: moving registered devices' likes to accounts. */
@Module({
  imports: [DinersModule],
  providers: [LikeTransfer, LikeTransferRunner],
})
export class InteractionsWorkerModule {}
