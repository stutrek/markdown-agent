import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TimestampedMessage } from "./types";

// Helper function to ensure directory exists
function ensureDirectoryExists(dirPath: string): void {
	if (!existsSync(dirPath)) {
		try {
			mkdirSync(dirPath, { recursive: true });
		} catch (error) {
			throw new Error(`Failed to create directory ${dirPath}: ${error}`);
		}
	}
}

export async function saveDebugOutput(
	basePath: string,
	outputName: string,
	startTime: string,
	messages: TimestampedMessage[],
): Promise<string> {
	const debugDir = resolve(basePath, "../debug-output");
	ensureDirectoryExists(debugDir);

	const filename = `${outputName}-${startTime.replace(/[:.]/g, "-")}.json`;
	const filepath = resolve(debugDir, filename);

	const debugData = {
		startTime,
		messages,
		metadata: {
			totalMessages: messages.length,
			phases: messages.filter((m) => m.role === "system").length,
			hasThinking: false, // OpenAI doesn't stream thinking
		},
	};

	try {
		writeFileSync(filepath, JSON.stringify(debugData, null, 2), "utf8");
	} catch (error) {
		throw new Error(`Failed to write debug output to ${filepath}: ${error}`);
	}

	return filepath;
}

export async function saveFinalOutput(
	basePath: string,
	outputName: string,
	startTime: string,
	content: string,
): Promise<string> {
	const outputDir = resolve(basePath, "./output");
	ensureDirectoryExists(outputDir);

	const filename = `${outputName}-${startTime.replace(/[:.]/g, "-")}.html`;
	const filepath = resolve(outputDir, filename);

	try {
		writeFileSync(filepath, content, "utf8");
	} catch (error) {
		throw new Error(`Failed to write final output to ${filepath}: ${error}`);
	}

	return filepath;
}
