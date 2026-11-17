-- ============================================================================
-- Migration: Custom Users & Module Permissions (Option B)
-- Run this in your Supabase SQL Editor to update public.users
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS password TEXT,
  ADD COLUMN IF NOT EXISTS role_label TEXT,
  ADD COLUMN IF NOT EXISTS dept TEXT,
  ADD COLUMN IF NOT EXISTS avatar_initials TEXT;

-- Ensure defaults and constraints
ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'staff',
  ALTER COLUMN permissions SET DEFAULT '[]'::jsonb,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN deleted SET DEFAULT FALSE;

-- Unique index on lowercase email for active users
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON public.users (lower(email))
  WHERE email IS NOT NULL AND deleted = FALSE;

-- ============================================================================
-- Manually insert users in SQL
-- ============================================================================
INSERT INTO public.users (
  id, name, email, password, role, role_label, dept, avatar_initials
)
VALUES
  (
    'usr-admin-01',
    'Mogessh',
    'wmgmogessh@gmail.com',
    'mog3729',
    'admin',
    'Administrator',
    'QAQC',
    'MG'
  ),
  (
    'usr-admin-02',
    'Teja',
    'wmgteja@gmail.com',
    '981834',
    'admin',
    'Administrator',
    'All',
    'TJ'
  ),
  (
    'usr-staff-01',
    'Demo1',
    'wmgdemo1@gmail.com',
    'staff123',
    'staff',
    'Staff',
    'QAQC',
    'D1'
  ),
  (
    'usr-staff-02',
    'Demo2',
    'wmgdemo2@gmail.com',
    'staff123',
    'staff',
    'Staff',
    'QAQC',
    'D2'
  ),
  (
    'usr-staff-03',
    'Demo3',
    'wmgdemo3@gmail.com',
    'staff123',
    'staff',
    'Staff',
    'QAQC',
    'D3'
  )
ON CONFLICT (id) DO NOTHING;