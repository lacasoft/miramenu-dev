// npm run admin:seed-superadmin -w api -- --email <email> --name <name> [--resend]
// Creates the only superadmin (RNF-08) and emails it the invitation to set its password.
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { emailSchema, personNameSchema } from '@miramenu/contracts';
import { AppModule } from '../app.module';
import { SuperadminSeeder } from '../modules/business-access';
import { createMigratorDataSource } from './migrator.data-source';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      resend: { type: 'boolean', default: false },
    },
  });
  const email = emailSchema.parse(values.email);
  const name = personNameSchema.parse(values.name);

  // The API role cannot write is_superadmin; only the schema owner can.
  const owner = createMigratorDataSource(process.env);
  await owner.initialize();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app
      .get(SuperadminSeeder)
      .seed(owner.manager, { email, name, resend: values.resend });
    console.log(
      result.sent
        ? `Superadmin ready; invitation sent to ${email}.`
        : `Superadmin ready, but the invitation email failed; run again with --resend.`,
    );
  } finally {
    await app.close();
    await owner.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exit(1);
});
