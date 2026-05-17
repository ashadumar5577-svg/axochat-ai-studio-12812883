
-- ChatGPT-style memories
CREATE TABLE IF NOT EXISTS public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_memories" ON public.user_memories
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_memories" ON public.user_memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_memories" ON public.user_memories
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_memories" ON public.user_memories
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_memories_user ON public.user_memories(user_id, created_at DESC);

-- Drop IDE-related tables (no longer used)
DROP TABLE IF EXISTS public.ide_files CASCADE;
DROP TABLE IF EXISTS public.sandbox_sessions CASCADE;
DROP FUNCTION IF EXISTS public.get_sandbox_usage(uuid);
