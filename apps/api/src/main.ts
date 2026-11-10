import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { APP_CONFIG } from './infrastructure/config/config.module';
import type { AppConfig } from './infrastructure/config/environment';
import { configureApp } from './infrastructure/http/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  await app.listen(config.port);
}

bootstrap().catch((error: unknown) => {
  // Configuration errors name variables, never values, so the message is safe to log.
  new Logger('Bootstrap').fatal(
    error instanceof Error ? error.message : 'Boot failed',
  );
  process.exit(1);
});
