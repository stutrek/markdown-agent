import { parse } from "yaml";
import {
	type ParsedMarkdownAgent,
	phaseConfigSchema,
	systemConfigSchema,
} from "./types";

/**
 * Extract YAML content from a markdown section
 */
function extractYamlFromSection(content: string): {
	yamlContent: string;
	textContent: string;
} {
	const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);

	if (yamlMatch) {
		// Normalize tabs to spaces for YAML parsing
		const yamlContent = yamlMatch[1].replace(/\t/g, "  ");
		const textContent = content.replace(yamlMatch[0], "").trim();
		return { yamlContent, textContent };
	}

	return { yamlContent: "", textContent: content };
}

/**
 * Parse a markdown agent file into structured data
 */
export function parseMarkdownAgent(
	markdownContent: string,
): ParsedMarkdownAgent {
	const lines = markdownContent.split("\n");
	const sections: Array<{ header: string; content: string }> = [];
	let currentSection: { header: string; content: string } | null = null;

	// Parse sections by looking for # headers
	for (const line of lines) {
		const headerMatch = line.match(/^#\s+(.+)$/);
		if (headerMatch) {
			// Save previous section if exists
			if (currentSection) {
				sections.push(currentSection);
			}
			// Start new section
			currentSection = {
				header: headerMatch[1],
				content: "",
			};
		} else if (currentSection) {
			currentSection.content += line + "\n";
		}
	}

	// Don't forget the last section
	if (currentSection) {
		sections.push(currentSection);
	}

	if (sections.length === 0) {
		throw new Error(
			"No sections found in markdown file. Expected at least a System section.",
		);
	}

	// Find and parse system section
	const systemSection = sections.find((s) => s.header === "System");
	if (!systemSection) {
		throw new Error("No System section found in markdown file.");
	}

	// Extract system YAML and prompt
	const { yamlContent: systemYaml, textContent: systemPrompt } =
		extractYamlFromSection(systemSection.content);

	let systemConfig: any;
	if (systemYaml) {
		try {
			const parsedYaml = parse(systemYaml);
			systemConfig = systemConfigSchema.parse(parsedYaml);
		} catch (error) {
			throw new Error(
				`Invalid YAML in System section: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	} else {
		systemConfig = {};
	}

	// Parse phases (all sections except System)
	const phases = sections
		.filter((s) => s.header !== "System")
		.map((section) => {
			const { yamlContent: phaseYaml, textContent: phaseContent } =
				extractYamlFromSection(section.content);

			let phaseConfig: any;
			if (phaseYaml) {
				try {
					const parsedYaml = parse(phaseYaml);
					phaseConfig = phaseConfigSchema.parse(parsedYaml);
				} catch (error) {
					throw new Error(
						`Invalid YAML in phase '${section.header}': ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

			return {
				name: section.header,
				content: phaseContent.trim(),
				config: phaseConfig,
			};
		});

	return {
		systemPrompt: systemPrompt.trim(),
		systemConfig,
		phases,
	};
}
