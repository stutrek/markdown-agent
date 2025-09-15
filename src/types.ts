import type { Message, Options } from "ollama";
import type z from "zod";

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

// Ollama tool call types
export type OllamaToolCall = {
	function: {
		name: string;
		arguments: string;
	};
};

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
	maxRetries?: number;
	parameters: z.ZodSchema<TInput>;
	execute: (input: TInput) => Promise<TResult>;
};

export function tool<TInput = unknown, TResult = unknown>(t: {
	name: string;
	maxRetries?: number;
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
	options?: Partial<Options>;
	responseSchema?: z.ZodSchema<unknown>;
	tools?: Record<string, Tool | ToolFactory>;
}
