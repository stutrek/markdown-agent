import { z } from "zod";

// Flexible model options schema supporting both Ollama and OpenAI
const modelOptionsSchema = z
	.object({
		// Core model parameter
		model: z.string().optional(),

		// Thinking/reasoning (custom, mapped to reasoning_effort for OpenAI)
		think: z.enum(["low", "medium", "high"]).optional(),

		// Common parameters (both APIs)
		temperature: z.number().optional(),
		top_p: z.number().optional(),
		seed: z.number().optional(),
		stop: z.union([z.string(), z.array(z.string())]).optional(),

		// Ollama-specific parameters
		num_ctx: z.number().optional(),
		num_predict: z.number().optional(),
		top_k: z.number().optional(),
		repeat_penalty: z.number().optional(),
		repeat_last_n: z.number().optional(),
		tfs_z: z.number().optional(),
		mirostat: z.number().optional(),
		mirostat_tau: z.number().optional(),
		mirostat_eta: z.number().optional(),
		num_thread: z.number().optional(),
		num_gpu: z.number().optional(),
		num_gqa: z.number().optional(),
		num_batch: z.number().optional(),
		num_keep: z.number().optional(),

		// OpenAI-specific parameters
		max_tokens: z.number().optional(),
		max_completion_tokens: z.number().optional(),
		reasoning_effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
		frequency_penalty: z.number().optional(),
		presence_penalty: z.number().optional(),
		logit_bias: z.record(z.string(), z.number()).optional(),
		logprobs: z.boolean().optional(),
		top_logprobs: z.number().optional(),
		n: z.number().optional(),
		user: z.string().optional(),
		response_format: z
			.object({
				type: z.enum(["text", "json_object"]).optional(),
			})
			.optional(),
	})
	.passthrough(); // Allow any additional undocumented parameters

// System config schema
export const systemConfigSchema = z.object({
	...modelOptionsSchema.shape,
	input: z.array(z.string()).optional(),
	tools: z.array(z.string()).optional(),
});

// Phase config schema (extends system config with phase-specific options)
export const phaseConfigSchema = z.object({
	...modelOptionsSchema.shape,
	input: z.array(z.string()).optional(),
	tools: z.array(z.string()).optional(),
	purge: z
		.union([
			z.array(z.enum(["tool-calls", "all-tool-calls", "previous-messages"])),
			z.enum(["tool-calls", "all-tool-calls", "previous-messages"]),
		])
		.optional(),
	responseSchema: z.string().optional(), // Will be handled separately as it's not a simple config
});

// Parsed markdown structure
export interface ParsedMarkdownAgent {
	systemPrompt: string;
	systemConfig: z.infer<typeof systemConfigSchema>;
	phases: Array<{
		name: string;
		content: string;
		config?: z.infer<typeof phaseConfigSchema>;
	}>;
}
