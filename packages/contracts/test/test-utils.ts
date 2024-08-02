import { AccountUpdate, Bool, Mina, type PrivateKey, fetchAccount, Crypto } from "o1js"
import { EcdsaProgramProof, EcdsaProgramPublicInput } from "../src/programs/ecdsa"

const proofsEnabled = process.env.SKIP_PROOFS !== "true"
if (!proofsEnabled) console.log("Skipping proof generation in tests.")

export const initLocalBlockchain = async () => {
    const localChain = await Mina.LocalBlockchain({
        proofsEnabled,
        enforceTransactionLimits: false,
    })
    Mina.setActiveInstance(localChain)

    const zkApp = Mina.TestPublicKey.random()
    const [deployer, sender, receiver] = localChain.testAccounts

    return {
        zkApp,
        deployer,
        sender,
        receiver,
    }
}

export const ensureFundedAccount = async (privateKey: PrivateKey) => {
    const publicKey = privateKey.toPublicKey()
    const result = await fetchAccount({ publicKey })
    const balance = result.account?.balance.toBigInt()
    if (!balance || balance <= 15_000_000_000n) {
        AccountUpdate.fundNewAccount(publicKey, 1)
    }
    return { privateKey, publicKey }
}

export async function ecdsaMockProof(
    publicInput: EcdsaProgramPublicInput,
    publicOutput: Bool
): Promise<EcdsaProgramProof> {
    return EcdsaProgramProof.dummy(
        publicInput,
        publicOutput,
        2,
    )
}
