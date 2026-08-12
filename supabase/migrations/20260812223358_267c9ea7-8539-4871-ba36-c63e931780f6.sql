DO $$
DECLARE
  v_vert text; i int; c text; st text; rid uuid; ts timestamptz;
  conf numeric; prio text; route text; flags jsonb; txt text; reason text; parse boolean; ovr boolean;
  r_cats text[] := ARRAY['restricted_data_access','deposit_assistance','metadata_curation','technical_platform','licensing_rights','preservation_format','general_inquiry'];
  b_cats text[] := ARRAY['fraud','billing_dispute','account_access','general_inquiry'];
  cats text[];
  esc text[] := ARRAY['escalated_low_confidence','escalated_guardrail','escalated_privacy_incident','escalated_parse_failure','escalated_attachment_mismatch'];
BEGIN
  IF EXISTS (SELECT 1 FROM public.request_revisions WHERE reviewer = 'Demo Reviewer') THEN RETURN; END IF;

  FOREACH v_vert IN ARRAY ARRAY['research','banking'] LOOP
    cats := CASE WHEN v_vert = 'research' THEN r_cats ELSE b_cats END;
    FOR i IN 0..27 LOOP
      c := cats[1 + (i % array_length(cats,1))];
      ts := now() - ((i % 7) || ' days')::interval - ((i % 9) || ' hours')::interval;
      ovr := (i % 11 = 3);
      IF i % 3 = 2 THEN
        st := esc[1 + ((i/3) % 5)];
        route := 'Human Review Queue';
        prio := CASE WHEN st IN ('escalated_privacy_incident','escalated_guardrail') THEN 'urgent' ELSE 'normal' END;
        parse := (st = 'escalated_parse_failure');
        conf := CASE st WHEN 'escalated_low_confidence' THEN 0.44 WHEN 'escalated_parse_failure' THEN 0 ELSE 0.83 END;
        IF st IN ('escalated_privacy_incident','escalated_guardrail') THEN
          c := CASE WHEN v_vert = 'banking' THEN 'fraud' ELSE 'restricted_data_access' END;
        END IF;
        flags := to_jsonb(ARRAY[CASE st
          WHEN 'escalated_low_confidence' THEN 'Confidence below the 0.70 threshold — routed to human review.'
          WHEN 'escalated_guardrail' THEN 'Guardrail: restricted or high-risk action requested without stated approval.'
          WHEN 'escalated_privacy_incident' THEN 'Guardrail: suspected privacy incident — mandatory human handling.'
          WHEN 'escalated_parse_failure' THEN 'Model output invalid — routed to human review.'
          ELSE 'Text references attachments but none were provided.' END]);
        reason := CASE WHEN parse THEN 'Model returned malformed output; failed safe into human review.'
                       ELSE 'Deterministic guardrail fired around the model call.' END;
        txt := CASE st
          WHEN 'escalated_low_confidence' THEN 'Following up on the item we discussed earlier, ref ' || (1000+i) || '. Not sure who handles this now — can someone take a look?'
          WHEN 'escalated_guardrail' THEN CASE WHEN v_vert='banking'
              THEN 'Someone used my stolen card details for an unauthorised transfer of ' || (200+i*13) || '. I never approved it.'
              ELSE 'Please grant me access to the restricted cohort dataset #' || (1000+i) || '. I want to download the full set for a paper.' END
          WHEN 'escalated_privacy_incident' THEN CASE WHEN v_vert='banking'
              THEN 'Your team emailed me another customer''s statement — their personal data was exposed. Ref ' || (1000+i) || '.'
              ELSE 'URGENT — a colleague accidentally uploaded a spreadsheet with patient names to public collection ' || (1000+i) || '. Possible breach.' END
          WHEN 'escalated_parse_failure' THEN '?? ref ' || (1000+i) || ' ~~~ ??? need help asap ///'
          ELSE CASE WHEN v_vert='banking'
              THEN 'I have attached the disputed statement and the receipt for the ' || (50+i*3) || ' charge — please compare them.'
              ELSE 'See the attached consent forms and cohort spreadsheet for deposit ' || (1000+i) || ' before publishing.' END
          END;
      ELSE
        st := 'auto_routed';
        parse := false;
        conf := 0.78 + ((i * 7) % 18)::numeric / 100;
        prio := CASE WHEN i % 9 = 4 THEN 'urgent' WHEN i % 5 = 0 THEN 'low' ELSE 'normal' END;
        flags := '[]'::jsonb;
        route := CASE c
          WHEN 'restricted_data_access' THEN 'Compliance'
          WHEN 'deposit_assistance' THEN 'Curation'
          WHEN 'metadata_curation' THEN 'Curation'
          WHEN 'technical_platform' THEN 'Infrastructure'
          WHEN 'licensing_rights' THEN 'Compliance'
          WHEN 'preservation_format' THEN 'Curation'
          WHEN 'fraud' THEN 'Fraud'
          WHEN 'billing_dispute' THEN 'Billing'
          WHEN 'account_access' THEN 'Support'
          ELSE 'General Support' END;
        reason := 'Message matches ' || replace(c,'_',' ') || ' intent; routed to ' || route || '.';
        txt := CASE c
          WHEN 'restricted_data_access' THEN 'Requesting access to restricted cohort dataset #' || (1000+i) || '. IRB approval and signed data use agreement are in place.'
          WHEN 'deposit_assistance' THEN 'I am depositing a longitudinal survey set for project ' || (1000+i) || ' and need help structuring the folders before submission.'
          WHEN 'metadata_curation' THEN 'The landing page for dataset ' || (1000+i) || ' lists the wrong contributors — please correct the metadata record.'
          WHEN 'technical_platform' THEN 'Bulk download for collection ' || (1000+i) || ' times out after about 2GB. Tried three browsers.'
          WHEN 'licensing_rights' THEN 'Which licence applies if we redistribute a derived subset of dataset ' || (1000+i) || ' in a course pack?'
          WHEN 'preservation_format' THEN 'We hold legacy SPSS files for collection ' || (1000+i) || ' — what preservation formats do you recommend?'
          WHEN 'fraud' THEN 'A card payment of ' || (100+i*11) || ' I did not recognise appeared overnight. Please review the transaction.'
          WHEN 'billing_dispute' THEN 'I was charged a monthly fee of ' || (5+i) || ' that should have been waived on my account.'
          WHEN 'account_access' THEN 'Locked out of online banking after a password reset — the one-time code never arrives. Ref ' || (1000+i) || '.'
          ELSE 'Quick question about your service hours and where to find documentation. Ref ' || (1000+i) || '.'
          END;
      END IF;

      INSERT INTO public.requests (
        request_text, attachments, ai_category, ai_priority, ai_route, ai_confidence,
        ai_reason, ai_parse_failed, final_category, final_priority, final_route,
        status, flags, was_overridden, reviewer_note, current_revision, created_at, vertical
      ) VALUES (
        txt, '[]'::jsonb, c, prio, route, conf, reason, parse, c, prio, route,
        st, flags, ovr, CASE WHEN ovr THEN 'Adjusted after reviewing the full thread.' ELSE NULL END, 1, ts, v_vert
      ) RETURNING id INTO rid;

      INSERT INTO public.request_revisions (
        request_id, revision, created_at, reviewer, category, priority, route, status,
        changes, reason, guardrail_acknowledged
      ) VALUES (
        rid, 1, ts, 'Demo Reviewer', c, prio, route, st, '[]'::jsonb,
        CASE WHEN ovr THEN 'Adjusted after reviewing the full thread.' ELSE NULL END, false
      );
    END LOOP;
  END LOOP;
END $$;