BEGIN;

CREATE TABLE IF NOT EXISTS socialflow_records (
    table_name text NOT NULL,
    id text NOT NULL,
    data jsonb NOT NULL,
    PRIMARY KEY (table_name, id)
);

CREATE INDEX IF NOT EXISTS socialflow_records_path_idx
    ON socialflow_records ((data->>'path'));

CREATE INDEX IF NOT EXISTS socialflow_records_data_idx
    ON socialflow_records USING GIN (data jsonb_path_ops);

COMMIT;