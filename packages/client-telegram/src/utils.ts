export function escapeMarkdown(text: string): string {
    // Don't escape if it's a code block
    if (text.startsWith("```") && text.endsWith("```")) {
        return text;
    }

    // Split the text by code blocks
    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts
        .map((part, index) => {
            // If it's a code block (odd indices in the split result will be code blocks)
            if (index % 2 === 1) {
                return part;
            }
            // For regular text, only escape characters that need escaping in Markdown
            return (
                part
                    // First preserve any intended inline code spans
                    .replace(/`.*?`/g, (match) => match)
                    // Then only escape the minimal set of special characters that need escaping in Markdown mode
                    .replace(/([*_`\\])/g, "\\$1")
            );
        })
        .join("");
}
