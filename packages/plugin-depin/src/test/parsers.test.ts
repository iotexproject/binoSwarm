import { describe, expect, it } from "vitest";

import { parseTagContent } from "../helpers/parsers";

describe.only("Parsers", () => {
    describe("Location", () => {
        it("should parse location", () => {
            const location = parseTagContent(
                "<extracted_location>New York</extracted_location>",
                "extracted_location"
            );
            expect(location).toBe("New York");
        });
        it("should return null if invalid extracted location tag", () => {
            const location = parseTagContent(
                "<extraced_location>New York</extraced_location>",
                "extracted_location"
            );
            expect(location).toBe(null);
        });
        it("should return null if no extracted location tag", () => {
            const location = parseTagContent("New York", "extracted_location");
            expect(location).toBe(null);
        });
        it("should return null if no location in tags", () => {
            const location = parseTagContent(
                "<extracted_location></extracted_location>",
                "extracted_location"
            );
            expect(location).toBe(null);
        });
    });
    describe("News Query", () => {
        it("should parse news query", () => {
            const newsQuery = parseTagContent(
                "<extracted_query>Trump invites House Republicans to Mar-a-Lago for strategy meetings.</extracted_query>",
                "extracted_query"
            );
            expect(newsQuery).toBe(
                "Trump invites House Republicans to Mar-a-Lago for strategy meetings."
            );
        });
    });
});
