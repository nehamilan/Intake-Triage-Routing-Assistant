DROP POLICY IF EXISTS "Authenticated read revisions" ON public.request_revisions;
CREATE POLICY "Agents and viewers read revisions" ON public.request_revisions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'agent'::app_role) OR public.has_role(auth.uid(), 'viewer'::app_role));
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);