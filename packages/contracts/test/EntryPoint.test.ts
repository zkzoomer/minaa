import { Field,PublicKey,  Mina, UInt64, Poseidon, Struct } from "o1js"
import { EntryPoint, offchainState } from "../src/contracts/EntryPoint"
import { Secp256k1, Secp256k1Scalar, Secp256k1Signature, UserOperation, UserOperationCallData } from "../src/interfaces/UserOperation"
import { initLocalBlockchain, proofsEnabled, setAccountContract, settleEntryPoint } from "./test-utils"
import { DepositedEvent, Withdrawal, WithdrawnEvent } from "../src/interfaces/IEntryPoint"

const FEE = 100_000_000

describe("EntryPoint", () => {
    let deployer: Mina.TestPublicKey
    let entryPoint: Mina.TestPublicKey
    let account: Mina.TestPublicKey
    let recipient: Mina.TestPublicKey
    let entryPointContract: EntryPoint

    // Tests break when doing a `beforeEach`
    beforeAll(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        entryPoint = localChain.entryPoint
        account = localChain.aliceAccount
        recipient = localChain.recipient
        entryPointContract = new EntryPoint(entryPoint)
        entryPointContract.offchainState.setContractInstance(entryPointContract)

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

            const nonce = await entryPointContract.getNonce(PublicKey.empty(), Field(0))
            expect(nonce.toString()).toEqual(Field(0).toString())
        })
    })

    describe("balanceOf", () => {
        it("returns 0 for a non-existent account", async () => {
            await localDeploy()

            const balance = await entryPointContract.balanceOf(PublicKey.empty())
            expect(balance.toString()).toEqual(Field(0).toString())
        })
    })

    // TODO: issue below
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
            const events = await entryPointContract.fetchEvents();
            expect(events[0]?.event.data).toEqual(DepositedEvent.fromValue({ account: recipient, amount: deposit }))
        })
    })

    describe("withdrawTo", () => {
        let tx: Mina.Transaction<false, false>
        let privateKey: Secp256k1Scalar
        let owner: Secp256k1
        let prefund: UInt64
        let amount: UInt64
        let oldRecipientBalance: UInt64

        beforeAll(async () => {
            oldRecipientBalance = await Mina.getBalance(recipient)

            // A private key is a random scalar of secp256k1
            privateKey = Secp256k1Scalar.random()
            owner = Secp256k1.generator.scale(privateKey)
            prefund = UInt64.from(100_000_000)

            await localDeploy()
            await setAccountContract(deployer, account, entryPointContract, owner, prefund, UInt64.from(0))

            // Withdraw a portion of the balance
            amount = UInt64.from(Math.floor(Math.random() * Number(prefund)))
            const withdrawToHash = Poseidon.hashPacked(Withdrawal, new Withdrawal({ account: account.key.toPublicKey(), recipient, amount }))
            const signature = Secp256k1Signature.signHash(
                (new Secp256k1Scalar([withdrawToHash, Field(0), Field(0)])).toBigInt(),
                privateKey.toBigInt(),
            );

            tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPointContract.withdrawTo(account, recipient, amount, signature)
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()

            await settleEntryPoint(entryPointContract, deployer)
        })

        it("decrements the account's balance", async () => {
            const balance = await entryPointContract.balanceOf(account.key.toPublicKey())
            expect(balance.toString()).toEqual(prefund.sub(amount).toString())
        })

        it("transfers the amount to the recipient", async () => {
            const balance = await Mina.getBalance(recipient)
            expect(balance.toString()).toEqual(oldRecipientBalance.add(amount).toString())
        })

        it("emits a Withdrawn event", async () => {
            const events = await entryPointContract.fetchEvents();
            expect(events[0]?.event.data).toEqual(WithdrawnEvent.fromValue({ account, recipient, amount }))
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
            expectedHash = Poseidon.hashPacked(Struct({ hash: Field, address: PublicKey }), { hash: expectedHash, address: entryPointContract.address })

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
                    await entryPointContract.validateAndUpdateNonce(account.key.toPublicKey(), key, Field(0))
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()
            await settleEntryPoint(entryPointContract, deployer)

            const nonce = await entryPointContract.getNonce(account.key.toPublicKey(), key)
            expect(nonce.toString()).toEqual(Field(1).toString())
        })

        it("reverts if the nonce is not valid", async () => {
            const key = Field.random()
            const tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPointContract.validateAndUpdateNonce(account.key.toPublicKey(), key, Field(0))
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()
            await settleEntryPoint(entryPointContract, deployer)

            await expect(async () => await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPointContract.validateAndUpdateNonce(account.key.toPublicKey(), key, Field(0))
                },
            )).rejects.toThrow();
        })
    })
})
