INSERT INTO "WorkCenter" ("id", "name")
VALUES ('a2c6d1a3-4b10-4ff0-8dae-c236596a2d77', 'Нитрид')
ON CONFLICT ("name") DO NOTHING;
