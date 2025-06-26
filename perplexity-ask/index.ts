#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Definition of the Perplexity Ask Tool.
 * This tool accepts an array of messages and returns a chat completion response
 * from the Perplexity API, with citations appended to the message if provided.
 */
const PERPLEXITY_ASK_TOOL: Tool = {
  name: "perplexity_ask",
  description:
    "Engages in a conversation using the Sonar API. " +
    "Accepts an array of messages (each with a role and content) " +
    "and returns a ask completion response from the Perplexity model.",
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description: "Role of the message (e.g., system, user, assistant)",
            },
            content: {
              type: "string",
              description: "The content of the message",
            },
          },
          required: ["role", "content"],
        },
        description: "Array of conversation messages",
      },
      model: {
        type: "string",
        description:
          "The model to use for the completion. Can be 'sonar' or 'sonar-pro'. Defaults to 'sonar-pro'.",
        enum: ["sonar", "sonar-pro"],
      },
      search_domain_filter: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "A list of domains to limit search results to. Max 10. Add a - at the beginning of the domain string for denylisting.",
      },
    },
    required: ["messages"],
  },
};

/**
 * Definition of the Perplexity Research Tool.
 * This tool performs deep research queries using the Perplexity API.
 */
const PERPLEXITY_RESEARCH_TOOL: Tool = {
  name: "perplexity_research",
  description:
    "Performs deep research using the Perplexity API. " +
    "Accepts an array of messages (each with a role and content) " +
    "and returns a comprehensive research response with citations.",
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description: "Role of the message (e.g., system, user, assistant)",
            },
            content: {
              type: "string",
              description: "The content of the message",
            },
          },
          required: ["role", "content"],
        },
        description: "Array of conversation messages",
      },
      search_domain_filter: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "A list of domains to limit search results to. Max 10. Add a - at the beginning of the domain string for denylisting.",
      },
    },
    required: ["messages"],
  },
};

/**
 * Definition of the Perplexity Reason Tool.
 * This tool performs reasoning queries using the Perplexity API.
 */
const PERPLEXITY_REASON_TOOL: Tool = {
  name: "perplexity_reason",
  description:
    "Performs reasoning tasks using the Perplexity API. " +
    "Accepts an array of messages (each with a role and content) " +
    "and returns a well-reasoned response using the sonar-reasoning-pro model.",
  inputSchema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description: "Role of the message (e.g., system, user, assistant)",
            },
            content: {
              type: "string",
              description: "The content of the message",
            },
          },
          required: ["role", "content"],
        },
        description: "Array of conversation messages",
      },
      model: {
        type: "string",
        description:
          "The model to use for reasoning. Can be 'sonar-reasoning' or 'sonar-reasoning-pro'. Defaults to 'sonar-reasoning-pro'.",
        enum: ["sonar-reasoning", "sonar-reasoning-pro"],
      },
      search_domain_filter: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "A list of domains to limit search results to. Max 10. Add a - at the beginning of the domain string for denylisting.",
      },
    },
    required: ["messages"],
  },
};

// Retrieve the Perplexity API key from environment variables
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is required");
  process.exit(1);
}
const DOMAIN_FILTER_ENV = process.env.PERPLEXITY_SEARCH_DOMAIN_FILTER;

/**
 * Performs a chat completion by sending a request to the Perplexity API.
 * Appends citations to the returned message content if they exist.
 *
 * @param {Array<{ role: string; content: string }>} messages - An array of message objects.
 * @param {string} model - The model to use for the completion.
 * @returns {Promise<string>} The chat completion result with appended citations.
 * @throws Will throw an error if the API request fails.
 */
