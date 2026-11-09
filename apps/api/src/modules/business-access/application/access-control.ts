import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { GENERIC_ERROR_CODES } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { ApiException } from '../../../infrastructure/http/api-exception';
import {
  type AccessDecision,
  type AccessLevel,
  type BranchRef,
  decideBranchAccess,
  decideBusinessAccess,
} from '../domain/access-policy';
import type { Actor } from '../domain/actor';
import { selectRows } from './sql';

const notFound = () =>
  new ApiException(404, GENERIC_ERROR_CODES.NOT_FOUND, 'Not found');
const forbidden = () =>
  new ApiException(403, GENERIC_ERROR_CODES.FORBIDDEN, 'Not allowed');

/**
 * The single check every module runs before acting on an admin object (ADR-0019,
 * contract "Verificar el permiso"): 404 outside the actor's scope, 403 inside it when the
 * role is not enough (ADR-0032).
 */
@Injectable()
export class AccessControl {
  constructor(
    @InjectDataSource('business_access')
    private readonly dataSource: DataSource,
  ) {}

  assertSuperadmin(actor: Actor): void {
    if (!actor.isSuperadmin) throw forbidden();
  }

  assertBusiness(actor: Actor, businessId: string, level: AccessLevel): void {
    this.enforce(decideBusinessAccess(actor, businessId, level));
  }

  /** Loads the branch's business first, so the check runs on the real owner, never on input. */
  async assertBranch(
    actor: Actor,
    branchId: string,
    level: AccessLevel,
  ): Promise<BranchRef> {
    const [branch] = await selectRows<{ id: string; business_id: string }>(
      this.dataSource.manager,
      `SELECT id, business_id FROM business_access.branch WHERE id = $1`,
      [branchId],
    );
    if (!branch) throw notFound();
    const ref = { id: branch.id, businessId: branch.business_id };
    this.enforce(decideBranchAccess(actor, ref, level));
    return ref;
  }

  private enforce(decision: AccessDecision): void {
    if (decision === 'not_found') throw notFound();
    if (decision === 'forbidden') throw forbidden();
  }
}

export { notFound };
