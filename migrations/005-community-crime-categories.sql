ALTER TABLE community_reports DROP CONSTRAINT IF EXISTS community_reports_category_check;
ALTER TABLE community_reports ADD CONSTRAINT community_reports_category_check CHECK(category IN ('theft','violence','vandalism','suspicious','disturbance','traffic','hazard','other'));
