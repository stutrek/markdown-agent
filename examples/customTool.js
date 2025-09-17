import { z } from "zod";
// if using typescript, use the `tool` function to verify types.
// import { tool } from "mdagent/dist/types.js";
// export const customTool = tool({
//   name: "customTool",
//   description: "A custom tool",
//   parameters: z.object({
//     name: z.string(),
//   }),
//   async execute(input) {
//     return `Hello, ${input.name}!`;
//   },
// });
// export default customTool;

export const customTool = {
	name: "customTool",
	description: "A custom tool",
	parameters: z.object({
		name: z.string(),
	}),
	async execute(input) {
		return `Hello, ${input.name}!`;
	},
};

export default customTool;
