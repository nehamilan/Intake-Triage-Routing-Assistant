// Hardcoded sample requests used by the "Load samples" / "Triage all" controls.
// Realistic research-data-repository intake messages covering every category
// in the RULEBOOK, plus the guardrail edge cases we need to demonstrate:
//   - restricted-data access WITH stated approval  (should auto-route)
//   - restricted-data access WITHOUT approval      (must escalate — Guardrail A)
//   - suspected privacy incident                   (must escalate — Guardrail B)
//   - vague / low-confidence message               (must escalate on threshold)
//   - urgent deadline case                         (priority = urgent)
//   - text references attachments but none provided (must escalate — mismatch)

import { mockFile, type Attachment } from "./attachments";

export interface SampleRequest {
  id: string;
  label: string;
  text: string;
  attachments: Attachment[];
}

export const SAMPLE_REQUESTS: readonly SampleRequest[] = [
  {
    id: "restricted-with-approval",
    label: "Restricted access — with IRB approval",
    text: "Hello, I'm a postdoc at the Karolinska Institute. I would like access to the restricted clinical cohort dataset (Study #A-2041). I have attached my IRB approval letter and the signed data use agreement, and my ethics clearance is valid through 2027. Please confirm the access procedure.",
    attachments: [
      mockFile(
        "irb_approval_letter_A-2041.pdf",
        "application/pdf",
        184_320,
        "Signed IRB approval letter for Study #A-2041, valid through 2027-06.",
      ),
      mockFile(
        "data_use_agreement_signed.pdf",
        "application/pdf",
        96_400,
        "Countersigned data use agreement — restricted tier.",
      ),
    ],
  },
  {
    id: "restricted-no-approval",
    label: "Restricted access — no approval mentioned",
    text: "Hi team, can you give me access to the sensitive interview transcripts in the confidential migration study? I'd like to download the full set for a paper I'm writing. Thanks.",
    attachments: [],
  },
  {
    id: "privacy-incident",
    label: "Suspected privacy incident",
    text: "URGENT — we think a colleague accidentally uploaded a spreadsheet containing patient names and personal data to the public collection yesterday afternoon. The file may already be indexed. Please help us take it down and confirm nothing was exposed.",
    attachments: [
      mockFile(
        "exposed_collection_link.txt",
        "text/plain",
        340,
        "URL of the public collection where the spreadsheet was uploaded.",
      ),
    ],
  },
  {
    id: "urgent-deadline",
    label: "Urgent deposit deadline",
    text: "I need to deposit our dataset today — the funder deadline is tomorrow morning ASAP and the submit button on the upload page keeps spinning. Can someone from the curation team walk me through the deposit for our project collection right now?",
    attachments: [
      mockFile(
        "dataset_manifest.csv",
        "text/csv",
        22_500,
        "Manifest of the 128 files intended for deposit.",
      ),
    ],
  },
  {
    id: "low-confidence-vague",
    label: "Vague / low-confidence",
    text: "Hi, quick question about the thing we talked about last week. Can you get back to me?",
    attachments: [],
  },
  {
    id: "licensing-ccby",
    label: "Licensing — CC-BY question",
    text: "We're preparing to release a derived dataset built from three sources, two of which are CC-BY and one that has a custom copyright notice. Can you advise which license we should apply, and whether attribution to the original authors is sufficient?",
    attachments: [
      mockFile(
        "source_licenses_summary.pdf",
        "application/pdf",
        61_200,
        "One-page table of the three upstream sources and their licenses.",
      ),
    ],
  },
  {
    id: "technical-download",
    label: "Technical — broken download",
    text: "The download for dataset DS-8821 fails with a 500 error every time I try. I've cleared cookies and tried a different browser, same result. The transfer stops around 40%. Can someone from infrastructure look at this?",
    attachments: [
      mockFile(
        "error_screenshot_500.png",
        "image/png",
        412_000,
        "Screenshot of the 500 error page after the download aborts.",
      ),
    ],
  },
  {
    id: "deposit-help",
    label: "Deposit assistance",
    text: "I'm trying to submit a new collection for our lab group but I can't figure out how to add co-authors to the upload, and my user account doesn't seem to have the right permissions to create a collection. Any guidance?",
    attachments: [],
  },
  {
    id: "metadata-doi",
    label: "Metadata curation",
    text: "Could you help me refine the description and keywords for our recent deposit? I'd also like to confirm the DOI has been minted correctly and that the metadata record reflects the updated abstract.",
    attachments: [],
  },
  {
    id: "preservation-format",
    label: "Preservation format",
    text: "We plan to preserve our raw microscopy files for at least 10 years. What format should we convert them to for long-term preservation, and does the repository run a backup of deposited files?",
    attachments: [],
  },
  {
    id: "general-inquiry",
    label: "General inquiry",
    text: "Hi, I'm new to the repository. Could you point me to an overview of what services you offer to research groups?",
    attachments: [],
  },
  {
    id: "restricted-borderline",
    label: "Restricted access — mentions ethics clearance",
    text: "Following up on our earlier email — I'd like to request access to the restricted survey responses from the 2023 wave. Our project has ethics clearance from the university REC and the approval reference is REC-2023-118.",
    attachments: [
      mockFile(
        "REC-2023-118_approval.pdf",
        "application/pdf",
        142_800,
        "University REC approval, reference REC-2023-118.",
      ),
    ],
  },
  {
    id: "deposit-large-collection",
    label: "Deposit — large multi-file collection",
    text: "Hello, we'd like to deposit a collection of about 4,000 audio recordings from our oral history project. Could someone from curation help us submit and structure the upload? We're not sure whether to split it into sub-collections.",
    attachments: [
      mockFile(
        "oral_history_index.csv",
        "text/csv",
        512_000,
        "Index of the ~4,000 audio recordings with speaker and date columns.",
      ),
    ],
  },
  {
    id: "metadata-doi-correction",
    label: "Metadata — DOI landing page wrong",
    text: "The DOI landing page for our dataset shows the wrong description and is missing three keywords we submitted. Could you update the metadata record so the DOI resolves to the correct abstract?",
    attachments: [
      mockFile(
        "doi_landing_screenshot.png",
        "image/png",
        286_400,
        "Screenshot of the incorrect DOI landing page.",
      ),
    ],
  },
  {
    id: "licensing-commercial-reuse",
    label: "Licensing — commercial reuse question",
    text: "A company reached out asking whether they can reuse our dataset commercially. The current license is CC-BY-NC. Can you confirm what commercial reuse requires and whether we can grant an exception without changing the public license?",
    attachments: [],
  },
  {
    id: "technical-login-loop",
    label: "Technical — login loop after password reset",
    text: "After resetting my password I get stuck in a login redirect loop and eventually see a 500 error. Nothing I try lets me sign in. Can infrastructure take a look at my account?",
    attachments: [],
  },
  {
    id: "preservation-proprietary",
    label: "Preservation — proprietary format concern",
    text: "Our simulation outputs are in a proprietary binary format tied to a vendor tool. We want them preserved and readable in 10 years even if the vendor disappears. What format should we convert to and does the repository handle the backup?",
    attachments: [],
  },
  {
    id: "privacy-incident-linked",
    label: "Privacy — link shared externally",
    text: "We just realised the private preview link for our unpublished dataset has been shared on a public mailing list. The file contains personal data about study participants. Can you revoke the link and confirm whether it was accessed?",
    attachments: [
      mockFile(
        "mailing_list_thread.eml",
        "message/rfc822",
        18_600,
        "Copy of the mailing-list thread where the preview link appears.",
      ),
    ],
  },
  {
    id: "restricted-urgent-no-approval",
    label: "Restricted access — urgent, no approval",
    text: "Deadline today — I urgently need access to the restricted patient interview dataset for a grant submission this evening. Please grant access ASAP.",
    attachments: [],
  },
  {
    id: "general-office-hours",
    label: "General — office hours question",
    text: "Quick question — do you run office hours or drop-in sessions for researchers who want help getting started?",
    attachments: [],
  },
  {
    id: "metadata-orcid",
    label: "Metadata — ORCID / author linking",
    text: "Could you help me link ORCID iDs to the author metadata on our recent deposit? Two co-authors are missing from the record and the description needs a short update.",
    attachments: [],
  },
  {
    id: "technical-api-transfer",
    label: "Technical — API bulk transfer failing",
    text: "Our scripted bulk transfer through the API is failing intermittently with a 500 during large downloads. Retries eventually work but it's slowing our pipeline. Can infrastructure investigate the endpoint?",
    attachments: [
      mockFile(
        "api_error_log.txt",
        "text/plain",
        48_200,
        "Excerpt of the client-side log showing the intermittent 500s.",
      ),
    ],
  },
  {
    id: "deposit-versioning",
    label: "Deposit — versioning a published dataset",
    text: "We need to submit a corrected version of a dataset that's already published in our collection. How do we upload a new version without breaking the existing DOI, and does the previous version stay accessible?",
    attachments: [],
  },
  {
    id: "deposit-embargo",
    label: "Deposit — embargoed release",
    text: "I'd like to deposit our thesis dataset now but keep it under embargo until the paper is published in about six months. Can curation help me submit the upload with an embargo period configured?",
    attachments: [],
  },
  {
    id: "metadata-controlled-vocab",
    label: "Metadata — controlled vocabulary",
    text: "Do you support a controlled vocabulary for subject keywords? I want to make sure the metadata on our deposit uses standard terms rather than free-text so the description is discoverable.",
    attachments: [],
  },
  {
    id: "metadata-language",
    label: "Metadata — non-English description",
    text: "Our dataset description is currently only in French. Should we also provide an English translation in the metadata, and is there a field for alternative language descriptions?",
    attachments: [],
  },
  {
    id: "licensing-mixed-sources",
    label: "Licensing — mixed-source aggregation",
    text: "We're publishing an aggregated dataset combining outputs from four different projects. The copyright status varies across sources and one has no explicit license. What license should we apply to the combined release?",
    attachments: [],
  },
  {
    id: "licensing-third-party-images",
    label: "Licensing — third-party images",
    text: "Our dataset includes photographs taken by a collaborator who has not yet signed anything. Can we publish under CC-BY without a written copyright transfer, or do we need a license agreement first?",
    attachments: [],
  },
  {
    id: "technical-search-broken",
    label: "Technical — search returns nothing",
    text: "Search on the repository has been returning zero results for common terms since this morning. I've tried different browsers and queries. Could infrastructure check whether the index is down?",
    attachments: [],
  },
  {
    id: "technical-upload-timeout",
    label: "Technical — upload times out on large files",
    text: "Every time I try to upload a 20 GB archive the transfer times out around 90% and I have to start over. The error page shows a 500. Can someone help me deposit this without restarting each time?",
    attachments: [
      mockFile(
        "upload_timeout_console.txt",
        "text/plain",
        12_800,
        "Browser console output captured during the failed upload.",
      ),
    ],
  },
  {
    id: "technical-two-factor",
    label: "Technical — 2FA lockout",
    text: "I've lost access to my two-factor device and can't log in to my user account. The password reset flow still asks for the 2FA code. Can infrastructure help me recover the account?",
    attachments: [],
  },
  {
    id: "preservation-checksums",
    label: "Preservation — checksum verification",
    text: "Do you run periodic checksum verification on deposited files? We'd like to confirm the fixity checks and the backup schedule before we commit to preserving our archive here for the long term.",
    attachments: [],
  },
  {
    id: "preservation-migration",
    label: "Preservation — format migration policy",
    text: "What is your policy on format migration? Some of our files are in formats that may not be readable in 10 years, and we want to know whether the repository will migrate them or whether that's on the depositor.",
    attachments: [],
  },
  {
    id: "restricted-tiered-access",
    label: "Restricted access — tiered access question",
    text: "We're planning to publish a sensitive dataset with tiered access: open metadata, restricted data files behind an approval process. Our ethics clearance is in place. Can you walk us through configuring the access levels?",
    attachments: [
      mockFile(
        "ethics_clearance_summary.pdf",
        "application/pdf",
        88_400,
        "One-page summary of the ethics clearance covering the sensitive dataset.",
      ),
    ],
  },
  {
    id: "restricted-reuse-existing",
    label: "Restricted access — reuse of already-approved data",
    text: "I already have approval to access the restricted cohort dataset for Study A. Can I reuse that clearance to analyse the same data for a new paper, or do I need a fresh IRB approval?",
    attachments: [],
  },
  {
    id: "privacy-screenshot-leak",
    label: "Privacy — screenshot with participant names",
    text: "A team member accidentally uploaded a screenshot to a public collection that shows a spreadsheet with participant names visible in the background. Please take it down and let us know whether the file was exposed.",
    attachments: [
      mockFile(
        "leaked_screenshot_thumbnail.png",
        "image/png",
        228_400,
        "Redacted copy of the leaked screenshot (participant names blurred).",
      ),
    ],
  },
  {
    id: "privacy-metadata-leak",
    label: "Privacy — personal data in metadata",
    text: "We just noticed that the metadata for one of our deposits contains participant initials and dates of birth in the description field. That's personal data that should not be public. Can it be scrubbed immediately?",
    attachments: [
      mockFile(
        "affected_metadata_record.json",
        "application/json",
        6_400,
        "Copy of the offending metadata record with the PII fields.",
      ),
    ],
  },
  {
    id: "urgent-conference",
    label: "Urgent — conference deadline",
    text: "Our poster deadline is today and I need the DOI for our dataset before I can submit. Can curation confirm the metadata is finalised and the DOI is live? ASAP please.",
    attachments: [],
  },
  {
    id: "general-citation",
    label: "General — how to cite",
    text: "Hi, how should users cite a dataset deposited in your repository? Is there a recommended citation format that appears on the landing page?",
    attachments: [],
  },
  {
    id: "general-training",
    label: "General — training materials",
    text: "Do you offer any training materials or workshops on research data management for early-career researchers? Looking for something we can point our new PhD students to.",
    attachments: [],
  },
  // Missing-attachment guardrail case — text references attached files but
  // none were actually provided. Should escalate to Human Review with the
  // "attachment mismatch" flag.
  {
    id: "deposit-missing-attachment",
    label: "Deposit — references attachments (none provided)",
    text: "Hi curation team, as discussed please find attached the completed deposit form and the dataset manifest so you can begin the ingest for our Q4 release. Let me know if you need anything else.",
    attachments: [],
  },
  // Embargo guardrail cases (Guardrail C).
  {
    id: "deposit-embargo-exact-date",
    label: "Deposit — embargo with exact date",
    text: "Please deposit the attached thesis dataset for our lab and embargo it until 2027-06-30. The paper is scheduled to appear that week and the DOI can go public then.",
    attachments: [
      mockFile(
        "thesis_dataset_manifest.csv",
        "text/csv",
        18_400,
        "Manifest of files intended for the embargoed deposit.",
      ),
    ],
  },
  {
    id: "deposit-embargo-month-only",
    label: "Deposit — embargo, month only",
    text: "We'd like to submit our collection now but keep it under embargo until March 2027, when the associated publication is expected. Please advise on the deposit steps.",
    attachments: [],
  },
  {
    id: "deposit-embargo-relative",
    label: "Deposit — embargo, relative duration",
    text: "Please upload the attached dataset but embargo it for 6 months from deposit. We'd rather not commit to a specific calendar date yet.",
    attachments: [
      mockFile(
        "dataset_bundle_index.csv",
        "text/csv",
        24_800,
        "Index of files bundled for the embargoed deposit.",
      ),
    ],
  },
];
