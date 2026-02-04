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

You encountered an error while trying to read a tweet. Error type: {{errorType}}

Provide a helpful, user-friendly response based on this error type:
- invalid_url: The URL is not a valid Twitter/X link
- tweet_not_found: The tweet could not be found or was deleted
- tweet_protected: The tweet is from a protected/suspended account
- tweet_forbidden: Access to the tweet is forbidden
- rate_limited: Rate limit reached, try again later
- client_error: Twitter client unavailable
- data_unavailable: Tweet data could not be loaded
- api_error: Technical error occurred

Maintain your character's voice and personality while being helpful and clear about the issue.
`;
