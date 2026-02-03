/**
 * Local type definitions for Twitter plugin.
 * These types are copied from @elizaos/client-twitter to avoid
 * adding an unnecessary dependency on the client package.
 */

export interface Photo {
    id: string;
    url: string;
    alt_text: string | undefined;
}

export interface Video {
    id: string;
    preview: string;
    url?: string;
}

export interface Mention {
    id: string;
    username?: string;
    name?: string;
}

export interface Tweet {
    id: string;
    text: string;
    conversationId: string;
    inReplyToStatusId?: string;
    quotedTweetId?: string;
    name?: string;
    username?: string;
    userId?: string;
    timestamp?: number;
    permanentUrl?: string;
    hashtags: string[];
    mentions: Mention[];
    photos: Photo[];
    videos: Video[];
    urls: string[];
    thread: Tweet[];
    likes?: number;
    retweets?: number;
    replies?: number;
    bookmarkCount?: number;
    views?: number;
    isQuoted?: boolean;
    isPin?: boolean;
    isReply?: boolean;
    isRetweet?: boolean;
    isSelfThread?: boolean;
    sensitiveContent?: boolean;
}
