-- FamilyService.init creates the family tables before migrations run.
CREATE INDEX IF NOT EXISTS family_position_history_family_time ON family_position_history(family_id,recorded_at);
CREATE INDEX IF NOT EXISTS family_position_history_user_time ON family_position_history(user_id,recorded_at DESC);
