import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { tool } from "../types";

export async function fetchRss(
	urls: string | string[],
	date?: Date,
): Promise<string> {
	const urlArray = Array.isArray(urls) ? urls : [urls];
	const allResults: string[] = [];

	for (const url of urlArray) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const xml = await response.text();
			const parser = new XMLParser({
				ignoreAttributes: false,
				attributeNamePrefix: "@_",
			});

			const result = parser.parse(xml);

			// Extract RSS/Atom content
			let items: any[] = [];
			if (result.rss?.channel?.item) {
				items = Array.isArray(result.rss.channel.item)
					? result.rss.channel.item
					: [result.rss.channel.item];
			} else if (result.feed?.entry) {
				items = Array.isArray(result.feed.entry)
					? result.feed.entry
					: [result.feed.entry];
			}

			if (items.length === 0) {
				throw new Error("No RSS/Atom items found");
			}

			// Take first few items and format them
			const recentItems = date
				? items.filter((item) => {
						const pubDate = new Date(item.pubDate || item.published);
						const itemDate = new Date(
							pubDate.getFullYear(),
							pubDate.getMonth(),
							pubDate.getDate(),
						);
						const targetDate = new Date(
							date.getFullYear(),
							date.getMonth(),
							date.getDate(),
						);
						return itemDate.getTime() === targetDate.getTime();
					})
				: items;
			const formatted = recentItems
				.map((item, index) => {
					const title = item.title || item.title || `Item ${index + 1}`;
					const description =
						item.content ||
						item.description ||
						item.summary ||
						"No description";
					return `## [${title}](${item.link})\n${description}\n\n`;
				})
				.join("\n\n---\n\n");

			allResults.push(formatted);
		} catch (error) {
			throw new Error(
				`Failed to fetch RSS ${url}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return allResults.join("\n\n---\n\n");
}

// Define Zod schema for fetch RSS tool
const fetchRssToolSchema = z.object({
	urls: z
		.union([
			z.url("Must be a valid URL"),
			z.array(z.url("Must be a valid URL")),
		])
		.describe("The RSS/Atom URL(s) to fetch"),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
		.describe("A single date to fetch in YYYY-MM-DD format")
		.optional(),
});

export const fetchRssTool = tool({
	name: "fetch_rss",
	description: "Fetch one or more RSS/Atom feeds and return recent items.",
	parameters: fetchRssToolSchema,
	async execute(input) {
		try {
			// Validate input using Zod schema
			const validatedInput = fetchRssToolSchema.parse(input);
			const date = validatedInput.date
				? new Date(validatedInput.date)
				: undefined;

			const result = await fetchRss(validatedInput.urls, date);
			return result;
		} catch (error) {
			throw new Error(
				`RSS fetch failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	},
});
export default fetchRssTool;
