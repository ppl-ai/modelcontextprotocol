#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
	readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const { name, version } = pkg;

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
	throw new Error('PERPLEXITY_API_KEY environment variable is required');
}

class PerplexityAskServer {
	private server: Server;
	private apiUrl = 'https://api.perplexity.ai/chat/completions';
	private model = 'sonar-pro';

	constructor() {
		this.server = new Server(
			{
				name,
				version,
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);

		this.setupHandlers();

		this.server.onerror = (error: Error) =>
			console.error('[MCP Error]', error);
	}

	private setupHandlers() {
		this.server.setRequestHandler(
			ListToolsRequestSchema,
			async () => ({
				tools: [
					{
						name: 'perplexity_ask',
						description:
							'Engages in a conversation using the Perplexity Sonar API. ' +
							'Accepts an array of messages (each with a role and content) ' +
							'and returns a chat completion response from the Perplexity model.',
						inputSchema: {
							type: 'object',
							properties: {
								messages: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											role: {
												type: 'string',
												description: 'Role of the message (e.g., system, user, assistant)',
											},
											content: {
												type: 'string',
												description: 'The content of the message',
											},
										},
										required: ['role', 'content'],
									},
									description: 'Array of conversation messages',
								},
							},
							required: ['messages'],
						},
					},
				],
			}),
		);

		this.server.setRequestHandler(
			CallToolRequestSchema,
			async (request) => {
				if (request.params.name !== 'perplexity_ask') {
					throw new McpError(
						ErrorCode.MethodNotFound,
						`Unknown tool: ${request.params.name}`,
					);
				}

				const args = request.params.arguments as Record<
					string,
					unknown
				>;

				if (
					!args ||
					!args.messages ||
					!Array.isArray(args.messages)
				) {
					throw new McpError(
						ErrorCode.InvalidParams,
						'Invalid arguments for perplexity_ask: "messages" must be an array',
					);
				}

				try {
					const result = await this.performChatCompletion(args.messages);
					return {
						content: [{ type: 'text', text: result }],
						isError: false,
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					throw new McpError(
						ErrorCode.InternalError,
						`Error processing request: ${errorMessage}`,
					);
				}
			},
		);
	}

	/**
	 * Performs a chat completion by sending a request to the Perplexity API.
	 * Appends citations to the returned message content if they exist.
	 *
	 * @param {Array<{ role: string; content: string }>} messages - An array of message objects.
	 * @returns {Promise<string>} The chat completion result with appended citations.
	 * @throws Will throw an error if the API request fails.
	 */
	private async performChatCompletion(
		messages: Array<{ role: string; content: string }>
	): Promise<string> {
		// Construct the API endpoint URL and request body
		const url = new URL(this.apiUrl);
		const body = {
			model: this.model,
			messages: messages,
		};

		let response;
		try {
			response = await fetch(url.toString(), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
				},
				body: JSON.stringify(body),
			});
		} catch (error) {
			throw new Error(`Network error while calling Perplexity API: ${error}`);
		}

		// Check for non-successful HTTP status
		if (!response.ok) {
			let errorText;
			try {
				errorText = await response.text();
			} catch (parseError) {
				errorText = 'Unable to parse error response';
			}
			throw new Error(
				`Perplexity API error: ${response.status} ${response.statusText}\n${errorText}`
			);
		}

		// Attempt to parse the JSON response from the API
		let data;
		try {
			data = await response.json();
		} catch (jsonError) {
			throw new Error(`Failed to parse JSON response from Perplexity API: ${jsonError}`);
		}

		// Directly retrieve the main message content from the response 
		let messageContent = data.choices[0].message.content;

		// If citations are provided, append them to the message content
		if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
			messageContent += '\n\nCitations:\n';
			data.citations.forEach((citation: string, index: number) => {
				messageContent += `[${index + 1}] ${citation}\n`;
			});
		}

		return messageContent;
	}

	public async run() {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		console.error('Perplexity Ask MCP Server running on stdio');
	}
}

const server = new PerplexityAskServer();
server.run().catch(console.error);
