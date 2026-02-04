/**
 * Tweet type - matches client-twitter structure for cache compatibility
 */
export interface Photo {
    id: string;
    url: string;
    alt_text?: string;
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
    authorId?: string;
    createdAt?: string;
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

/**
 * Twitter API v2 response types
 */
export type TwitterMedia = {
    media_key: string;
    type: string;
    url?: string;
};

export type TwitterUser = {
    id: string;
    username: string;
    name: string;
};

export type TwitterTweetData = {
    id: string;
    text: string;
    attachments?: {
        media_keys: string[];
    };
    photos?: Array<{ url: string; id?: string; alt_text?: string }>;
    author_id?: string;
    created_at?: string;
    conversation_id?: string;
};

export type TwitterApiResponse = {
    data: TwitterTweetData;
    includes?: {
        media: TwitterMedia[];
        users?: TwitterUser[];
    };
};

/**
 * Twitter client interface for fetching tweets
 */
export type TwitterClient = {
    v2: {
        getTweet: (tweetId: string) => Promise<unknown>;
    };
};
