import { DeployArgs, Field, SmartContract, Struct } from "o1js";
import { UserOperation } from "./UserOperation";
import { Bytes32 } from "../programs/ecdsa";

export declare abstract class IAccountContract extends SmartContract {
    /**
     * Deploys a {@link AccountContract}.
     */
    deploy(args?: DeployArgs): Promise<void>;

    /**
     * Validates a user operation
     * @dev Must validate caller is the {@link EntryPoint}
     * @dev Must validate the signature and nonce
     * @param userOperation the {@link UserOperation} that is to be executed
     * @param userOperationHash hash of the request data, used as the basis for the signature
     * @param missingAccountFunds missing funds on the account's deposit in the {@link EntryPoint}
     *      This is the minimum amount to be transferred to the {@link EntryPoint} to make the call
     *      The excess is left in the {@link EntryPoint} for future calls, and can be withdrawn anytime
     * @returns validationData packaged ValidationData structure
     *      <1-byte> validity - 0 for valid signature, 1 for invalid signature
     *      <6-byte> validUntil - last timestamp thi soperation is valid, 0 for indefinite
     *      <6-byte> validAfter - first timestamp this operation is valid
     */
    abstract validateUserOp(userOperation: UserOperation, userOperationHash: Bytes32, missingAccountFunds: Field): Promise<Field>
}
