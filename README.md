# Markdown Agent

This is a simple way to create an AI agent using a local AI. Define an AI agent using a single markdown file and plain English, run it with a single command, and get the result rendered into an HTML file.

It comes with a list of versatile tools, allowing you to load URLs, RSS feeds, and load data from files.

AI calls are handled by [Ollama](https://ollama.com). Settings can be changed using yaml blocks in your agent.

## Installation

Install [Node.js](https://nodejs.org/en) using your favorite method.
Install [Ollama](https://ollama.com) and download a model using their instructions.

```bash
npm install -G mdagent
```

## Basic Example

_see [the examples](./examples) for a more detailed examples_

Create an md file like this:

```md
# System

```yaml
model: gpt-oss:20b

tools:
  - fetchRss
```

You are an editor that finds interesting articles to read. Today is {{CURRENT_DATE}}.

# Find topics

Load yesterday's RSS articles from `https://feeds.arstechnica.com/arstechnica/index`, and find two quirky, unique articles to read. Print their titles and urls.
```

Then run `mdagent`.

```bash
mdagent my-file.md
```

## Creating markdown agents

The most basic markdown agent contains two h1 (#) headers.

The first section must start with # System, and it defines the system prompt, which tells the AI the agent's mission, and how it should behave. The second header is the "user" prompt. It asks the AI to do something. Following headers are run in order, being appended to the output of the previous sections. When the process is complete, a new file will appear in an `output` directory containing the entire conversation as HTML.

## Configuration

The system prompt, and all user prompts take configuration in a yaml block.

```yaml
model: gpt-oss:20b
think: medium

# ollama model options, these particular settings require 16gb of free memory
seed: 42
num_ctx: 65536
num_predict: 16384
top_k: 40
top_p: 0.9

# if your agent needs CLI arguments, configure them here.
# for example `mdagent ./my-markdown.md --date 2025-09-15 --section tech
input:
  - date
  - section

# the tool calls that your agent can call.
# these can be the predefined tool calls or paths relative to the markdown file.
tools:
  - fetchRss
  - fetchUrls
```

## Built in tools

- **fetchUrl** - fetches any url. If it's HTML it will be converted to markdown. Takes parameters for a CSS selector of the content, and CSS selectors to remove.
- **fetchRss** - fetches an RSS feed, optionally filter it to a single day
- **loadFile** - loads the contents of the file into the agent's context. The file must be next to, or in a folder next to, your markdown file.

## Custom tools

To implement custom logic, or even call other models, you can define a custom tool. They have the full power of Node.js. 

A tool consists of 

- a tool name
- a description, telling the AI when it should use the tool
- a schema for input, defined using [zod](https://zod.dev/)
- an execute function, which will be called by the AI.