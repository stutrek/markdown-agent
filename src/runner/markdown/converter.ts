import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { z } from "zod";
import { builtInTools } from "../../tools";
import type { Phase, Tool } from "../../types";
import { parseMarkdownAgent } from "./parser";
import { loadTools } from "./toolLoader";
import type { systemConfigSchema } from "./types";

/**
 * Create an agent from a markdown file
 */
export async function createMarkdownAgent(markdownPath: string): Promise<{
	phases: Phase[];
	tools: Record<string, Tool>;
	systemPrompt: string;
	systemConfig: z.infer<typeof systemConfigSchema>;
}> {
	const baseDir = dirname(markdownPath);
	// Read and parse the markdown file
	let markdownContent: string;
	try {
		markdownContent = readFileSync(resolve(markdownPath), "utf8");
	} catch (error) {
		throw new Error(
			`Failed to read markdown file '${markdownPath}': ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const parsed = parseMarkdownAgent(markdownContent);

	// Load system tools if specified
	let systemTools: Record<string, Tool> = {};
	if (parsed.systemConfig.tools && parsed.systemConfig.tools.length > 0) {
		try {
			systemTools = await loadTools(parsed.systemConfig.tools, baseDir);
		} catch (error) {
			throw new Error(
				`Failed to load system tools, available tools: ${Object.keys(builtInTools).join(", ")}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Convert parsed phases to Phase[] format
	const phases: Phase[] = await Promise.all(
		parsed.phases.map(async (phase) => {
			const phaseConfig: Partial<Phase> = {
				name: phase.name,
				prompt: phase.content,
			};

			// Load phase-specific tools if specified
			let phaseTools: Record<string, Tool> = {};
			if (phase.config?.tools && phase.config.tools.length > 0) {
				try {
					phaseTools = await loadTools(phase.config.tools, baseDir);
				} catch (error) {
					throw new Error(
						`Failed to load tools for phase '${phase.name}': ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

			// Combine system tools with phase tools (phase tools override system tools)
			const combinedTools = { ...systemTools, ...phaseTools };

			// Apply phase-specific config overrides
			if (phase.config) {
				const { think, purge, responseSchema, ...options } = phase.config;
				if (think) {
					phaseConfig.think = think;
				}
				if (purge) {
					// Handle both string and array formats for purge
					const purgeArray = Array.isArray(purge) ? purge : [purge];
					phaseConfig.purge = purgeArray as readonly (
						| "tool-calls"
						| "all-tool-calls"
						| "previous-messages"
					)[];
				}
				if (responseSchema) {
					// For now, we'll handle response schemas as strings
					// This could be extended to parse and validate schemas
					console.warn(
						`Response schema '${responseSchema}' in phase '${phase.name}' is not yet supported`,
					);
				}

				phaseConfig.options = options;
			}

			// Add tools to phase config if any tools are available
			if (Object.keys(combinedTools).length > 0) {
				phaseConfig.tools = combinedTools;
			}

			return phaseConfig as Phase;
		}),
	);

	return {
		phases,
		tools: systemTools,
		systemPrompt: parsed.systemPrompt,
		systemConfig: parsed.systemConfig,
	};
}
