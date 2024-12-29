import { Field, Mina, Poseidon, PublicKey, Struct, UInt64 } from "o1js"
import { EntryPoint, offchainState } from "../src/contracts/EntryPoint"
import {
    DepositedEvent,
    UserOperationEvent,
    Withdrawal,
    WithdrawnEvent,
} from "../src/interfaces/IEntryPoint"
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
    setAccountContract,
    settleEntryPoint,
} from "./test-utils"

const FEE = 100_000_000

describe("EntryPoint", () => {
    let deployer: Mina.TestPublicKey
    let entryPoint: Mina.TestPublicKey
    let account: Mina.TestPublicKey
    let recipient: Mina.TestPublicKey
    let beneficiary: Mina.TestPublicKey
    let entryPointContract: EntryPoint
    let privateKey: CurveScalar
    let owner: Curve

    // Tests break when doing a `beforeEach`
    beforeAll(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        entryPoint = localChain.entryPoint
        account = localChain.aliceAccount
        recipient = localChain.recipient
        beneficiary = localChain.beneficiary
        entryPointContract = new EntryPoint(entryPoint)
        entryPointContract.offchainState.setContractInstance(entryPointContract)

        // A private key is a random scalar of secp256k1
        privateKey = CurveScalar.random()
        owner = Curve.generator.scale(privateKey)

        if (proofsEnabled) {
            await offchainState.compile()
            await EntryPoint.compile()
        }
    })

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await entryPointContract.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, entryPoint.key]).send()
    }

    describe("deploy", () => {
        it("should deploy EntryPoint", async () => {
            await localDeploy()
        })
    })

    describe("getNonce", () => {
        it("returns 0 for a non-existent sender", async () => {
            await localDeploy()

            const nonce = await entryPointContract.getNonce(
                PublicKey.empty(),
                Field(0),
            )
            expect(nonce.toString()).toEqual(Field(0).toString())
        })
    })

    describe("balanceOf", () => {
        it("returns 0 for a non-existent account", async () => {
            await localDeploy()

            const balance = await entryPointContract.balanceOf(
                PublicKey.empty(),
            )
            expect(balance.toString()).toEqual(Field(0).toString())
        })
    })

    describe("depositTo", () => {
        let tx: Mina.Transaction<false, false>
        let deposit: UInt64
        let recipient: PublicKey

        beforeAll(async () => {
            await localDeploy()

            recipient = Mina.TestPublicKey.random()
            deposit = UInt64.from(100_000_000)
            tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPointContract.depositTo(recipient, deposit)
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()

            await settleEntryPoint(entryPointContract, deployer)
        })

        it("increments an account's balance", async () => {
            const balance = await entryPointContract.balanceOf(recipient)
            expect(balance.toString()).toEqual(deposit.toString())
        })

        it("emits a Deposited event", async () => {
            const events = await entryPointContract.fetchEvents()
            expect(events[0]?.event.data).toEqual(
                DepositedEvent.fromValue({
                    account: recipient,
                    amount: deposit,
                }),
            )
        })
    })

    describe("withdrawTo", () => {
        let tx: Mina.Transaction<false, false>
        let prefund: UInt64
        let amount: UInt64
        let oldRecipientBalance: UInt64

        beforeAll(async () => {
            oldRecipientBalance = await Mina.getBalance(recipient)
            prefund = UInt64.from(100_000_000)

            await localDeploy()
            await setAccountContract(
                deployer,
                account,
                entryPointContract,
                owner,
                prefund,
                UInt64.from(0),
            )

            // Withdraw a portion of the balance
            amount = UInt64.from(Math.floor(Math.random() * Number(prefund)))
            const withdrawToHash = Poseidon.hashPacked(
                Withdrawal,
                new Withdrawal({
                    account: account.key.toPublicKey(),
                    recipient,
                    amount,
                }),
            )
            const signature = CurveSignature.signHash(
                new CurveScalar([
                    withdrawToHash,
                    Field(0),
                    Field(0),
                ]).toBigInt(),
                privateKey.toBigInt(),
            )

            tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPointContract.withdrawTo(
                        account,
                        recipient,
                        amount,
                        signature,
                    )
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()

            await settleEntryPoint(entryPointContract, deployer)
        })

        it("decrements the account's balance", async () => {
            const balance = await entryPointContract.balanceOf(
                account.key.toPublicKey(),
            )
            expect(balance.toString()).toEqual(prefund.sub(amount).toString())
        })

        it("transfers the amount to the recipient", async () => {
            const balance = await Mina.getBalance(recipient)
            expect(balance.toString()).toEqual(
                oldRecipientBalance.add(amount).toString(),
            )
        })

        it("emits a Withdrawn event", async () => {
            const events = await entryPointContract.fetchEvents()
            expect(events[0]?.event.data).toEqual(
                WithdrawnEvent.fromValue({ account, recipient, amount }),
            )
        })
    })

    describe("handleOp", () => {
        let prefund: UInt64
        let balance: UInt64
        let fee: UInt64
        let amount: UInt64
        let userOp: UserOperation
        let oldRecipientBalance: UInt64
        let oldBeneficiaryBalance: UInt64

        const sendHandleOp = async (
            userOp: UserOperation,
            signature: CurveSignature,
        ) => {
            const tx = await Mina.transaction(
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

            return tx
        }

        beforeAll(async () => {
            oldRecipientBalance = await Mina.getBalance(recipient)
            oldBeneficiaryBalance = await Mina.getBalance(beneficiary)
            // Account already deployed
            prefund = await entryPointContract.balanceOf(
                account.key.toPublicKey(),
            )
            balance = await Mina.getBalance(account.key.toPublicKey())

            // Define a UserOperation
            fee = UInt64.from(Math.floor((Math.random() * Number(prefund)) / 2))
            amount = UInt64.from(
                Math.floor((Math.random() * Number(balance)) / 2),
            )
            userOp = new UserOperation({
                sender: account.key.toPublicKey(),
                nonce: Field(0),
                key: Field(0),
                calldata: new UserOperationCallData({ recipient, amount }),
                fee: fee,
            })
        })

        it("validates and executes the UserOperation, sending the fee to the beneficiary", async () => {
            const userOpHash = await entryPointContract.getUserOpHash(userOp)
            const signature = CurveSignature.signHash(
                new CurveScalar([userOpHash, Field(0), Field(0)]).toBigInt(),
                privateKey.toBigInt(),
            )
            await sendHandleOp(userOp, signature)

            // The fee was debited from the account's balance
            const feeBalance = await entryPointContract.balanceOf(
                account.key.toPublicKey(),
            )
            expect(feeBalance.toString()).toEqual(prefund.sub(fee).toString())
            // And sent to the beneficiary
            const beneficiaryBalance = await Mina.getBalance(beneficiary)
            expect(beneficiaryBalance.toString()).toEqual(
                oldBeneficiaryBalance.add(fee).toString(),
            )

            // The account's balance was decremented by the amount
            const accountBalance = await Mina.getBalance(
                account.key.toPublicKey(),
            )
            expect(accountBalance.toString()).toEqual(
                balance.sub(amount).toString(),
            )
            // And sent to the recipient
            const recipientBalance = await Mina.getBalance(recipient)
            expect(recipientBalance.toString()).toEqual(
                oldRecipientBalance.add(amount).toString(),
            )
        })

        it("reverts under a replay attack", async () => {
            const userOpHash = await entryPointContract.getUserOpHash(userOp)
            const signature = CurveSignature.signHash(
                new CurveScalar([userOpHash, Field(0), Field(0)]).toBigInt(),
                privateKey.toBigInt(),
            )

            await expect(
                async () =>
                    await Mina.transaction(
                        { sender: deployer, fee: FEE },
                        async () => {
                            await entryPointContract.handleOp(
                                userOp,
                                signature,
                                beneficiary.key.toPublicKey(),
                            )
                        },
                    ),
            ).rejects.toThrow()
        })

        it("reverts if the EntryPoint's balance is less than the fee", async () => {
            const invalidUserOp = {
                ...userOp,
                fee: prefund.add(UInt64.from(1)),
                nonce: Field(1),
            }
            const userOpHash =
                await entryPointContract.getUserOpHash(invalidUserOp)
            const signature = CurveSignature.signHash(
                new CurveScalar([userOpHash, Field(0), Field(0)]).toBigInt(),
                privateKey.toBigInt(),
            )

            await expect(
                async () =>
                    await Mina.transaction(
                        { sender: deployer, fee: FEE },
                        async () => {
                            await entryPointContract.handleOp(
                                invalidUserOp,
                                signature,
                                beneficiary.key.toPublicKey(),
                            )
                        },
                    ),
            ).rejects.toThrow()
        })

        it("reverts if the signature is invalid", async () => {
            const signature = CurveSignature.signHash(
                new CurveScalar([
                    Field.random(),
                    Field.random(),
                    Field.random(),
                ]).toBigInt(),
                privateKey.toBigInt(),
            )

            await expect(
                async () =>
                    await Mina.transaction(
                        { sender: deployer, fee: FEE },
                        async () => {
                            await entryPointContract.handleOp(
                                userOp,
                                signature,
                                beneficiary.key.toPublicKey(),
                            )
                        },
                    ),
            ).rejects.toThrow()
        })

        it("emits a UserOperation event", async () => {
            const userOpHash = await entryPointContract.getUserOpHash(userOp)
            const events = await entryPointContract.fetchEvents()
            expect(events[0]?.event.data).toEqual(
                UserOperationEvent.fromValue({ userOpHash, ...userOp }),
            )
        })
    })

    describe("getUserOpHash", () => {
        it("returns the hash of the UserOperation", async () => {
            const userOp = new UserOperation({
                sender: account.key.toPublicKey(),
                nonce: Field(0),
                key: Field(0),
                calldata: new UserOperationCallData({
                    recipient: PublicKey.empty(),
                    amount: UInt64.from(0),
                }),
                fee: UInt64.from(0),
            })
            let expectedHash = Poseidon.hashPacked(UserOperation, userOp)
            expectedHash = Poseidon.hashPacked(
                Struct({ hash: Field, address: PublicKey }),
                { hash: expectedHash, address: entryPointContract.address },
            )

            const hash = await entryPointContract.getUserOpHash(userOp)
            expect(hash.toString()).toEqual(expectedHash.toString())
        })
    })

    describe("validateAndUpdateNonce", () => {
        it("validates and updates the nonce", async () => {
            const key = Field.random()
            const tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPointContract.validateAndUpdateNonce(
                        account.key.toPublicKey(),
                        key,
                        Field(0),
                    )
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()
            await settleEntryPoint(entryPointContract, deployer)

            const nonce = await entryPointContract.getNonce(
                account.key.toPublicKey(),
                key,
            )
            expect(nonce.toString()).toEqual(Field(1).toString())
        })

        it("reverts if the nonce is not valid", async () => {
            const key = Field.random()
            const tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPointContract.validateAndUpdateNonce(
                        account.key.toPublicKey(),
                        key,
                        Field(0),
                    )
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()
            await settleEntryPoint(entryPointContract, deployer)

            await expect(
                async () =>
                    await Mina.transaction(
                        { sender: deployer, fee: FEE },
                        async () => {
                            await entryPointContract.validateAndUpdateNonce(
                                account.key.toPublicKey(),
                                key,
                                Field(0),
                            )
                        },
                    ),
            ).rejects.toThrow()
        })
    })
})
