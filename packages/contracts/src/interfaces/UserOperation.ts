import {
    Bytes,
    createEcdsaV2,
    createForeignCurveV2,
    Crypto,
    Field,
    PublicKey,
    Struct,
    UInt64
} from "o1js";

// TODO: Adjust to secp256r1
export class Secp256k1 extends createForeignCurveV2(
    Crypto.CurveParams.Secp256k1,
) {}
export class Secp256k1Scalar extends Secp256k1.Scalar {}
export class Secp256k1Signature extends createEcdsaV2(Secp256k1) {}

// create an instance of ECDSA over secp256k1
export class Ecdsa extends createEcdsaV2(Secp256k1) {}
export class Bytes32 extends Bytes(32) {}

export class EcdsaProgramPublicInput extends Struct({
    message: Bytes32.provable,
    publicKey: Secp256k1.provable,
}) {}

/**
 * User Operation calldata
 * @param recipient recepient of the transaction
 * @param amount amount being transferred
 */
export class UserOperationCallData extends Struct({
    recipient: PublicKey,
    amount: UInt64,
}) {}

/**
 * User Operation struct
 * @param sender the sender account of this request
 * @param nonce unique value the sender uses to verify the operation is not a replay
 * @param calldata call to execute on this account
 * @param signature sender-verified signature for the request and EntryPoint address
 * @param fee transaction fee
 */
export class UserOperation extends Struct({
    sender: Secp256k1.provable,
    nonce: Field,
    key: Field,
    calldata: UserOperationCallData,
    fee: UInt64,
}) {}

/**
 * Nonce Sequence struct
 * @param sender address of the account
 * @param key nonce key
 */
export class NonceSequence extends Struct({
    sender: PublicKey,
    key: Field,
}) {}
