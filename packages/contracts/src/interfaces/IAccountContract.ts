import { type Field, PublicKey, SmartContract, Struct } from "o1js"
import { Curve, type Ecdsa, type UserOperation } from "./UserOperation"

/***
 * An event emitted after each successful request
 * @param userOpHash unique identifier for the request (hash its entire content, except signature)
 * @param sender the account that generates this request
 * @param key the nonce key value from the request
 * @param nonce the nonce value from the request
 */
export class AccountInitializedEvent extends Struct({
    entryPoint: PublicKey,
    account: PublicKey,
    owner: Curve,
}) {}

export abstract class IAccountContract extends SmartContract {
    /**
     * Validates a user operation and executes it
     * @dev Must call the {@link EntryPoint} for nonce management
     * @dev Must validate the signature and assert no replay
     * @param userOp user operation to validate and execute
     * @param signature user operation signature
     */
    abstract validateUserOpAndExecute(
        userOp: UserOperation,
        signature: Ecdsa,
    ): Promise<Field>

    /**
     * Validates that the given signature of the operation hash is valid for the account's owner
     * @param dataHash hash of the request data, used as the basis for the signature
     * @param signature user operation signature
     */
    abstract verifySignature(dataHash: Field, signature: Ecdsa): Promise<void>
}
