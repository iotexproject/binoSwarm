// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PredictionMarket is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public token; // ERC-20 token used for betting
    uint256 public constant FEE_PERCENT = 10; // 10% fee on bets
    address public feeCollector; // Address to collect fees
    uint256 public minBet; // Minimum bet amount
    uint256 public maxBet; // Maximum bet amount

    struct Bet {
        address user;
        uint256 amount;
        bool outcome; // true for "Yes", false for "No"
    }

    struct Prediction {
        string statement;
        uint256 deadline;
        uint256 totalYes;
        uint256 totalNo;
        bool resolved;
        bool outcome; // Final outcome, true for "Yes", false for "No"
        address resolver; // Address authorized to resolve the prediction
        mapping(address => Bet) bets;
        address[] participants;
    }

    mapping(uint256 => Prediction) public predictions;
    uint256 public predictionCount;

    // ----------------------------------------------------------
    // Events
    // ----------------------------------------------------------

    event PredictionCreated(
        uint256 indexed predictionId,
        string statement,
        uint256 deadline,
        address resolver
    );
    event BetPlaced(
        uint256 indexed predictionId,
        address indexed user,
        uint256 amount,
        bool outcome
    );
    event PredictionResolved(uint256 indexed predictionId, bool outcome);
    event RewardDistributed(
        uint256 indexed predictionId,
        address indexed user,
        uint256 payout
    );
    event FeeCollected(
        uint256 indexed predictionId,
        address indexed user,
        uint256 feeAmount
    );

    // ----------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------

    constructor(
        address _tokenAddress,
        address _feeCollector,
        uint256 _minBet,
        uint256 _maxBet
    ) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid token address");
        require(_feeCollector != address(0), "Invalid fee collector address");

        token = IERC20(_tokenAddress);
        feeCollector = _feeCollector;
        minBet = _minBet; // e.g., 1 * 10**18 if the token has 18 decimals
        maxBet = _maxBet;
    }

    // ----------------------------------------------------------
    // Modifiers
    // ----------------------------------------------------------

    modifier onlyResolver(uint256 predictionId) {
        require(
            msg.sender == predictions[predictionId].resolver,
            "Not authorized to resolve"
        );
        _;
    }

    modifier beforeDeadline(uint256 predictionId) {
        require(
            block.timestamp < predictions[predictionId].deadline,
            "Prediction deadline passed"
        );
        _;
    }

    modifier afterDeadline(uint256 predictionId) {
        require(
            block.timestamp >= predictions[predictionId].deadline,
            "Prediction deadline not reached"
        );
        _;
    }

    // ----------------------------------------------------------
    // Admin / Config Functions (Owner-Only)
    // ----------------------------------------------------------

    /**
     * @notice Sets a new minimum bet amount. Only callable by the contract owner.
     */
    function setMinBet(uint256 _minBet) external onlyOwner {
        minBet = _minBet;
    }

    /**
     * @notice Sets a new minimum bet amount. Only callable by the contract owner.
     */
    function setMaxBet(uint256 _maxBet) external onlyOwner {
        maxBet = _maxBet;
    }
    /**
     * @notice Updates the fee collector address. Only callable by the contract owner.
     */
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "Invalid fee collector address");
        feeCollector = _feeCollector;
    }

    // ----------------------------------------------------------
    // Core Prediction Logic
    // ----------------------------------------------------------

    function createPrediction(
        string memory _statement,
        uint256 _deadline,
        address _resolver
    ) external {
        require(_deadline > block.timestamp, "Deadline must be in the future");

        uint256 predictionId = predictionCount++;
        Prediction storage prediction = predictions[predictionId];
        prediction.statement = _statement;
        prediction.deadline = _deadline;
        prediction.resolver = _resolver;

        emit PredictionCreated(predictionId, _statement, _deadline, _resolver);
    }

    /**
     * @notice Place a bet on a specific outcome for a given prediction.
     * @param _predictionId The ID of the prediction.
     * @param _outcome True for "Yes", false for "No".
     * @param _amount The amount of tokens to bet.
     */
    function placeBet(
        uint256 _predictionId,
        bool _outcome,
        uint256 _amount
    ) external nonReentrant beforeDeadline(_predictionId) {
        _placeBetInternal(msg.sender, _predictionId, _outcome, _amount);
    }

    /**
     * @notice Allows an agent (e.g., AI) to place bets on behalf of a user.
     *         The user must have previously approved this contract to spend tokens on their behalf.
     */
    function placeBetForAccount(
        address _user,
        uint256 _predictionId,
        bool _outcome,
        uint256 _amount
    ) external nonReentrant beforeDeadline(_predictionId) {
        _placeBetInternal(_user, _predictionId, _outcome, _amount);
    }

    function _placeBetInternal(
        address _user,
        uint256 _predictionId,
        bool _outcome,
        uint256 _amount
    ) internal {
        require(_amount >= minBet, "Bet amount below minimum");
        require(_amount <= maxBet, "Bet amount above maximum");

        Prediction storage prediction = predictions[_predictionId];
        Bet storage userBet = prediction.bets[_user];

        // If user already bet, ensure it's the same outcome
        if (userBet.amount > 0) {
            require(userBet.outcome == _outcome, "Cannot change your outcome");
        }

        // Check user balance & allowance
        uint256 userBalance = token.balanceOf(_user);
        uint256 userAllowance = token.allowance(_user, address(this));
        require(userBalance >= _amount, "Insufficient token balance");
        require(userAllowance >= _amount, "Insufficient token allowance");

        // Calculate fee and net amount
        uint256 fee = (_amount * FEE_PERCENT) / 100;
        uint256 netAmount = _amount - fee;

        // Transfer tokens to contract & feeCollector
        token.safeTransferFrom(_user, address(this), _amount);
        token.safeTransfer(feeCollector, fee);

        // Update user's bet
        userBet.user = _user;
        userBet.amount += netAmount; // top-up if already bet on the same outcome
        userBet.outcome = _outcome;

        // Update prediction totals
        if (userBet.amount == netAmount) {
            // This means user had no prior bet => new participant
            prediction.participants.push(_user);
        }

        if (_outcome) {
            prediction.totalYes += netAmount;
        } else {
            prediction.totalNo += netAmount;
        }

        emit BetPlaced(_predictionId, _user, netAmount, _outcome);
        emit FeeCollected(_predictionId, _user, fee);
    }

    /**
     * @notice Resolve a prediction, pay out winners immediately, and mark it as resolved.
     */
    function resolvePrediction(uint256 _predictionId, bool _outcome)
        external
        nonReentrant
        onlyResolver(_predictionId)
        afterDeadline(_predictionId)
    {
        Prediction storage prediction = predictions[_predictionId];
        require(!prediction.resolved, "Prediction already resolved");

        // Mark as resolved
        prediction.resolved = true;
        prediction.outcome = _outcome;

        // Pools
        uint256 winnersPool = _outcome
            ? prediction.totalYes
            : prediction.totalNo;
        uint256 losersPool = _outcome
            ? prediction.totalNo
            : prediction.totalYes;

        // Distribute rewards to winners
        address[] memory participants = prediction.participants;
        for (uint256 i = 0; i < participants.length; i++) {
            address userAddr = participants[i];
            Bet storage userBet = prediction.bets[userAddr];

            // Skip losers or zero bets
            if (userBet.amount == 0 || userBet.outcome != _outcome) {
                continue;
            }

            // reward = (losersPool * userBet.amount / winnersPool)
            // payout = reward + userBet.amount
            uint256 reward = (losersPool * userBet.amount) / winnersPool;
            uint256 payout = reward + userBet.amount;

            // Zero out bet before transferring to prevent reentrancy
            userBet.amount = 0;

            token.safeTransfer(userAddr, payout);
            emit RewardDistributed(_predictionId, userAddr, payout);
        }

        emit PredictionResolved(_predictionId, _outcome);
    }

    // ----------------------------------------------------------
    // View / Utility Functions
    // ----------------------------------------------------------

    /**
     * @notice Returns the list of participants in a given prediction.
     */
    function getParticipants(uint256 _predictionId)
        external
        view
        returns (address[] memory)
    {
        return predictions[_predictionId].participants;
    }

    /**
     * @notice Returns the token allowance of a user for this contract.
     */
    function checkAllowance(address _user) external view returns (uint256) {
        return token.allowance(_user, address(this));
    }
}
