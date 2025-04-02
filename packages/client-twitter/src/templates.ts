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
