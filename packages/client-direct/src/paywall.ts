import { paymentMiddleware, Network, RouteConfig } from "x402-express";
import { Request, Response, NextFunction } from "express";

const defaultReceiver =
    "0x0000000000000000000000000000000000000000" as `0x${string}`;
const defaultPrice = "$0.001";
const defaultNetwork = "iotex" as Network;
const defaultFacilitator = "http://localhost:8001/facilitator";

const price = process.env.X402_PRICE_FOR_PROTECTED_ROUTE_USDC || defaultPrice;
const network = (process.env.X402_NETWORK as Network) || defaultNetwork;

export const paymentReceiver =
    (process.env.X402_PAYMENT_RECEIVER as `0x${string}`) || defaultReceiver;
export const facilitator =
    process.env.X402_FACILITATOR_URL || defaultFacilitator;

const MAX_TIMEOUT_SECONDS = 180;

export const routePaymentConfig: RouteConfig = {
    price,
    network,
    config: {
        description: "Access to paid BinoSwarm API",
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    },
};

const paywallMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const route = `${req.method} ${req.path}`;
    const middleware = paymentMiddleware(
        paymentReceiver,
        {
            [route]: routePaymentConfig,
        },
        {
            url: facilitator as `${string}://${string}`,
        }
    );

    middleware(req, res, next);
};

export default paywallMiddleware;
