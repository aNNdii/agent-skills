/**
 * flow-next: start the next phase of the /spec → /plan → /build → /review flow in a fresh
 * session or after a compaction, without the user at the keyboard.
 *
 * The agent calls the flow_next_phase tool after the user chose how to continue (an Inbox card
 * or the chat, see pi/references/next-phase.md). Tools cannot replace the session, so the tool only
 * records the request and ends the run; once the agent has settled, the /flow-next command does
 * the switch and sends the next phase's prompt. Same pattern as pi's reload-runtime example.
 *
 * By hand: /flow-next fresh /build <plan path>   or   /flow-next compact /build <plan path>
 * The prompt must be a flow phase with its absolute path (/plan, /build, /review or /flow).
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Mode = "fresh" | "compact";
type Job = { mode: Mode; prompt: string };

const COMMAND = "flow-next";
const COMPACT_INSTRUCTIONS =
	"The next flow phase starts right after this summary and reads spec.md and plan.md from disk. Keep the spec dir path and anything the user said that is not written in those files. Drop tool output and file contents.";
const PHASE_PROMPT = /^\/(plan|build|review|flow)\s+\/\S/;

function parseArgs(args: string): Job | null {
	const match = args.trim().match(/^(fresh|compact)\s+(\S[\s\S]*)$/);
	if (!match || !PHASE_PROMPT.test(match[2].trim())) return null;
	return { mode: match[1] as Mode, prompt: match[2].trim() };
}

export default function (pi: ExtensionAPI) {
	let pending: Job | null = null;
	// Set by session_compact_failed: a compaction the user cancelled must not start the next phase.
	let compactAborted = false;

	pi.on("session_compact_failed", (event) => {
		if (event.aborted) compactAborted = true;
	});

	pi.registerTool({
		name: "flow_next_phase",
		label: "Flow: next phase",
		description:
			"Start the next phase of the /spec → /plan → /build → /review flow once this turn ends: mode fresh opens a fresh session in this terminal and runs prompt there; mode compact compacts this session and then runs prompt. prompt is the next phase's command with its absolute path: /plan <spec.md>, /build <plan.md>, /review <plan.md>, or /flow <spec dir> to resume. Call it once, as the only tool call of the last step of your turn, after writing every answer into spec.md or plan.md, and end your turn.",
		promptSnippet: "Start the next flow phase in a fresh session or after compaction",
		promptGuidelines: [
			"Use flow_next_phase only when the user chose a fresh session or a compaction for the next flow phase, on an Inbox card or in the chat. Never call flow_next_phase on your own initiative.",
		],
		parameters: Type.Object({
			mode: StringEnum(["fresh", "compact"] as const),
			prompt: Type.String({ description: "The next phase's command, e.g. /build /abs/path/plan.md" }),
		}),
		async execute(_toolCallId, params) {
			if (!PHASE_PROMPT.test(params.prompt.trim())) {
				throw new Error("prompt must be /plan, /build, /review or /flow followed by an absolute path");
			}
			if (pending) {
				throw new Error(`flow_next_phase was already called this turn (${pending.prompt}); end your turn`);
			}
			pending = { mode: params.mode, prompt: params.prompt.trim() };
			const what = params.mode === "compact" ? "Compacts this session" : "Opens a fresh session";
			return {
				content: [{ type: "text", text: `${what} when this turn ends, then runs: ${pending.prompt}. End your turn now.` }],
				details: pending,
				terminate: true,
			};
		},
	});

	pi.on("agent_settled", (event, ctx) => {
		if (!pending) return;
		if (event.aborted) {
			if (ctx.hasUI) ctx.ui.notify(`Next phase cancelled: ${pending.prompt}`, "info");
			pending = null;
			return;
		}
		// Runs after every settled handler, while idle, as a command rather than model input.
		pi.sendUserMessage(`/${COMMAND}`, { expandPromptTemplates: true });
	});

	pi.registerCommand(COMMAND, {
		description: "Next flow phase: /flow-next fresh|compact <command>, or run what flow_next_phase scheduled",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const job = args.trim() ? parseArgs(args) : pending;
			pending = null;
			if (!job) {
				if (ctx.hasUI) ctx.ui.notify(`Usage: /${COMMAND} fresh|compact /build <plan path>`, "warning");
				return;
			}
			await ctx.waitForIdle();

			if (job.mode === "compact") {
				if (ctx.hasUI) ctx.ui.notify(`Compacting, then: ${job.prompt}`, "info");
				const run = () => pi.sendUserMessage(job.prompt, { expandPromptTemplates: true });
				compactAborted = false;
				ctx.compact({
					customInstructions: COMPACT_INSTRUCTIONS,
					onComplete: run,
					onError: (error) => {
						// Cancelled by the user or an extension: stop here, the user wanted to halt.
						if (compactAborted || /cancel|abort/i.test(error.message)) {
							if (ctx.hasUI) ctx.ui.notify(`Compaction cancelled. Run ${job.prompt} yourself.`, "warning");
							return;
						}
						// A technical failure only skips the trim; the next phase is what the user waits for.
						if (ctx.hasUI) ctx.ui.notify(`Compaction skipped (${error.message}), continuing`, "warning");
						run();
					},
				});
				return;
			}

			const result = await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
				withSession: async (next) => {
					if (next.hasUI) next.ui.notify(`Fresh session for: ${job.prompt}`, "info");
					await next.sendUserMessage(job.prompt, { expandPromptTemplates: true });
				},
			});
			if (result.cancelled && ctx.hasUI) ctx.ui.notify(`New session cancelled. Run ${job.prompt} yourself.`, "warning");
		},
	});
}
