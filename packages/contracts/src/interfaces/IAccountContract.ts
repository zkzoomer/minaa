import { Field, SmartContract, UInt64 } from "o1js";

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
        signature: any,
        missingAccountFunds: UInt64,
    ): Promise<void>

    /**
     * Validates that the given signature of the operation hash is valid for the account's owner
     * @param dataHash hash of the request data, used as the basis for the signature
     * @param signature user operation signature
     */
    abstract verifySignature(
        dataHash: Field,
        signature: any,
    ): Promise<void>
}
