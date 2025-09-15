import { load } from "cheerio";
import TurndownService from "turndown";
import { z } from "zod";
import { tool } from "../types";

const turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
});

turndown.remove([
	"style",
	"script",
	"head",
	"header",
	"footer",
	"aside",
	"link",
	"meta",
	"title",
	"img",
	"picture",
]);

export async function fetchUrls(
	urls:
		| string
		| Array<string | { url: string; content?: string; exclude?: string[] }>,
): Promise<string> {
	const urlArray = Array.isArray(urls) ? urls : [urls];
	const results: string[] = [];

	for (let url of urlArray) {
		if (typeof url === "string") {
			url = {
				url,
			};
		}
		try {
			const response = await fetch(url.url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
					"Accept-Language": "en-US,en;q=0.9",
					"Accept-Encoding": "gzip, deflate, br",
					DNT: "1",
					Connection: "keep-alive",
					"Upgrade-Insecure-Requests": "1",
				},
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const contentType = response.headers.get("content-type");
			let text: string;

			if (contentType?.includes("html")) {
				const html = await response.text();
				let content = load(html)("body");
				if (url.content) {
					content = content.find(url.content);
				}

				if (url.exclude) {
					for (const exclude of url.exclude) {
						const exclusions = content.find(exclude);
						exclusions.each((_, exclusion) => {
							content.find(exclusion).remove();
						});
					}
				}

				text = turndown.turndown(content.html() || "");
			} else {
				text = await response.text();
			}

			// Clean and truncate
			text = text.trim();
			results.push("**URL: " + url.url + "**\n" + text);
		} catch (error) {
			return `Failed to fetch URL ${url}: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	return results.join("\n\n---\n\n");
}

// Define Zod schema for fetch URLs tool
const fetchUrlsToolSchema = z.object({
	urls: z
		.array(
			z.object({
				url: z.url("Must be a valid URL"),
				content: z.string("CSS selector for the main content").optional(),
				exclude: z
					.array(z.string("CSS selector for the content to exclude"))
					.optional(),
			}),
		)
		.describe(
			"The URL(s) to fetch and the CSS selectors for the main content and the content to exclude",
		),
});

// Convert to Ollama tool format using Zod schema
export const fetchUrlsTool = tool({
	name: "fetch_urls",
	description: "Fetch one or more URLs and return text content.",
	parameters: fetchUrlsToolSchema,
	async execute(input: z.infer<typeof fetchUrlsToolSchema>): Promise<string> {
		try {
			// Validate input using Zod schema
			const validatedInput = fetchUrlsToolSchema.parse(input);

			const result = await fetchUrls(validatedInput.urls);
			return result;
		} catch (error) {
			throw new Error(
				`URL fetch failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	},
});

export default fetchUrlsTool;
