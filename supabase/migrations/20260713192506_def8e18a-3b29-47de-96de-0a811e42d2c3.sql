
-- Roles
CREATE TYPE public.app_role AS ENUM ('agent', 'viewer');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- has_role security definer helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile + assign viewer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tighten RLS on requests / request_revisions
DROP POLICY IF EXISTS "Anyone can read requests" ON public.requests;
DROP POLICY IF EXISTS "Anyone can insert requests" ON public.requests;
DROP POLICY IF EXISTS "Anyone can update requests" ON public.requests;
DROP POLICY IF EXISTS "Anyone can read revisions" ON public.request_revisions;
DROP POLICY IF EXISTS "Anyone can insert revisions" ON public.request_revisions;

REVOKE ALL ON public.requests FROM anon;
REVOKE ALL ON public.request_revisions FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.requests TO authenticated;
GRANT SELECT, INSERT ON public.request_revisions TO authenticated;

CREATE POLICY "Authenticated read requests"
  ON public.requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents insert requests"
  ON public.requests FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'agent'));
CREATE POLICY "Agents update requests"
  ON public.requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'agent'))
  WITH CHECK (public.has_role(auth.uid(), 'agent'));

CREATE POLICY "Authenticated read revisions"
  ON public.request_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents insert revisions"
  ON public.request_revisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'agent'));
