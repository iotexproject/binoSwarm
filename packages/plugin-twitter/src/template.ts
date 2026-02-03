export const tweetResponseTemplate = `# Recent Messages

{{recentMessages}}

# Tweet Data

You are analyzing a tweet from Twitter/X. The raw API response data is provided below:

\`\`\`json
{{tweetData}}
\`\`\`

{{#imageUrls}}
Images in this tweet:
{{#each imageUrls}}
- {{this}}
{{/each}}
{{/imageUrls}}

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
