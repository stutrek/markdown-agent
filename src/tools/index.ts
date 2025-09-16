import { fetchRss } from "./fetchRss";
import { fetchUrls } from "./fetchUrls";
import { loadFile } from "./loadFile";

export const builtInTools = {
	fetchUrls,
	fetchRss,
	loadFile,
} as const;
