import OpenAI from "openai";
import type {
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { saveDebugOutput } from "../outputUtils";
import type { Message, Phase, Tool, ToolCall, ToolFactory } from "../types";
import { ensureOllamaModel } from "./ollama-model-manager";
import { replaceTemplateVariables } from "./utils";

export interface ChatRunnerConfig {
	apiConfig: {
		baseURL: string;
		apiKey?: string;
	};
	model: string;
	tools: Record<string, Tool | ToolFactory>;
	options: any;
	systemPrompt: string;
	basePath: string;
	templateOptions: Record<string, any>;
	outputName: string;
	onThinkingChunk: (chunk: string) => void;
	onContentChunk: (chunk: string) => void;
	onToolCall: (toolCall: ToolCall) => void;
	onToolResponse: (response: any) => void;
	onPhaseEnd: (messages: Message[]) => void;
}

export class ChatRunner {
	private messages: Message[] = []; // Complete message history
	private purgedMessages: Message[] = []; // Purged message history for AI context
	private openaiClient: OpenAI;
	private config: ChatRunnerConfig;
	private tools: Tool[] = [];
	private notifiedToolCallIds = new Set<string>();
	startTime: string;

	/**
	 * Convert tools with Zod schemas to the format expected by OpenAI
	 */
	private convertToolsForAPI(tools: Tool[]): ChatCompletionTool[] {
		return Object.values(tools).map((tool) => {
			return {
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: z.toJSONSchema(tool.parameters),
				},
			} as ChatCompletionTool;
		});
	}

	constructor(config: ChatRunnerConfig) {
		this.config = config;
		this.startTime = new Date().toISOString();
		this.openaiClient = new OpenAI({
			baseURL: config.apiConfig.baseURL,
			apiKey: config.apiConfig.apiKey,
		});
		this.tools = Object.values(config.tools).map((tool) => {
			if (typeof tool === "function") {
				tool = tool({ basePath: config.basePath });
			}
			return tool;
		});
	}

	/**
	 * Map options to OpenAI parameters using passthrough approach
	 */
	private mapOptionsToOpenAI(phase: Phase): Record<string, any> {
		const mergedOptions = {
			...this.config.options,
			...(phase.options ?? {}),
		};

		const result: Record<string, any> = {};

		// Map think to reasoning_effort
		const thinkLevel = phase.think ?? mergedOptions.think;
		if (thinkLevel === "low") result.reasoning_effort = "minimal";
		else if (thinkLevel === "medium") result.reasoning_effort = "medium";
		else if (thinkLevel === "high") result.reasoning_effort = "high";

		// Map num_predict to max_tokens (Ollama → OpenAI)
		if (mergedOptions.num_predict && !mergedOptions.max_tokens) {
			result.max_tokens = mergedOptions.num_predict;
		}

		// Pass through all parameters that OpenAI supports
		const openAIParams = [
			"max_tokens",
			"max_completion_tokens",
			"temperature",
			"top_p",
			"seed",
			"frequency_penalty",
			"presence_penalty",
			"logit_bias",
			"logprobs",
			"top_logprobs",
			"n",
			"stop",
			"user",
			"response_format",
		];

		for (const param of openAIParams) {
			if (mergedOptions[param] !== undefined) {
				result[param] = mergedOptions[param];
			}
		}

		// Ollama-specific params are simply not passed (ignored by OpenAI)
		// When using Ollama's OpenAI compat mode, these are handled at model creation time

		return result;
	}

	/**
	 * Check if we're using an Ollama endpoint
	 */
	private isOllamaEndpoint(): boolean {
		const url = this.config.apiConfig.baseURL.toLowerCase();
		return (
			url.includes("localhost:11434") ||
			url.includes("127.0.0.1:11434") ||
			(!url.includes("openai.com") && !url.includes("api.openai.com"))
		);
	}

	/**
	 * Helper methods for tool call notification tracking
	 */
	private hasNotifiedToolCall(id: string): boolean {
		return this.notifiedToolCallIds.has(id);
	}

	private markToolCallNotified(id: string): void {
		this.notifiedToolCallIds.add(id);
	}

	private async saveDebugOutput(): Promise<void> {
		await saveDebugOutput(
			this.config.basePath,
			this.config.outputName,
			this.startTime,
			this.messages as any,
		);
	}

	async run(phase: Phase): Promise<Message[]> {
		// Replace template variables in both prompts
		const processedSystemPrompt = replaceTemplateVariables(
			this.config.systemPrompt,
			this.config.templateOptions,
		);
		const templatedUserPrompt = replaceTemplateVariables(
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
			const systemMessage: Message = {
				role: "system",
				content: processedSystemPrompt,
			};
			this.messages.push(systemMessage);
			this.purgedMessages.push(systemMessage);
		}

		// Add user message
		const userMessage: Message = {
			role: "user",
			content: processedUserPrompt,
		};
		this.messages.push(userMessage);

		this.purgedMessages.push(userMessage);

		// Merge options from config and phase
		const mergedOptions = {
			...this.config.options,
			...(phase.options ?? {}),
		};

		// Handle Ollama-specific model creation with custom parameters
		let modelToUse = this.config.model;
		if (this.isOllamaEndpoint()) {
			modelToUse = await ensureOllamaModel(
				this.config.apiConfig.baseURL,
				this.config.model,
				mergedOptions,
			);
		}

		await this.saveDebugOutput();
		const phaseTools = Object.values(phase.tools ?? {}).map((tool) => {
			if (typeof tool === "function") {
				tool = tool({ basePath: this.config.basePath });
			}
			return tool;
		});

		const tools = phaseTools.length > 0 ? phaseTools : this.tools;

		// Get tool definitions for OpenAI, converting Zod schemas to JSON Schema
		const toolDefinitions = this.convertToolsForAPI(tools);

		let content = "";
		let round = 0;
		const maxRounds = 30; // Prevent infinite loops

		while (round < maxRounds) {
			round++;
			this.notifiedToolCallIds.clear(); // Reset for each round

			try {
				if (phase.responseSchema) {
					console.log("Response schema:", z.toJSONSchema(phase.responseSchema));
				}

				// Create OpenAI streaming request
				const stream = await this.openaiClient.chat.completions.create({
					model: modelToUse,
					messages: this.purgedMessages as ChatCompletionMessageParam[],
					tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
					stream: true,
					stream_options: { include_usage: true },
					...this.mapOptionsToOpenAI(phase),
				});

				// Collect the full response and any tool calls
				const toolCalls: ToolCall[] = [];

				for await (const chunk of stream) {
					const delta = chunk.choices[0]
						?.delta as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
						reasoning?: string;
					};

					// Content streaming
					if (delta?.content) {
						this.config.onContentChunk(delta.content);
						content += delta.content;
					}

					if (delta?.reasoning) {
						this.config.onThinkingChunk(delta.reasoning);
					}

					// Tool call streaming - accumulate fragments
					if (delta?.tool_calls) {
						for (const toolCallDelta of delta.tool_calls) {
							const index = toolCallDelta.index;

							if (!toolCalls[index]) {
								toolCalls[index] = {
									id: "",
									type: "function",
									function: { name: "", arguments: "" },
								};
							}

							if (toolCallDelta.id) toolCalls[index].id = toolCallDelta.id;
							if (toolCallDelta.function?.name)
								toolCalls[index].function.name = toolCallDelta.function.name;
							if (toolCallDelta.function?.arguments)
								toolCalls[index].function.arguments +=
									toolCallDelta.function.arguments;
						}

						// Notify once per tool call
						for (const toolCall of toolCalls) {
							if (toolCall.id && !this.hasNotifiedToolCall(toolCall.id)) {
								this.config.onToolCall(toolCall);
								this.markToolCallNotified(toolCall.id);
							}
						}
					}

					// Usage information
					if (chunk.usage?.completion_tokens_details?.reasoning_tokens) {
						console.log(
							`Reasoning tokens: ${chunk.usage.completion_tokens_details.reasoning_tokens}`,
						);
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
					await this.executeTool(toolCall, tools);
					await this.saveDebugOutput();
				}
			} catch (error) {
				throw new Error(
					`API chat failed in round ${round}: ${error instanceof Error ? error.message : String(error)}`,
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
	private async executeTool(toolCall: ToolCall, tools: Tool[]): Promise<void> {
		const tool = tools.find((tool) => tool.name === toolCall.function.name);
		if (!tool) {
			throw new Error(`Unknown tool: ${toolCall.function.name}`);
		}

		try {
			// Parse tool call arguments (handles malformed JSON)
			const args =
				typeof toolCall.function.arguments === "string"
					? JSON.parse(toolCall.function.arguments)
					: toolCall.function.arguments;

			const result = await tool.execute(args);

			// Call onToolResponse callback
			this.config.onToolResponse(result);

			// Add tool result to messages for next round
			const toolMessage = {
				role: "tool",
				content: typeof result === "string" ? result : JSON.stringify(result),
				tool_call_id: toolCall.id,
				name: toolCall.function.name,
			} as Message;

			this.messages.push(toolMessage);
			this.purgedMessages.push(toolMessage);

			// Success - no need to retry
			return;
		} catch (error) {
			// Send retry request to AI
			const retryMsg = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}. Please retry this tool call with corrected parameters.`;
			this.config.onToolResponse(retryMsg);

			const retryToolMessage = {
				role: "tool",
				content: `Error: ${retryMsg}`,
				tool_call_id: toolCall.id,
				name: toolCall.function.name,
			} as Message;

			this.messages.push(retryToolMessage);
			this.purgedMessages.push(retryToolMessage);
		}
	}
}
