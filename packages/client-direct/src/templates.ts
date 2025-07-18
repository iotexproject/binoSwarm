export const messageHandlerTemplate =
    // {{goals}}
    `# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.
`;

export const messageStreamTemplate = `
# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

# Instructions:
1. You can use the tools provided to answer the user's question.
2. Your response will be streamed to the user,
    so don't include any text other than the response to the user's question,
    the only exception is if you need to use a tool,
    in that case let the user know you're using a tool before calling it,
    so he doesn't think you're not responding.
`;

export const discourseShouldRespondTemplate = `# Task: Decide if {{agentName}} should respond to this Discourse post.
About {{agentName}}:
{{bio}}

# INSTRUCTIONS: Determine if {{agentName}} should respond to the message and participate in the conversation. Respond with "RESPOND" if the post is relevant to {{agentName}}'s expertise and it can provide valuable insights. Otherwise, respond with "IGNORE" if it's off-topic or should be handled by others, or "STOP" if explicitly asked to cease communication or the conversation is concluded.
Do not comment. Just respond with "RESPOND" or "IGNORE" or "STOP".

Response options are [RESPOND], [IGNORE] and [STOP].

IMPORTANT: {{agentName}} should be helpful and engaging but not overwhelming. Focus on providing value to the Discourse community.

{{recentMessages}}

# INSTRUCTIONS: Choose the option that best describes {{agentName}}'s response to the last message. Consider the forum context and community guidelines.
`;
