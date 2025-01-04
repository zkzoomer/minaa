# MinAA

Account Abstraction Proof of Concept over Mina Protocol.

## Description

The motivating factor for this project is to enable users to interact with the Mina blockchain using non-custodial accounts that validate user operations using non-native signatures. This provides a template for implementing smart contracts that handle user operations and signature verification, similar to Ethereum's [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337). You can find more detailed architecture overview in the [docs](./docs/README.md).

## Build

```bash
cd packages/contracts
bun run build
```

## Test

```bash
export SKIP_PROOFS=true # skip proofs for faster testing during development
cd packages/contracts
bun run test
```
