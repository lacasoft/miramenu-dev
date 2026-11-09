import type { AdminRole } from '@miramenu/contracts';

export interface ActorRole {
  businessId: string;
  branchId: string | null;
  role: AdminRole;
}

/** Who is making an admin request, resolved from the session on every request. */
export interface Actor {
  userId: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
  roles: readonly ActorRole[];
}
