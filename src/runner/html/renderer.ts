import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Handlebars from "handlebars";
import { marked } from "marked";
import type { Message } from "ollama";

const template = readFileSync(resolve(__dirname, "template.hbs"), "utf8");

// Configure marked with GFM
marked.setOptions({
	gfm: true,
	breaks: true,
});

// Register custom Handlebars helpers
Handlebars.registerHelper("isLast", (index: number, length: number) => {
	return index === length - 1;
});

Handlebars.registerHelper("add", (a: number, b: number) => {
	return a + b;
});

Handlebars.registerHelper("getMessageName", (message: Message) => {
	const { role, tool_calls, tool_name } = message;
	switch (role) {
		case "user":
			return `${message.content.length} chars - ${message.content.substring(0, 50)}`;
		case "assistant":
			if (tool_calls && tool_calls.length > 0) {
				const toolNames = tool_calls
					.map(
						(tc) =>
							`${tc.function?.name || "unknown"} - ${JSON.stringify(tc.function?.arguments).substring(0, 50)}`,
					)
					.join(", ");
				return toolNames;
			}
			return `${message.content.length} chars - ${message.content.substring(0, 50)}`;
		case "tool":
			return `${message.content.length} chars - ${tool_name || "unknown"} - ${message.content.substring(0, 50)}`;
		default:
			return "";
	}
});

Handlebars.registerHelper("renderMarkdown", (message: Message) => {
	if (message.tool_calls && message.tool_calls.length > 0) {
		return new Handlebars.SafeString(
			`<pre>${JSON.stringify(message.tool_calls, null, 2)}</pre>`,
		);
	}
	const { content } = message;
	if (!content) return "";
	try {
		const jsonParsed = JSON.parse(content);
		return new Handlebars.SafeString(
			`<pre>${JSON.stringify(jsonParsed, null, 2)}</pre>`,
		);
	} catch {
		// continue
	}

	const html = marked(content);
	return new Handlebars.SafeString(
		typeof html === "string" ? html : html.toString(),
	);
});

const htmlRenderer = Handlebars.compile(template);

export function renderHtml(messages: Message[]): string {
	return htmlRenderer({ messages });
}
