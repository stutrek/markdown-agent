# Markdown Agent

**Markdown Agent** is a simple way to create and run AI agents using plain Markdown files. You write your agent’s behavior in everyday English (with some optional configuration in YAML), run it from the command line, and the results are saved as an HTML file.  

It comes with a set of built-in tools for fetching URLs, reading RSS feeds, and loading local files. You can also extend it with your own tools in Node.js.

AI calls are handled by [Ollama](https://ollama.com). Models and settings are controlled via YAML blocks in your Markdown agent.

## Installation

1. Install [Node.js](https://nodejs.org/en) (use any method you prefer).  
2. Install [Ollama](https://ollama.com) and download at least one model (follow their instructions).  
3. Install Markdown Agent globally:  

```bash
npm install -g mdagent
```

## Quick Start Example

Create a file called `my-agent.md`:

```md
# System

```yaml
model: gpt-oss:20b
tools:
  - fetchRss
\``` <-- remove the backslash

You are an editor that finds interesting articles to read. Today is {{CURRENT_DATE}}.

# Find topics

Load yesterday's RSS articles from `https://feeds.arstechnica.com/arstechnica/index` and pick two quirky, unique articles. Print their titles and URLs.
```

Run the agent:

```bash
mdagent my-agent.md
```

This will create a new HTML file in the `output` directory containing the full conversation and results.

> 💡 See [examples](./examples) for more complete samples.

## Writing Markdown Agents

A Markdown agent is just a Markdown file with sections. The two main sections are:

1. **System section** (`# System`) – sets the agent’s role, model, and configuration.  
2. **User sections** (`# Something`) – instructions for the agent, written in plain English.  

Each additional `# Header` is run in order, with the output of one section passed into the next. When finished, the full run is saved as an HTML file in the `output` directory.

## Configuration

Configuration is written inside YAML blocks at the top of a section. For example:

```yaml
model: gpt-oss:20b
think: medium

# Advanced Ollama options (example: requires 16GB free memory)
seed: 42
num_ctx: 65536
num_predict: 16384
top_k: 40
top_p: 0.9

# Pass arguments to your agent from the CLI
# Example: mdagent my-agent.md --date 2025-09-15 --section tech
input:
  - date
  - section

# Tools available to this agent
tools:
  - fetchRss
  - fetchUrls
  - loadFile
```

## Built-in Tools

- **fetchUrls** – fetches one or more webpages. Converts HTML to Markdown. Supports options for selecting which parts to keep or remove with CSS selectors.  
- **fetchRss** – fetches an RSS feed, with optional filtering by date.  
- **loadFile** – loads the content of a local file into the agent’s context. Files must be in the same directory (or a sibling folder) as your Markdown file.  

## Custom Tools

You can extend Markdown Agent with your own tools in Node.js. A custom tool has:

- **A name** – how the agent refers to it.  
- **A description** – tells the AI when it should use this tool.  
- **An input schema** – defined with [Zod](https://zod.dev/).  
- **An `execute` function** – the code that actually runs when the tool is called.  

This makes it possible to add custom logic, fetch data from APIs, or even call other models.