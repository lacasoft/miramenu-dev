import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Media of Catalog (ADR-0006, ADR-0015, ADR-0038): each upload, its state and its optimized
 * variants; the media of dishes and profiles; and, on each published menu, the media it
 * still waits for, so a medium that becomes ready yields one new version, never two.
 * Every reference includes business_id, so nothing points to another business's media.
 */
export class AddCatalogMedia1794500000000 implements MigrationInterface {
  name = 'AddCatalogMedia1794500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `CREATE TABLE catalog.media_asset (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id uuid NOT NULL REFERENCES catalog.business_state (business_id),
        branch_id uuid,
        kind text NOT NULL CHECK (kind IN ('image', 'video')),
        status text NOT NULL CHECK (status IN ('pending_upload', 'processing', 'ready', 'failed')),
        content_type text NOT NULL CHECK (length(content_type) BETWEEN 1 AND 100),
        size_bytes integer NOT NULL CHECK (size_bytes > 0),
        failure_reason text CHECK (failure_reason IN
          ('upload_mismatch', 'unsupported_format', 'too_large', 'too_long', 'processing_error')),
        variants jsonb,
        processing_since timestamptz(3),
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        updated_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_media_asset_id_business UNIQUE (id, business_id),
        CONSTRAINT fk_media_asset_branch FOREIGN KEY (branch_id, business_id)
          REFERENCES catalog.branch_state (branch_id, business_id),
        CONSTRAINT ck_media_asset_ready CHECK ((status = 'ready') = (variants IS NOT NULL)),
        CONSTRAINT ck_media_asset_failed CHECK ((status = 'failed') = (failure_reason IS NOT NULL))
      )`,
      `CREATE INDEX idx_media_asset_listing ON catalog.media_asset (business_id, created_at DESC, id DESC)`,

      `ALTER TABLE catalog.dish
        ADD COLUMN image_media_id uuid,
        ADD COLUMN video_media_id uuid,
        ADD CONSTRAINT fk_dish_image FOREIGN KEY (image_media_id, business_id)
          REFERENCES catalog.media_asset (id, business_id),
        ADD CONSTRAINT fk_dish_video FOREIGN KEY (video_media_id, business_id)
          REFERENCES catalog.media_asset (id, business_id)`,
      `ALTER TABLE catalog.profile
        ADD COLUMN logo_media_id uuid,
        ADD CONSTRAINT fk_profile_logo FOREIGN KEY (logo_media_id, business_id)
          REFERENCES catalog.media_asset (id, business_id)`,

      `ALTER TABLE catalog.published_menu
        ADD COLUMN pending_media uuid[] NOT NULL DEFAULT '{}',
        ADD COLUMN media_id uuid,
        ADD CONSTRAINT fk_published_menu_media FOREIGN KEY (media_id, business_id)
          REFERENCES catalog.media_asset (id, business_id),
        ADD CONSTRAINT ck_published_menu_media CHECK ((origin = 'media_ready') = (media_id IS NOT NULL)),
        -- ADR-0015: never two versions for the same medium, even if the worker retries.
        ADD CONSTRAINT uq_published_menu_media UNIQUE (branch_id, media_id)`,

      // Versions published before media existed get the new fields, empty, so every
      // published version has the same shape. Only development data exists so far.
      `UPDATE catalog.published_menu SET content = jsonb_set(
        jsonb_set(content, '{profile,logo}', 'null'::jsonb),
        '{categories}',
        COALESCE((
          SELECT jsonb_agg(jsonb_set(category, '{dishes}', COALESCE((
            SELECT jsonb_agg(dish || '{"image": null, "video": null}'::jsonb ORDER BY d)
            FROM jsonb_array_elements(category->'dishes') WITH ORDINALITY AS dishes(dish, d)
          ), '[]'::jsonb)) ORDER BY c)
          FROM jsonb_array_elements(content->'categories') WITH ORDINALITY AS categories(category, c)
        ), '[]'::jsonb))`,
      `UPDATE catalog.published_base SET content = jsonb_set(
        jsonb_set(content, '{profile,logoId}', 'null'::jsonb),
        '{dishes}', ${withNullMediaIds('content')})`,
      `UPDATE catalog.published_branch SET content = jsonb_set(
        CASE WHEN content->'profile' = 'null'::jsonb THEN content
             ELSE jsonb_set(content, '{profile,logoId}', 'null'::jsonb) END,
        '{dishes}', ${withNullMediaIds('content')})`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `UPDATE catalog.published_branch SET content = jsonb_set(
        content #- '{profile,logoId}', '{dishes}', ${withoutKeys('content', ['imageId', 'videoId'])})`,
      `UPDATE catalog.published_base SET content = jsonb_set(
        content #- '{profile,logoId}', '{dishes}', ${withoutKeys('content', ['imageId', 'videoId'])})`,
      `UPDATE catalog.published_menu SET content = jsonb_set(
        content #- '{profile,logo}',
        '{categories}',
        COALESCE((
          SELECT jsonb_agg(jsonb_set(category, '{dishes}', COALESCE((
            SELECT jsonb_agg(dish - 'image' - 'video' ORDER BY d)
            FROM jsonb_array_elements(category->'dishes') WITH ORDINALITY AS dishes(dish, d)
          ), '[]'::jsonb)) ORDER BY c)
          FROM jsonb_array_elements(content->'categories') WITH ORDINALITY AS categories(category, c)
        ), '[]'::jsonb))`,
      // A media_ready version cannot exist without media; drop them before the columns.
      `DELETE FROM catalog.published_menu WHERE origin = 'media_ready'`,
      `UPDATE catalog.branch_state bs SET menu_version = (
        SELECT max(pm.version) FROM catalog.published_menu pm WHERE pm.branch_id = bs.branch_id)`,
      `ALTER TABLE catalog.published_menu
        DROP CONSTRAINT uq_published_menu_media,
        DROP CONSTRAINT ck_published_menu_media,
        DROP CONSTRAINT fk_published_menu_media,
        DROP COLUMN media_id,
        DROP COLUMN pending_media`,
      `ALTER TABLE catalog.profile DROP CONSTRAINT fk_profile_logo, DROP COLUMN logo_media_id`,
      `ALTER TABLE catalog.dish
        DROP CONSTRAINT fk_dish_video, DROP CONSTRAINT fk_dish_image,
        DROP COLUMN video_media_id, DROP COLUMN image_media_id`,
      `DROP TABLE catalog.media_asset`,
    ];
    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }
}

/** The snapshot's dishes, each with null media ids, in their order. */
function withNullMediaIds(column: string): string {
  return `COALESCE((
    SELECT jsonb_agg(dish || '{"imageId": null, "videoId": null}'::jsonb ORDER BY d)
    FROM jsonb_array_elements(${column}->'dishes') WITH ORDINALITY AS dishes(dish, d)
  ), '[]'::jsonb)`;
}

function withoutKeys(column: string, keys: readonly string[]): string {
  const removal = keys.map((key) => ` - '${key}'`).join('');
  return `COALESCE((
    SELECT jsonb_agg(dish${removal} ORDER BY d)
    FROM jsonb_array_elements(${column}->'dishes') WITH ORDINALITY AS dishes(dish, d)
  ), '[]'::jsonb)`;
}
