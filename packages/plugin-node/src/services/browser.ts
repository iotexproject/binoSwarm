import { generateObject, IBrowserService, trimTokens } from "@elizaos/core";
import { Service } from "@elizaos/core";
import { settings } from "@elizaos/core";
import { IAgentRuntime, ModelClass, ServiceType } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { PlaywrightBlocker } from "@cliqz/adblocker-playwright";
import CaptchaSolver from "capsolver-npm";
import { Browser, BrowserContext, chromium, Page } from "playwright";
import { elizaLogger } from "@elizaos/core";
import { z } from "zod";

async function generateSummary(
    runtime: IAgentRuntime,
    text: string
): Promise<{ title: string; description: string }> {
    // make sure text is under 128k characters
    text = await trimTokens(text, 100000, runtime);

    const prompt = `Please generate a concise summary for the following text:

  Text: """
  ${text}
  """

  Respond with a JSON object in the following format:
  <response>
  {
    "title": "Generated Title",
    "summary": "Generated summary and/or description of the text"
  }
  </response>
  `;

    const summarySchema = z.object({
        title: z.string().describe("The title of the page"),
        summary: z.string().describe("The summary of the page"),
    });

    type Summary = z.infer<typeof summarySchema>;

    const response = await generateObject<Summary>({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
        schema: summarySchema,
        schemaName: "summary",
        schemaDescription: "A summary of the text",
        functionId: "BrowserService_generateSummary",
        tags: ["browser", "generate-summary"],
    });

    const parsedResponse = response.object;

    if (parsedResponse) {
        return {
            title: parsedResponse.title,
            description: parsedResponse.summary,
        };
    }

    return {
        title: "",
        description: "",
    };
}

type PageContent = {
    title: string;
    description: string;
    bodyContent: string;
};

export class BrowserService extends Service implements IBrowserService {
    private browser: Browser | undefined;
    private context: BrowserContext | undefined;
    private blocker: PlaywrightBlocker | undefined;
    private captchaSolver: CaptchaSolver;
    private cacheKey = "content/browser";

    static serviceType: ServiceType = ServiceType.BROWSER;

    static register(runtime: IAgentRuntime): IAgentRuntime {
        // since we are lazy loading, do nothing
        return runtime;
    }

    getInstance(): IBrowserService {
        return BrowserService.getInstance();
    }

    constructor() {
        super();
        this.browser = undefined;
        this.context = undefined;
        this.blocker = undefined;
        this.captchaSolver = new CaptchaSolver(
            settings.CAPSOLVER_API_KEY || ""
        );
    }

    async initialize() {}

