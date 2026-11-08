// The verifier pass: a second, independent model call that judges whether the
// code that ran actually answered the task. The explainer describes output; the
// verifier decides if the output is a real answer. Deterministic grounding
// (grounding.ts) already polices figures in the prose — this polices meaning.
//
// Operators can point VULTR_INFERENCE_VERIFY_MODEL at a different model family
// so the checker is not the author. Any verifier failure degrades to
// "uncertain" — never a silent pass.

import { clip } from "./agent.js"
import type { Llm } from "./llm.js"
import type { ExecResult } from "./providers/types.js"

export type Verdict = "pass" | "fail" | "uncertain"

export interface Verification {
  verdict: Verdict
  reason: string
}

export const VERIFY_SYSTEM = `You are an independent verifier. You did not write the code and you do not trust it.
Given the user's task, the program that ran, and its REAL output, decide whether the output actually answers the task.
Reply with exactly this format:
VERDICT: PASS | FAIL | UNCERTAIN
then ONE sentence of reason.
- PASS: the output contains the result the task asked for.
- FAIL: the program ran but produced the wrong thing, answered a different question, or omitted what was asked.
- UNCERTAIN: the output is too thin or ambiguous to judge.
Judge only what the output shows. Do not reward effort, style, or plausible-looking code.`

const VERDICT_RE = /verdict\s*:\s*(pass|fail|uncertain)/i

export function parseVerdict(text: string): Verification {
  const m = text.match(VERDICT_RE)
  const verdict = (m?.[1]?.toLowerCase() ?? "uncertain") as Verdict
  const reason = text
    .replace(VERDICT_RE, "")
    .replace(/^[\s:;.\-—]+/, "")
    .trim()
  return { verdict, reason: clip(reason || "no reason given", 280) }
}

export async function verifyRun(
  llm: Llm,
  input: {
    task: string
    code: string | null
    result: ExecResult | null
    artifactNames: string[]
    succeeded: boolean
  },
  signal?: AbortSignal,
): Promise<Verification> {
  if (!input.succeeded || !input.result) {
    return { verdict: "uncertain", reason: "the run failed — there is no successful output to verify" }
  }
  const evidence = [
    `Task: ${input.task}`,
    `Program:\n${clip(input.code ?? "(none)", 3000)}`,
    `exit code: ${input.result.exitCode}${input.result.timedOut ? " (timed out)" : ""}`,
    `stdout:\n${clip(input.result.stdout, 3000)}`,
    input.result.stderr ? `stderr:\n${clip(input.result.stderr, 1000)}` : "",
    `files produced: ${input.artifactNames.join(", ") || "none"}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  try {
    const reply = await llm(
      [
        { role: "system", content: VERIFY_SYSTEM },
        { role: "user", content: evidence },
      ],
      signal,
    )
    return parseVerdict(reply)
  } catch {
    return { verdict: "uncertain", reason: "the verifier could not run — treat the result as unverified" }
  }
}
