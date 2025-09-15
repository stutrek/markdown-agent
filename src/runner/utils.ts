export function replaceTemplateVariables(
	template: string,
	options: Record<string, any>,
): string {
	let content = template;
	for (const [key, value] of Object.entries(options)) {
		if (value !== undefined && value !== null) {
			content = content.replaceAll(`{{${key}}}`, String(value));
		}
	}

	content = content.replaceAll(
		"{{CURRENT_DATE}}",
		new Date().toISOString().split("T")[0],
	);
	return content;
}
