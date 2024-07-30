import { Cache } from "o1js"
import {
  Bytes32,
  Ecdsa,
  EcdsaProgram,
  Secp256k1,
  Secp256k1Scalar,
} from "../contracts/ecdsa"

// a private key is a random scalar of secp256k1
const privateKey = Secp256k1Scalar.random()
const publicKey = Secp256k1.generator.scale(privateKey)

// create a message to sign
const message = Bytes32.fromString("sneed")

// sign the message--not a provable method
const signature = Ecdsa.sign(message.toBytes(), privateKey.toBigInt())

describe("ECDSA", () => {
  it("compiles the ECDSA zkProgram", async () => {
    const cache: Cache = Cache.FileSystem("./cache")
    await EcdsaProgram.compile({ cache })
  })

  it("returns true when proving a valid signature", async () => {
    const proof = await EcdsaProgram.verifySignature(
      { message, publicKey },
      signature,
    )
    expect(proof.publicOutput.toBoolean()).toEqual(true)
  }, 1_000_000)

  it("returns false when proving an invalid signature", async () => {
    const falseMessage = Bytes32.fromString("chuck")
    const proof = await EcdsaProgram.verifySignature(
      { message: falseMessage, publicKey },
      signature,
    )
    expect(proof.publicOutput.toBoolean()).toEqual(false)
  }, 1_000_000)
})
