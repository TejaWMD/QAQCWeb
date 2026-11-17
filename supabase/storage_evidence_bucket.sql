-- Private bucket for evidence uploads (Requests & Stoppages, CAPA, etc.).
-- Run once in the Supabase SQL editor.
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "evidence upload" ON storage.objects;
CREATE POLICY "evidence upload" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'evidence');

DROP POLICY IF EXISTS "evidence read" ON storage.objects;
CREATE POLICY "evidence read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'evidence');
