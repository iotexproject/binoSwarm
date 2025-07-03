export const callCollaboratorTemplate = `
You are about to call a collaborator.
Please provide the necessary information to call the collaborator.

<context>
<character_info>
<name>{{agentName}}</name>
<biography>{{bio}}</biography>
<backstory>{{lore}}</backstory>
</character_info>

<knowledge_base>
<areas_of_expertise>{{knowledge}}</areas_of_expertise>
</knowledge_base>

<recent_interactions>{{recentPostInteractions}}</recent_interactions>
<recent_interactions>{{recentInteractions}}</recent_interactions>
<recent_messages>{{recentMessages}}</recent_messages>

<current_post>{{currentPost}}</current_post>
<image_descriptions>{{imageDescriptions}}</image_descriptions>
<conversation_thread>{{formattedConversation}}</conversation_thread>

{{context}}
</context>

Now, choose the collaborator you want to call and provide the message you want to send to it.
Collaborators details:
<collaborators>
{{collaborators}}
</collaborators>

The message you want the collaborator to help you with:
<currentMessage>{{currentMessage}}</currentMessage>

IMPORTANT INSTRUCTIONS:
1. Before calling a collaborator, analyze if the current message contains sufficient details for the task.
2. If the current message is vague (e.g., "try again", "do it", "help me with this"), you MUST extract the necessary context from the recent interactions and conversation thread above.
3. When extracting context, identify what the user is specifically referring to by looking at the most recent relevant request in the conversation history.
4. Provide the collaborator with a complete, self-contained message that includes all necessary details (addresses, chains, parameters, etc.) so they can execute the task without needing additional context.
5. If there are multiple different requests in the conversation history, determine which one the user is referring to based on recency and relevance to the current message.
`;
