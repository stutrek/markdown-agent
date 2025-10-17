// import { saveDebugOutput } from "../outputUtils";
import type { Message, Phase } from "../types";
import type { ChatRunner } from "./ChatRunner";

export type { Phase };

export async function runMultiPhase(
	runner: ChatRunner,
	phases: Phase[],
): Promise<Message[]> {
	for (const phase of phases) {
		await runner.run(phase);
	}

	return runner.getMessages();
}
