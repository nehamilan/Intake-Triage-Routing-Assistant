DROP POLICY IF EXISTS "Authenticated read requests" ON public.requests;
CREATE POLICY "Agents and viewers read requests"
  ON public.requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'viewer'));