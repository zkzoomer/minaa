# MinAA

Account Abstraction Proof of Concept over Mina Protocol.

## Description

The motivating factor for this project is to enable users to interact with the Mina blockchain using non-custodial accounts that validate user operations using non-native signatures. An _account_ in this context is a smart contract that implements the [`IAccountContract`](./packages/contracts/src/interfaces/IAccountContract.ts) interface, which must implement two methods:
- 1. `validateUserOp` to validate a user operation
- 2. `verifySignature` to verify a signature
Internally, these can implement any logic to validate the user operation and signature. Examples are provided in the [`AccountContract`](./packages/contracts/src/contracts/AccountContract.ts) that implement ECDSA signatures on secp256k1 and secp256r1.

Interactions with the blockchain are defined via the [`UserOperation`](./packages/contracts/src/interfaces/UserOperation.ts) struct, which contains the transaction data to be validated. Users sign these operations, and the corresponding account contract must be able to validate these signatures.

Similar to ERC-4337, we define an `EntryPoint` contract that acts as a central hub for all accounts. This contract keeps track of the accounts and their respective balances and nonces to avoid replay attacks. The `EntryPoint` contract receives the user operations, validates them, and executes them.