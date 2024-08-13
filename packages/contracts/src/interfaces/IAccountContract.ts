import { type Bool, SmartContract, type UInt64 } from "o1js"
import type { Bytes32, UserOperation } from "./UserOperation"

export abstract class IAccountContract extends SmartContract {
    /**
     * Validates a user operation
     * @dev Must validate caller is the {@link EntryPoint}
     * @dev Must validate the signature and nonce
     * @param userOperation the {@link UserOperation} that is to be executed
     * @param userOperationHash hash of the request data, used as the basis for the signature
     * @param missingAccountFunds missing funds on the account's deposit in the {@link EntryPoint}
     *      This is the minimum amount to be transferred to the {@link EntryPoint} to make the call
     *      The excess is left in the {@link EntryPoint} for future calls, and can be withdrawn anytime
     * @returns validationData validation data, 1 for valid signature or 0 for invalid signature
     */
    abstract validateUserOp(
        userOperation: UserOperation,
        userOperationHash: Bytes32,
        missingAccountFunds: UInt64,
    ): Promise<Bool>
}
