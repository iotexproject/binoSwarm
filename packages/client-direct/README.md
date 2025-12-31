# Direct Client

This package provides a REST API interface for the ElizaOS platform.

## Features

- RESTful API for agent interactions
- File upload support
- Streaming responses
- Two-tier rate limiting for server protection

## Rate Limiting

The Direct Client implements a two-tier rate limiting approach to protect against excessive API usage:

### 1. Per-IP Rate Limiting

These limits are applied to individual clients based on their IP address:

- `/:agentId/message`: Limited to 5 requests per minute per IP
- `/:agentId/message-stream`: Limited to 3 requests per minute per IP

### 2. Global Rate Limiting

Global rate limiting protects the server from distributed high load across multiple clients:

- All routes: Limited to 200 requests per minute across all IPs

### Configuration

Rate limits can be adjusted through environment variables:

| Environment Variable           | Description                                              | Default          |
| ------------------------------ | -------------------------------------------------------- | ---------------- |
| `RATE_LIMIT_MESSAGE_MAX`       | Maximum number of requests to `/message` endpoint        | 5                |
| `RATE_LIMIT_MESSAGE_WINDOW_MS` | Time window in milliseconds for message rate limiting    | 60000 (1 minute) |
| `RATE_LIMIT_STREAM_MAX`        | Maximum number of requests to `/message-stream` endpoint | 3                |
| `RATE_LIMIT_STREAM_WINDOW_MS`  | Time window in milliseconds for stream rate limiting     | 60000 (1 minute) |
| `RATE_LIMIT_GLOBAL_MAX`        | Maximum total requests across all endpoints              | 200              |
| `RATE_LIMIT_GLOBAL_WINDOW_MS`  | Time window in milliseconds for global rate limiting     | 60000 (1 minute) |

### Rate Limit Response

When IP-based rate limits are exceeded, the API returns a 429 response with the following headers:

- `Retry-After`: Seconds until the rate limit resets
- `X-RateLimit-Limit`: Maximum requests allowed in the window
- `X-RateLimit-Remaining`: Remaining requests in the current window
- `X-RateLimit-Reset`: Unix timestamp (in seconds) when the rate limit resets

When global rate limits are exceeded, the API returns a 429 response with:

- `Retry-After`: Seconds until the rate limit resets
- `X-RateLimit-Global-Limit`: Maximum global requests allowed in the window
- `X-RateLimit-Global-Remaining`: Remaining global requests in the current window
- `X-RateLimit-Global-Reset`: Unix timestamp (in seconds) when the global rate limit resets

And the response body:

```json
{
    "error": "Server is experiencing high load. Please try again later.",
    "retryAfter": 45,
    "global": true
}
```

## Endpoints

### GET `/`

Health check endpoint.

**Response:**

```text
Welcome to the DePIN Revolution's Command Center! This RESTful API is your gateway to the future of decentralized infrastructure. Ready to build something legendary? 🚀
```

---

### GET `/hello`

Alternative health check endpoint.

**Response:**

```text
Hey there! You've just accessed the epicenter of the DePIN revolution's neural network! This isn't just any REST API - it's your gateway to the decentralized future! Ready to build something legendary? 🚀
```

---

### GET `/agents`

Retrieve list of available agents.

**Response:**

```json
{
  "agents": [
    {
      "id": "agent-uuid",
      "name": "Agent Name",
      "clients": ["direct", "discord"]
    }
  ]
}
```

**Fields:**

- `id`: Unique agent identifier
- `name`: Agent's character name
- `clients`: Active client connections

---

### POST `/:agentId/message-paid`

**x402-powered endpoint** for sending messages to agents with micropayment support.

This endpoint uses the x402 protocol for blockchain-based micropayments. Requests must be wrapped with x402 payment handling.

**URL Parameters:**

- `agentId`: The target agent's UUID

**Request Body:**

```json
{
  "text": "Your message here",
  "roomId": "unique-room-identifier",
  "userId": "user-identifier"
}
```

**Fields:**

- `text` (required): Message content
- `roomId` (required): Conversation room identifier
- `userId` (required): Sender identifier

**Response:**

Server-Sent Events (SSE) stream. Each event is prefixed with `data:`.

**Usage Example:**

```typescript
import { createWalletClient, http, walletActions } from "viem";
import { iotex } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

// Setup wallet client
const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
const walletClient = createWalletClient({
  chain: iotex,
  transport: http(iotex.rpcUrls.default.http[0]),
  account,
}).extend(walletActions);

// Wrap fetch with x402 payment
const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);

// Make request
const response = await fetchWithPayment(
  "http://AGENT_API_URL/:agentId/message-paid",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Hello, agent!",
      roomId: "unique-room-id",
      userId: Date.now().toString(),
    }),
  }
);

// Process SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.substring(6).trim();
      console.log(data); // Handle agent response
    }
  }
}
```

**Requirements:**

- EVM-compatible wallet with IoTeX chain support
- Private key for transaction signing
- x402-fetch library

---

## Rate Limits

All endpoints are protected by rate limiting. Excessive requests will receive `429 Too Many Requests` responses.
