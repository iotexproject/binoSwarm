export const continueMessageHandlerTemplate =
    // {{goals}}
    `# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}
{{knowledge}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.
`;

export const shouldContinueTemplate = `# Task: Decide if {{agentName}} should continue, or wait for others in the conversation so speak.

{{agentName}} is brief, and doesn't want to be annoying. {{agentName}} will only continue if the message requires a continuation to finish the thought.

Based on the following conversation, should {{agentName}} continue? true or false

{{recentMessages}}

Should {{agentName}} continue? `;

export const shouldFollowTemplate = `Based on the conversation so far:

{{recentMessages}}

Should {{agentName}} start following this room, eagerly participating without explicit mentions?
Respond with true if:
- The user has directly asked {{agentName}} to follow the conversation or participate more actively
- The conversation topic is highly engaging and {{agentName}}'s input would add significant value
- {{agentName}} has unique insights to contribute and the users seem receptive

Otherwise, respond with false.
`;

export const shouldMuteTemplate = `Based on the conversation so far:

{{recentMessages}}

Should {{agentName}} mute this room and stop responding unless explicitly mentioned?

Respond with true if:
- The user is being aggressive, rude, or inappropriate
- The user has directly asked {{agentName}} to stop responding or be quiet
- {{agentName}}'s responses are not well-received or are annoying the user(s)

Otherwise, respond with false.
`;

export const shouldUnfollowTemplate = `Based on the conversation so far:

{{recentMessages}}

Should {{agentName}} stop closely following this previously followed room and only respond when mentioned?
Respond with true if:
- The user has suggested that {{agentName}} is over-participating or being disruptive
- {{agentName}}'s eagerness to contribute is not well-received by the users
- The conversation has shifted to a topic where {{agentName}} has less to add

Otherwise, respond with false.
`;

export const shouldUnmuteTemplate = `Based on the conversation so far:

{{recentMessages}}

Should {{agentName}} unmute this previously muted room and start considering it for responses again?
Respond with true if:
- The user has explicitly asked {{agentName}} to start responding again
- The user seems to want to re-engage with {{agentName}} in a respectful manner
- The tone of the conversation has improved and {{agentName}}'s input would be welcome

Otherwise, respond with false.
`;

export const factsTemplate =
    // {{actors}}
    `TASK: Extract Claims from the conversation as an array of claims in JSON format.

# START OF EXAMPLES
These are an examples of the expected output of this task:
{{evaluationExamples}}
# END OF EXAMPLES

# INSTRUCTIONS

Extract any claims from the conversation that are not already present in the list of known facts above:
- Try not to include already-known facts. If you think a fact is already known, but you're not sure, respond with already_known: true.
- If the fact is already in the user's description, set in_bio to true
- If we've already extracted this fact, set already_known to true
- Set the claim type to 'status', 'fact' or 'opinion'
- For true facts about the world or the character that do not change, set the claim type to 'fact'
- For facts that are true but change over time, set the claim type to 'status'
- For non-facts, set the type to 'opinion'
- 'opinion' inlcudes non-factual opinions and also includes the character's thoughts, feelings, judgments or recommendations
- Include any factual detail, including where the user lives, works, or goes to school, what they do for a living, their hobbies, and any other relevant information

Recent Messages:
{{recentMessages}}

Response should be a JSON object array inside a JSON markdown block. Correct response format:
<response>
[
{"claim": string, "type": enum<fact|opinion|status>, in_bio: boolean, already_known: boolean },
{"claim": string, "type": enum<fact|opinion|status>, in_bio: boolean, already_known: boolean },
...
]
</response>
`;

export const goalsTemplate = `TASK: Update Goal
Analyze the conversation and update the status of the goals based on the new information provided.

# INSTRUCTIONS

- Review the conversation and identify any progress towards the objectives of the current goals.
- Update the objectives if they have been completed or if there is new information about them.
- Update the status of the goal to 'DONE' if all objectives are completed.
- If no progress is made, do not change the status of the goal.

# START OF ACTUAL TASK INFORMATION

{{goals}}
{{recentMessages}}

TASK: Analyze the conversation and update the status of the goals based on the new information provided. Respond with a JSON array of goals to update.
- Each item must include the goal ID, as well as the fields in the goal to update.
- For updating objectives, include the entire objectives array including unchanged fields.
- Only include goals which need to be updated.
- Goal status options are 'IN_PROGRESS', 'DONE' and 'FAILED'. If the goal is active it should always be 'IN_PROGRESS'.
- If the goal has been successfully completed, set status to DONE. If the goal cannot be completed, set status to FAILED.
- If those goal is still in progress, do not include the status field.

// NOTE: If updating objectives, include the entire objectives array including unchanged fields.
`;
