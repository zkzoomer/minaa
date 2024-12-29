import {
    Mina,
    type PublicKey,
    type UInt64,
} from "o1js"
import { AccountContract, type AccountFactory } from "../src"
import type { EntryPoint } from "../src/contracts/EntryPoint"
import type { Curve } from "../src/interfaces/UserOperation"

export const proofsEnabled = process.env.SKIP_PROOFS !== "true"
if (!proofsEnabled) console.log("Skipping proof generation in tests.")

export const FEE = 100_000_000

export const initLocalBlockchain = async () => {
    const localChain = await Mina.LocalBlockchain({
        proofsEnabled,
        enforceTransactionLimits: false,
    })
    Mina.setActiveInstance(localChain)

    const [
        deployer,
        aliceAccount,
        bobAccount,
        sender,
        recipient,
        beneficiary,
        entryPoint,
        accountFactory,
    ] = localChain.testAccounts

    return {
        localChain,
        deployer,
        aliceAccount,
        bobAccount,
        sender,
        recipient,
        beneficiary,
        entryPoint,
        accountFactory,
    }
}

export const deployAccount = async (
    deployer: Mina.TestPublicKey,
    account: Mina.TestPublicKey,
    entryPointContract: EntryPoint,
    owner: Curve,
    prefund: UInt64,
    initialBalance: UInt64,
) => {
    const accountContract = new AccountContract(account)
    const tx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountContract.deploy()
        },
    )
    await tx.prove()
    await tx.sign([deployer.key, account.key]).send()

    await setAccountContract(
        deployer,
        account,
        entryPointContract,
        owner,
        prefund,
        initialBalance,
    )
}

export const setAccountContract = async (
    deployer: Mina.TestPublicKey,
    account: Mina.TestPublicKey,
    entryPointContract: EntryPoint,
    owner: Curve,
    prefund: UInt64,
    initialBalance: UInt64,
) => {
    const accountContract = new AccountContract(account)

    const deployTx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountContract.deploy()
        },
    )
    await deployTx.prove()
    await deployTx.sign([deployer.key, account.key]).send()

    const initTx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountContract.initialize(
                entryPointContract.address,
                owner,
                prefund,
                initialBalance,
            )
        },
    )
    await initTx.prove()
    await initTx.sign([deployer.key, account.key]).send()

    await settleEntryPoint(entryPointContract, deployer)
}

export const initAccountFactory = async (
    deployer: Mina.TestPublicKey,
    accountFactoryContract: AccountFactory,
    entryPointContract: EntryPoint,
) => {
    const tx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountFactoryContract.initialize(entryPointContract.address)
        },
    )
    await tx.prove()
    await tx.sign([deployer.key]).send()
}

export const addAccountToFactory = async (
    deployer: Mina.TestPublicKey,
    accountFactoryContract: AccountFactory,
    account: PublicKey,
) => {
    const tx = await Mina.transaction(
        { sender: deployer, fee: FEE },
        async () => {
            await accountFactoryContract.addAccount(account)
        },
    )
    await tx.prove()
    await tx.sign([deployer.key]).send()

    // Settle all outstanding state changes
    const proof =
        await accountFactoryContract.offchainState.createSettlementProof()
    const settleTx = await Mina.transaction(deployer, async () => {
        await accountFactoryContract.settle(proof)
    })
    await settleTx.sign([deployer.key]).prove()
    await settleTx.send()
}

export async function settleEntryPoint(
    entryPointContract: EntryPoint,
    sender: Mina.TestPublicKey,
) {
    const proof = await entryPointContract.offchainState.createSettlementProof()
    const tx = Mina.transaction(sender, async () => {
        await entryPointContract.settle(proof)
    })
    await tx.prove()
    await tx.sign([sender.key]).send()
}
