// The agent loop: model writes code → sandbox runs it → real output returns →
// on failure the error is fed back (bounded retries) → model explains.
//
// The model only ever *describes* results it has been handed. The explanation
// prompt contains the actual stdout/stderr; it is told not to invent numbers.

import type { ChatMessage, Llm } from "./llm.js"
import type { EventCallback } from "./events.js"
import type { ExecResult, Sandbox } from "./providers/types.js"

export const MAX_ATTEMPTS = 3
const MAX_FEEDBACK_CHARS = 2000

const SYSTEM = `You are a data analyst agent. You answer questions by writing Python 3 that is executed in an isolated sandbox with pandas, numpy and matplotlib installed. There is no network and no pip.
Rules:
- Reply with ONE fenced \`\`\`python block and nothing else.
- If the user supplied data it is at /work/data.csv. Load it with pandas.
- Print every number you need to stdout. Keep stdout under 40 lines.
- For a chart: use matplotlib (it is already in non-interactive mode), a clear title and labelled axes, then save it with plt.savefig("/work/out/chart.png", dpi=110, bbox_inches="tight"). The directory exists. Do not call plt.show().
- To hand back a table, write it to /work/out/result.csv.
- /work/out is the only place to write files. Never read anything outside /work.`

export function extractCode(reply: string): string | null {
  const m = reply.match(/```(?:python|py)?\s*\n([\s\S]*?)```/i)
  const code = (m ? m[1] : null)?.trim()
  return code ? code : null
}

export function clip(s: string, max = MAX_FEEDBACK_CHARS): string {
  return s.length <= max ? s : s.slice(0, max) + `\n…[${s.length - max} more chars truncated]`
}

export function failed(r: ExecResult): boolean {
  return r.timedOut || r.exitCode !== 0
}

/** Runs first inside the sandbox: ensures the output directory exists. */
export const PRELUDE = 'import os\nos.makedirs("/work/out", exist_ok=True)\n'

export interface AgentResult {
  succeeded: boolean
  attempts: number
  lastResult: ExecResult | null
  lastCode: string | null
}

export async function runAgent(opts: {
  task: string
  csvHead?: string
  llm: Llm
  sandbox: Sandbox
  onEvent: EventCallback
  signal?: AbortSignal
}): Promise<AgentResult> {
  const { task, csvHead, llm, sandbox, onEvent, signal } = opts
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: csvHead ? `Task: ${task}\n\nA CSV is at /work/data.csv. First lines:\n${csvHead}` : `Task: ${task}`,
    },
  ]

  let last: ExecResult | null = null
  let lastCode: string | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) break
    const reply = await llm(messages, signal)
    const code = extractCode(reply)
    if (!code) {
      onEvent({ type: "retry", attempt, reason: "The model did not return a code block." })
      messages.push(
        { role: "assistant", content: reply },
        { role: "user", content: "Reply with one ```python block only." },
      )
      continue
    }
    lastCode = code
    onEvent({ type: "writing", attempt, code })
    onEvent({ type: "running", attempt })
    last = await sandbox.exec(PRELUDE + code)
    onEvent({ type: "result", attempt, result: last })

    if (!failed(last)) return { succeeded: true, attempts: attempt, lastResult: last, lastCode }

    const reason = last.timedOut ? "Execution timed out." : `Exit code ${last.exitCode}.`
    if (attempt < MAX_ATTEMPTS) {
      onEvent({ type: "retry", attempt, reason })
      messages.push(
        { role: "assistant", content: reply },
        {
          role: "user",
          content: `That failed. ${reason}\nstderr:\n${clip(last.stderr)}\nstdout:\n${clip(last.stdout)}\nFix it. Reply with one \`\`\`python block.`,
        },
      )
    }
  }
  return { succeeded: false, attempts: MAX_ATTEMPTS, lastResult: last, lastCode }
}

export async function explain(
  llm: Llm,
  task: string,
  r: ExecResult | null,
  succeeded: boolean,
  artifactNames: string[],
  signal?: AbortSignal,
): Promise<string> {
  const evidence = r
    ? `exit code: ${r.exitCode}${r.timedOut ? " (timed out)" : ""}\nstdout:\n${clip(r.stdout)}\nstderr:\n${clip(r.stderr)}\nfiles produced: ${artifactNames.join(", ") || "none"}`
    : "(no execution happened)"
  return llm(
    [
      {
        role: "system",
        content:
          "You explain the result of a sandboxed program run to a business user in 2-5 sentences. Use ONLY numbers present in the output below. If a chart was produced, refer to it ('the chart below') but do not describe details you cannot see. If the run failed, say so plainly and what went wrong. Never invent figures.",
      },
      { role: "user", content: `Task: ${task}\nRun ${succeeded ? "succeeded" : "FAILED"}.\n${evidence}` },
    ],
    signal,
  )
}
