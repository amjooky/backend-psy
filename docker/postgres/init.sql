-- PostgreSQL initialization script
-- Runs automatically when the container starts for the first time

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For full-text search
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- For accent-insensitive search

-- Set timezone
SET timezone = 'UTC';

-- Log setup completion
DO $$
BEGIN
  RAISE NOTICE 'Monpsy database initialized successfully';
END
$$;
