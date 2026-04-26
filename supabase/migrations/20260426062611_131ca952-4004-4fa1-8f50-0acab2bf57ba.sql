
-- Sandbox sessions
CREATE TABLE public.sandbox_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  e2b_sandbox_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  seconds_used INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sandbox_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own sandbox sessions"
  ON public.sandbox_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "users insert own sandbox sessions"
  ON public.sandbox_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own sandbox sessions"
  ON public.sandbox_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE INDEX idx_sandbox_sessions_user_started ON public.sandbox_sessions(user_id, started_at DESC);

-- GitHub tokens
CREATE TABLE public.github_tokens (
  user_id UUID NOT NULL PRIMARY KEY,
  access_token TEXT NOT NULL,
  github_username TEXT,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.github_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own github token"
  ON public.github_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own github token"
  ON public.github_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own github token"
  ON public.github_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users delete own github token"
  ON public.github_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Optional saved files (independent of sandbox)
CREATE TABLE public.ide_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, path)
);

ALTER TABLE public.ide_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own ide files"
  ON public.ide_files FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ide_files_updated_at
  BEFORE UPDATE ON public.ide_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER github_tokens_updated_at
  BEFORE UPDATE ON public.github_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Usage helper
CREATE OR REPLACE FUNCTION public.get_sandbox_usage(_user_id UUID)
RETURNS TABLE(week_seconds INTEGER, day_seconds INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(SUM(seconds_used) FILTER (WHERE started_at > now() - interval '7 days'), 0)::int AS week_seconds,
    COALESCE(SUM(seconds_used) FILTER (WHERE started_at > now() - interval '1 day'), 0)::int  AS day_seconds
  FROM public.sandbox_sessions
  WHERE user_id = _user_id;
$$;
