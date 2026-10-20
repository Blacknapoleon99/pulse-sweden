-- FamilyService.init adds recipient_id to existing family message tables.
CREATE INDEX IF NOT EXISTS family_messages_private_time ON family_messages(family_id,sender_id,recipient_id,created_at DESC);
