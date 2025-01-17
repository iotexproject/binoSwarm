# Prediction Market Plugin for ElizaOS

The **Prediction Market Plugin** enables users to create and participate in prediction markets through AI-driven smart contract interactions. This plugin integrates the **IoTeX blockchain** and **Solidity smart contracts** to provide a decentralized and transparent platform for making and resolving predictions.

---

## Features

1. **Prediction Creation**:
   - Users can propose new predictions.
   - The system evaluates the proposal and deploys a smart contract if needed.

2. **Smart Contract Interaction**:
   - Participants can place bets on existing predictions.
   - Rewards are distributed based on the outcomes.

3. **AI-Assisted Outcome Validation**:
   - The plugin fetches external data to determine the outcome of predictions.

4. **Seamless Integration**:
   - Fully integrated into the ElizaOS framework for streamlined user experience.

---

## Workflow

### 1. User Submission
- A user submits a prediction to the AI agent (e.g., *"I bet tomorrow will be sunny in NY."*).
- The plugin extracts the following:
  - **Proposer**: User submitting the prediction.
  - **Prediction Statement**: The claim being predicted (e.g., "It will be sunny in NY.").
  - **Deadline**: Time by which the prediction must be resolved.

---

### 2. AI Evaluation
- The plugin checks if a similar prediction with the same deadline already exists:
  - **If Found**: The plugin provides the user with the smart contract (SC) address for interaction.
  - **If Not Found**: The plugin deploys a new smart contract with the prediction parameters.

---

### 3. Smart Contract Deployment
- A new smart contract is created with the following:
  - **Prediction Statement**.
  - **Deadline**.
  - **Betting Conditions** (e.g., "Sunny" or "Not Sunny").
  - Logic for tracking bets and distributing rewards.

---

### 4. User Interaction
- Users interact with the SC to place bets:
  - Specify the outcome they support (e.g., "Sunny").
  - Transfer the betting amount to the contract.

---

### 5. Outcome Determination
- As the deadline approaches:
  - The plugin fetches external data (e.g., weather APIs for weather predictions).
  - It evaluates the outcome of the prediction.
  - The plugin sends the outcome to the SC for resolution.

---

### 6. Reward Distribution
- The smart contract distributes rewards automatically:
  - Winners receive payouts based on their stakes.
  - Losers' stakes are forfeited according to the SC rules.

---

## Decision-Making Process

### Prediction Evaluation
- **Similarity Check**:
  - The plugin uses natural language processing (NLP) to identify if the proposed prediction matches existing ones.
  - Ensures no duplicate predictions are created unnecessarily.

- **Deadline Validation**:
  - Parses the deadline and ensures it is valid and feasible for resolution.

---

### Outcome Determination
- **Data Source Selection**:
  - Fetches data from trusted APIs (e.g., weather, sports scores, oracles).
  - Logs data sources for transparency.

- **AI Validation**:
  - Analyzes fetched data to determine the correct outcome.
  - Ensures results are verifiable and immutable.

---

## Technical Details

### Smart Contract
- **Blockchain**: IoTeX.
- **Language**: Solidity.
- **Features**:
  - Bet tracking (user address, bet amount, and outcome).
  - Secure reward distribution.
  - Admin interaction for outcome submission (via the plugin).

---

### Plugin Architecture
- **ElizaOS Integration**:
  - Provides a user-friendly interface to interact with prediction markets.
  - Logs interactions for auditing.

- **AI Core**:
  - Handles NLP for prediction parsing and evaluation.
  - Interfaces with external data sources for outcome determination.

- **Blockchain Module**:
  - Manages SC deployment and interactions.
  - Ensures secure and transparent transactions.

---

## Future Enhancements
1. **Decentralized Oracle Integration**:
   - To improve trust, integrate decentralized oracles for automated outcome submission.

2. **Advanced Betting Options**:
   - Enable features like multi-outcome predictions, parlay bets, and custom odds.

3. **Performance Optimization**:
   - Scale the plugin to handle high prediction volumes efficiently.

---

## Contribution Guidelines
We welcome contributions to enhance the plugin! Please:
1. Fork the repository.
2. Create a new branch for your feature.
3. Submit a pull request with detailed descriptions.

---

## License
This plugin is licensed under the MIT License. See the `LICENSE` file for details.