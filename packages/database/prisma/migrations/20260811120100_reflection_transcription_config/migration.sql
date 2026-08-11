INSERT INTO "llm_prompt_versions" (
  "id",
  "task",
  "semantic_version",
  "source_path",
  "sha256",
  "content",
  "output_schema_version",
  "approved_at"
)
VALUES (
  '00000000-0000-0000-0000-000000001101',
  'REFLECTION_TRANSCRIPTION',
  '1.0.0',
  'packages/prompts/REFLECTION_TRANSCRIPTION/1.0.0.md',
  'cdb8149c5b8fe13468f55f17a769af7f9b9ed36f72949c40dbdd91212dae1ee8',
  E'Gönderilen meditasyon refleksiyonu ses kaydını Türkçe olarak kelimesi kelimesine yazıya dök.\n\n- Özetleme, yorumlama, dil bilgisi düzeltmesi veya yeni içerik ekleme.\n- Duyulmayan kısa bölümleri `[anlaşılmadı]` olarak işaretle.\n- Yalnızca transkripsiyon metnini döndür.\n',
  'plain-text-v1',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("task", "semantic_version") DO NOTHING;

INSERT INTO "llm_task_configs" (
  "id",
  "task",
  "primary_model_id",
  "prompt_version_id",
  "enabled",
  "updated_at"
)
SELECT
  '00000000-0000-0000-0000-000000001102',
  'REFLECTION_TRANSCRIPTION',
  model."id",
  '00000000-0000-0000-0000-000000001101',
  true,
  CURRENT_TIMESTAMP
FROM "llm_models" model
JOIN "llm_providers" provider ON provider."id" = model."provider_id"
WHERE provider."adapter_id" = 'gemini'
  AND model."provider_model_id" = 'gemini-2.5-flash-lite'
ON CONFLICT ("task") DO NOTHING;

