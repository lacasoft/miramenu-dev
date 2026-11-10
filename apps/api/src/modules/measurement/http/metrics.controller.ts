import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { type Metrics, metricsQuerySchema } from '@miramenu/contracts';
import { z } from 'zod';
import {
  type Actor,
  AdminSessionGuard,
  CurrentActor,
} from '../../business-access';
import { MetricsService } from '../application/metrics.service';

/** The dashboard's numbers, for one branch or grouped by business. */
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('branches/:branchId/metrics')
  ofBranch(
    @CurrentActor() actor: Actor,
    @Param('branchId', { schema: z.uuid() }) branchId: string,
    @Query({ schema: metricsQuerySchema })
    query: z.output<typeof metricsQuerySchema>,
  ): Promise<Metrics> {
    return this.metrics.ofBranch(actor, branchId, query);
  }

  @Get('businesses/:businessId/metrics')
  ofBusiness(
    @CurrentActor() actor: Actor,
    @Param('businessId', { schema: z.uuid() }) businessId: string,
    @Query({ schema: metricsQuerySchema })
    query: z.output<typeof metricsQuerySchema>,
  ): Promise<Metrics> {
    return this.metrics.ofBusiness(actor, businessId, query);
  }
}
