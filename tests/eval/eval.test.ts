/**
 * AI materiality eval runner.
 *
 * Tests the full three-step pipeline (binary hash -> text hash -> AI compare)
 * for each eval case. The DeepSeek API call is mocked — we inject the expected
 * AI response directly and verify the entire pipeline end to end.
 *
 * Pass rate is computed at the end and reported. This eval verifies that the
 * deterministic guardrails (steps 1 and 2) correctly gate the AI call and that
 * the AI response parsing/propagation works correctly.
 */

import { describe, it, expect } from "vitest";
import {
  computeBinaryHash,
  computeTextHash,
  buildComparePrompt,
  parseAIResponse,
} from "@/lib/core";
import { evalCases } from "./eval-cases";
import type { EvalCase } from "./eval-cases";

// ---------------------------------------------------------------------------
// Helper: simulate the full pipeline for a single case
// ---------------------------------------------------------------------------

interface PipelineResult {
  stage: "BINARY_MATCH" | "TEXT_MATCH" | "AI_COMPARE";
  verdict: "IDENTICAL" | "BINARY_DIFF_ONLY" | "MATERIAL" | "NOT_MATERIAL";
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  reasoning: string | null;
  aiPrompt?: { system: string; user: string };
}

function runPipeline(kase: EvalCase): PipelineResult {
  const bufA = Buffer.from(kase.textA, "utf-8");
  const bufB = Buffer.from(kase.textB, "utf-8");

  // Step 1: Binary hash check
  const binaryHashA = computeBinaryHash(bufA);
  const binaryHashB = computeBinaryHash(bufB);

  // NOTE: The mock eval does NOT compute binary hashes from real PDF bytes.
  // It computes them from the text encoded as utf-8 buffers. This is
  // intentional — we are testing the pipeline logic, not the byte identity
  // of PDFs. Binary hashes will match when both text strings are identical
  // and encoded identically.
  if (binaryHashA === binaryHashB) {
    return {
      stage: "BINARY_MATCH",
      verdict: "IDENTICAL",
      confidence: null,
      reasoning: null,
    };
  }

  // Step 2: Text hash check
  const textHashA = computeTextHash(kase.textA);
  const textHashB = computeTextHash(kase.textB);

  if (textHashA === textHashB) {
    return {
      stage: "TEXT_MATCH",
      verdict: "BINARY_DIFF_ONLY",
      confidence: null,
      reasoning: null,
    };
  }

  // Step 3: AI compare (mock the DeepSeek API call)
  const prompt = buildComparePrompt(kase.textA, kase.textB);

  if (!kase.mockAIResponse) {
    throw new Error(
      `Eval case "${kase.label}" expects AI_COMPARE but has no mockAIResponse`,
    );
  }

  const parsed = parseAIResponse(kase.mockAIResponse);

  return {
    stage: "AI_COMPARE",
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    aiPrompt: prompt,
  };
}

// ---------------------------------------------------------------------------
// Eval tests
// ---------------------------------------------------------------------------

describe("AI materiality eval suite", () => {
  let passCount = 0;
  let failCount = 0;
  const failures: string[] = [];

  for (const kase of evalCases) {
    it(kase.label, () => {
      const result = runPipeline(kase);

      // Check stage
      try {
        expect(result.stage).toBe(kase.expectedStage);
      } catch {
        failures.push(
          `${kase.label}: expected stage "${kase.expectedStage}", got "${result.stage}"`,
        );
        failCount++;
        throw new Error(failures[failures.length - 1]);
      }

      // Check verdict
      try {
        expect(result.verdict).toBe(kase.expectedVerdict);
      } catch {
        failures.push(
          `${kase.label}: expected verdict "${kase.expectedVerdict}", got "${result.verdict}"`,
        );
        failCount++;
        throw new Error(failures[failures.length - 1]);
      }

      // For AI_COMPARE stage, verify prompt and AI response propagation
      if (kase.expectedStage === "AI_COMPARE") {
        expect(result.aiPrompt).toBeDefined();
        expect(result.aiPrompt!.system).toContain("document-integrity reviewer");
        expect(result.aiPrompt!.user).toContain("Document A (baseline)");
        expect(result.aiPrompt!.user).toContain("Document B (new version)");
        expect(result.confidence).toBe(kase.mockAIResponse!.confidence);
        expect(result.reasoning).toBe(kase.mockAIResponse!.reasoning);
        expect(result.confidence).not.toBeNull();
        expect(result.reasoning).not.toBeNull();
      } else {
        // Non-AI stages should have null confidence and reasoning
        expect(result.confidence).toBeNull();
        expect(result.reasoning).toBeNull();
      }

      passCount++;
    });
  }

  // Report pass rate after all cases have run
  it("reports eval pass rate", () => {
    const total = passCount + failCount;
    const rate = total > 0 ? ((passCount / total) * 100).toFixed(1) : "0.0";
    console.log(`\n=== AI Eval Pass Rate: ${rate}% (${passCount}/${total}) ===\n`);

    if (failures.length > 0) {
      console.log("Failures:");
      for (const f of failures) {
        console.log(`  - ${f}`);
      }
    }

    expect(passCount).toBe(evalCases.length);
    expect(failCount).toBe(0);
  });
});