    async initializeBrowser() {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    "--disable-dev-shm-usage", // Uses /tmp instead of /dev/shm. Prevents memory issues on low-memory systems
                    "--block-new-web-contents", // Prevents creation of new windows/tabs
                ],
            });

            const platform = process.platform;
            let userAgent = "";

            // Change the user agent to match the platform to reduce bot detection
            switch (platform) {
                case "darwin":
                    userAgent =
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
                    break;
                case "win32":
                    userAgent =
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
                    break;
                case "linux":
                    userAgent =
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
                    break;
                default:
                    userAgent =
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
            }

            this.context = await this.browser.newContext({
                userAgent,
                acceptDownloads: false,
            });

            this.blocker =
                await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
        }
    }

    async closeBrowser() {
        if (this.context) {
            await this.context.close();
            this.context = undefined;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = undefined;
        }
    }

    async getPageContent(
        url: string,
        runtime: IAgentRuntime
    ): Promise<PageContent> {
        await this.initializeBrowser();
        return await this.fetchPageContent(url, runtime);
    }

    private getCacheKey(url: string): string {
        return stringToUuid(url);
    }

    private async fetchPageContent(
        url: string,
        runtime: IAgentRuntime
    ): Promise<PageContent> {
        const cacheKey = this.getCacheKey(url);
        const cached = await runtime.cacheManager.get<{
            url: string;
            content: PageContent;
        }>(`${this.cacheKey}/${cacheKey}`);

        if (cached) {
            return cached.content;
        }

        let page: Page | undefined;

        try {
            if (!this.context) {
                elizaLogger.log(
                    "Browser context not initialized. Call initializeBrowser() first."
                );
            }

            page = await this.context.newPage();

            // Enable stealth mode
            await page.setExtraHTTPHeaders({
                "Accept-Language": "en-US,en;q=0.9",
            });

            // Apply ad blocker
            if (this.blocker) {
                await this.blocker.enableBlockingInPage(page);
            }

            const response = await page.goto(url, { waitUntil: "networkidle" });

            if (!response) {
                elizaLogger.error("Failed to load the page");
            }

            if (response.status() === 403 || response.status() === 404) {
                return await this.tryAlternativeSources(url, runtime);
            }

            // Check for CAPTCHA
            const captchaDetected = await this.detectCaptcha(page);
            if (captchaDetected) {
                await this.solveCaptcha(page, url);
            }
            const documentTitle = await page.evaluate(() => document.title);
            const bodyContent = await page.evaluate(
                () => document.body.innerText
            );
            const { title: parsedTitle, description } = await generateSummary(
                runtime,
                documentTitle + "\n" + bodyContent
            );
            const content = { title: parsedTitle, description, bodyContent };
            await runtime.cacheManager.set(`${this.cacheKey}/${cacheKey}`, {
                url,
                content,
            });
            return content;
        } catch (error) {
            elizaLogger.error("Error:", error);
            return {
                title: url,
                description: "Error, could not fetch content",
                bodyContent: "",
            };
        } finally {
            if (page) {
                await page.close();
            }
        }
    }

    private async detectCaptcha(page: Page): Promise<boolean> {
        const captchaSelectors = [
            'iframe[src*="captcha"]',
            'div[class*="captcha"]',
            "#captcha",
            ".g-recaptcha",
            ".h-captcha",
        ];

        for (const selector of captchaSelectors) {
            const element = await page.$(selector);
            if (element) return true;
        }

        return false;
    }

    private async solveCaptcha(page: Page, url: string): Promise<void> {
        try {
            const hcaptchaKey = await this.getHCaptchaWebsiteKey(page);
            if (hcaptchaKey) {
                const solution = await this.captchaSolver.hcaptchaProxyless({
                    websiteURL: url,
                    websiteKey: hcaptchaKey,
                });
                await page.evaluate((token) => {
                    // eslint-disable-next-line
                    // @ts-ignore
                    window.hcaptcha.setResponse(token);
                }, solution.gRecaptchaResponse);
                return;
            }

            const recaptchaKey = await this.getReCaptchaWebsiteKey(page);
            if (recaptchaKey) {
                const solution = await this.captchaSolver.recaptchaV2Proxyless({
                    websiteURL: url,
                    websiteKey: recaptchaKey,
                });
                await page.evaluate((token) => {
                    // eslint-disable-next-line
                    // @ts-ignore
                    document.getElementById("g-recaptcha-response").innerHTML =
                        token;
                }, solution.gRecaptchaResponse);
            }
        } catch (error) {
            elizaLogger.error("Error solving CAPTCHA:", error);
        }
    }

    private async getHCaptchaWebsiteKey(page: Page): Promise<string> {
        return page.evaluate(() => {
            const hcaptchaIframe = document.querySelector(
                'iframe[src*="hcaptcha.com"]'
            );
            if (hcaptchaIframe) {
                const src = hcaptchaIframe.getAttribute("src");
                const match = src?.match(/sitekey=([^&]*)/);
                return match ? match[1] : "";
            }
            return "";
        });
    }

    private async getReCaptchaWebsiteKey(page: Page): Promise<string> {
        return page.evaluate(() => {
            const recaptchaElement = document.querySelector(".g-recaptcha");
            return recaptchaElement
                ? recaptchaElement.getAttribute("data-sitekey") || ""
                : "";
        });
    }

    private async tryAlternativeSources(
        url: string,
        runtime: IAgentRuntime
    ): Promise<{ title: string; description: string; bodyContent: string }> {
        // Try Internet Archive
        const archiveUrl = `https://web.archive.org/web/${url}`;
        try {
            return await this.fetchPageContent(archiveUrl, runtime);
        } catch (error) {
            elizaLogger.error("Error fetching from Internet Archive:", error);
        }

        // Try Google Search as a last resort
        const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        try {
            return await this.fetchPageContent(googleSearchUrl, runtime);
        } catch (error) {
            elizaLogger.error("Error fetching from Google Search:", error);
            elizaLogger.error(
                "Failed to fetch content from alternative sources"
            );
            return {
                title: url,
                description:
                    "Error, could not fetch content from alternative sources",
                bodyContent: "",
            };
        }
    }
}
