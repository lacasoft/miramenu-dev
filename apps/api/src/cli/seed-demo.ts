// npm run dev:seed-demo -w api   (development only)
// Needs: npm run demo:fetch-media (the Pexels files) and the superadmin seed.
// Creates, once, the demo business "demo": a branch, a profile and a menu whose photos and
// videos are uploaded the way the admin app does it (signed URL, PUT, confirm), and
// publishes it. With the worker running (npm run start:worker -w api), each medium shows
// up in the menu as soon as it is ready, in a version of its own (ADR-0015).
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import type { CreateMediaRequest } from '@miramenu/contracts';
import type { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import type { Actor } from '../modules/business-access';
import { BranchService } from '../modules/business-access/application/branch.service';
import { BusinessService } from '../modules/business-access/application/business.service';
import { BaseMenuService } from '../modules/catalog/application/base-menu.service';
import { MediaService } from '../modules/catalog/application/media.service';
import { PublicationService } from '../modules/catalog/application/publication.service';
import { createMigratorDataSource } from './migrator.data-source';

const SUBDOMAIN = 'demo';

const MENU = [
  {
    category: 'Tacos',
    dishes: [
      {
        name: 'Tacos al pastor',
        description: 'Del trompo, con piña, cebolla y cilantro',
        priceCents: 2500,
        photo: 'trompo.jpg',
        video: 'making-a-taco.mp4',
      },
      {
        name: 'Tacos de suadero',
        description: 'Con salsa verde, cebolla y limón',
        priceCents: 2800,
        photo: 'tacos-plate.jpg',
        video: 'plate-of-tacos.mp4',
      },
    ],
  },
  {
    category: 'Para compartir',
    dishes: [
      {
        name: 'Orden surtida',
        description: 'Cuatro tacos de la casa con guacamole',
        priceCents: 12000,
        photo: 'tacos-variety.jpg',
        video: 'getting-tacos.mp4',
      },
    ],
  },
];

interface Services {
  business: BusinessService;
  branch: BranchService;
  menu: BaseMenuService;
  media: MediaService;
  publication: PublicationService;
}

/** The single superadmin acts for the seed, as it would in the admin app (ADR-0020). */
async function superadminActor(owner: DataSource): Promise<Actor> {
  const [row] = (await owner.query(
    `SELECT id, email, name FROM business_access.admin_user WHERE is_superadmin`,
  )) as { id: string; email: string; name: string }[];
  if (!row) {
    throw new Error(
      'No superadmin yet: run npm run admin:seed-superadmin -w api first',
    );
  }
  return {
    userId: row.id,
    email: row.email,
    name: row.name,
    isSuperadmin: true,
    roles: [],
  };
}

async function upload(
  services: Services,
  actor: Actor,
  businessId: string,
  path: string,
): Promise<string> {
  const { size } = await stat(path);
  const request: CreateMediaRequest = path.endsWith('.mp4')
    ? { kind: 'video', contentType: 'video/mp4', sizeBytes: size }
    : { kind: 'image', contentType: 'image/jpeg', sizeBytes: size };
  const created = await services.media.create(actor, { businessId }, request);
  const response = await fetch(created.upload.url, {
    method: created.upload.method,
    headers: created.upload.headers,
    body: await readFile(path),
  });
  if (!response.ok) {
    throw new Error(`Uploading ${path} answered ${response.status}`);
  }
  await services.media.complete(actor, { businessId }, created.media.id);
  return created.media.id;
}

async function seed(services: Services, actor: Actor, mediaDir: string) {
  const { business } = await services.business.create(actor, {
    name: 'Taquería Demo',
    country: 'MX',
    subdomain: SUBDOMAIN,
    admin: { email: `admin@${SUBDOMAIN}.miramenu.localhost`, name: 'Demo' },
  });
  const branch = await services.branch.create(actor, business.id, {
    name: 'Centro',
    slug: 'centro',
  });
  const media = (file: string) =>
    upload(services, actor, business.id, resolve(mediaDir, file));

  await services.menu.putProfile(actor, business.id, {
    name: 'Taquería Demo',
    socialLinks: [],
    logoId: await media('tacos-plate.jpg'),
  });
  for (const section of MENU) {
    const category = await services.menu.createCategory(actor, business.id, {
      name: section.category,
    });
    for (const dish of section.dishes) {
      await services.menu.createDish(actor, business.id, {
        categoryId: category.id,
        name: dish.name,
        description: dish.description,
        priceCents: dish.priceCents,
        currency: 'MXN',
        imageId: await media(dish.photo),
        videoId: await media(dish.video),
      });
    }
  }
  const draft = await services.menu.draft(actor, business.id);
  await services.publication.publishBusiness(actor, business.id, randomUUID(), {
    draftVersion: draft.draftVersion,
    confirmedConflicts: [],
  });
  return { businessId: business.id, branchId: branch.id };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'media-dir': { type: 'string', default: '../../.cache/demo-media' },
    },
  });
  const mediaDir = resolve(values['media-dir']);
  await stat(resolve(mediaDir, MENU[0].dishes[0].photo)).catch(() => {
    throw new Error('No demo media yet: run npm run demo:fetch-media first');
  });

  const owner = createMigratorDataSource(process.env);
  await owner.initialize();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const [existing] = (await owner.query(
      `SELECT business_id FROM business_access.subdomain WHERE name = $1`,
      [SUBDOMAIN],
    )) as { business_id: string }[];
    if (existing) {
      console.log(
        `The demo business already exists (${existing.business_id}); nothing to do.`,
      );
      return;
    }
    const services: Services = {
      business: app.get(BusinessService),
      branch: app.get(BranchService),
      menu: app.get(BaseMenuService),
      media: app.get(MediaService),
      publication: app.get(PublicationService),
    };
    const created = await seed(
      services,
      await superadminActor(owner),
      mediaDir,
    );
    console.log(
      [
        `Demo business ${created.businessId} published, with branch ${created.branchId}.`,
        `Menu: GET /branches/${created.branchId}/menu`,
        'Its media appear as the worker finishes them: npm run start:worker -w api',
      ].join('\n'),
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
