-- Supabase exposes public-schema tables through PostgREST when direct grants and
-- permissive policies allow it. LexPulse uses server-side Prisma for database
-- access, so browser clients should not be able to read or mutate tables
-- directly with anon/authenticated roles.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
DECLARE
  table_record RECORD;
  sequence_record RECORD;
  has_anon BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_service_role BOOLEAN := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  IF has_anon THEN
    REVOKE ALL ON SCHEMA public FROM anon;
  END IF;

  IF has_authenticated THEN
    REVOKE ALL ON SCHEMA public FROM authenticated;
  END IF;

  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_record.schemaname, table_record.tablename);

    IF has_anon THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon', table_record.schemaname, table_record.tablename);
    END IF;

    IF has_authenticated THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM authenticated', table_record.schemaname, table_record.tablename);
    END IF;

    IF has_service_role THEN
      EXECUTE format('DROP POLICY IF EXISTS service_role_all ON %I.%I', table_record.schemaname, table_record.tablename);
      EXECUTE format(
        'CREATE POLICY service_role_all ON %I.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
        table_record.schemaname,
        table_record.tablename
      );
    END IF;
  END LOOP;

  FOR sequence_record IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    IF has_anon THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM anon', sequence_record.sequence_schema, sequence_record.sequence_name);
    END IF;

    IF has_authenticated THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM authenticated', sequence_record.sequence_schema, sequence_record.sequence_name);
    END IF;
  END LOOP;
END $$;
