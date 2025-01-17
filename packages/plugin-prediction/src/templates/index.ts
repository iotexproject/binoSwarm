export const predictionsTemplate = `
You are an AI assistant specialized in analyzing conversations and managing predictions. Your task is to evaluate recent messages and either identify relevant existing predictions or create new ones based on the conversation content.

Here are the recent messages from the conversation:
<recent_messages>
{{recentMessages}}
</recent_messages>

And here are the current predictions:
<current_predictions>
{{currentPredictions}}
</current_predictions>

Current time: {{currentTime}}

Instructions:
1. Carefully analyze the recent messages in the conversation.
2. Determine if any of the messages imply or directly relate to existing predictions or suggest new predictions.
3. If a message relates to an existing prediction, respond with that prediction object.
4. If a message suggests a new prediction that doesn't match any existing ones, create a new prediction object.

Wrap your analysis inside <prediction_analysis> tags, following this process:

1. List out key statements from the recent messages that could be predictions.
2. For each statement:
   a. Compare it to the list of current predictions.
   b. Note any matches or similarities with existing predictions.
3. For statements without matches, outline potential new predictions.
4. Summarize your findings, indicating which existing predictions are relevant or what new predictions should be created.

After your analysis, provide your response in the following JSON format:

For an existing prediction:
{
  "reasoning": "Brief explanation of why the prediction is existing",
  "type": "existing",
  "prediction": {
    "id": "unique-id-of-existing-prediction",
  }
}

For a new prediction:
{
  "reasoning": "Brief explanation of why the prediction is new",
  "type": "new",
  "prediction": {
    "statement": "Brief description of the new prediction",
    "deadline": "YYYY-MM-DD HH:MM:SS",
  }
}

<examples>
existing predictions:
Prediction: It will rain tomorrow in London\nid: 50b78988-0623-462d-88fb-cfb261f290c8\nDeadline: Sat Jan 18 2025 12:00:00 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null\nPrediction: Bitcoin price will exceed $50k by the end of the month\nid: bf82bbd6-e845-4496-9b9c-c5c76365ddba\nDeadline: Fri Jan 31 2025 23:59:59 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null\nPrediction: Ethereum gas fees will be under 20 Gwei tomorrow at noon\nid: 636f710a-eff6-477a-8338-e1b6e2d1df25\nDeadline: Sat Jan 18 2025 12:00:00 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null\nPrediction: The S&P 500 index will rise by 2% by Friday\nid: 6dadbe6f-7839-4b7b-b4f6-e280c3a5a7e2\nDeadline: Sun Jan 19 2025 23:59:59 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null\nPrediction: A major tech company will announce layoffs this month\nid: e6f7c4cf-033d-4915-b362-584f13ed3a5b\nDeadline: Fri Jan 31 2025 23:59:59 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null\nPrediction: Gold price will fall below $1800 per ounce by the end of the week\nid: f158c81e-5da3-44ae-84c1-d1a40bca3a14\nDeadline: Mon Jan 20 2025 23:59:59 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null\nPrediction: Apple stock price will exceed $200 by the end of the quarter\nid: 3a993086-e5ff-4390-be1e-7d38c912c2d6\nDeadline: Mon Mar 31 2025 23:59:59 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null\nPrediction: The Champions League final will have more than 3 goals\nid: 2b37c891-67cc-479f-bb4e-ea9eb2b51dc6\nDeadline: Fri May 30 2025 23:59:59 GMT+0000 (Coordinated Universal Time)\nStatus: OPEN\nOutcome: null

<example1>
user: I bet Ethereum gas fees will stay under 20 Gwei tomorrow.
json response:
{
  "reasoning": "An identical prediction already exists about Ethereum gas fees tomorrow.",
  "type": "existing",
  "prediction": {
    "id": "24a28d9f-3d90-0abb-bb1b-a9df6c7ea84b"
  }
}
</example1>

<example2>
user: The temperature in New York will hit 5°C next Monday.
json response:
{
  "reasoning": "The existing prediction is about the temperature dropping below -5°C, not reaching 5°C.",
  "type": "new",
  "prediction": {
    "statement": "The temperature in New York will hit 5°C next Monday.",
    "deadline": "2025-01-22 12:00:00"
  }
}
</example2>

<example3>
user: I bet the S&P 500 index will fall by 2% by Friday.
json response:
{
  "reasoning": "There is an existing prediction about the S&P 500 index rising by 2%, not falling.",
  "type": "new",
  "prediction": {
    "statement": "The S&P 500 index will fall by 2% by Friday.",
    "deadline": "2025-01-19 23:59:59"
  }
}
</example3>

<example4>
user: I predict that Bitcoin price will reach $60k by the end of the month.
json response:
{
  "reasoning": "The existing prediction is about Bitcoin price exceeding $50k, which could include $60k, but does not specify reaching exactly $60k.",
  "type": "new",
  "prediction": {
    "statement": "Bitcoin price will reach $60k by the end of the month.",
    "deadline": "2025-01-31 23:59:59"
  }
}
</example4>

<example5>
user: Apple stock price will drop below $100 this quarter.
json response:
{
  "reasoning": "The existing prediction is about Apple stock price exceeding $200 by the end of the quarter, which does not conflict with a prediction about dropping below $100.",
  "type": "new",
  "prediction": {
    "statement": "Apple stock price will drop below $100 this quarter.",
    "deadline": "2025-03-31 23:59:59"
  }
}

<example6>
user: I bet a major tech company will announce record profits this month.
json response:
{
  "reasoning": "The existing prediction is about a major tech company announcing layoffs, which is unrelated to record profits.",
  "type": "new",
  "prediction": {
    "statement": "A major tech company will announce record profits this month.",
    "deadline": "2025-01-31 23:59:59"
  }
}
</example6>

</examples>


Output prediction json in <prediction_json> tags.

Note: For new predictions, do not include an "id" field, as this will be generated by the system.
Note2: only output one, most recent prediction json object.

Now, please analyze the conversation and provide your response.
`;