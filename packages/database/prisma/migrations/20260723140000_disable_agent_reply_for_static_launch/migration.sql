UPDATE "feature_flag_configs"
SET
  "enabled" = false,
  "rollout_percentage" = 0,
  "version" = "version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'llm.agent-reply.enabled';
