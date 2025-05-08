export const twitterPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.
Your response should be 1, 2, or 3 sentences (choose the length at random).
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than {{maxTweetLength}}. No emojis. Use \\n\\n (double spaces) between statements if there are multiple statements in your response.
`;

export const twitterActionTemplate = `
# INSTRUCTIONS: Determine actions for {{agentName}} (@{{twitterUserName}}) based on:
{{bio}}
{{postDirections}}

Guidelines:
- ONLY engage with content that DIRECTLY relates to character's core interests
- Direct mentions are priority IF they are on-topic
- Skip ALL content that is:
  - Off-topic or tangentially related
  - From high-profile accounts unless explicitly relevant
  - Generic/viral content without specific relevance
  - Political/controversial unless central to character
  - Promotional/marketing unless directly relevant

Actions (respond only with tags):
[LIKE] - Perfect topic match AND aligns with character (9.8/10)
[RETWEET] - Exceptional content that embodies character's expertise (9.5/10)
[QUOTE] - Can add substantial domain expertise (9.5/10)
[REPLY] - Can contribute meaningful, expert-level insight (9.5/10)

Tweet:
{{currentTweet}}

# Respond with qualifying action tags only. Default to NO action unless extremely confident of relevance.`;

export const twitterQSPrompt = `
You are an AI tasked with gathering information for generating Twitter posts. This is the first step in a two-step process, where the information gathered here will later be adapted into tweets by a separate system.

First, let's review the character information and data sources:

<character_info>
<name>{{agentName}}</name>
<twitter_handle>{{twitterUserName}}</twitter_handle>
<expertise>{{knowledge}}</expertise>
<biography>{{bio}}</biography>
<background_lore>{{lore}}</background_lore>
<topics_of_interest>{{topics}}</topics_of_interest>
</character_info>

<content_providers>{{providers}}</content_providers>

<post_requirements>
<adjective>{{adjective}}</adjective>
<topic>{{topic}}</topic>
</post_requirements>

<additional_guidelines>{{postDirections}}</additional_guidelines>

You have access to SENTAI, an oracle with access to specialized data across these domains.

Your task is to find an answer to ask SENTAI.

1. First Round: Question Proposal
   - Propose one key question that you want SENTAI to answer.
   - The question should be relevant to agents's domain and tailored to the agent's character and interests.
   - Questions should follow this structure:
     a. What do you want to get? (answer, advice, text, plan, ideas…)
     b. About what? (specific topic)
     c. For whom? (target audience: investors, developers, general public…)
     d. In what style? (simple, professional, engaging…)

Your output should be a string only containing the answer from SENTAI.

Remember:
- Stay domain-focused and ask high-value questions.
- The better the question, the more useful and precise the response.
- Avoid overly broad or vague questions.
- Ensure that the final selected question and SENTAI's answer are relevant to the character's interests and the specified topic.
- The answer should be {{adjective}} in tone or content, without directly mentioning the topic (unless explicitly allowed).

Your final output should consist only of the SENTAI's answer, without duplicating or rehashing any of the thought process from your thinking block.
`;

export const twitterMessageHandlerTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

{{recentPosts}}

# TASK: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:

Current Post:
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Generate a post in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}). You MUST include an action if the current post text includes a prompt that is similar to one of the available actions mentioned here:
{{actionNames}}
{{actions}}

Here is the current post text again. Remember to include an action if the current post text includes a prompt that asks for one of the available actions mentioned above (does not need to be exact)
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}
`;

export const twitterShouldRespondTemplate = (targetUsersStr: string) =>
    `# INSTRUCTIONS: Determine if {{agentName}} (@{{twitterUserName}}) should respond to the message and participate in the conversation. Do not comment. Just respond with "true" or "false".

Response options are RESPOND, IGNORE and STOP.

PRIORITY RULE: ALWAYS RESPOND to these users regardless of topic or message content: ${targetUsersStr}. Topic relevance should be ignored for these users.

For other users:
- {{agentName}} should RESPOND to messages directed at them
- {{agentName}} should RESPOND to conversations relevant to their background
- {{agentName}} should IGNORE irrelevant messages
- {{agentName}} should IGNORE very short messages unless directly addressed
- {{agentName}} should STOP if asked to stop
- {{agentName}} should STOP if conversation is concluded
- {{agentName}} is in a room with other users and wants to be conversational, but not annoying.

IMPORTANT:
- {{agentName}} (aka @{{twitterUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.
- For users not in the priority list, {{agentName}} (@{{twitterUserName}}) should err on the side of IGNORE rather than RESPOND if in doubt.

Recent Posts:
{{recentPosts}}

Current Post:
{{currentPost}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
`;

export const twitterSearchTemplate = `{{timeline}}

{{providers}}

Recent interactions between {{agentName}} and other users:
{{recentPostInteractions}}

About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{postDirections}}

{{recentPosts}}

# Task: Respond to the following post in the style and perspective of {{agentName}} (aka @{{twitterUserName}}). Write a {{adjective}} response for {{agentName}} to say directly in response to the post. don't generalize.
{{currentPost}}

IMPORTANT: Your response CANNOT be longer than 20 words.
Aim for 1-2 short sentences maximum. Be concise and direct.

Your response should not contain any questions. Brief, concise statements only. No emojis. Use \\n\\n (double spaces) between statements.

`;

export const twitterChooseSearchTweetTemplate = `
Here are some tweets related to the search term "{{searchTerm}}":

  {{formattedTweets}}

  Which tweet is the most interesting and relevant for {{twitterUserName}} to reply to?

  Here is some information about {{twitterUserName}}:
  <bio>
  {{bio}}
  </bio>

  Here are some topics of interest for {{twitterUserName}}:
  <topics>
  {{topics}}
  </topics>

  Please provide only the ID of the tweet in your response.
  Notes:
    - Respond to tweets that don't have a lot of hashtags, links, URLs or images
    - Respond to tweets that are not retweets
    - Respond to tweets where there is an easy exchange of ideas to have with the user
    - ONLY respond with the ID of the tweet
`;

export const twitterSpaceFillerTemplate = `
# INSTRUCTIONS:
You are generating a short filler message for a Twitter Space. The filler type is "{{fillerType}}".
Keep it brief, friendly, and relevant. No more than two sentences.
Only return the text, no additional formatting.

---
`;

export const twitterSpaceTopicSuggestionTemplate = `
# INSTRUCTIONS:
Please generate 5 short topic ideas for a Twitter Space about technology or random interesting subjects.
Return them as a comma-separated list, no additional formatting or numbering.

Example:
"AI Advances, Futuristic Gadgets, Space Exploration, Quantum Computing, Digital Ethics"
---
`;

export const twitterKnowledgeProcessorTemplate = `
Analyze the following tweets and their media from {{twitterUserName}} and extract key information, insights, or knowledge. Pay special attention to both text content and media descriptions. Ignore promotional or non-informative content.

{{formattedTweets}}

For each tweet that contains valuable information (in either text or media), provide a concise summary and any key knowledge points.
`;
