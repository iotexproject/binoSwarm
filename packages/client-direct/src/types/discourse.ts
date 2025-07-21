export interface DiscoursePost {
    id: number;
    username: string;
    created_at: string;
    cooked: string;
    raw: string; // The actual text content - most important field
    post_number: number; // To check if original post (1) or reply (>1)
    topic_id: number;
    topic_slug: string;
    topic_title: string;
    category_id: number;
    category_slug: string;
    user_id: number;

    // Filtering fields
    moderator: boolean;
    admin: boolean;
    staff: boolean;
    hidden: boolean;
    deleted_at: string | null;
    user_deleted: boolean;
}

export interface PostCreatedPayload {
    post: DiscoursePost;
}

export type DiscourseEventType = "post_created";

export interface DiscourseWebhookData {
    eventType: string;
    instance: string;
    eventId: string;
    signature: string;
    payload: PostCreatedPayload;
}

export interface DiscoursePostRequest {
    raw: string;
    topic_id: number;
    created_at: string;
    reply_to_post_number: number;
}

export interface DiscoursePostResponse {
    id: number;
    created_at: string;
    raw: string;
    post_number: number;
    topic_id: number;
    topic_slug?: string;
}

export interface DiscourseApiError {
    action: string;
    errors: string[];
}
