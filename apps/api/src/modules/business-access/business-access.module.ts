import { Module } from '@nestjs/common';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { AccessControl } from './application/access-control';
import { AdminSessionService } from './application/admin-session.service';
import { BranchDirectory } from './application/branch-directory';
import { BranchService } from './application/branch.service';
import { BusinessService } from './application/business.service';
import { InvitationService } from './application/invitation.service';
import { LoginThrottle } from './application/login-throttle';
import { LoginService } from './application/login.service';
import { ResolutionService } from './application/resolution.service';
import { SuperadminSeeder } from './application/superadmin-seeder';
import { TeamService } from './application/team.service';
import { AdminSessionGuard } from './http/admin-session.guard';
import { BranchController } from './http/branch.controller';
import { BusinessController } from './http/business.controller';
import { InvitationController } from './http/invitation.controller';
import { PublicResolutionController } from './http/public-resolution.controller';
import { SessionController } from './http/session.controller';
import { TeamController } from './http/team.controller';

/** Business & access: businesses, branches, QR and subdomains, admins and their permissions. */
@Module({
  imports: [RedisModule, MailModule],
  controllers: [
    SessionController,
    InvitationController,
    BusinessController,
    BranchController,
    TeamController,
    PublicResolutionController,
  ],
  providers: [
    AccessControl,
    AdminSessionService,
    AdminSessionGuard,
    BranchDirectory,
    LoginThrottle,
    LoginService,
    InvitationService,
    ResolutionService,
    BusinessService,
    BranchService,
    TeamService,
    SuperadminSeeder,
  ],
  exports: [
    AccessControl,
    AdminSessionGuard,
    BranchDirectory,
    AdminSessionService,
    SuperadminSeeder,
  ],
})
export class BusinessAccessModule {}
