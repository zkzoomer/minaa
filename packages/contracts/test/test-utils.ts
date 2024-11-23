import { AccountUpdate, Mina, PrivateKey, PublicKey, UInt64, fetchAccount } from "o1js"
import { AccountContract, AccountFactory } from "../src"
import { Secp256k1 } from "../src/interfaces/UserOperation"
import { accountFactoryOffchainState } from "../src/contracts/AccountFactory"
import { EntryPoint } from "../src/contracts/EntryPoint"

export const proofsEnabled = process.env.SKIP_PROOFS !== "true"
if (!proofsEnabled) console.log("Skipping proof generation in tests.")

export const FEE = 100_000_000

export const initLocalBlockchain = async () => {
    const localChain = await Mina.LocalBlockchain({
        proofsEnabled,
        enforceTransactionLimits: false,
    })
    Mina.setActiveInstance(localChain)

    const [deployer, aliceAccount, bobAccount, sender, recipient,zkApp] = localChain.testAccounts

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

export const setAccountContract = async (
    deployer: Mina.TestPublicKey,
    account: Mina.TestPublicKey,
    entryPoint: PublicKey,
    owner: Secp256k1,
    prefund: UInt64,
) => {
    let accountContract = new AccountContract(account)

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
            await accountContract.initialize(entryPoint, owner, prefund)
        },
    )
    await initTx.prove()
    await initTx.sign([deployer.key, account.key]).send()

    const entryPointContract = new EntryPoint(entryPoint)
    await settleEntryPoint(entryPointContract, deployer)
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
    let proof = await accountFactory.offchainState.createSettlementProof()
    const settleTx = await Mina.transaction(deployer, async () => {
        await accountFactory.settle(proof);
    });
    await settleTx.sign([deployer.key]).prove();
    await settleTx.send();
}

export async function settleEntryPoint(contract: EntryPoint, sender: Mina.TestPublicKey) {
    const proof = await contract.offchainState.createSettlementProof();
    const tx = Mina.transaction(sender, async () => {
        await contract.settle(proof);
    });
    tx.sign([sender.key]);
    await tx.prove().send().wait();
}
