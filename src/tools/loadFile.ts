import { readFile } from "node:fs/promises";
import { posix, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { type ToolFactory, tool } from "../types";

const parametersSchema = z.object({
	path: z.string(),
});

export const loadFile: ToolFactory<z.infer<typeof parametersSchema>, string> = (
	config,
) =>
	tool({
		name: "load_file",
		maxRetries: 0,
		description: "Load a file from the file system",
		parameters: parametersSchema,
		async execute(input) {
			const { path } = input;

			// Security checks
			const resolvedPath = resolve(config.basePath, path);
			const relativePath = relative(config.basePath, resolvedPath);

			// Check if the file is underneath the current working directory
			// Normalize path separators to forward slashes for consistent checking
			const normalizedRelativePath = relativePath.split(sep).join(posix.sep);
			if (normalizedRelativePath.startsWith("..")) {
				throw new Error(
					`Access denied: File path "${path}" is outside the agent directory`,
				);
			}

			// Check if the file is in a hidden directory
			const pathParts = normalizedRelativePath.split(posix.sep);
			const hasHiddenDirectory = pathParts.some(
				(part) => part.startsWith(".") && part !== ".",
			);

			if (hasHiddenDirectory) {
				throw new Error(
					`Access denied: File path "${path}" contains hidden directories`,
				);
			}

			const file = await readFile(resolvedPath, "utf8");
			return file;
		},
	});

export default loadFile;
