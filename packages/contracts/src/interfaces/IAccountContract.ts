import { Bool, Field, PublicKey, SmartContract, Struct, UInt64 } from "o1js";
import { Ecdsa, Secp256k1 } from "./UserOperation";

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
    owner: Secp256k1.provable,
}) {}

export abstract class IAccountContract extends SmartContract {
    /**
     * Validates a user operation
     * @dev Must validate caller is the {@link EntryPoint}
     * @dev Must validate the signature and nonce
     * @param userOperationHash hash of the request data, used as the basis for the signature
     * @param signature user operation signature
     * @param missingAccountFunds missing funds on the account's deposit in the {@link EntryPoint}
     *      This is the minimum amount to be transferred to the {@link EntryPoint} to make the call
     *      The excess is left in the {@link EntryPoint} for future calls, and can be withdrawn anytime
     */
    abstract validateUserOp(
        userOperationHash: Field,
        signature: Ecdsa,
        missingAccountFunds: UInt64,
    ): Promise<void>

    /**
     * Validates that the given signature of the operation hash is valid for the account's owner
     * @param userOperationHash hash of the request data, used as the basis for the signature
     * @param signature user operation signature
     */
    abstract verifySignature(
        userOperationHash: Field,
        signature: Ecdsa,
    ): Promise<void>
}
