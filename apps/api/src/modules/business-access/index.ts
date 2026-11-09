// Public entry of the Business & access context: other contexts import only from here.
// Contract "Verificar el permiso": guard the admin routes with AdminSessionGuard, take the
// actor with CurrentActor and check every object with AccessControl (ADR-0019).
export { BusinessAccessModule } from './business-access.module';
export { AccessControl } from './application/access-control';
export { SuperadminSeeder } from './application/superadmin-seeder';
export type { AccessLevel } from './domain/access-policy';
export type { Actor, ActorRole } from './domain/actor';
export { AdminSessionGuard } from './http/admin-session.guard';
export { CurrentActor } from './http/current-actor.decorator';
