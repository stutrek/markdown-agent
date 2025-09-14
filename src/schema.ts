import { z } from "zod";

const DateRegex = /^\d{4}-\d{2}-\d{2}$/;

const FinalSchema = z
	.object({
		date: z.string().regex(DateRegex, "date must be YYYY-MM-DD"),
		source: z.union([z.literal("day-of"), z.literal("current-events")]),
		theme: z
			.string()
			.min(1, "theme required")
			.transform((s) => s.trim()),
		words: z
			.array(z.string().min(1))
			.length(4, "exactly 4 words required")
			.transform((arr) => arr.map((w) => w.trim().toLowerCase()))
			.refine((arr) => arr.every((w) => /^[a-z]+$/.test(w)), {
				message: "words must be lowercase letters only",
			})
			.refine((arr) => new Set(arr).size === arr.length, {
				message: "words must be unique",
			}),
	})
	.passthrough();

export type FinalOutput = z.infer<typeof FinalSchema>;

export function validateFinal(obj: unknown): FinalOutput {
	return FinalSchema.parse(obj);
}
