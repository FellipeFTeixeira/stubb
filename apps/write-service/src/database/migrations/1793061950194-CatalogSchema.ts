import { MigrationInterface, QueryRunner } from 'typeorm';

export class CatalogSchema1793061950194 implements MigrationInterface {
  name = 'CatalogSchema1793061950194';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "catalog_events" ("id" uuid NOT NULL, "organizer_id" uuid NOT NULL, "title" text NOT NULL, "description" text NOT NULL, "category" text NOT NULL, "age_rating" text NOT NULL, "image_url" text, "status" text NOT NULL, "version" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f16a3f4d0c5f5fd0c07e06ef009" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog_venues" ("id" uuid NOT NULL, "organizer_id" uuid NOT NULL, "name" text NOT NULL, "address" text NOT NULL, "city" text NOT NULL, "state" text NOT NULL, "time_zone" text NOT NULL, "version" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_3c3b553e96dd67d5bcf4635c57b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog_sessions" ("id" uuid NOT NULL, "event_id" uuid NOT NULL, "venue_id" uuid NOT NULL, "status" text NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "sales_starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "time_zone" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_catalog_sessions_event_venue_starts_at" UNIQUE ("event_id", "venue_id", "starts_at"), CONSTRAINT "PK_74392676c4aa7d7bba9211c3e44" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog_session_sectors" ("id" uuid NOT NULL, "session_id" uuid NOT NULL, "venue_sector_id" uuid NOT NULL, "name" text NOT NULL, "name_key" text NOT NULL, "kind" text NOT NULL, "capacity" integer, "rows" jsonb, "position" integer NOT NULL, CONSTRAINT "uq_catalog_session_sectors_name_key" UNIQUE ("session_id", "name_key"), CONSTRAINT "uq_catalog_session_sectors_venue_sector" UNIQUE ("session_id", "venue_sector_id"), CONSTRAINT "PK_dcd78a7a2ea426c5cf9dbae9a94" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog_batches" ("id" uuid NOT NULL, "session_sector_id" uuid NOT NULL, "name" text NOT NULL, "name_key" text NOT NULL, "price_cents" integer NOT NULL, "quantity" integer, "ends_at" TIMESTAMP WITH TIME ZONE, "position" integer NOT NULL, CONSTRAINT "uq_catalog_batches_position" UNIQUE ("session_sector_id", "position"), CONSTRAINT "uq_catalog_batches_name_key" UNIQUE ("session_sector_id", "name_key"), CONSTRAINT "PK_2ceced5dbaf12623b5061eff293" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "catalog_venue_sectors" ("id" uuid NOT NULL, "venue_id" uuid NOT NULL, "name" text NOT NULL, "name_key" text NOT NULL, "kind" text NOT NULL, "capacity" integer, "rows" jsonb, "position" integer NOT NULL, CONSTRAINT "uq_catalog_venue_sectors_name_key" UNIQUE ("venue_id", "name_key"), CONSTRAINT "PK_ef903711abe22b5d064715159ec" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_sessions" ADD CONSTRAINT "FK_87eda10171bd23b652923ee6733" FOREIGN KEY ("event_id") REFERENCES "catalog_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_sessions" ADD CONSTRAINT "FK_da148055ae821819339bcfe45b9" FOREIGN KEY ("venue_id") REFERENCES "catalog_venues"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_session_sectors" ADD CONSTRAINT "FK_306509d7ed97d672a19565b77d5" FOREIGN KEY ("session_id") REFERENCES "catalog_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_batches" ADD CONSTRAINT "FK_d7b1935b5d6eb521ed5a184171c" FOREIGN KEY ("session_sector_id") REFERENCES "catalog_session_sectors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_venue_sectors" ADD CONSTRAINT "FK_e9ec78c36fe34ac6cd7e35ba3b0" FOREIGN KEY ("venue_id") REFERENCES "catalog_venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "catalog_venue_sectors" DROP CONSTRAINT "FK_e9ec78c36fe34ac6cd7e35ba3b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_batches" DROP CONSTRAINT "FK_d7b1935b5d6eb521ed5a184171c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_session_sectors" DROP CONSTRAINT "FK_306509d7ed97d672a19565b77d5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_sessions" DROP CONSTRAINT "FK_da148055ae821819339bcfe45b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "catalog_sessions" DROP CONSTRAINT "FK_87eda10171bd23b652923ee6733"`,
    );
    await queryRunner.query(`DROP TABLE "catalog_venue_sectors"`);
    await queryRunner.query(`DROP TABLE "catalog_batches"`);
    await queryRunner.query(`DROP TABLE "catalog_session_sectors"`);
    await queryRunner.query(`DROP TABLE "catalog_sessions"`);
    await queryRunner.query(`DROP TABLE "catalog_venues"`);
    await queryRunner.query(`DROP TABLE "catalog_events"`);
  }
}
