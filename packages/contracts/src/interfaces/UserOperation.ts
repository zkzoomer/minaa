import {
    Bytes,
    Crypto,
    Field,
    PublicKey,
    Struct,
    UInt64,
    createEcdsa,
    createForeignCurve,
} from "o1js"

export class Curve extends createForeignCurve(
    process.env.SECP256R1 === "true"
        ? Crypto.CurveParams.Secp256r1
        : Crypto.CurveParams.Secp256k1,
) {}
console.log("CURVE: ", process.env.SECP256R1)
export class CurveScalar extends Curve.Scalar {}
export class CurveSignature extends createEcdsa(Curve) {}

// create an instance of ECDSA over the curve
export class Ecdsa extends createEcdsa(Curve) {}
export class Bytes32 extends Bytes(32) {}

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
 * @param key nonce key
 * @param calldata call to execute on this account
 * @param fee transaction fee
 */
export class UserOperation extends Struct({
    sender: PublicKey,
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
