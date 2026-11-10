import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { type BatchReceipt, feedEntryBatchSchema } from '@miramenu/contracts';
import { z } from 'zod';
import { EntryIntake } from '../application/entry-intake';

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * The same batch whether it came as JSON or, from sendBeacon, as text/plain holding
 * JSON (ADR-0041). Anything that is not a valid batch fails validation as usual.
 */
const batchBodySchema = z.preprocess(
  (body) => (typeof body === 'string' ? parseJson(body) : body),
  feedEntryBatchSchema,
);

/**
 * Feed entries from the PWA (design: "Recibir lotes de eventos"). There is no session
 * or Origin check: the entries carry no diner and change no one's state, and any
 * client can claim to be a phone; the worker checks each dish against the menu.
 */
@Controller('feed-entries')
export class FeedEntriesController {
  constructor(private readonly intake: EntryIntake) {}

  @Post('batch')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  receive(
    @Body({ schema: batchBodySchema })
    body: z.output<typeof feedEntryBatchSchema>,
  ): Promise<BatchReceipt> {
    return this.intake.receive(body, new Date());
  }
}
