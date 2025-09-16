import { z } from "zod";
import { tool } from "../src/types";

export const customTool = tool({
	name: "customTool",
	description: "A custom tool",
	parameters: z.object({
		name: z.string(),
	}),
	async execute(input) {
		return `Hello, ${input.name}!`;
	},
});

export default customTool;
