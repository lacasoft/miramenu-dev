import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// ADR-0034: scrypt from node:crypto. N=2^17, r=8, p=1 needs 128 MiB per hash.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 256 * 1024 * 1024;

interface ScryptParameters {
  cost: number;
  blockSize: number;
  parallelization: number;
}

function derive(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
  length: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      length,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: MAX_MEMORY,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Stored as scrypt$N$r$p$salt$hash, so the parameters can grow without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const parameters = {
    cost: COST,
    blockSize: BLOCK_SIZE,
    parallelization: PARALLELIZATION,
  };
  const key = await derive(password, salt, parameters, KEY_LENGTH);
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, salt, expected] =
    stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const expectedKey = Buffer.from(expected, 'base64');
  const key = await derive(
    password,
    Buffer.from(salt, 'base64'),
    {
      cost: Number(cost),
      blockSize: Number(blockSize),
      parallelization: Number(parallelization),
    },
    expectedKey.length,
  );
  return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
}

let decoyHash: Promise<string> | undefined;

/**
 * Hashes against a decoy when the email does not exist, so an unknown email takes as long
 * as a wrong password and the timing does not reveal which addresses have an account.
 */
export async function verifyAgainstDecoy(password: string): Promise<false> {
  decoyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  await verifyPassword(password, await decoyHash);
  return false;
}
