import { MigrationInterface, QueryRunner } from 'typeorm';

// Identity é CRUD: nenhuma dessas tabelas escreve na outbox nem chega ao Kafka.
export class IdentitySchema1793145600000 implements MigrationInterface {
  name = 'IdentitySchema1793145600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "identity_users" (
      "id" uuid NOT NULL,
      "email" text NOT NULL,
      "password_hash" text NOT NULL,
      "full_name" text NOT NULL,
      "cpf" character(11) NOT NULL,
      "email_verified_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "pk_identity_users" PRIMARY KEY ("id"),
      CONSTRAINT "uq_identity_users_email" UNIQUE ("email"),
      CONSTRAINT "uq_identity_users_cpf" UNIQUE ("cpf"),
      CONSTRAINT "ck_identity_users_email_lower" CHECK ("email" = lower("email"))
    )`);
    await queryRunner.query(`CREATE TABLE "identity_user_roles" (
      "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
      "role" text NOT NULL,
      "granted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "pk_identity_user_roles" PRIMARY KEY ("user_id", "role"),
      CONSTRAINT "ck_identity_user_roles_role" CHECK ("role" IN ('customer', 'organizer', 'admin', 'gate_staff'))
    )`);
    await queryRunner.query(`CREATE TABLE "identity_email_verifications" (
      "id" uuid NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
      "token_hash" character(64) NOT NULL,
      "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "used_at" TIMESTAMP WITH TIME ZONE,
      "invalidated_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "pk_identity_email_verifications" PRIMARY KEY ("id"),
      CONSTRAINT "uq_identity_email_verifications_token_hash" UNIQUE ("token_hash")
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_identity_email_verifications_user_created" ON "identity_email_verifications" ("user_id", "created_at")`,
    );
    await queryRunner.query(`CREATE TABLE "identity_refresh_tokens" (
      "id" uuid NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
      "family_id" uuid NOT NULL,
      "token_hash" character(64) NOT NULL,
      "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "revoked_at" TIMESTAMP WITH TIME ZONE,
      "replaced_by" uuid,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "pk_identity_refresh_tokens" PRIMARY KEY ("id"),
      CONSTRAINT "uq_identity_refresh_tokens_token_hash" UNIQUE ("token_hash")
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_identity_refresh_tokens_family" ON "identity_refresh_tokens" ("family_id")`,
    );
    await queryRunner.query(`CREATE TABLE "identity_organizer_requests" (
      "id" uuid NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "identity_users"("id") ON DELETE CASCADE,
      "organization_name" text NOT NULL,
      "cnpj" character(14) NOT NULL,
      "reason" text NOT NULL,
      "status" text NOT NULL,
      "rejection_message" text,
      "decided_by" uuid REFERENCES "identity_users"("id"),
      "decided_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "pk_identity_organizer_requests" PRIMARY KEY ("id"),
      CONSTRAINT "ck_identity_organizer_requests_status" CHECK ("status" IN ('pending', 'approved', 'rejected'))
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_identity_organizer_requests_pending" ON "identity_organizer_requests" ("user_id") WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_identity_organizer_requests_status_created" ON "identity_organizer_requests" ("status", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_identity_organizer_requests_status_created"`);
    await queryRunner.query(`DROP INDEX "uq_identity_organizer_requests_pending"`);
    await queryRunner.query(`DROP TABLE "identity_organizer_requests"`);
    await queryRunner.query(`DROP INDEX "idx_identity_refresh_tokens_family"`);
    await queryRunner.query(`DROP TABLE "identity_refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "idx_identity_email_verifications_user_created"`);
    await queryRunner.query(`DROP TABLE "identity_email_verifications"`);
    await queryRunner.query(`DROP TABLE "identity_user_roles"`);
    await queryRunner.query(`DROP TABLE "identity_users"`);
  }
}
