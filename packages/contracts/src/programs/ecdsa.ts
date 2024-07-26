import {
  Bool,
  Bytes,
  Crypto,
  type EcdsaSignatureV2,
  ZkProgram,
  createEcdsaV2,
  createForeignCurveV2,
} from "o1js"

// TODO: Adjust to secp256r1
export class Secp256k1 extends createForeignCurveV2(
  Crypto.CurveParams.Secp256k1,
) {}
export class Secp256k1Scalar extends Secp256k1.Scalar {}
export class Secp256k1Signature extends createEcdsaV2(Secp256k1) {}

// create an instance of ECDSA over secp256k1
export class Ecdsa extends createEcdsaV2(Secp256k1) {}
export class Bytes32 extends Bytes(32) {}

export const ecdsaProgram = ZkProgram({
  name: "ecdsa",
  publicOutput: Bool,
  methods: {
    verifySignature: {
      privateInputs: [Bytes32.provable, Ecdsa.provable, Secp256k1.provable],
      async method(
        message: Bytes,
        signature: EcdsaSignatureV2,
        publicKey: Secp256k1,
      ) {
        return signature.verifyV2(message, publicKey)
      },
    },
  },
})

export type EcdsaProgram = typeof ecdsaProgram
