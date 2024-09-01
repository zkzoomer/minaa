import { AccountUpdate, Mina, PrivateKey, PublicKey, UInt64, fetchAccount } from "o1js"
import { AccountContract, AccountFactory } from "../src"
import { Secp256k1 } from "../src/interfaces/UserOperation"
import { accountFactoryOffchainState } from "../src/contracts/AccountFactory"

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
    prefund: UInt64,
) => {
    const accountContract = new AccountContract(account)
    const tx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountContract.initialize(entryPoint, owner, prefund)
        },
    )
    await tx.prove()
    await tx.sign([deployer.key, account.key]).send()
}

export const deployAndInitAccountContract = async (
    deployer: Mina.TestPublicKey,
    account: Mina.TestPublicKey,
    entryPoint: PublicKey,
    owner: Secp256k1,
    prefund: UInt64,
) => {
    const accountContract = new AccountContract(account)
    const deployTx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountContract.initialize(entryPoint, owner, prefund)
        },
    )
    await deployTx.prove()
    await deployTx.sign([deployer.key, account.key]).send()

    await initAccountContract(deployer, account, entryPoint, owner, prefund)
}

export const initAccountFactory = async (
    deployer: Mina.TestPublicKey,
    accountFactory: AccountFactory,
    entryPoint: PublicKey,
) => {
    const tx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountFactory.initialize(entryPoint)
        },
    )
    await tx.prove()
    await tx.sign([deployer.key]).send()
}

export const addAccountToFactory = async (
    deployer: Mina.TestPublicKey,
    accountFactory: AccountFactory,
    account: PublicKey,
) => {
    const tx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountFactory.addAccount(account)
        },
    )
    await tx.prove()
    await tx.sign([deployer.key]).send()

    // Settle all outstanding state changes
    let proof = await accountFactoryOffchainState.createSettlementProof()
    const settleTx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountFactory.settle(proof)
        },
    )
    await settleTx.prove()
    await settleTx.sign([deployer.key]).send()
}
