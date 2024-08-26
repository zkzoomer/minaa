import { AccountUpdate, Mina, PrivateKey, PublicKey, UInt64, fetchAccount } from "o1js"
import { AccountContract } from "../src"
import { Secp256k1 } from "../src/interfaces/UserOperation"

export const proofsEnabled = false //process.env.SKIP_PROOFS !== "true"
if (!proofsEnabled) console.log("Skipping proof generation in tests.")

export const FEE = 100_000_000

export const initLocalBlockchain = async () => {
    const localChain = await Mina.LocalBlockchain({
        proofsEnabled,
        enforceTransactionLimits: false,
    })
    Mina.setActiveInstance(localChain)

    const zkApp = Mina.TestPublicKey.random()
    const [deployer, aliceAccount, bobAccount, sender, recipient] = localChain.testAccounts

    return {
        localChain,
        zkApp,
        deployer,
        aliceAccount,
        bobAccount,
        sender,
        recipient,
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

export const initAccountContract = async (
    deployer: Mina.TestPublicKey,
    account: Mina.TestPublicKey,
    entryPoint: PublicKey,
    owner: Secp256k1,
) => {
    const accountContract = new AccountContract(account)
    const tx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountContract.initialize(entryPoint, owner)
        },
    )
    await tx.prove()
    await tx.sign([deployer.key, account.key]).send()
}
