/**
 * AI materiality eval cases.
 *
 * Each case is a pair of document texts + the expected verdict when comparing
 * Document B against Document A as the baseline.
 *
 * These cases exercise the core pipeline: binary hash -> text hash -> AI compare.
 * The AI response is mocked; we verify the deterministic pipeline stages and
 * that the mock AI verdict propagates correctly through parseAIResponse.
 */

export interface EvalCase {
  /** Human-readable label for this case */
  label: string;
  /** Text of Document A (the baseline) */
  textA: string;
  /** Text of Document B (the new version being compared) */
  textB: string;
  /** Expected pipeline stage */
  expectedStage: "BINARY_MATCH" | "TEXT_MATCH" | "AI_COMPARE";
  /** Expected verdict */
  expectedVerdict:
    | "IDENTICAL"
    | "BINARY_DIFF_ONLY"
    | "MATERIAL"
    | "NOT_MATERIAL";
  /** Mock AI response (only used when expectedStage is AI_COMPARE) */
  mockAIResponse: {
    verdict: "MATERIAL" | "NOT_MATERIAL";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reasoning: string;
  } | null;
}

export const evalCases: EvalCase[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // CASE 1: Identical files (binary match)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "identical documents — byte-for-byte same",
    textA: "This agreement is made on 2026-01-01 between Party A and Party B for $10,000.",
    textB: "This agreement is made on 2026-01-01 between Party A and Party B for $10,000.",
    expectedStage: "BINARY_MATCH",
    expectedVerdict: "IDENTICAL",
    mockAIResponse: null,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 2: Whitespace-only change (cosmetic — text match)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "whitespace-only change — extra spaces and newlines",
    textA: "Section 1. Payment.\nThe Buyer shall pay $5,000.",
    textB: "Section 1.   Payment.\n\n  The Buyer shall pay $5,000.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "NOT_MATERIAL",
    mockAIResponse: {
      verdict: "NOT_MATERIAL",
      confidence: "HIGH",
      reasoning:
        "Only whitespace formatting differences (spacing and line breaks) were found — no substantive content changed.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 3: Amount changed (material)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "material change — payment amount altered",
    textA:
      "Loan Agreement.\nBorrower: Alice.\nLender: Bob.\nPrincipal amount: $100,000.\nInterest rate: 5%.\nTerm: 12 months.",
    textB:
      "Loan Agreement.\nBorrower: Alice.\nLender: Bob.\nPrincipal amount: $250,000.\nInterest rate: 5%.\nTerm: 12 months.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "MATERIAL",
    mockAIResponse: {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning:
        "The principal loan amount was changed from $100,000 to $250,000, which materially alters the financial obligation of the borrower.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 4: Named party changed (material)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "material change — party name changed",
    textA:
      "Service Agreement between Acme Corp and Beta LLC.\nScope: Web development services.\nDuration: 6 months.",
    textB:
      "Service Agreement between Acme Corp and Gamma Inc.\nScope: Web development services.\nDuration: 6 months.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "MATERIAL",
    mockAIResponse: {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning:
        "The counterparty was changed from Beta LLC to Gamma Inc, which materially alters the legal parties to the agreement.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 5: Date changed (material)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "material change — effective date changed",
    textA:
      "Effective Date: January 15, 2026.\nThis agreement shall commence on the Effective Date and continue for 3 years.",
    textB:
      "Effective Date: March 1, 2027.\nThis agreement shall commence on the Effective Date and continue for 3 years.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "MATERIAL",
    mockAIResponse: {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning:
        "The effective date was changed from January 2026 to March 2027, a 14-month delay that materially affects the agreement timeline.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 6: Punctuation/capitalization change (not material)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "cosmetic change — punctuation and capitalization",
    textA:
      "The parties agree to the terms set forth herein. this agreement is binding.",
    textB:
      "The parties agree to the terms set forth herein. This agreement is binding.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "NOT_MATERIAL",
    mockAIResponse: {
      verdict: "NOT_MATERIAL",
      confidence: "HIGH",
      reasoning:
        "Only a capitalization change from 'this' to 'This' — no substantive meaning was altered.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 7: Completely different documents (material)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "material change — entirely different document",
    textA:
      "Employment Agreement. Employee: John Doe. Position: Software Engineer. Salary: $120,000.",
    textB:
      "Non-Disclosure Agreement. Disclosing Party: John Doe. Receiving Party: Company X. Term: 5 years.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "MATERIAL",
    mockAIResponse: {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning:
        "Document B is an entirely different document type (NDA vs Employment Agreement) — the content bears no relationship to the baseline.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 8: Rewording without meaning change (not material)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "cosmetic change — paraphrasing same meaning",
    textA: "The consultant will deliver a report within 30 days of project completion.",
    textB: "Within 30 days following the completion of the project, the consultant shall provide a report.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "NOT_MATERIAL",
    mockAIResponse: {
      verdict: "NOT_MATERIAL",
      confidence: "MEDIUM",
      reasoning:
        "The text was reworded but the obligation (report delivery within 30 days of completion) remains identical — a cosmetic restatement.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 9: Duration/term changed (material)
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "material change — contract duration extended",
    textA: "This lease shall have a term of 12 months commencing on July 1, 2026.",
    textB: "This lease shall have a term of 36 months commencing on July 1, 2026.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "MATERIAL",
    mockAIResponse: {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning:
        "The lease term was extended from 12 to 36 months, a threefold increase that materially changes the parties' obligations.",
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CASE 10: Empty document vs document with content
  // ──────────────────────────────────────────────────────────────────────────
  {
    label: "empty baseline vs document with content",
    textA: "",
    textB: "This is a new document with substantive content that was previously empty.",
    expectedStage: "AI_COMPARE",
    expectedVerdict: "MATERIAL",
    mockAIResponse: {
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning:
        "Document A was empty; Document B introduces entirely new substantive content — a material addition.",
    },
  },
];
