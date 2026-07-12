CREATE TYPE "LlmProviderStatus" AS ENUM ('ENABLED', 'DISABLED');
CREATE TYPE "LlmModelStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "LlmTask" AS ENUM ('AGENT_REPLY', 'REFLECTION_TAGGING', 'WEEKLY_SUMMARY', 'KNOWLEDGE_EMBEDDING', 'RAG_QUERY_REWRITE', 'RAG_RERANK');
CREATE TYPE "LlmBudgetReservationStatus" AS ENUM ('RESERVED', 'SETTLED', 'RELEASED', 'EXPIRED');

CREATE TABLE "llm_providers" (
  "id" UUID NOT NULL,
  "adapter_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "status" "LlmProviderStatus" NOT NULL DEFAULT 'DISABLED',
  "secret_alias" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_providers_adapter_id_key" ON "llm_providers"("adapter_id");

CREATE TABLE "llm_models" (
  "id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "provider_model_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "status" "LlmModelStatus" NOT NULL DEFAULT 'INACTIVE',
  "input_token_limit" INTEGER NOT NULL,
  "output_token_limit" INTEGER NOT NULL,
  "supports_tools" BOOLEAN NOT NULL DEFAULT false,
  "supports_structured" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "llm_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_models_provider_id_provider_model_id_key" ON "llm_models"("provider_id", "provider_model_id");
CREATE INDEX "llm_models_status_idx" ON "llm_models"("status");
ALTER TABLE "llm_models" ADD CONSTRAINT "llm_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "llm_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "llm_model_price_versions" (
  "id" UUID NOT NULL,
  "model_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "input_micro_usd_per_m" BIGINT NOT NULL,
  "output_micro_usd_per_m" BIGINT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL,
  "retired_at" TIMESTAMP(3),
  "source_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "llm_model_price_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_model_price_versions_model_id_version_key" ON "llm_model_price_versions"("model_id", "version");
CREATE INDEX "llm_model_price_versions_model_id_effective_at_idx" ON "llm_model_price_versions"("model_id", "effective_at");
ALTER TABLE "llm_model_price_versions" ADD CONSTRAINT "llm_model_price_versions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "llm_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "llm_prompt_versions" (
  "id" UUID NOT NULL,
  "task" "LlmTask" NOT NULL,
  "semantic_version" TEXT NOT NULL,
  "source_path" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "output_schema_version" TEXT NOT NULL,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "llm_prompt_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_prompt_versions_task_semantic_version_key" ON "llm_prompt_versions"("task", "semantic_version");
CREATE INDEX "llm_prompt_versions_task_created_at_idx" ON "llm_prompt_versions"("task", "created_at");

CREATE TABLE "llm_task_configs" (
  "id" UUID NOT NULL,
  "task" "LlmTask" NOT NULL,
  "primary_model_id" UUID,
  "fallback_model_id" UUID,
  "prompt_version_id" UUID,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "llm_task_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_task_configs_task_key" ON "llm_task_configs"("task");
ALTER TABLE "llm_task_configs" ADD CONSTRAINT "llm_task_configs_primary_model_id_fkey" FOREIGN KEY ("primary_model_id") REFERENCES "llm_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "llm_task_configs" ADD CONSTRAINT "llm_task_configs_fallback_model_id_fkey" FOREIGN KEY ("fallback_model_id") REFERENCES "llm_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "llm_task_configs" ADD CONSTRAINT "llm_task_configs_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "llm_prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "llm_usage_logs" (
  "id" UUID NOT NULL,
  "operation_id" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "task" "LlmTask" NOT NULL,
  "student_id" UUID,
  "source_message_id" UUID,
  "requested_model_id" UUID,
  "actual_model_id" UUID,
  "price_version_id" UUID,
  "prompt_version_id" UUID,
  "provider_request_id" TEXT,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_micro_usd" BIGINT NOT NULL DEFAULT 0,
  "latency_ms" INTEGER,
  "status" TEXT NOT NULL,
  "fallback_used" BOOLEAN NOT NULL DEFAULT false,
  "error_code" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "llm_usage_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_usage_logs_operation_id_attempt_key" ON "llm_usage_logs"("operation_id", "attempt");
CREATE INDEX "llm_usage_logs_created_at_task_idx" ON "llm_usage_logs"("created_at", "task");
CREATE INDEX "llm_usage_logs_student_id_created_at_idx" ON "llm_usage_logs"("student_id", "created_at");
ALTER TABLE "llm_usage_logs" ADD CONSTRAINT "llm_usage_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "llm_usage_logs" ADD CONSTRAINT "llm_usage_logs_price_version_id_fkey" FOREIGN KEY ("price_version_id") REFERENCES "llm_model_price_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "llm_budgets" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  "daily_limit_micro_usd" BIGINT NOT NULL,
  "monthly_limit_micro_usd" BIGINT NOT NULL,
  "warning_percent" INTEGER NOT NULL DEFAULT 80,
  "critical_percent" INTEGER NOT NULL DEFAULT 100,
  "hard_limit_enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "llm_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "llm_budget_reservations" (
  "id" UUID NOT NULL,
  "budget_id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "day_bucket" TEXT NOT NULL,
  "month_bucket" TEXT NOT NULL,
  "estimated_micro_usd" BIGINT NOT NULL,
  "actual_micro_usd" BIGINT,
  "status" "LlmBudgetReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "settled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "llm_budget_reservations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_budget_reservations_operation_id_key" ON "llm_budget_reservations"("operation_id");
CREATE INDEX "llm_budget_reservations_status_expires_at_idx" ON "llm_budget_reservations"("status", "expires_at");
CREATE INDEX "llm_budget_reservations_day_bucket_status_idx" ON "llm_budget_reservations"("day_bucket", "status");
CREATE INDEX "llm_budget_reservations_month_bucket_status_idx" ON "llm_budget_reservations"("month_bucket", "status");
ALTER TABLE "llm_budget_reservations" ADD CONSTRAINT "llm_budget_reservations_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "llm_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_context_reads" (
  "id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "source_message_id" UUID,
  "answer_reference" TEXT,
  "sections" JSONB NOT NULL,
  "range" TEXT NOT NULL,
  "as_of" TIMESTAMP(3) NOT NULL,
  "projection_schema_version" TEXT NOT NULL,
  "record_hashes" JSONB NOT NULL,
  "row_count" INTEGER NOT NULL,
  "page_count" INTEGER NOT NULL DEFAULT 1,
  "latency_ms" INTEGER NOT NULL,
  "policy_result" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_context_reads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_context_reads_student_id_created_at_idx" ON "agent_context_reads"("student_id", "created_at");
CREATE INDEX "agent_context_reads_policy_result_created_at_idx" ON "agent_context_reads"("policy_result", "created_at");
ALTER TABLE "agent_context_reads" ADD CONSTRAINT "agent_context_reads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "llm_providers" ("id", "adapter_id", "display_name", "status", "secret_alias", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000701', 'gemini', 'Gemini Paid Services', 'DISABLED', 'GEMINI_API_KEY', CURRENT_TIMESTAMP)
ON CONFLICT ("adapter_id") DO NOTHING;
INSERT INTO "llm_models" ("id", "provider_id", "provider_model_id", "display_name", "status", "input_token_limit", "output_token_limit", "supports_tools", "supports_structured", "updated_at")
VALUES
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000701', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'ACTIVE', 1048576, 65536, true, true, CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000701', 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 'ACTIVE', 1048576, 65536, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("provider_id", "provider_model_id") DO NOTHING;
INSERT INTO "llm_model_price_versions" ("id", "model_id", "version", "input_micro_usd_per_m", "output_micro_usd_per_m", "effective_at", "source_url")
VALUES
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000702', 1, 300000, 2500000, '2026-06-18T00:00:00.000Z', 'https://ai.google.dev/gemini-api/docs/pricing'),
  ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000703', 1, 100000, 400000, '2026-06-18T00:00:00.000Z', 'https://ai.google.dev/gemini-api/docs/pricing')
ON CONFLICT ("model_id", "version") DO NOTHING;
INSERT INTO "llm_task_configs" ("id", "task", "primary_model_id", "fallback_model_id", "enabled", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000706', 'AGENT_REPLY', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000703', true, CURRENT_TIMESTAMP)
ON CONFLICT ("task") DO NOTHING;
INSERT INTO "llm_budgets" ("id", "daily_limit_micro_usd", "monthly_limit_micro_usd", "updated_at")
VALUES ('default', 2000000, 30000000, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "feature_flag_configs" ("key", "enabled", "rollout_percentage", "scope", "version", "updated_at")
VALUES ('llm.agent-reply.enabled', true, 100, 'GLOBAL', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
