import type {
	ChatRequest,
	Message,
	Tool as OllamaTool,
	ToolCall,
} from "ollama";
import { Ollama } from "ollama";
import { z } from "zod";
import { saveDebugOutput } from "../outputUtils";
import type { Phase, Tool } from "../types";

export interface ChatRunnerConfig {
	ollamaConfig: any;
	model: string;
	tools: Record<string, Tool>;
	options: any;
	systemPrompt: string;
	templateOptions: Record<string, any>;
	onThinkingChunk: (chunk: string) => void;
	onContentChunk: (chunk: string) => void;
	onToolCall: (toolCall: ToolCall) => void;
	onToolResponse: (response: any) => void;
	onPhaseEnd: (messages: Message[]) => void;
}

export class ChatRunner {
	private messages: Message[] = []; // Complete message history
	private purgedMessages: Message[] = []; // Purged message history for AI context
	private ollamaClient: Ollama;
	private startTime: string;
	private config: ChatRunnerConfig;

	/**
	 * Convert tools with Zod schemas to the format expected by Ollama
	 */
	private convertToolsForOllama(tools: Record<string, Tool>): OllamaTool[] {
		return Object.values(tools).map((tool) => {
			return {
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: z.toJSONSchema(tool.parameters),
				},
			} as OllamaTool;
		});
	}

	/**
	 * Find a tool by its function name
	 */
	private findToolByName(toolName: string): Tool | undefined {
		return Object.values(this.config.tools).find(
			(tool) => tool.name === toolName,
		);
	}

	constructor(config: ChatRunnerConfig) {
		this.config = config;
		this.startTime = new Date().toISOString();
		this.ollamaClient = new Ollama(config.ollamaConfig);
	}

	private replaceTemplateVariables(
		template: string,
		options: Record<string, any>,
	): string {
		let content = template;
		for (const [key, value] of Object.entries(options)) {
			if (value !== undefined && value !== null) {
				content = content.replaceAll(`{{${key}}}`, String(value));
			}
		}

		content = content.replaceAll(
			"{{CURRENT_DATE}}",
			new Date().toISOString().split("T")[0],
		);
		return content;
	}

	private async saveDebugOutput(): Promise<void> {
		await saveDebugOutput(this.startTime, this.messages as any);
	}

	async run(phase: Phase): Promise<Message[]> {
		// Replace template variables in both prompts
		const processedSystemPrompt = this.replaceTemplateVariables(
			this.config.systemPrompt,
			this.config.templateOptions,
		);
		const templatedUserPrompt = this.replaceTemplateVariables(
			phase.prompt,
			this.config.templateOptions,
		);
		const formatPrompt = phase.responseSchema
			? `
--------
Respond in the following format. Respond ONLY with a JSON object, no wrappers or commentary.
${z.toJSONSchema(phase.responseSchema)}`
			: "";

		const processedUserPrompt = `${templatedUserPrompt}\n\n${formatPrompt}`;

		// Track the starting message count to know what's new
		const startMessageCount = this.messages.length;
		const startPurgedMessageCount = this.purgedMessages.length;

		// Add system prompt only if this is the first run
		if (this.messages.length === 0) {
			const systemMessage = {
				role: "system",
				content: processedSystemPrompt,
			};
			this.messages.push(systemMessage);
			this.purgedMessages.push(systemMessage);
		}

		// Add user message
		const userMessage = {
			role: "user",
			content: processedUserPrompt,
		};
		this.messages.push(userMessage);

		this.purgedMessages.push(userMessage);

		await this.saveDebugOutput();

		// Get tool definitions for Ollama, converting Zod schemas to JSON Schema
		const toolDefinitions = this.convertToolsForOllama(this.config.tools);

		let content = "";
		let round = 0;
		const maxRounds = 30; // Prevent infinite loops

		while (round < maxRounds) {
			round++;

			try {
				if (phase.responseSchema) {
					console.log("Response schema:", z.toJSONSchema(phase.responseSchema));
				}
				// Prepare chat options
				const chatOptions: ChatRequest & { stream: true } = {
					model: this.config.model,
					messages: this.purgedMessages,
					tools: toolDefinitions,
					stream: true,
					think: phase.think ?? "medium",
					options: {
						...this.config.options,
						...(phase.options ?? {}),
					},
				};

				// Get response from Ollama
				const response = await this.ollamaClient.chat(chatOptions);

				// Collect the full response and any tool calls
				const toolCalls: ToolCall[] = [];

				for await (const chunk of response) {
					if (chunk.message.thinking) {
						this.config.onThinkingChunk(chunk.message.thinking);
					} else if (chunk.message.content) {
						this.config.onContentChunk(chunk.message.content);
						content += chunk.message.content;
					} else if (chunk.message.tool_calls) {
						toolCalls.push(...chunk.message.tool_calls);

						// Call onToolCall callback for each tool call
						for (const toolCall of chunk.message.tool_calls) {
							this.config.onToolCall(toolCall);
						}
					}
				}

				// Add assistant message with content and/or tool calls
				if (content || toolCalls.length > 0) {
					const assistantMessage: Message = {
						role: "assistant",
						content: content || "",
					};

					if (toolCalls.length > 0) {
						assistantMessage.tool_calls = toolCalls;
					}

					this.messages.push(assistantMessage);
					this.purgedMessages.push(assistantMessage);

					await this.saveDebugOutput();
				}

				// If no tool calls, we're done
				if (toolCalls.length === 0) {
					break;
				}

				// Execute tools for this round
				for (const toolCall of toolCalls) {
					await this.executeToolWithRetry(toolCall);
					await this.saveDebugOutput();
				}
			} catch (error) {
				throw new Error(
					`Ollama chat failed in round ${round}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		if (round >= maxRounds) {
			throw new Error(`Reached maximum tool execution rounds (${maxRounds})`);
		}

		// Apply purging if specified in the phase
		if (phase.purge?.includes("tool-calls")) {
			this.purgeToolCallsFromPhase(startPurgedMessageCount);
		}
		if (phase.purge?.includes("all-tool-calls")) {
			this.purgeAllToolCalls();
		}

		if (phase.purge?.includes("previous-messages")) {
			this.purgedMessages = this.purgedMessages.slice(startPurgedMessageCount);
		}

		// Validate structured response if schema is provided
		if (phase.responseSchema && content) {
			try {
				const parsedContent = JSON.parse(content);
				const validatedContent = phase.responseSchema.parse(parsedContent);

				// Update the last assistant message with validated content
				const lastMessage = this.messages[this.messages.length - 1];
				if (lastMessage && lastMessage.role === "assistant") {
					lastMessage.content = JSON.stringify(validatedContent);
				}

				console.log(`✅ Phase "${phase.name}" response validated successfully`);
			} catch (error) {
				console.warn(
					`⚠️  Phase "${phase.name}" response validation failed:`,
					error,
				);
				console.warn("Raw content:", content);
				// Continue execution even if validation fails
			}
		}

		this.config.onPhaseEnd(this.messages.slice(startMessageCount));

		// Return only the new messages created in this run
		return this.messages.slice(startMessageCount);
	}

	getMessages(): Message[] {
		return this.messages;
	}

	private purgeToolCallsFromPhase(startPurgedMessageCount: number): void {
		// Process each message in the phase, counting backwards to avoid index issues
		for (
			let i = this.purgedMessages.length - 1;
			i >= startPurgedMessageCount;
			i--
		) {
			const message = this.purgedMessages[i];

			// Remove tool response messages entirely from purgedMessages
			if (message.role === "tool") {
				this.purgedMessages.splice(i, 1);
			}
			// Remove tool_calls from assistant messages in purgedMessages
			else if (message.role === "assistant" && message.tool_calls) {
				const { tool_calls: _, ...purgedMessage } = message;
				this.purgedMessages[i] = purgedMessage;
			}
		}
	}
	private purgeAllToolCalls(): void {
		for (let i = this.purgedMessages.length - 1; i >= 0; i--) {
			const message = this.purgedMessages[i];
			if (message.role === "tool") {
				this.purgedMessages.splice(i, 1);
			} else if (message.role === "assistant" && message.tool_calls) {
				const { tool_calls: _, ...purgedMessage } = message;
				this.purgedMessages[i] = purgedMessage;
			}
		}
	}

	/**
	 * Execute a tool call with retry logic (up to 2 retries)
	 */
	private async executeToolWithRetry(toolCall: ToolCall): Promise<void> {
		const maxRetries = 2;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const args = toolCall.function.arguments;
				const tool = this.findToolByName(toolCall.function.name);

				if (!tool || !tool.execute) {
					throw new Error(
						`Unknown tool or missing execute method: ${toolCall.function.name}`,
					);
				}

				const result = await tool.execute(args);

				// Call onToolResponse callback
				this.config.onToolResponse(result);

				// Add tool result to messages for next round
				const toolMessage = {
					role: "tool",
					content: typeof result === "string" ? result : JSON.stringify(result),
					tool_name: toolCall.function.name,
				} as Message;

				this.messages.push(toolMessage);
				this.purgedMessages.push(toolMessage);

				// Success - no need to retry
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// If this is the last attempt, send final error
				if (attempt === maxRetries) {
					const errorMsg = `Tool execution failed after ${maxRetries + 1} attempts: ${lastError.message}`;
					this.config.onToolResponse(errorMsg);

					// Send final error back to AI as tool response
					const errorToolMessage = {
						role: "tool",
						content: `Error: ${errorMsg}`,
						tool_name: toolCall.function.name,
					} as Message;

					this.messages.push(errorToolMessage);
					this.purgedMessages.push(errorToolMessage);
				} else {
					// Send retry request to AI
					const retryMsg = `Tool execution failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Please retry this tool call.`;
					this.config.onToolResponse(retryMsg);

					const retryToolMessage = {
						role: "tool",
						content: `Error: ${retryMsg}`,
						tool_name: toolCall.function.name,
					} as Message;

					this.messages.push(retryToolMessage);
					this.purgedMessages.push(retryToolMessage);
				}
			}
		}
	}
}
