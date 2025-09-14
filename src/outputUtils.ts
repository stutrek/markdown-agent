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
	startTime: string,
	messages: TimestampedMessage[],
): Promise<string> {
	const debugDir = resolve(__dirname, "../debug-output");
	ensureDirectoryExists(debugDir);

	const filename = `${startTime.replace(/[:.]/g, "-")}.json`;
	const filepath = resolve(debugDir, filename);

	const debugData = {
		startTime,
		messages,
		metadata: {
			totalMessages: messages.length,
			phases: messages.filter((m) => m.role === "system").length,
			hasThinking: messages.some((m) => !!m.thinking),
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
	date: string,
	agent: string,
	theme: string,
	data: unknown,
): Promise<string> {
	const outputDir = resolve(__dirname, "../output");
	ensureDirectoryExists(outputDir);

	// Sanitize theme for filename
	const sanitizedTheme = theme
		.replace(/[^a-zA-Z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.toLowerCase()
		.substring(0, 50);

	const filename = `${date}-${agent}-${sanitizedTheme}.json`;
	const filepath = resolve(outputDir, filename);

	const outputData = {
		date,
		agent,
		theme,
		data,
		generatedAt: new Date().toISOString(),
	};

	try {
		writeFileSync(filepath, JSON.stringify(outputData, null, 2), "utf8");
	} catch (error) {
		throw new Error(`Failed to write final output to ${filepath}: ${error}`);
	}

	return filepath;
}
