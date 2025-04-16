import axios from 'axios';
import { z } from 'zod';
import { elizaLogger } from '@elizaos/core';

const CategoryEnum = z
  .enum(['business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology'])
  .describe('News category to fetch headlines for');

interface NewsAPIParams {
  category?: string;
  q?: string;
}

export const GetHeadlinesToolSchema = {
  name: 'get_headlines',
  description: "Fetches today's top headlines from News API. You can filter by country, category, and search keywords.",
  parameters: z.object({
    category: CategoryEnum.optional().describe(
      'Category to filter headlines by: business, entertainment, general, health, science, sports, technology'
    ),
    q: z.string().optional().describe('Keywords or phrase to search for in the headlines'),
  }),
  execute: async (input: NewsAPIParams) => {
    try {
      const tool = new NewsAPITool();
      return await tool.getRawData(input);
    } catch (error) {
      elizaLogger.error('Error executing get_headlines tool', error);
      return `Error executing get_headlines tool`;
    }
  },
};

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: {
    source: { name: string };
    title: string;
    url: string;
    description: string | null;
    publishedAt: string;
    urlToImage: string | null;
    content: string | null;
  }[];
}

export class NewsAPITool  {

  constructor() {
    if (!process.env.NEWSAPI_API_KEY) {
      throw new Error('Please set the NEWSAPI_API_KEY environment variable.');
    }
  }

  public async getRawData(params: NewsAPIParams): Promise<NewsAPIResponse> {
    const validatedParams = GetHeadlinesToolSchema.parameters.parse(params);
    return this.fetchNews(validatedParams);
  }

  private async fetchNews(params: NewsAPIParams): Promise<NewsAPIResponse> {
    const apiKey = process.env.NEWSAPI_API_KEY!;
    const queryParams = new URLSearchParams({
      country: 'us',
      apiKey,
      ...(params.category && { category: params.category }),
      ...(params.q && { q: params.q }),
    });

    const url = `https://newsapi.org/v2/top-headlines?${queryParams.toString()}`;
    const response = await axios.get<NewsAPIResponse>(url);

    return response.data;
  }
}