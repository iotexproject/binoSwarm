export class ElizaLogger {
    constructor() {
        // Check if we're in Node.js environment
        this.isNode =
            typeof process !== "undefined" &&
            process.versions != null &&
            process.versions.node != null;

        // Set verbose based on environment
        this.verbose = this.isNode ? process.env.VERBOSE === "true" : false;

        // Add initialization logging
        console.log(`[ElizaLogger] Initializing with:
            isNode: ${this.isNode}
            verbose: ${this.verbose}
            VERBOSE env: ${process.env.VERBOSE}
            NODE_ENV: ${process.env.NODE_ENV}
        `);
    }

    private isNode: boolean;
    verbose = false;
    closeByNewLine = true;
    useIcons = true;
    logsTitle = "LOGS";
    warningsTitle = "WARNINGS";
    errorsTitle = "ERRORS";
    informationsTitle = "INFORMATIONS";
    successesTitle = "SUCCESS";
    debugsTitle = "DEBUG";
    assertsTitle = "ASSERT";

    // Add structured logging options
    useStructuredLogs = true; // Enable JSON structured logging
    logLabels: Record<string, string> = {}; // Additional labels to include in logs

    // Method to set additional log labels
    setLogLabels(labels: Record<string, string>) {
        this.logLabels = { ...this.logLabels, ...labels };
        return this;
    }

    #serializeError(error: Error): Record<string, any> {
        const plainError: Record<string, any> = {
            message: error.message,
            stack: error.stack,
            name: error.name,
        };
        // Add any other custom properties from the error
        Object.keys(error).forEach((key) => {
            plainError[key] = error[key];
        });
        return plainError;
    }

    #formatStructuredLog(
        level: string,
        message: any,
        additionalData?: Record<string, any>
    ) {
        const timestamp = new Date().toISOString();
        const logObject = {
            timestamp,
            level,
            message:
                typeof message === "object" ? JSON.stringify(message) : message,
            ...this.logLabels,
            ...additionalData,
        };

        return JSON.stringify(logObject);
    }

    #getColor(foregroundColor = "", backgroundColor = "") {
        if (!this.isNode) {
            // Browser console styling
            const colors: { [key: string]: string } = {
                black: "#000000",
                red: "#ff0000",
                green: "#00ff00",
                yellow: "#ffff00",
                blue: "#0000ff",
                magenta: "#ff00ff",
                cyan: "#00ffff",
                white: "#ffffff",
            };

            const fg = colors[foregroundColor.toLowerCase()] || colors.white;
            const bg = colors[backgroundColor.toLowerCase()] || "transparent";
            return `color: ${fg}; background: ${bg};`;
        }

        // Node.js console colors
        let fgc = "\x1b[37m";
        switch (foregroundColor.trim().toLowerCase()) {
            case "black":
                fgc = "\x1b[30m";
                break;
            case "red":
                fgc = "\x1b[31m";
                break;
            case "green":
                fgc = "\x1b[32m";
                break;
            case "yellow":
                fgc = "\x1b[33m";
                break;
            case "blue":
                fgc = "\x1b[34m";
                break;
            case "magenta":
                fgc = "\x1b[35m";
                break;
            case "cyan":
                fgc = "\x1b[36m";
                break;
            case "white":
                fgc = "\x1b[37m";
                break;
        }

        let bgc = "";
        switch (backgroundColor.trim().toLowerCase()) {
            case "black":
                bgc = "\x1b[40m";
                break;
            case "red":
                bgc = "\x1b[44m";
                break;
            case "green":
                bgc = "\x1b[44m";
                break;
            case "yellow":
                bgc = "\x1b[43m";
                break;
            case "blue":
                bgc = "\x1b[44m";
                break;
            case "magenta":
                bgc = "\x1b[45m";
                break;
            case "cyan":
                bgc = "\x1b[46m";
                break;
            case "white":
                bgc = "\x1b[47m";
                break;
        }

        return `${fgc}${bgc}`;
    }

    #getColorReset() {
        return this.isNode ? "\x1b[0m" : "";
    }

    clear() {
        console.clear();
    }

    print(foregroundColor = "white", backgroundColor = "black", ...strings) {
        // Convert objects to strings
        const processedStrings = strings.map((item) => {
            if (typeof item === "object") {
                return JSON.stringify(item, (key, value) =>
                    typeof value === "bigint" ? value.toString() : value
                );
            }
            return item;
        });

        if (this.isNode) {
            const c = this.#getColor(foregroundColor, backgroundColor);
            console.log(c, processedStrings.join(""), this.#getColorReset());
        } else {
            const style = this.#getColor(foregroundColor, backgroundColor);
            console.log(`%c${processedStrings.join("")}`, style);
        }

        if (this.closeByNewLine) console.log("");
    }

    #logWithStyle(
        strings: any[],
        options: {
            fg: string;
            bg: string;
            icon: string;
            groupTitle: string;
            level: string;
        }
    ) {
        const { fg, bg, icon, groupTitle, level } = options;

        // Handle structured logging if enabled
        if (this.useStructuredLogs) {
            const serializedStrings = strings.map((item) =>
                item instanceof Error ? this.#serializeError(item) : item
            );

            if (
                serializedStrings.length === 1 &&
                typeof serializedStrings[0] !== "object"
            ) {
                // Simple message
                const structuredLog = this.#formatStructuredLog(
                    level,
                    serializedStrings[0]
                );
                console.log(structuredLog);
            } else if (
                serializedStrings.length === 1 &&
                typeof serializedStrings[0] === "object"
            ) {
                // Object log
                const structuredLog = this.#formatStructuredLog(
                    level,
                    "",
                    serializedStrings[0]
                );
                console.log(structuredLog);
            } else {
                // Multiple entries
                const message = serializedStrings[0] || "";
                const additionalData = serializedStrings
                    .slice(1)
                    .reduce((acc, item, index) => {
                        acc[`data_${index}`] = item;
                        return acc;
                    }, {});
                const structuredLog = this.#formatStructuredLog(
                    level,
                    message,
                    additionalData
                );
                console.log(structuredLog);
            }

            if (this.closeByNewLine) console.log("");
            return;
        }

        // Original styling logic for non-structured logging
        if (strings.length > 1) {
            if (this.isNode) {
                const c = this.#getColor(fg, bg);
                console.group(c, (this.useIcons ? icon : "") + groupTitle);
            } else {
                const style = this.#getColor(fg, bg);
                console.group(
                    `%c${this.useIcons ? icon : ""}${groupTitle}`,
                    style
                );
            }

            const nl = this.closeByNewLine;
            this.closeByNewLine = false;
            strings.forEach((item) => {
                this.print(fg, bg, item);
            });
            this.closeByNewLine = nl;
            console.groupEnd();
            if (nl) console.log();
        } else {
            this.print(
                fg,
                bg,
                strings.map((item) => {
                    return `${this.useIcons ? `${icon} ` : ""}${item}`;
                })
            );
        }
    }

    log(...strings) {
        this.#logWithStyle(strings, {
            fg: "white",
            bg: "",
            icon: "\u25ce",
            groupTitle: ` ${this.logsTitle}`,
            level: "info",
        });
    }

    warn(...strings) {
        this.#logWithStyle(strings, {
            fg: "yellow",
            bg: "",
            icon: "\u26a0",
            groupTitle: ` ${this.warningsTitle}`,
            level: "warn",
        });
    }

    error(...strings) {
        this.#logWithStyle(strings, {
            fg: "red",
            bg: "",
            icon: "\u26D4",
            groupTitle: ` ${this.errorsTitle}`,
            level: "error",
        });
    }

    info(...strings) {
        this.#logWithStyle(strings, {
            fg: "blue",
            bg: "",
            icon: "\u2139",
            groupTitle: ` ${this.informationsTitle}`,
            level: "info",
        });
    }

    debug(...strings) {
        if (!this.verbose) {
            return;
        }
        this.#logWithStyle(strings, {
            fg: "magenta",
            bg: "",
            icon: "\u1367",
            groupTitle: ` ${this.debugsTitle}`,
            level: "debug",
        });
    }

    success(...strings) {
        this.#logWithStyle(strings, {
            fg: "green",
            bg: "",
            icon: "\u2713",
            groupTitle: ` ${this.successesTitle}`,
            level: "success",
        });
    }

    assert(...strings) {
        this.#logWithStyle(strings, {
            fg: "cyan",
            bg: "",
            icon: "\u0021",
            groupTitle: ` ${this.assertsTitle}`,
            level: "assert",
        });
    }

    progress(message: string) {
        if (this.isNode) {
            // Clear the current line and move cursor to beginning
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(message);
        } else {
            console.log(message);
        }
    }
}

export const elizaLogger = new ElizaLogger();
elizaLogger.closeByNewLine = true;
elizaLogger.useIcons = true;
elizaLogger.useStructuredLogs = true; // Enable structured logging by default

export default elizaLogger;
