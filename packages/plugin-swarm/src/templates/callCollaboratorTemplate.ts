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
`;
