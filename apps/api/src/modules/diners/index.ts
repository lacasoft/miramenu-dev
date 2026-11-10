// Public entry of the Diners context: other contexts import only from here.
// Design contracts: identify the diner, anonymous or registered · public name ·
// DinerRegistered, with the device that passes to the account.
export { DinersModule } from './diners.module';
export type { IdentifiedDiner } from './application/diner-identity';
export { DinerDirectory } from './application/diner-directory';
export {
  type DinerRegistered,
  DinerRegistrations,
  DINER_REGISTRATIONS_PAGE_MAX,
} from './application/diner-registrations';
export {
  CurrentDiner,
  DinerIdentityGuard,
  RegisteredDiner,
  RegisteredDinerGuard,
} from './http/diner-identity.guard';
