import {
    Field,
    PublicKey,
    SmartContract,
    Struct,
    UInt64,
    type Void,
} from "o1js"
import type { Ecdsa, UserOperation } from "./UserOperation"

/**
 * Withdrawal struct
 * @param account the account being withdrawn from
 * @param recipient the recipient of the withdrawal
 * @param amount the amount being withdrawn
 */
export class Withdrawal extends Struct({
    account: PublicKey,
    recipient: PublicKey,
    amount: UInt64,
}) {}

/**
 * An event emitted after a given `amount` is credited to an account
 * @param account the account being credited
 * @param amount the amount being credited
 */
export class DepositedEvent extends Struct({
    account: PublicKey,
    amount: UInt64,
}) {}

/**
 * An event emitted after a given `amount` is withdrawn from an account
 * @param account the account being withdrawn from
 * @param recipient the recipient of the withdrawal
 * @param amount the amount being withdrawn
 */
export class WithdrawnEvent extends Struct({
    account: PublicKey,
    recipient: PublicKey,
    amount: UInt64,
}) {}

/***
 * An event emitted after each successful request
 * @param userOpHash unique identifier for the request (hash its entire content, except signature)
 * @param sender the account that generates this request
 * @param key the nonce key value from the request
 * @param nonce the nonce value from the request
 */
export class UserOperationEvent extends Struct({
    userOpHash: Field,
    sender: PublicKey,
    key: Field,
    nonce: Field,
}) {}

export abstract class IEntryPoint extends SmartContract {
    /**
     * Returns the next valid nonce number for a given nonce key
     * @param sender sender of the transaction
     * @param key nonce key
     * @returns the next valid nonce number
     */
    abstract getNonce(sender: PublicKey, key: Field): Promise<Field>

    /**
     * Gets the deposited amount for an account
     * @param account account being checked
     * @returns the deposited amount
     */
    abstract balanceOf(account: PublicKey): Promise<UInt64>

    /**
     * Adds to the deposit of the given account
     * @param account account being topped up
     * @param amount amount being topped up
     */
    abstract depositTo(account: PublicKey, amount: UInt64): Promise<Void>

    /**
     * Withdraws from an account's deposit. This will call the account's contract to validate the withdrawal.
     * @param account account being withdrawn from
     * @param recipient account receiving the withdrawn amount
     * @param amount amount being withdrawn
     * @param signature user operation signature
     */
    abstract withdrawTo(
        account: PublicKey,
        recipient: PublicKey,
        amount: UInt64,
        signature: Ecdsa,
    ): Promise<Void>

    /**
     * Executes a `UserOperation`
     * @param userOp user operation being executed
     * @param signature user operation signature
     * @param beneficiary address to receive the fees
     */
    abstract handleOp(
        userOp: UserOperation,
        signature: Ecdsa,
        beneficiary: PublicKey,
    ): Promise<Void>

    /**
     * Generate a request ID - unique identifier for this request
     * The request ID is a hash over the content of the userOp (except the signature) and the entrypoint
     * @param userOp user operation being executeds
     * @returns the request ID
     */
    abstract getUserOpHash(userOp: UserOperation): Promise<Field>

    /**
     * Validates a nonce uniqueness for the given account, and updates it. Reverts if the nonce is not valid
     * @param sender account being validated
     * @param key nonce key being validated
     * @param nonce nonce being validated
     */
    abstract validateAndUpdateNonce(
        sender: PublicKey,
        key: Field,
        nonce: Field,
    ): Promise<Void>
}
