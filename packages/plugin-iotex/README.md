# @elizaos/plugin-iotex

This plugin provides actions and providers for interacting with the IoTeX chain. While default evm actions like token transfers can be achieved through the evm plugin configured to work with IoTeX, this plugin implements some actions that are specific to IoTeX, such as staking-related actions.

## Description

The IoTeX plugin provides comprehensive functionality for interacting with the IoTeX chain, including staking actions, ioID actions, etc...

## Features

- [x] Read informations about a staking bucket
- [ ] Create a new staking bucket
- [ ] Get staking rewards

## Installation

```bash
pnpm install @elizaos/plugin-iotex
```

## Configuration

### Required Environment Variables

```env
# Required
IOTEX_PRIVATE_KEY=your-private-key-here

# Optional - Custom RPC URLs
IOTEX_PROVIDER_URL=https://your-custom-mainnet-rpc-url
```

### Chain Configuration

By default, **Ethereum mainnet** is enabled. To enable additional chains, add them to your character config:

```json
"settings": {
    "chains": {
        "evm": [ "iotex" ],
        "iotex": true
        }
}
```

Note: The chain names must match those in the viem/chains.

## Provider

The **Wallet Provider** initializes with the **first chain in the list** as the default (or Ethereum mainnet if none are added). It:

- Provides the **context** of the currently connected address and its balance.
- Creates **Public** and **Wallet clients** to interact with the supported chains.
- Allows adding chains dynamically at runtime.

## Actions

### 1. GetBucketInfo

Gets the details of a staking bucket given the bucket id:

```typescript
// Example: read info for bucket 21988
Provide info for bucket 21988
```

### 2. ListBuckets

List all staking buckets owned by a certain wallet:

```typescript
// Example: list buckets for 0xC4E50d97C51A86185AFB28D73e57AE68cfa9f204
List buckets for 0xC4E50d97C51A86185AFB28D73e57AE68cfa9f204
```

## Development

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Build the plugin:

```bash
pnpm run build
```

4. Run tests:

```bash
pnpm test
```

## API Reference

### Core Components

1. **Actions**
    - GetBucketInfo: retrieve staking settings for a bucket id
    - Listbuckets: list staking buckets for a wallet

## Future Enhancements

TBD

## Contributing

The plugin contains tests. Whether you're using **TDD** or not, please make sure to run the tests before submitting a PR:

```bash
pnpm test
```

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for more information.

## Credits

This plugin integrates with and builds upon several key technologies:

- [Ethereum](https://ethereum.org/): Decentralized blockchain
- [LiFi](https://lifi.io/): Cross-chain bridge and swap service
- [viem](https://viem.sh/): Ethereum client library
- [wagmi](https://wagmi.sh/): Ethereum client library

Special thanks to:

- [Ethereum Developer community](https://ethereum.org/developers/)
- The Eliza community for their contributions and feedback

For more information about EVM capabilities:

- [Ethereum Documentation](https://ethereum.org/developers/)
- [LiFi Documentation](https://lifi.io)
- [viem Documentation](https://viem.sh)
- [wagmi Documentation](https://wagmi.sh)

## License

This plugin is part of the Eliza project. See the main project repository for license information.
