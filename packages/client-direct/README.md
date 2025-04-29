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

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `RATE_LIMIT_MESSAGE_MAX` | Maximum number of requests to `/message` endpoint | 5 |
| `RATE_LIMIT_MESSAGE_WINDOW_MS` | Time window in milliseconds for message rate limiting | 60000 (1 minute) |
| `RATE_LIMIT_STREAM_MAX` | Maximum number of requests to `/message-stream` endpoint | 3 |
| `RATE_LIMIT_STREAM_WINDOW_MS` | Time window in milliseconds for stream rate limiting | 60000 (1 minute) |
| `RATE_LIMIT_GLOBAL_MAX` | Maximum total requests across all endpoints | 200 |
| `RATE_LIMIT_GLOBAL_WINDOW_MS` | Time window in milliseconds for global rate limiting | 60000 (1 minute) |

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
