import { paymentMiddleware, Network } from "x402-express";

const defaultReceiver = "" as `0x${string}`;
const defaultPrice = "$0.001";
const defaultNetwork = "iotex" as Network;
const defaultFacilitator = "http://localhost:8001/facilitator";

const paymentReceiver =
    (process.env.X402_PAYMENT_RECEIVER as `0x${string}`) || defaultReceiver;
const price = process.env.X402_PRICE_FOR_PROTECTED_ROUTE_USDC || defaultPrice;
const network = (process.env.X402_NETWORK as Network) || defaultNetwork;
const facilitator = process.env.X402_FACILITATOR_URL || defaultFacilitator;

const routePaymentConfig = {
    price,
    network,
    config: {
        description: "Access to paid BinoSwarm API",
    },
};

const paywallMiddleware = paymentMiddleware(
    paymentReceiver,
    {
        "POST /:agentId/message-paid": routePaymentConfig,
    },
    {
        url: facilitator as `${string}://${string}`,
    }
);

export default paywallMiddleware;
