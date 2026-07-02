// Hardcoded sample requests used by the "Load samples" / "Triage all" controls.
// Realistic research-data-repository intake messages covering every category
// in the RULEBOOK, plus the guardrail edge cases we need to demonstrate:
//   - restricted-data access WITH stated approval  (should auto-route)
//   - restricted-data access WITHOUT approval      (must escalate — Guardrail A)
//   - suspected privacy incident                   (must escalate — Guardrail B)
//   - vague / low-confidence message               (must escalate on threshold)
//   - urgent deadline case                         (priority = urgent)

export interface SampleRequest {
  id: string;
  label: string;
  text: string;
}

export const SAMPLE_REQUESTS: readonly SampleRequest[] = [
  {
    id: "restricted-with-approval",
    label: "Restricted access — with IRB approval",
    text: "Hello, I'm a postdoc at the Karolinska Institute. I would like access to the restricted clinical cohort dataset (Study #A-2041). I have attached my IRB approval letter and the signed data use agreement, and my ethics clearance is valid through 2027. Please confirm the access procedure.",
  },
  {
    id: "restricted-no-approval",
    label: "Restricted access — no approval mentioned",
    text: "Hi team, can you give me access to the sensitive interview transcripts in the confidential migration study? I'd like to download the full set for a paper I'm writing. Thanks.",
  },
  {
    id: "privacy-incident",
    label: "Suspected privacy incident",
    text: "URGENT — we think a colleague accidentally uploaded a spreadsheet containing patient names and personal data to the public collection yesterday afternoon. The file may already be indexed. Please help us take it down and confirm nothing was exposed.",
  },
  {
    id: "urgent-deadline",
    label: "Urgent deposit deadline",
    text: "I need to deposit our dataset today — the funder deadline is tomorrow morning ASAP and the submit button on the upload page keeps spinning. Can someone from the curation team walk me through the deposit for our project collection right now?",
  },
  {
    id: "low-confidence-vague",
    label: "Vague / low-confidence",
    text: "Hi, quick question about the thing we talked about last week. Can you get back to me?",
  },
  {
    id: "licensing-ccby",
    label: "Licensing — CC-BY question",
    text: "We're preparing to release a derived dataset built from three sources, two of which are CC-BY and one that has a custom copyright notice. Can you advise which license we should apply, and whether attribution to the original authors is sufficient?",
  },
  {
    id: "technical-download",
    label: "Technical — broken download",
    text: "The download for dataset DS-8821 fails with a 500 error every time I try. I've cleared cookies and tried a different browser, same result. The transfer stops around 40%. Can someone from infrastructure look at this?",
  },
  {
    id: "deposit-help",
    label: "Deposit assistance",
    text: "I'm trying to submit a new collection for our lab group but I can't figure out how to add co-authors to the upload, and my user account doesn't seem to have the right permissions to create a collection. Any guidance?",
  },
  {
    id: "metadata-doi",
    label: "Metadata curation",
    text: "Could you help me refine the description and keywords for our recent deposit? I'd also like to confirm the DOI has been minted correctly and that the metadata record reflects the updated abstract.",
  },
  {
    id: "preservation-format",
    label: "Preservation format",
    text: "We plan to preserve our raw microscopy files for at least 10 years. What format should we convert them to for long-term preservation, and does the repository run a backup of deposited files?",
  },
  {
    id: "general-inquiry",
    label: "General inquiry",
    text: "Hi, I'm new to the repository. Could you point me to an overview of what services you offer to research groups?",
  },
  {
    id: "restricted-borderline",
    label: "Restricted access — mentions ethics clearance",
    text: "Following up on our earlier email — I'd like to request access to the restricted survey responses from the 2023 wave. Our project has ethics clearance from the university REC and the approval reference is REC-2023-118.",
  },
  {
    id: "deposit-large-collection",
    label: "Deposit — large multi-file collection",
    text: "Hello, we'd like to deposit a collection of about 4,000 audio recordings from our oral history project. Could someone from curation help us submit and structure the upload? We're not sure whether to split it into sub-collections.",
  },
  {
    id: "metadata-doi-correction",
    label: "Metadata — DOI landing page wrong",
    text: "The DOI landing page for our dataset shows the wrong description and is missing three keywords we submitted. Could you update the metadata record so the DOI resolves to the correct abstract?",
  },
  {
    id: "licensing-commercial-reuse",
    label: "Licensing — commercial reuse question",
    text: "A company reached out asking whether they can reuse our dataset commercially. The current license is CC-BY-NC. Can you confirm what commercial reuse requires and whether we can grant an exception without changing the public license?",
  },
  {
    id: "technical-login-loop",
    label: "Technical — login loop after password reset",
    text: "After resetting my password I get stuck in a login redirect loop and eventually see a 500 error. Nothing I try lets me sign in. Can infrastructure take a look at my account?",
  },
  {
    id: "preservation-proprietary",
    label: "Preservation — proprietary format concern",
    text: "Our simulation outputs are in a proprietary binary format tied to a vendor tool. We want them preserved and readable in 10 years even if the vendor disappears. What format should we convert to and does the repository handle the backup?",
  },
  {
    id: "privacy-incident-linked",
    label: "Privacy — link shared externally",
    text: "We just realised the private preview link for our unpublished dataset has been shared on a public mailing list. The file contains personal data about study participants. Can you revoke the link and confirm whether it was accessed?",
  },
  {
    id: "restricted-urgent-no-approval",
    label: "Restricted access — urgent, no approval",
    text: "Deadline today — I urgently need access to the restricted patient interview dataset for a grant submission this evening. Please grant access ASAP.",
  },
  {
    id: "general-office-hours",
    label: "General — office hours question",
    text: "Quick question — do you run office hours or drop-in sessions for researchers who want help getting started?",
  },
  {
    id: "metadata-orcid",
    label: "Metadata — ORCID / author linking",
    text: "Could you help me link ORCID iDs to the author metadata on our recent deposit? Two co-authors are missing from the record and the description needs a short update.",
  },
  {
    id: "technical-api-transfer",
    label: "Technical — API bulk transfer failing",
    text: "Our scripted bulk transfer through the API is failing intermittently with a 500 during large downloads. Retries eventually work but it's slowing our pipeline. Can infrastructure investigate the endpoint?",
  },
];
