import { Field, Mina, Poseidon, UInt64 } from "o1js"
import { AccountContract } from "../src/contracts/AccountContract"
import { EntryPoint } from "../src/contracts/EntryPoint"
import {
    Curve,
    CurveScalar,
    CurveSignature,
    UserOperation,
    UserOperationCallData,
} from "../src/interfaces/UserOperation"
import {
    FEE,
    initLocalBlockchain,
    proofsEnabled,
    setAccountContract,
    settleEntryPoint,
} from "./test-utils"

// A private key is a random scalar of secp256k1
const privateKey = CurveScalar.random()
const owner = Curve.generator.scale(privateKey)

// Define a prefund amount
const prefund = UInt64.from(1_000_000)
// Define the initial balance of the account
const initialBalance = UInt64.from(1_000_000_000)

describe("AccountContract", () => {
    let deployer: Mina.TestPublicKey
    let account: Mina.TestPublicKey
    let sender: Mina.TestPublicKey
    let recipient: Mina.TestPublicKey
    let entryPoint: Mina.TestPublicKey
    let accountContract: AccountContract
    let entryPointContract: EntryPoint

    beforeAll(async () => {
        if (proofsEnabled) {
            await AccountContract.compile()
        }
    })

    beforeEach(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        account = localChain.aliceAccount
        sender = localChain.sender
        recipient = localChain.recipient
        entryPoint = localChain.entryPoint

        accountContract = new AccountContract(account)
        entryPointContract = new EntryPoint(entryPoint)
        entryPointContract.offchainState.setContractInstance(entryPointContract)
    })

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await accountContract.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, account.key]).send()

        const tx2 = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await entryPointContract.deploy()
            },
        )
        await tx2.prove()
        await tx2.sign([deployer.key, entryPoint.key]).send()
    }

    describe("deploy", () => {
        it("should deploy AccountContract", async () => {
            await localDeploy()
        })
    })

    describe("initialize", () => {
        it("sets the `entryPoint` and `owner` and prefunds it accordingly", async () => {
            await localDeploy()

            // Initialize the account contract
            await setAccountContract(
                deployer,
                account,
                entryPointContract,
                owner,
                prefund,
                initialBalance,
            )

            // Verify both `entryPoint` and `owner` are set accordingly
            expect(accountContract.entryPoint.get().toJSON()).toEqual(
                entryPoint.toJSON(),
            )
            expect(accountContract.owner.get().x.toString()).toEqual(
                owner.x.toString(),
            )
            expect(accountContract.owner.get().y.toString()).toEqual(
                owner.y.toString(),
            )

            // Prefunds the account
            const balance = await entryPointContract.balanceOf(account)
            expect(balance.toString()).toEqual(prefund.toString())

            // Emits an `AccountInitialized``event
            const events = await accountContract.fetchEvents()
            expect(events[0]?.type).toEqual("AccountInitialized")
        })

        it("reverts when trying to re-initialize an account", async () => {
            await localDeploy()
            await setAccountContract(
                deployer,
                account,
                entryPointContract,
                owner,
                prefund,
                initialBalance,
            )

            await expect(
                async () =>
                    await accountContract.initialize(
                        entryPointContract.address,
                        owner,
                        prefund,
                        initialBalance,
                    ),
            ).rejects.toThrow()
        })
    })

    describe("validateUserOpAndExecute", () => {
        let userOp: UserOperation

        beforeEach(async () => {
            await localDeploy()
            await setAccountContract(
                deployer,
                account,
                entryPointContract,
                owner,
                prefund,
                initialBalance,
            )

            userOp = new UserOperation({
                sender: account.key.toPublicKey(),
                nonce: Field(0),
                key: Field(0),
                calldata: new UserOperationCallData({
                    recipient: recipient.key.toPublicKey(),
                    amount: UInt64.from(100_000_000),
                }),
                fee: UInt64.from(0),
            })
        })

        it("reverts when given an invalid signature", async () => {
            // Generating an invalid signature
            const bogusSignature = CurveSignature.signHash(
                CurveScalar.from(350).toBigInt(),
                privateKey.toBigInt(),
            )

            await expect(
                async () =>
                    await Mina.transaction(
                        { sender: deployer, fee: FEE },
                        async () => {
                            await accountContract.validateUserOpAndExecute(
                                userOp,
                                bogusSignature,
                            )
                        },
                    ),
            ).rejects.toThrow()
        })

        it("sends the `amount` to the `recipient`", async () => {
            const oldBalance = await Mina.getBalance(recipient)

            const userOpHash = await entryPointContract.getUserOpHash(userOp)
            const signature = CurveSignature.signHash(
                new CurveScalar([
                    userOpHash,
                    Field(0),
                    Field(0),
                ]).toBigInt(),
                privateKey.toBigInt(),
            )

            const tx = await Mina.transaction(
                { sender, fee: FEE },
                async () => {
                    await accountContract.validateUserOpAndExecute(
                        userOp,
                        signature,
                    )
                },
            )
            await tx.prove()
            await tx.sign([sender.key]).send()
            await settleEntryPoint(entryPointContract, sender)

            const balance = await Mina.getBalance(recipient)
            expect(balance.sub(oldBalance).toString()).toEqual(
                userOp.calldata.amount.toString(),
            )
        })

        it("reverts when given a replayed nonce", async () => {
            const userOpHash = await entryPointContract.getUserOpHash(userOp)
            const signature = CurveSignature.signHash(
                new CurveScalar([
                    userOpHash,
                    Field(0),
                    Field(0),
                ]).toBigInt(),
                privateKey.toBigInt(),
            )

            const tx = await Mina.transaction(
                { sender, fee: FEE },
                async () => {
                    await accountContract.validateUserOpAndExecute(
                        userOp,
                        signature,
                    )
                },
            )
            await tx.prove()
            await tx.sign([sender.key]).send()
            await settleEntryPoint(entryPointContract, sender)

            await expect(
                async () =>
                    await Mina.transaction(
                        { sender: deployer, fee: FEE },
                        async () => {
                            await accountContract.validateUserOpAndExecute(
                                userOp,
                                signature,
                            )
                        },
                    ),
            ).rejects.toThrow()
        })
    })

    describe("verifySignature", () => {
        let userOpHash: Field

        beforeAll(() => {
            const amount = UInt64.from(350)
            const fee = UInt64.from(42)

            // Defining a user operation
            const calldata = new UserOperationCallData({ recipient, amount })
            const userOp = new UserOperation({
                sender,
                nonce: Field(42),
                key: Field(69),
                calldata,
                fee,
            })
            userOpHash = Poseidon.hashPacked(UserOperation, userOp)
        })

        beforeEach(async () => {
            await localDeploy()
            await setAccountContract(
                deployer,
                account,
                entryPointContract,
                owner,
                prefund,
                initialBalance,
            )
        })

        it("verifies a valid signature", async () => {
            // Generating a valid signature
            const signature = CurveSignature.signHash(
                new CurveScalar([
                    userOpHash,
                    Field(0),
                    Field(0),
                ]).toBigInt(),
                privateKey.toBigInt(),
            )

            const tx = await Mina.transaction(
                { sender, fee: FEE },
                async () => {
                    await accountContract.verifySignature(userOpHash, signature)
                },
            )
            await tx.prove()
            await tx.sign([sender.key]).send()
        })

        it("reverts when given an invalid signature", async () => {
            // Generating an invalid signature
            const bogusSignature = CurveSignature.signHash(
                CurveScalar.from(350).toBigInt(),
                privateKey.toBigInt(),
            )

            await expect(
                async () =>
                    await Mina.transaction(
                        { sender: deployer, fee: FEE },
                        async () => {
                            await accountContract.verifySignature(
                                userOpHash,
                                bogusSignature,
                            )
                        },
                    ),
            ).rejects.toThrow()
        })
    })
})
