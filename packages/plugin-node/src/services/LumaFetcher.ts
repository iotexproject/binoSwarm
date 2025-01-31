import { v4 as uuidv4 } from "uuid";
import {
    IAgentRuntime,
    Service,
    ServiceType,
    UUID,
    elizaLogger,
} from "@elizaos/core";
import ical from "ical.js";
import { BrowserService } from "./browser";


const LUMA_ICS_URL = "https://api.lu.ma/ics/get?entity=calendar&id=cal-VFzfuxD01QUFkSs";

const INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

export class LumaFetcher extends Service {
    interval: NodeJS.Timeout;
    runtime: IAgentRuntime;

    static serviceType = ServiceType.LUMA_FETCHER;

    async initialize(runtime: IAgentRuntime): Promise<void> {
        this.runtime = runtime;

        fetchLatestEvents(this.runtime);
        this.interval = setInterval(async () => {
            try {
                elizaLogger.debug("running luma fetcher...");
                await fetchLatestEvents(this.runtime);
            } catch (error) {
                elizaLogger.error("Error in luma fetcher:", error);
            }
        }, INTERVAL);


    }
}

export default LumaFetcher;

async function fetchLatestEvents(runtime: IAgentRuntime) {
    const response = await fetch(LUMA_ICS_URL);
    const icsText = await response.text();

    const jcalData = ical.parse(icsText);
    const comp = new ical.Component(jcalData);
    const events = comp.getAllSubcomponents("vevent");

    const vevents = events.map(event => {
        const vevent = new ical.Event(event);
        return {
            title: vevent.summary,
            start: vevent.startDate.toJSDate(),
            end: vevent.endDate.toJSDate(),
            location: vevent.location,
            description: vevent.description
        };
    });

    for (const event of vevents) {
        await runtime.ragKnowledgeManager.createKnowledge({
            id: uuidv4() as UUID,
            agentId: runtime.agentId,
            content: {
                text: JSON.stringify(event),
                metadata: {
                    title: event.title,
                    isMain: true,
                    isChunk: false,
                    type: "event",
                },
            },
        });
    }
}
// const browserService = runtime.getService(
//     ServiceType.BROWSER
// ) as BrowserService;
// await browserService.startContentExtractionFromUrl(
//     "https://lu.ma/ethdenver",
//     runtime,
//     "a.event-link.content-link"
// );