import { z } from "zod";
import { emailSchema } from "./business-access.ts";

/**
 * Header with the anonymous id of the diner's device. The PWA creates it once and keeps it
 * on the device (diner-core's deviceIdOf); registering links it to the diner's account.
 */
export const DEVICE_ID_HEADER = "x-device-id";
export const deviceIdSchema = z.uuid();

/**
 * Mobile numbers in E.164. Only Mexico today (RNF-06): each country adds its prefix and
 * its number of digits here. It also keeps codes from going to costly foreign numbers.
 */
export const PHONE_NUMBER_PLANS = [{ prefix: "+52", digits: 10 }] as const;
export const phoneSchema = z
  .string()
  .refine(
    (phone) =>
      PHONE_NUMBER_PLANS.some(({ prefix, digits }) =>
        new RegExp(`^\\${prefix}\\d{${digits}}$`).test(phone),
      ),
    "unsupported phone number",
  );

export const VERIFICATION_CODE_LENGTH = 6;
export const verificationCodeSchema = z
  .string()
  .regex(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`));

/** The name other diners and the business see (design: "solo ve el nombre"). */
export const dinerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((name) => !/\p{Cc}/u.test(name), "control characters");

export const requestCodeSchema = z.strictObject({ phone: phoneSchema });

/**
 * sent: the provider accepted the message. unconfirmed: it did not answer in time, so the
 * message may still arrive; it is not sent again on its own.
 */
export const codeDeliverySchema = z.enum(["sent", "unconfirmed"]);

export const codeRequestedSchema = z.strictObject({
  delivery: codeDeliverySchema,
  expiresAt: z.iso.datetime(),
  /** Seconds until another code can be asked for, unless this one is reported failed. */
  resendAfterSeconds: z.number().int().positive(),
});

export const verifyCodeSchema = z.strictObject({
  phone: phoneSchema,
  code: verificationCodeSchema,
  name: dinerNameSchema,
  email: emailSchema.optional(),
  /** Offers, once for every business (design: "las acepta una sola vez"). */
  offersConsent: z.boolean().default(false),
  /** The privacy notice the diner was shown; it must be the current one. */
  privacyNoticeVersion: z.string().trim().min(1).max(40),
});

export const dinerSessionSchema = z.strictObject({
  diner: z.strictObject({ id: z.uuid(), name: z.string() }),
});

export type CodeDelivery = z.infer<typeof codeDeliverySchema>;
export type CodeRequested = z.infer<typeof codeRequestedSchema>;
export type VerifyCodeRequest = z.input<typeof verifyCodeSchema>;
export type DinerSession = z.infer<typeof dinerSessionSchema>;

/** Error codes of the Diners context, besides the generic ones. */
export const DINERS_ERROR_CODES = {
  /** The code is wrong; the same code may still be retried within its attempts. */
  CODE_INVALID: "CODE_INVALID",
  /** No code to check: expired, used, out of attempts or never asked for. Ask for another. */
  CODE_EXPIRED: "CODE_EXPIRED",
  /** The provider refuses this number, e.g. it is not a mobile or has no WhatsApp. */
  PHONE_NOT_REACHABLE: "PHONE_NOT_REACHABLE",
  /** The provider of codes failed: the message did not leave. */
  CODE_PROVIDER_UNAVAILABLE: "CODE_PROVIDER_UNAVAILABLE",
  /** Redis is down, so codes and their limits cannot be checked: registration is closed. */
  REGISTRATION_UNAVAILABLE: "REGISTRATION_UNAVAILABLE",
  /** The diner was shown an older privacy notice; show the current one. */
  PRIVACY_NOTICE_OUTDATED: "PRIVACY_NOTICE_OUTDATED",
} as const;
