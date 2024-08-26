import { Field, Mina, Poseidon, PublicKey, UInt64 } from "o1js"
import { AccountContract } from "../src/contracts/AccountContract"
import { Secp256k1, Secp256k1Scalar, Secp256k1Signature, UserOperation, UserOperationCallData } from "../src/interfaces/UserOperation"
import { proofsEnabled, ensureFundedAccount, initLocalBlockchain, initAccountContract, FEE } from "./test-utils"

// A private key is a random scalar of secp256k1
const privateKey = Secp256k1Scalar.random()
const owner = Secp256k1.generator.scale(privateKey)

// Define the entry point and owner
const entryPoint = Mina.TestPublicKey.random()

describe("Ownable", () => {
    let deployer: Mina.TestPublicKey
    let sender: Mina.TestPublicKey
    let recipient: Mina.TestPublicKey
    let aliceAccount: Mina.TestPublicKey
    let aliceAccountContract: AccountContract

    beforeAll(async () => {
        if (proofsEnabled) await AccountContract.compile()
    })

    beforeEach(async () => {
        ({ aliceAccount, deployer, sender, recipient } = await initLocalBlockchain())
        aliceAccountContract = new AccountContract(aliceAccount)
        await ensureFundedAccount(aliceAccount.key)
    })

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await aliceAccountContract.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, aliceAccount.key]).send()
    }

    describe("deploy", () => {
        it("should deploy AccountContract", async () => {
            await localDeploy()
        })
    })

    describe("initialize", () => {
        it("sets the `entryPoint` and `owner`", async () => {
            await localDeploy()

            // Initialize the account contract
            await initAccountContract(deployer, aliceAccount, entryPoint, owner)

            // Verify both `entryPoint` and `owner` are set accordingly
            expect(aliceAccountContract.entryPoint.get().toJSON()).toEqual(entryPoint.toJSON())
            expect(aliceAccountContract.owner.get().x.toString()).toEqual(owner.x.toString())
            expect(aliceAccountContract.owner.get().y.toString()).toEqual(owner.y.toString())

            // Emits an `AccountInitialized``event
            const events = await aliceAccountContract.fetchEvents()
            expect(events[0]?.type).toEqual('AccountInitialized')
        })

        it("reverts when trying to re-initialize an account", async () => {
            await localDeploy()
            await initAccountContract(deployer, aliceAccount, entryPoint, owner)

            await expect(async () => await aliceAccountContract.initialize(entryPoint, owner)).rejects.toThrow();
        })
    })

    describe("execute", () => {
        it("reverts when the call is not sent via the `EntryPoint`", async () => {
            await expect(async () => await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await aliceAccountContract.execute(PublicKey.empty(), UInt64.from(0))
                },
            )).rejects.toThrow();
        })

        it("sends a `value` amount to the `recipient`", async () => {
            await localDeploy()
            // Setting the sender to be the entry point for easier testing
            await initAccountContract(deployer, aliceAccount, sender, owner)
            // Recipient of the funds
            let startBalance = Mina.getAccount(recipient).balance;

            const amount = UInt64.from(350)
            const tx = await Mina.transaction(
                { sender: sender, fee: FEE },
                async () => {
                    await aliceAccountContract.execute(recipient, amount)
                },
            )
            await tx.prove()
            await tx.sign([sender.key]).send()

            // Recipient's balance is increased
            let endBalance = Mina.getAccount(recipient).balance;
            expect(endBalance.sub(startBalance).toString()).toEqual(amount.toString());
        })
    })

    describe("verifySignature", () => {
        let userOpHash: Field

        beforeAll(() => {
            const amount = UInt64.from(350)
            const fee = UInt64.from(42)
    
            // Defining a user operation
            const calldata = new UserOperationCallData({ recipient, amount })
            const userOp = new UserOperation({ sender, nonce: Field(42), key: Field(69), calldata, fee })
            userOpHash = Poseidon.hashPacked(UserOperation, userOp)
        })

        it("verifies a valid signature", async () => {
            await localDeploy()
            await initAccountContract(deployer, aliceAccount, sender, owner)

            // Generating a valid signature
            const signature = Secp256k1Signature.signHash(
                (new Secp256k1Scalar([userOpHash, Field(0), Field(0)])).toBigInt(),
                privateKey.toBigInt(),
            );

            const tx = await Mina.transaction(
                { sender, fee: FEE },
                async () => {
                    await aliceAccountContract.verifySignature(userOpHash, signature)
                },
            )
            await tx.prove()
            await tx.sign([sender.key]).send()
        })

        it("reverts when given an invalid signature", async () => {
            await localDeploy()
            await initAccountContract(deployer, aliceAccount, sender, owner)

            // Generating an invalid signature
            const bogusSignature = Secp256k1Signature.signHash(
                Secp256k1Scalar.from(350).toBigInt(),
                privateKey.toBigInt(),
            );

            await expect(async () => await Mina.transaction(
                { sender: deployer, fee: FEE },
                async () => {
                    await aliceAccountContract.verifySignature(userOpHash, bogusSignature)
                },
            )).rejects.toThrow();
        })
    })
})
