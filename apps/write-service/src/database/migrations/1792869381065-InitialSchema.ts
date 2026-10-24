import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1792869381065 implements MigrationInterface {
  name = 'InitialSchema1792869381065';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "diagnostics_pings" ("id" uuid NOT NULL, "label" text NOT NULL, "count" integer NOT NULL, "version" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ff1466907618a1764266addb3fa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("key" uuid NOT NULL, "scope" text NOT NULL, "request_hash" character(64) NOT NULL, "response_status" integer, "response_body" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_15de2f76fa9f27ad8f330983607" PRIMARY KEY ("key", "scope"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_idempotency_keys_created_at" ON "idempotency_keys"  ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox" ("id" uuid NOT NULL, "bounded_context" text NOT NULL, "aggregate_type" text NOT NULL, "aggregate_id" text NOT NULL, "aggregate_version" bigint NOT NULL, "event_type" text NOT NULL, "schema_version" integer NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL, "payload" jsonb NOT NULL, CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox"`);
    await queryRunner.query(`DROP INDEX "public"."idx_idempotency_keys_created_at"`);
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP TABLE "diagnostics_pings"`);
  }
}
