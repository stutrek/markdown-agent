import crypto from "crypto";
import { Ollama } from "ollama";

interface OllamaParameters {
	num_ctx?: number;
	num_predict?: number;
	top_k?: number;
	repeat_penalty?: number;
	repeat_last_n?: number;
	tfs_z?: number;
	mirostat?: number;
	mirostat_tau?: number;
	mirostat_eta?: number;
	num_thread?: number;
	num_gpu?: number;
	num_gqa?: number;
	num_batch?: number;
	num_keep?: number;
	[key: string]: unknown;
}

/**
 * Extract Ollama-specific parameters from options
 */
function extractOllamaParams(options: Record<string, any>): OllamaParameters {
	const ollamaKeys: (keyof OllamaParameters)[] = [
		"num_ctx",
		"num_predict",
		"top_k",
		"repeat_penalty",
		"repeat_last_n",
		"tfs_z",
		"mirostat",
		"mirostat_tau",
		"mirostat_eta",
		"num_thread",
		"num_gpu",
		"num_gqa",
		"num_batch",
		"num_keep",
	];

	const params: OllamaParameters = {};
	for (const key of ollamaKeys) {
		if (options[key] !== undefined) {
			params[key] = options[key];
		}
	}

	return params;
}

/**
 * Generate deterministic model name based on base model and parameters
 * Uses hash of parameters to keep names manageable
 */
function getModelName(baseModel: string, params: OllamaParameters): string {
	if (Object.keys(params).length === 0) return baseModel;

	// Create a stable hash of the parameters
	const paramString = JSON.stringify(params, Object.keys(params).sort());
	const hash = crypto
		.createHash("md5")
		.update(paramString)
		.digest("hex")
		.substring(0, 8);

	return `${baseModel}-custom-${hash}`;
}

/**
 * Ensure an Ollama model exists with the specified parameters.
 * Creates it if necessary. Returns the model name to use.
 */
export async function ensureOllamaModel(
	baseURL: string,
	baseModel: string,
	options: Record<string, any>,
): Promise<string> {
	const ollamaParams = extractOllamaParams(options);

	// If no Ollama-specific parameters, use base model as-is
	if (Object.keys(ollamaParams).length === 0) {
		return baseModel;
	}

	const ollamaClient = new Ollama({ host: baseURL.replace("/v1", "") });
	const targetModelName = getModelName(baseModel, ollamaParams);

	try {
		// Check if model already exists
		await ollamaClient.show({ model: targetModelName });
		console.log(`✓ Using existing model: ${targetModelName}`);
		return targetModelName;
	} catch {
		// Model doesn't exist, create it
		const paramsList = Object.entries(ollamaParams)
			.map(([k, v]) => `${k}=${v}`)
			.join(", ");
		console.log(`Creating model ${targetModelName} with ${paramsList}...`);

		try {
			await ollamaClient.create({
				model: targetModelName,
				from: baseModel,
				parameters: ollamaParams,
				stream: false,
			});

			console.log(`✓ Created model: ${targetModelName}`);
			return targetModelName;
		} catch (createError) {
			console.error(`Failed to create model ${targetModelName}:`, createError);
			console.warn(`Falling back to base model: ${baseModel}`);
			return baseModel;
		}
	}
}
