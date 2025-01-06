# MinAA Architecture Overview

## Introduction

MinAA is a project designed to enable users to interact with the Mina blockchain using non-custodial accounts. These accounts validate user operations using non-native signatures, allowing for a more flexible and secure interaction with the blockchain. The architecture is inspired by Ethereum's ERC-4337 and revolves around the concept of account abstraction.

An _account_ in this context is a smart contract that implements the [`IAccountContract`](../packages/contracts/src/interfaces/IAccountContract.ts) interface, which must implement two methods:
- 1. `validateUserOp` to validate a user operation
- 2. `verifySignature` to verify a signature
Internally, these can implement any logic to validate the user operation and signature. The example provided in the [`AccountContract`](../packages/contracts/src/contracts/AccountContract.ts) implements ECDSA signatures on either [secp256r1](../packages/contracts/src/interfaces/UserOperation.ts#L14) or [secp256k1](../packages/contracts/src/interfaces/UserOperation.ts#L15).

Interactions with the blockchain are defined via the [`UserOperation`](../packages/contracts/src/interfaces/UserOperation.ts#L42) struct, which contains the transaction data to be validated. Users sign these operations, and the corresponding account contract must be able to validate these signatures.

Similar to ERC-4337, we define an `EntryPoint` contract that acts as a central hub for all accounts. This contract keeps track of the accounts and their respective balances and nonces to avoid replay attacks. The `EntryPoint` contract receives the user operations, validates them, and executes them.

## Key Components

### 1. [**AccountContract**](../packages/contracts/src/contracts/AccountContract.ts)

- **Purpose**: Represents a user's account on the blockchain. It is a smart contract that implements the `IAccountContract` interface.
- **Key Methods**:
  - `initialize`: Sets up the account with an entry point, owner, and initial balance.
  - `validateUserOpAndExecute`: Validates a user operation and executes it, ensuring the operation is not a replay and the signature is valid.
  - `verifySignature`: Confirms that a given signature is valid for the account's owner.

### 2. [**EntryPoint**](../packages/contracts/src/contracts/EntryPoint.ts)

- **Purpose**: Acts as a central hub for all accounts, managing their balances and nonces to prevent replay attacks.
- **Key Methods**:
  - `getNonce`: Retrieves the next valid nonce for a given account given the sender and nonce key.
  - `balanceOf`: Returns the deposited amount for an account.
  - `depositTo`: Adds funds to an account's `EntryPoint` balance, used to pay for operation fees.
  - `withdrawTo`: Withdraws funds from an account, validating the operation through the account's contract.
  - `handleOp`: Executes a user operation, deducting the necessary fee from the account's `EntryPoint` balance.
  - `paymasterHandleOp`: Similar to `handleOp`, but the transaction caller covers the fee.
  - `getUserOpHash`: Generates a unique identifier for a user operation.
  - `validateAndUpdateNonce`: Validates and updates the nonce for an account.

### 3. [**AccountRegistry**](../packages/contracts/src/contracts/AccountRegistry.ts)

- **Purpose**: Largely unnecessary, but facilitates the management of `AccountContract` instances.
- **Key Methods**:
  - `initialize`: Sets up the factory with an entry point.
  - `addAccount`: Registers a deployed account, ensuring it matches the entry point.
  - `getPublicKey`: Retrieves the public key of an account based on the owner's key.

### 4. [**UserOperation**](../packages/contracts/src/interfaces/UserOperation.ts)

- **Purpose**: Represents the data structure for user operations. Due to the static nature of circuits, this must be defined differently for each application.
- **Components**:
  - `sender`: The address of the account that is sending the user operation.
  - `nonce`: The current nonce for the account.
  - `key`: The nonce key being used for the user operation.
  - `calldata`: The calldata for the user operation. For the example provided in the [`AccountContract`](../packages/contracts/src/contracts/AccountContract.ts), the [`UserOperationCallData`](../packages/contracts/src/interfaces/UserOperation.ts#L29) contains:
    - `recipient`: The address of the recipient of the transaction.
    - `amount`: The amount of the transaction.
  - `fee`: The fee for the user operation.
g smart contracts for increased efficiency.

## Limitations

Due to the static nature of circuits, the [`UserOperationCallData`](../packages/contracts/src/interfaces/UserOperation.ts#L29) must be defined differently for each application that is to implement account abstraction. Note how this directly affects the definition and deployment of both the `EntryPoint` and `AccountContract`. This limitation is a necessary one given the constraints of o1js.

Furthermore, o1js's lack of a `msg.sender` equivalent means that it is not possible to guarantee that the caller to some function is a given `AccountContract`. This in turn means that making a zkApp that uses account abstraction is not possible without implementing a custom `AccountContract` that executes the logic of the given zkApp.

## Usecases

- **Non-Custodial Wallets**: Allowing users to create and manage their own wallets without having to use Mina's native signature scheme. Their functionality would be limited to the logic defined in the `AccountContract`.

- **Identity Verification**: Identity protocols could leverage account abstraction to enable users to prove elements of their identity using the existing secure enclaves in their smartphones.

- **Consumer Applications**: Other applications could also benefit from account abstraction: ZK Email, recurring payments, conditional transfers, etc.

## Further Work

By simply adding a `msg.sender` equivalent to o1js, much of the added complexity of the current design could be removed. In turn, it could be possible to define an almost general-purpose `UserOperationCallData` that can be used for any application. Such a design could look like the following:

```typescript
class UserOperationCallData extends Struct({
    address: PublicKey,
    dataFields: Array<Field>(n),
}) {}
```

Where the `address` is the contract being called, and the `dataFields` is an array of _n_ fields that acts as the calldata. Each smart contract would then have to define an additional method to parse the `dataFields` into the appropriate arguments. This would allow for the creation of a general-purpose `UserOperationCallData` that can be used for any application, abstracting away the added complexity of the current design.