async function performChatCompletion(
  messages: Array<{ role: string; content: string }>,
  model: string = "sonar-pro",
  search_domain_filter?: string[]
): Promise<string> {
  // Construct the API endpoint URL and request body
  const url = new URL("https://api.perplexity.ai/chat/completions");
  const body: any = {
    model: model, // Model identifier passed as parameter
    messages: messages,
  };

  if (search_domain_filter && search_domain_filter.length > 0) {
    if (search_domain_filter.length > 10) {
      throw new Error("search_domain_filter cannot contain more than 10 domains.");
    }
    body.search_domain_filter = search_domain_filter;
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
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
      errorText = "Unable to parse error response";
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
    messageContent += "\n\nCitations:\n";
    data.citations.forEach((citation: string, index: number) => {
      messageContent += `[${index + 1}] ${citation}\n`;
    });
  }

  return messageContent;
}

// Initialize the server with tool metadata and capabilities
const server = new Server(
  {
    name: "example-servers/perplexity-ask",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Registers a handler for listing available tools.
 * When the client requests a list of tools, this handler returns all available Perplexity tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [PERPLEXITY_ASK_TOOL, PERPLEXITY_RESEARCH_TOOL, PERPLEXITY_REASON_TOOL],
}));

/**
 * Registers a handler for calling a specific tool.
 * Processes requests by validating input and invoking the appropriate tool.
 *
 * @param {object} request - The incoming tool call request.
 * @returns {Promise<object>} The response containing the tool's result or an error.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    if (!args) {
      throw new Error("No arguments provided");
    }

    let search_domain_filter = args.search_domain_filter as (string[] | undefined);

    // Hierarchy: user input > environment variable > default
    if (search_domain_filter === undefined) {
      if (DOMAIN_FILTER_ENV) {
        search_domain_filter = DOMAIN_FILTER_ENV.split(',').map(d => d.trim());
      } else {
        search_domain_filter = [];
      }
    }

    if (search_domain_filter && (!Array.isArray(search_domain_filter) || !search_domain_filter.every(item => typeof item === 'string'))) {
      throw new Error(`Invalid arguments for ${name}: search_domain_filter must be an array of strings`);
    }

    switch (name) {
      case "perplexity_ask": {
        if (!Array.isArray(args.messages)) {
          throw new Error(
            "Invalid arguments for perplexity_ask: 'messages' must be an array"
          );
        }
        const messages = args.messages;
        const model = args.model ?? "sonar-pro";
        if (
          typeof model !== "string" ||
          !["sonar", "sonar-pro"].includes(model)
        ) {
          throw new Error(
            "Invalid model for perplexity_ask. Must be 'sonar' or 'sonar-pro'."
          );
        }
        const result = await performChatCompletion(
          messages,
          model,
          search_domain_filter
        );
        return {
          content: [{ type: "text", text: result }],
          isError: false,
        };
      }
      case "perplexity_research": {
        if (!Array.isArray(args.messages)) {
          throw new Error(
            "Invalid arguments for perplexity_research: 'messages' must be an array"
          );
        }
        // Invoke the chat completion function with the provided messages using the deep research model
        const messages = args.messages;
        const result = await performChatCompletion(
          messages,
          "sonar-deep-research",
          search_domain_filter
        );
        return {
          content: [{ type: "text", text: result }],
          isError: false,
        };
      }
      case "perplexity_reason": {
        if (!Array.isArray(args.messages)) {
          throw new Error(
            "Invalid arguments for perplexity_reason: 'messages' must be an array"
          );
        }
        const messages = args.messages;
        const model = args.model ?? "sonar-reasoning-pro";
        if (
          typeof model !== "string" ||
          !["sonar-reasoning", "sonar-reasoning-pro"].includes(model)
        ) {
          throw new Error(
            "Invalid model for perplexity_reason. Must be 'sonar-reasoning' or 'sonar-reasoning-pro'."
          );
        }
        const result = await performChatCompletion(
          messages,
          model,
          search_domain_filter
        );
        return {
          content: [{ type: "text", text: result }],
          isError: false,
        };
      }
      default:
        // Respond with an error if an unknown tool is requested
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    // Return error details in the response
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Initializes and runs the server using standard I/O for communication.
 * Logs an error and exits if the server fails to start.
 */
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Perplexity MCP Server running on stdio with Ask, Research, and Reason tools");
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

// Start the server and catch any startup errors
runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
