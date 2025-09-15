#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { renderHtml } from "./src/runner/html/renderer";

/**
 * Find the most recent debug output file
 */
function findMostRecentDebugFile() {
	const debugDir = path.join(__dirname, "debug-output");

	if (!fs.existsSync(debugDir)) {
		throw new Error("debug-output directory not found");
	}

	const files = fs
		.readdirSync(debugDir)
		.filter((file) => file.endsWith(".json"))
		.map((file) => ({
			name: file,
			path: path.join(debugDir, file),
			mtime: fs.statSync(path.join(debugDir, file)).mtime,
		}))
		.sort((a, b) => b.mtime.valueOf() - a.mtime.valueOf());

	if (files.length === 0) {
		throw new Error("No debug output files found");
	}

	return files[0];
}

/**
 * Load and parse debug output file
 */
function loadDebugOutput(filePath: string) {
	const content = fs.readFileSync(filePath, "utf8");
	const data = JSON.parse(content);

	if (!data.messages || !Array.isArray(data.messages)) {
		throw new Error("Invalid debug output format: missing messages array");
	}

	return data.messages;
}

/**
 * Render messages to HTML and save to file
 */
function renderAndSave(messages: any[], outputPath: string) {
	try {
		const html = renderHtml(messages);
		fs.writeFileSync(outputPath, html, "utf8");
		console.log(`✅ Rendered HTML saved to: ${outputPath}`);
	} catch (error) {
		console.error("❌ Error rendering HTML:", (error as Error).message);
		throw error;
	}
}

/**
 * Main function
 */
function main() {
	try {
		console.log("🔍 Finding most recent debug output file...");
		const debugFile = findMostRecentDebugFile();
		console.log(`📄 Found: ${debugFile.name}`);

		console.log("📖 Loading debug output...");
		const messages = loadDebugOutput(debugFile.path);
		console.log(`💬 Found ${messages.length} messages`);

		// Generate output filename
		const baseName = debugFile.name.replace(".json", "");
		const outputPath = path.join(
			path.dirname(debugFile.path),
			`${baseName}.html`,
		);

		console.log("🎨 Rendering HTML...");
		renderAndSave(messages, outputPath);

		console.log("✨ Done!");
	} catch (error) {
		console.error("❌ Error:", (error as Error).message);
		process.exit(1);
	}
}

// Run the script
if (require.main === module) {
	main();
}

export { findMostRecentDebugFile, loadDebugOutput, renderAndSave };
