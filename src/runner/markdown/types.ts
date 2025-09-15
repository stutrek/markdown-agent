import { z } from "zod";

// Base Ollama options schema
const ollamaOptionsSchema = z.object({
	model: z.string().optional(),
	think: z.enum(["low", "medium", "high"]).optional(),
	seed: z.number().optional(),
	num_ctx: z.number().optional(),
	num_predict: z.number().optional(),
	top_k: z.number().optional(),
	top_p: z.number().optional(),
});

// System config schema
export const systemConfigSchema = z.object({
	...ollamaOptionsSchema.shape,
	input: z.array(z.string()).optional(),
	tools: z.array(z.string()).optional(),
});

// Phase config schema (extends system config with phase-specific options)
export const phaseConfigSchema = z.object({
	...ollamaOptionsSchema.shape,
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
