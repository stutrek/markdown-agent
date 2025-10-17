import type z from "zod";

// Define our own Message type that matches OpenAI's structure
export type Message = {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_calls?: ToolCall[];
	tool_call_id?: string; // For tool messages
	name?: string; // For tool messages (function name)
};

// Define ToolCall type that matches OpenAI's structure
export type ToolCall = {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string; // JSON string, not parsed object
	};
};

// Flexible config type that accepts any parameter
export type ModelOptions = Record<string, any>;

// Augment the base message types with themeMeta
export type TimestampedSystemMessage = Message & {
	role: "system";
	themeMeta?: { timestamp: string };
};

export type TimestampedUserMessage = Message & {
	role: "user";
	themeMeta?: { timestamp: string };
};

export type TimestampedAssistantMessage = Message & {
	role: "assistant";
	themeMeta?: { timestamp: string };
};

export type TimestampedToolMessage = Message & {
	role: "tool";
	themeMeta?: { timestamp: string };
};

// Union type for all timestamped messages
export type TimestampedMessage =
	| TimestampedSystemMessage
	| TimestampedUserMessage
	| TimestampedAssistantMessage
	| TimestampedToolMessage;

// Legacy type alias - use ToolCall instead
export type OllamaToolCall = ToolCall;

export type OllamaToolResult<TInput = any, TResult = any> = {
	toolName: string;
	toolCallId: string;
	input: TInput;
	result?: TResult;
	error?: string;
};

export type PhasePurge = "tool-calls" | "all-tool-calls" | "previous-messages";

export type Tool<TInput = unknown, TResult = unknown> = {
	name: string;
	description: string;
	parameters: z.ZodSchema<TInput>;
	execute: (input: TInput) => Promise<TResult>;
};

export function tool<TInput = unknown, TResult = unknown>(t: {
	name: string;
	description: string;
	parameters: z.ZodSchema<TInput>;
	execute: (input: TInput) => Promise<TResult>;
}): Tool<TInput, TResult> {
	return t;
}

type ToolFactoryConfig = {
	basePath: string;
};

export type ToolFactory<TInput = unknown, TResult = unknown> = (
	props: ToolFactoryConfig,
) => Tool<TInput, TResult>;

export interface Phase<Name extends string = string> {
	name: Name;
	prompt: string;
	purge?: readonly PhasePurge[];
	think?: "low" | "medium" | "high";
	options?: Partial<ModelOptions>;
	responseSchema?: z.ZodSchema<unknown>;
	tools?: Record<string, Tool | ToolFactory>;
}
