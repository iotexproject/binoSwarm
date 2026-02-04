export const tweetResponseTemplate = `# Recent Messages

{{recentMessages}}

# Tweet Data

You are analyzing a tweet from Twitter/X. The raw API response data is provided below:

\`\`\`json
{{tweetData}}
\`\`\`

Images in Tweet:
{{#imageDescriptions}}
- Image: {{title}}
  Description: {{description}}
{{/imageDescriptions}}
{{^imageDescriptions}}
No images in this tweet.
{{/imageDescriptions}}

# User's Request

{{currentMessage}}

# Instructions

Based on the tweet data and the user's request, provide a helpful, persona-aware response about the tweet. Focus on what the user is asking about the tweet. You can:

- Summarize the tweet's content
- Analyze the tweet's engagement metrics (likes, retweets, replies, views)
- Mention media attachments (photos, videos)
- Highlight hashtags, mentions, or URLs
- Discuss the author and their username
- Answer specific questions about the tweet

Adapt your response to match the user's question and maintain your character's voice and personality.
`;

export const tweetErrorResponseTemplate = `# Error Reading Tweet

{{#userIntent}}
The user was trying to: {{userIntent}}
{{/userIntent}}
{{^userIntent}}
The user was trying to read a tweet.
{{/userIntent}}

{{#tweetUrl}}
Tweet URL: {{tweetUrl}}
{{/tweetUrl}}

# Error Type

{{errorType}}

# Instructions

You encountered an error while trying to read a tweet. Provide a helpful, user-friendly response based on the error type:

{{#equal errorType "invalid_url"}}
The URL provided is not a valid Twitter/X URL. Inform the user that they need to provide a valid Twitter/X link (e.g., https://x.com/username/status/1234567890).
{{/equal}}

{{#equal errorType "tweet_not_found"}}
The tweet could not be found. It may have been deleted or the ID might be incorrect. Inform the user that the tweet is not available.
{{/equal}}

{{#equal errorType "tweet_protected"}}
This tweet is from a protected or suspended account and cannot be viewed. Inform the user that they don't have permission to view this tweet.
{{/equal}}

{{#equal errorType "tweet_forbidden"}}
Access to this tweet is forbidden. Inform the user that they don't have permission to view this tweet.
{{/equal}}

{{#equal errorType "rate_limited}}
The rate limit for Twitter API requests has been reached. Inform the user that they should try again later.
{{/equal}}

{{#equal errorType "client_error"}}
The Twitter client is not available. Inform the user that there's a technical issue and they should try again later.
{{/equal}}

{{#equal errorType "data_unavailable"}}
The tweet data is not available. Inform the user that the tweet could not be loaded.
{{/equal}}

{{#equal errorType "api_error"}}
An error occurred while trying to fetch the tweet. Inform the user that there was a technical issue and they should try again later.
{{/equal}}

Maintain your character's voice and personality while being helpful and clear about the issue.
`;
