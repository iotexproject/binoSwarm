# `@elizaos/plugin-depin`

The **`@elizaos/plugin-depin`** plugin empowers the Eliza Agent Framework with **Perception** and **Action** capabilities via DePINs, bridging the digital intelligence of AI with the physical world.

- **DePINs as "Senses and Actuators":** Enables real-time data access from decentralized sensors and control over physical devices.
- **Unlock Transformative Use Cases:** From drone delivery to smart city infrastructure and precision agriculture, this plugin extends your AI agents' potential.

Leverage **`@elizaos/plugin-depin`** to integrate AI agents with the real world seamlessly.

---

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
QUICKSILVER_URL=http://localhost:8000 # Optional, defaults to "https://quicksilver.iotex.ai"
```

### Character Configuration

Update character.json with the following:

```json
"plugins": [
    "@elizaos/plugin-depin"
]
```

### QuickSilver

For the best experience you can run your own instance of [QuickSilver](https://github.com/iotexproject/quicksilver).

## Providers

### DePINScan

The DePINScan provider fetches and caches data from the IoTeX DePINScan API, providing:

- **Daily Metrics**: Latest aggregated statistics about DePIN activity on IoTeX
- **Project Data**: Detailed information about DePIN projects including:
  - Project name and slug
  - Token details and market metrics
  - Device statistics (total devices, costs, earnings)
  - Layer 1 chains and categories
  - Market data (market cap, token price, FDV)

## Actions

### Depin Projects

The DEPIN_PROJECTS action analyzes and provides information about DePIN projects tracked by DePINScan. It can:

- Query token prices, market caps, and valuations
- Compare metrics between different projects
- Filter projects by categories and chains
- Provide device statistics and earnings data
- Answer questions about specific project details

### Current Weather and Weather Forecast

The CURRENT_WEATHER action fetches and analyzes weather data for a given location using Mapbox and Nubila APIs. It can:

- Provide current temperature, weather conditions, and forecasts
- Answer questions about weather patterns and trends
- Generate weather-themed memes and images
