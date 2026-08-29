ALTER TABLE booking_review_intakes ADD COLUMN surgery_history_requested INTEGER NOT NULL DEFAULT 0 CHECK (surgery_history_requested IN (0, 1));
ALTER TABLE booking_review_intakes ADD COLUMN disease_history_requested INTEGER NOT NULL DEFAULT 0 CHECK (disease_history_requested IN (0, 1));
ALTER TABLE booking_review_intakes ADD COLUMN last_treatment_requested INTEGER NOT NULL DEFAULT 0 CHECK (last_treatment_requested IN (0, 1));
ALTER TABLE booking_review_intakes ADD COLUMN question_request_note TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO schema_versions (version, description, applied_at)
VALUES ('0015_review_question_requests', 'Owner requested health intake questions', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
