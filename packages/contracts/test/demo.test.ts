import { Field, Mina, Transaction, TransactionPromise, UInt64 } from "o1js"
import { AccountContract } from "../src/contracts/AccountContract"
import { EntryPoint, offchainState } from "../src/contracts/EntryPoint"
import {
    Curve,
    CurveScalar,
    CurveSignature,
    UserOperation,
    UserOperationCallData,
} from "../src/interfaces/UserOperation"
import {
    initLocalBlockchain,
    proofsEnabled,
    settleEntryPoint,
} from "./test-utils"

const FEE = 100_000_000

describe("EntryPoint", () => {
    let tx: Transaction<false, false>
    let deployer: Mina.TestPublicKey
    let entryPoint: Mina.TestPublicKey
    let account: Mina.TestPublicKey
    let recipient: Mina.TestPublicKey
    let beneficiary: Mina.TestPublicKey
    let accountContract: AccountContract
    let entryPointContract: EntryPoint
    let privateKey: CurveScalar
    let owner: Curve

    beforeAll(async () => {
        if (proofsEnabled) {
            await offchainState.compile()
            await EntryPoint.compile()
        }

        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        entryPoint = localChain.entryPoint
        account = localChain.aliceAccount
        recipient = localChain.recipient
        beneficiary = localChain.beneficiary

        accountContract = new AccountContract(account)
        entryPointContract = new EntryPoint(entryPoint)
        entryPointContract.offchainState.setContractInstance(entryPointContract)

        // A private key is a random scalar of secp256k1
        privateKey = CurveScalar.random()
        owner = Curve.generator.scale(privateKey)
    })

    it("demo", async () => {
        // Deploy entry point contract
        tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await entryPointContract.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, entryPoint.key]).send()

        // Deploy account contract
        tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await accountContract.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, account.key]).send()

        // Initialize the account contract
        const prefund = UInt64.from(1_000_000)
        const initialBalance = UInt64.from(1_000_000_000)
        tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await accountContract.initialize(
                    entryPoint,
                    owner,
                    prefund,
                    initialBalance,
                )
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, account.key]).send()
        await settleEntryPoint(entryPointContract, deployer)

        // Define and sign a user operation
        const userOp = new UserOperation({
            sender: account.key.toPublicKey(),
            nonce: Field(0),
            key: Field(0),
            calldata: new UserOperationCallData({
                recipient: recipient.key.toPublicKey(),
                amount: UInt64.from(100_000_000),
            }),
            fee: UInt64.from(1_000),
        })
        const userOpHash = await entryPointContract.getUserOpHash(userOp)
        const signature = CurveSignature.signHash(
            new CurveScalar([userOpHash, Field(0), Field(0)]).toBigInt(),
            privateKey.toBigInt(),
        )

        // Send the user operation to the entry point
        tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await entryPointContract.handleOp(
                    userOp,
                    signature,
                    beneficiary.key.toPublicKey(),
                )
            },
        )
        await tx.prove()
        await tx.sign([deployer.key]).send()
        await settleEntryPoint(entryPointContract, deployer)
    })
})
