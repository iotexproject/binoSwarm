function parseTagContent(text: string, tag: string) {
    const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`);
    const match = text?.match(pattern);
    if (match && match[1].trim()) {
        return match[1].trim();
    }
    return null;
}

export function parseLocation(text: string) {
    return parseTagContent(text, "extracted_location");
}
