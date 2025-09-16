import { resolve } from "node:path";
import { builtInTools } from "../../tools";
import type { Tool } from "../../types";

/**
 * Load tools dynamically from the tools directory
 */
export async function loadTools(
	toolNames: string[],
	basePath: string,
): Promise<Record<string, Tool>> {
	const tools: Record<string, Tool> = {};
	const errors: string[] = [];

	// Load each tool
	for (const toolName of toolNames) {
		if (toolName in builtInTools) {
			const tool = builtInTools[toolName as keyof typeof builtInTools];
			tools[toolName] = (
				typeof tool === "function" ? tool({ basePath }) : tool
			) as Tool;
			continue;
		}
		try {
			const toolPath = resolve(basePath, `${toolName}`);
			const toolModule = await import(toolPath);

			// Check if tool has a default export
			if (!toolModule.default) {
				errors.push(`Tool '${toolName}' does not have a default export`);
				continue;
			}

			// Validate the tool structure
			const tool =
				typeof toolModule.default === "function"
					? toolModule.default({ basePath })
					: toolModule.default;
			if (
				!tool.name ||
				!tool.description ||
				!tool.parameters ||
				!tool.execute
			) {
				errors.push(
					`Tool '${toolName}' does not have the required structure (name, description, parameters, execute)`,
				);
				continue;
			}

			tools[toolName] = toolModule.default as Tool;
		} catch (error) {
			errors.push(
				`Failed to load tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// If any tools failed to load, throw an error with all failures
	if (errors.length > 0) {
		throw new Error(`Tool loading failed:\n${errors.join("\n")}`);
	}

	return tools;
}
