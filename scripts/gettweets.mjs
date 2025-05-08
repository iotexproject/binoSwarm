import { Scraper } from "agent-twitter-client";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: "../.env" });

const TWEETS_FILE = "tweets.json";
const CLEANED_TWEETS_FILE = "cleaned_tweets.json";
const RESPONSES_FILE = "responses.json";
const NUMBER_OF_TWEETS = 2000;
const PROFILE_TO_SCRAPE = "some_random_profile";
const AGENT_NAME = "some_random_agent";

(async () => {
    try {
        const scraper = await initScrapper();
        if (await scraper.isLoggedIn()) {
            console.log("Logged in successfully!");

            await fetchAndProcessTweets(scraper);

            console.log("All tweets fetched and saved to", TWEETS_FILE);

            await scraper.logout();
            console.log("Logged out successfully!");
        } else {
            console.log("Login failed. Please check your credentials.");
        }
    } catch (error) {
        console.error("An error occurred:", error);
    }
})();

async function fetchAndProcessTweets(scraper) {
    const tweets = scraper.getTweets(PROFILE_TO_SCRAPE, NUMBER_OF_TWEETS);
    const fetchedTweets = initFetchedTweets();

    const skipFirst = fetchedTweets.length;
    let count = 0;

    for await (const tweet of tweets) {
        if (count < skipFirst) {
            count++;
            continue;
        }

        console.log("--------------------");
        console.log("Tweet ID:", tweet.id);
        console.log("Text:", tweet.text);
        console.log("Created At:", tweet.createdAt);
        console.log("Retweets:", tweet.retweetCount);
        console.log("Likes:", tweet.likeCount);
        console.log("--------------------");

        // Add the new tweet to the fetched tweets array
        fetchedTweets.push(tweet);
    }

    // Save all fetched tweets to the JSON file after loop completion
    fs.writeFileSync(TWEETS_FILE, JSON.stringify(fetchedTweets, null, 2));
    saveCleanedTweets(fetchedTweets);
    saveResponses(fetchedTweets);
}

function saveResponses(tweets) {
    const responses = tweets
        .filter((tweet) => {
            const validText = tweet.text.length > 0;
            const isQuoted = tweet.isQuoted;
            const hasQuotedStatus = tweet.quotedStatus;
            return validText && isQuoted && hasQuotedStatus;
        })
        .map((tweet) => {
            return [
                {
                    user: tweet.quotedStatus.username,
                    content: {
                        text: tweet.quotedStatus.text,
                    },
                },
                {
                    user: AGENT_NAME,
                    content: {
                        text: tweet.text,
                    },
                },
            ];
        });
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(responses, null, 2));
}

function saveCleanedTweets(tweets) {
    console.log("tweets", tweets.length);
    const cleanedTweets = tweets
        .filter((tweet) => {
            const validText = tweet.text.length > 0;
            const notRetweet = !tweet.isRetweet;
            const notQuote = !tweet.isQuoted;
            const notReply = !tweet.isReply;
            const result = validText && notRetweet && notQuote && notReply;
            return result;
        })
        .map((tweet) => tweet.text);
    console.log("cleanedTweets", cleanedTweets.length);
    fs.writeFileSync(
        CLEANED_TWEETS_FILE,
        JSON.stringify(cleanedTweets, null, 2)
    );
}

function initFetchedTweets() {
    let fetchedTweets = [];
    // Load existing tweets from the JSON file if it exists
    if (fs.existsSync(TWEETS_FILE)) {
        const fileContent = fs.readFileSync(TWEETS_FILE, "utf-8");
        fetchedTweets = JSON.parse(fileContent);
    }
    return fetchedTweets;
}

async function initScrapper() {
    const scraper = new Scraper();
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    const email = process.env.TWITTER_EMAIL;
    const twitter2faSecret = process.env.TWITTER_2FA_SECRET;

    await scraper.login(username, password, email, twitter2faSecret);
    return scraper;
}
