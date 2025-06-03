# `@elizaos/plugin-icn`

The **`@elizaos/plugin-icn`** provides capabilities to fetch network statistics from the Impossible Cloud Network.

## Overview

This plugin integrates with the Impossible Cloud API to retrieve data such as:

- Total and booked capacity
- Hardware provider counts
- Node counts (Hyper and Scaler)
- Node locations
- Staked ICNL and ICNT
- Total Value Locked (TVL)

## Configuration

### Character Configuration

Update `character.json` with the following to enable the plugin:

```json
"plugins": [
    "@elizaos/plugin-icn"
]
```