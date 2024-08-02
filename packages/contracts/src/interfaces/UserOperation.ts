import { EcdsaSignatureV2, Field, PublicKey, Struct } from "o1js";

/**
 * User Operation calldata
 * @param recipient recepient of the transaction
 * @param amount amount being transferred
 */
export class UserOperationCallData extends Struct({
    recepient: PublicKey,
    amount: Field,
}) {}

/**
 * User Operation struct
 * @param sender the sender account of this request
 * @param nonce unique value the sender uses to verify the operation is not a replay
 * @param calldata call to execute on this account
 * @param signature sender-verified signature for the request and EntryPoint address
 */
export class UserOperation extends Struct({
    sender: PublicKey,
    nonce: Field,
    calldata: UserOperationCallData,
    signature: EcdsaSignatureV2.provable,
}) {}
