import { SmartContract } from "o1js"
import type { EcdsaProgramProof } from "../programs/ecdsa"

export class Account extends SmartContract {
  _verifySignatureProof(signatureProof: EcdsaProgramProof) {
    signatureProof.verify()
    return signatureProof.publicOutput
  }
}
