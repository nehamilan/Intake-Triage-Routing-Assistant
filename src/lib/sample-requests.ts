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
];
