import { Module } from '@nestjs/common';
import { Ffmpeg } from './ffmpeg';

@Module({
  providers: [Ffmpeg],
  exports: [Ffmpeg],
})
export class FfmpegModule {}
