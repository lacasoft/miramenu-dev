import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  // SIGTERM lets BullMQ finish or release the jobs in progress before the process exits.
  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  // Configuration errors name variables, never values, so the message is safe to log.
  new Logger('Bootstrap').fatal(
    error instanceof Error ? error.message : 'Boot failed',
  );
  process.exit(1);
});
