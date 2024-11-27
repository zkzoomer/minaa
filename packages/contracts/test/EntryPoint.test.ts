import { Field,PublicKey,  Mina, UInt64, fetchEvents, Poseidon } from "o1js"
import { EntryPoint, offchainState } from "../src/contracts/EntryPoint"
import { Bytes32, Secp256k1, Secp256k1Scalar, Secp256k1Signature } from "../src/interfaces/UserOperation"
import { initLocalBlockchain, proofsEnabled, setAccountContract, settleEntryPoint } from "./test-utils"
import { DepositedEvent, Withdrawal, WithdrawnEvent } from "../src/interfaces/IEntryPoint"

const FEE = 100_000_000

// a private key is a random scalar of secp256k1
const privateKey = Secp256k1Scalar.random()
const publicKey = Secp256k1.generator.scale(privateKey)

// create a message to sign
const message = Bytes32.fromString("sneed")

describe("EntryPoint", () => {
    let deployer: Mina.TestPublicKey
    let zkApp: Mina.TestPublicKey
    let account: Mina.TestPublicKey
    let recipient: Mina.TestPublicKey
    let entryPoint: EntryPoint

    beforeAll(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        zkApp = localChain.zkApp
        account = localChain.aliceAccount
        recipient = localChain.recipient
        entryPoint = new EntryPoint(zkApp)
        entryPoint.offchainState.setContractInstance(entryPoint)

        if (proofsEnabled) {
            await offchainState.compile()
            await EntryPoint.compile()
        }
    })

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await entryPoint.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, zkApp.key]).send()
    }

    describe("deploy", () => {
        it("should deploy EntryPoint", async () => {
            await localDeploy()
        })
    })

    describe("getNonce", () => {
        it("returns 0 for a non-existent sender", async () => {
            await localDeploy()

            const nonce = await entryPoint.getNonce(PublicKey.empty(), Field(0))
            expect(nonce.toString()).toEqual(Field(0).toString())
        })
    })

    describe("balanceOf", () => {
        it("returns 0 for a non-existent account", async () => {
            await localDeploy()

            const balance = await entryPoint.balanceOf(PublicKey.empty())
            expect(balance.toString()).toEqual(Field(0).toString())
        })
    })

    describe("depositTo", () => {
        let tx: Mina.Transaction<false, false>
        let deposit: UInt64
        let recipient: PublicKey

        beforeAll(async () => {
            await localDeploy()
            
            deposit = UInt64.from(100_000_000)
            recipient = Mina.TestPublicKey.random()
            tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPoint.depositTo(recipient, deposit)
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()

            await settleEntryPoint(entryPoint, deployer)
        })

        it("increments an account's balance", async () => {
            const balance = await entryPoint.balanceOf(recipient)
            expect(balance.toString()).toEqual(deposit.toString())
        })

        it("emits a Deposited event", async () => {
            const events = await entryPoint.fetchEvents();
            expect(events[0]?.event.data).toEqual(DepositedEvent.fromValue({ account: recipient, amount: deposit }))
        })
    })

    describe("withdrawTo", () => {
        let tx: Mina.Transaction<false, false>
        let privateKey: Secp256k1Scalar
        let owner: Secp256k1
        let deposit: UInt64
        let amount: UInt64
        let oldBalance: UInt64

        beforeAll(async () => {
            oldBalance = await Mina.getBalance(recipient)

            // A private key is a random scalar of secp256k1
            privateKey = Secp256k1Scalar.random()
            owner = Secp256k1.generator.scale(privateKey)
            deposit = UInt64.from(100_000_000)

            await localDeploy()
            await setAccountContract(deployer, account, entryPoint.address, owner, deposit)

            // Withdraw a portion of the balance
            amount = UInt64.from(Math.floor(Math.random() * Number(deposit)))
            const withdrawToHash = Poseidon.hashPacked(Withdrawal, new Withdrawal({ account: account.key.toPublicKey(), recipient, amount }))
            const signature = Secp256k1Signature.signHash(
                (new Secp256k1Scalar([withdrawToHash, Field(0), Field(0)])).toBigInt(),
                privateKey.toBigInt(),
            );

            tx = await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await entryPoint.withdrawTo(account, recipient, amount, signature)
                },
            )
            await tx.prove()
            await tx.sign([deployer.key]).send()

            await settleEntryPoint(entryPoint, deployer)
        })

        it("decrements the account's balance", async () => {
            const balance = await entryPoint.balanceOf(account.key.toPublicKey())
            expect(balance.toString()).toEqual(deposit.sub(amount).toString())
        })

        it("transfers the amount to the recipient", async () => {
            const balance = await Mina.getBalance(recipient)
            expect(balance.toString()).toEqual(oldBalance.add(amount).toString())
        })

        it("emits a Withdrawn event", async () => {
            const events = await entryPoint.fetchEvents();
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
            expectedHash = Poseidon.hashPacked(Struct({ hash: Field, address: PublicKey }), { hash: expectedHash, address: entryPoint.address })

            const hash = await entryPoint.getUserOpHash(userOp)
            expect(hash.toString()).toEqual(expectedHash.toString())
        })
    })
})
