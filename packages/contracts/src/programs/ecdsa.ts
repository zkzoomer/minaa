import {
  Bool,
  Bytes,
  Crypto,
  type EcdsaSignatureV2,
  Field,
  Struct,
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

export class EcdsaProgramPublicInput extends Struct({
  message: Bytes32.provable,
  publicKey: Secp256k1.provable,
}) {}

export const EcdsaProgram = ZkProgram({
  name: "ecdsa",
  publicInput: EcdsaProgramPublicInput,
  publicOutput: Bool,
  methods: {
    verifySignature: {
      privateInputs: [Ecdsa.provable],
      async method(
        { message, publicKey }: EcdsaProgramPublicInput,
        signature: EcdsaSignatureV2,
      ) {
        return signature.verifyV2(message, publicKey)
      },
    },
  },
})

export class EcdsaProgramProof extends ZkProgram.Proof(EcdsaProgram) {}

export type EcdsaProgram = typeof EcdsaProgram
