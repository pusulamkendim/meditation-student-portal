CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "KnowledgeStage" AS ENUM ('GENERAL', 'WEEK_1', 'WEEK_2', 'WEEK_3', 'WEEK_4', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentVersionStatus" AS ENUM ('UPLOADED', 'QUARANTINED', 'SCANNING', 'PARSING', 'CHUNKING', 'EMBEDDING', 'READY', 'PUBLISHED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeEmbeddingStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WeeklySummaryDraftStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'REJECTED');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "inbox_event_id" UUID;

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "retrieval_config_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "knowledge_base_id" UUID NOT NULL,
    "logical_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "quarantine_key" TEXT,
    "storage_key" TEXT,
    "extracted_text" TEXT,
    "parser_version" TEXT,
    "status" "KnowledgeDocumentVersionStatus" NOT NULL DEFAULT 'UPLOADED',
    "error_code" TEXT,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document_stage_assignments" (
    "id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "stage" "KnowledgeStage" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_document_stage_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "title_path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "start_char" INTEGER,
    "end_char" INTEGER,
    "stage_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_embeddings" (
    "id" UUID NOT NULL,
    "chunk_id" UUID NOT NULL,
    "model_ref" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "embedding_vector" vector(768),
    "content_hash" TEXT NOT NULL,
    "status" "KnowledgeEmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_retrieval_configs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "top_k" INTEGER NOT NULL DEFAULT 20,
    "final_chunks" INTEGER NOT NULL DEFAULT 6,
    "min_score" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "max_context_chars" INTEGER NOT NULL DEFAULT 12000,
    "vector_weight" DOUBLE PRECISION NOT NULL DEFAULT 0.78,
    "keyword_weight" DOUBLE PRECISION NOT NULL DEFAULT 0.22,
    "max_chunks_per_document" INTEGER NOT NULL DEFAULT 3,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_retrieval_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_query_logs" (
    "id" UUID NOT NULL,
    "source_message_id" UUID,
    "student_id" UUID,
    "curriculum_stage" TEXT,
    "retrieval_config_version" INTEGER NOT NULL,
    "candidate_chunk_ids" JSONB NOT NULL,
    "selected_chunk_ids" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "threshold_passed" BOOLEAN NOT NULL,
    "handoff_reference" UUID,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rag_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoffs" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "source_message_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'OPEN',
    "response_owner_id" UUID,
    "resolved_by_admin_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflection_tags" (
    "id" UUID NOT NULL,
    "reflection_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "taxonomy_version" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "model_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflection_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_summary_draft_versions" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content_encrypted" BYTEA NOT NULL,
    "content_key_id" TEXT NOT NULL,
    "status" "WeeklySummaryDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "operation_id" TEXT,
    "created_by_admin_id" UUID,
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_summary_draft_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_bases_name_key" ON "knowledge_bases"("name");

-- CreateIndex
CREATE INDEX "knowledge_documents_knowledge_base_id_active_idx" ON "knowledge_documents"("knowledge_base_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_knowledge_base_id_logical_name_key" ON "knowledge_documents"("knowledge_base_id", "logical_name");

-- CreateIndex
CREATE INDEX "knowledge_document_versions_status_created_at_idx" ON "knowledge_document_versions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_document_versions_document_id_version_key" ON "knowledge_document_versions"("document_id", "version");

-- CreateIndex
CREATE INDEX "knowledge_document_stage_assignments_stage_document_version_idx" ON "knowledge_document_stage_assignments"("stage", "document_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_document_stage_assignments_document_version_id_st_key" ON "knowledge_document_stage_assignments"("document_version_id", "stage");

-- CreateIndex
CREATE INDEX "knowledge_chunks_content_hash_idx" ON "knowledge_chunks"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_document_version_id_chunk_index_key" ON "knowledge_chunks"("document_version_id", "chunk_index");

-- CreateIndex
CREATE INDEX "knowledge_embeddings_model_ref_status_idx" ON "knowledge_embeddings"("model_ref", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_embeddings_chunk_id_model_ref_content_hash_key" ON "knowledge_embeddings"("chunk_id", "model_ref", "content_hash");

-- CreateIndex
CREATE INDEX "rag_query_logs_student_id_created_at_idx" ON "rag_query_logs"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "rag_query_logs_threshold_passed_created_at_idx" ON "rag_query_logs"("threshold_passed", "created_at");

-- CreateIndex
CREATE INDEX "handoffs_student_id_status_created_at_idx" ON "handoffs"("student_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reflection_tags_tag_created_at_idx" ON "reflection_tags"("tag", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reflection_tags_reflection_id_tag_operation_id_key" ON "reflection_tags"("reflection_id", "tag", "operation_id");

-- CreateIndex
CREATE INDEX "weekly_summary_draft_versions_meeting_id_status_idx" ON "weekly_summary_draft_versions"("meeting_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_summary_draft_versions_meeting_id_version_key" ON "weekly_summary_draft_versions"("meeting_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "messages_inbox_event_id_key" ON "messages"("inbox_event_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_inbox_event_id_fkey" FOREIGN KEY ("inbox_event_id") REFERENCES "inbox_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document_stage_assignments" ADD CONSTRAINT "knowledge_document_stage_assignments_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "knowledge_document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "knowledge_document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_query_logs" ADD CONSTRAINT "rag_query_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflection_tags" ADD CONSTRAINT "reflection_tags_reflection_id_fkey" FOREIGN KEY ("reflection_id") REFERENCES "practice_reflections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_summary_draft_versions" ADD CONSTRAINT "weekly_summary_draft_versions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "weekly_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "knowledge_retrieval_configs" ("id", "top_k", "final_chunks", "min_score", "max_context_chars", "vector_weight", "keyword_weight", "max_chunks_per_document", "version", "updated_at")
VALUES ('default', 20, 6, 0.55, 12000, 0.78, 0.22, 3, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "system_event_definitions" ("key", "audience", "channels", "variable_schema", "compliance_class", "protected", "default_ttl_seconds", "updated_at")
VALUES ('WEEKLY_SUMMARY_SHARED', 'STUDENT', '["WHATSAPP", "TELEGRAM"]'::jsonb, '{"type":"object","properties":{"summaryText":{"type":"string"}},"required":["summaryText"],"additionalProperties":false}'::jsonb, 'STANDARD', false, 86400, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "variable_schema" = EXCLUDED."variable_schema", "channels" = EXCLUDED."channels", "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "feature_flag_configs" ("key", "enabled", "rollout_percentage", "scope", "version", "updated_at")
VALUES
  ('knowledge.ingestion.enabled', false, 0, 'GLOBAL', 1, CURRENT_TIMESTAMP),
  ('knowledge.rag.enabled', false, 0, 'GLOBAL', 1, CURRENT_TIMESTAMP),
  ('llm.reflection-tagging.enabled', false, 0, 'GLOBAL', 1, CURRENT_TIMESTAMP),
  ('llm.weekly-summary.enabled', false, 0, 'GLOBAL', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "llm_models" ("id", "provider_id", "provider_model_id", "display_name", "status", "input_token_limit", "output_token_limit", "supports_tools", "supports_structured", "updated_at")
VALUES ('00000000-0000-0000-0000-00000000070c', '00000000-0000-0000-0000-000000000701', 'gemini-embedding-2', 'Gemini Embedding 2', 'ACTIVE', 8192, 768, false, false, CURRENT_TIMESTAMP)
ON CONFLICT ("provider_id", "provider_model_id") DO NOTHING;

INSERT INTO "llm_model_price_versions" ("id", "model_id", "version", "input_micro_usd_per_m", "output_micro_usd_per_m", "effective_at", "source_url")
VALUES ('00000000-0000-0000-0000-00000000070d', '00000000-0000-0000-0000-00000000070c', 1, 200000, 0, '2026-06-18T00:00:00.000Z', 'https://ai.google.dev/gemini-api/docs/pricing')
ON CONFLICT ("model_id", "version") DO NOTHING;

INSERT INTO "llm_task_configs" ("id", "task", "primary_model_id", "enabled", "updated_at")
VALUES
  ('00000000-0000-0000-0000-000000000707', 'REFLECTION_TAGGING', NULL, false, CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000708', 'WEEKLY_SUMMARY', NULL, false, CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-000000000709', 'KNOWLEDGE_EMBEDDING', '00000000-0000-0000-0000-00000000070c', false, CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-00000000070a', 'RAG_QUERY_REWRITE', NULL, false, CURRENT_TIMESTAMP),
  ('00000000-0000-0000-0000-00000000070b', 'RAG_RERANK', NULL, false, CURRENT_TIMESTAMP)
ON CONFLICT ("task") DO NOTHING;
