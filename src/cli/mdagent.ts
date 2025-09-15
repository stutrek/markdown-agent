#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { ChatRunner, type ChatRunnerConfig } from "../agents/ChatRunner";
import { createMarkdownAgent } from "../agents/markdown/converter";
import { runMultiPhase } from "../agents/multi-phase";

const verboseEventListeners = (): Pick<
	ChatRunnerConfig,
	| "onThinkingChunk"
	| "onContentChunk"
	| "onToolCall"
	| "onToolResponse"
	| "onPhaseEnd"
> => {
	let currentChunkType: "thinking" | "content" | null = null;

	const writeChunk = (chunk: string, type: "thinking" | "content") => {
		// Insert newline when chunk type changes
		if (currentChunkType && currentChunkType !== type) {
			process.stdout.write("\n");
		}
		currentChunkType = type;
		process.stdout.write(chunk);
	};

	return {
		onThinkingChunk: (chunk) => {
			writeChunk(`\x1b[90m${chunk}\x1b[0m`, "thinking");
		},
		onContentChunk: (chunk) => {
			writeChunk(chunk, "content");
		},
		onToolCall: (toolCall) => {
			currentChunkType = null;
			console.log(
				`\n\x1b[34m🔧 ${toolCall.function.name}(${JSON.stringify(toolCall.function.arguments)})\x1b[0m`,
			);
		},
		onToolResponse: (response) => {
			currentChunkType = null;
			if (typeof response === "string") {
				const preview =
					response.length > 2000
						? response.substring(0, 2000) + "..."
						: response;
				console.log(`\x1b[32m✅ ${preview}\x1b[0m\n`);
			} else {
				console.log(`\x1b[32m✅ ${JSON.stringify(response, null, 2)}\x1b[0m\n`);
			}
		},
		onPhaseEnd: (messages) => {
			currentChunkType = null;
			console.log(`\n✅ Phase completed with ${messages.length} messages`);
		},
	};
};

/**
 * Parse command line arguments and extract template variables
 */
function parseTemplateVariables(args: string[]): Record<string, string> {
	const templateVars: Record<string, string> = {};

	for (let i = 0; i < args.length; i += 2) {
		const key = args[i];
		const value = args[i + 1];

		if (!key || !value) {
			throw new Error(`Invalid argument pair: ${key} ${value || ""}`);
		}

		// Remove leading dashes from key
		const cleanKey = key.replace(/^--?/, "");
		templateVars[cleanKey] = value;
	}

	return templateVars;
}

/**
 * Main CLI function
 */
async function main() {
	// Parse arguments manually to handle dynamic template variables
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log(
			"Usage: mdagent <markdown-file> [--verbose] [template-variables...]",
		);
		console.log("");
		console.log("Examples:");
		console.log('  mdagent ./my-agent.md --topic "AI" --date "2025-01-15"');
		console.log(
			"  mdagent ./my-agent.md --verbose --section tech --priority high",
		);
		console.log("");
		console.log("Template variables are passed as key-value pairs:");
		console.log("  --key value  or  key value");
		return;
	}

	const markdownFile = args[0];
	const remainingArgs = args.slice(1);

	// Check for verbose flag
	const verboseIndex = remainingArgs.indexOf("--verbose");
	const verbose = verboseIndex !== -1;
	if (verbose) {
		remainingArgs.splice(verboseIndex, 1);
	}

	try {
		// Resolve the markdown file path
		const markdownPath = resolve(process.cwd(), markdownFile);

		if (verbose) {
			console.log("📄 Loading markdown file:", markdownPath);
		}

		// Parse remaining arguments as template variables
		const templateVars = parseTemplateVariables(remainingArgs);

		if (verbose) {
			console.log("🔧 Template variables:", templateVars);
		}

		// Create the markdown agent
		const agent = await createMarkdownAgent(markdownPath);

		if (verbose) {
			console.log(`🤖 Created agent with ${agent.phases.length} phases`);
			console.log("🛠️  Available tools:", Object.keys(agent.tools));
		}

		// Create the chat runner
		const runner = new ChatRunner({
			ollamaConfig: {
				host: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
			},
			model: agent.systemConfig.model ?? "gpt-oss:20b",
			tools: agent.tools,
			options: agent.systemConfig,
			templateOptions: templateVars,
			systemPrompt: agent.systemPrompt,
			basePath: dirname(markdownPath),
			...verboseEventListeners(),
		});

		// Run all phases
		const messages = await runMultiPhase(runner, agent.phases);

		// Print the final response
		const finalMessage = messages.at(-1);
		if (finalMessage?.content) {
			console.log("\n📋 Final Response:");
			console.log("─".repeat(50));
			console.log(finalMessage.content);
			console.log("─".repeat(50));
		} else {
			console.log("\n✅ Agent completed successfully");
		}
	} catch (error) {
		console.error("\n❌ Error:");
		throw error;
	}
}

// Run the CLI
if (require.main === module) {
	main().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}

export { main as runMdagent };
