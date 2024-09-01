import { Mina, PublicKey, UInt64, VerificationKey } from "o1js"
import { AccountFactory, accountFactoryOffchainState } from "../src/contracts/AccountFactory"
import { addAccountToFactory, deployAndInitAccountContract, ensureFundedAccount, FEE, initAccountContract, initAccountFactory, initLocalBlockchain, proofsEnabled } from "./test-utils"
import { Secp256k1, Secp256k1Scalar } from "../src/interfaces/UserOperation"
import { AccountContract } from "../src"

// A private key is a random scalar of secp256k1
const privateKey = Secp256k1Scalar.random()
const owner = Secp256k1.generator.scale(privateKey)

// Define a prefund amount
const prefund = UInt64.from(350)

// Define the entry point
const entryPoint = Mina.TestPublicKey.random()

describe("AccountFactory", () => {
    let localChain: any
    let zkApp: Mina.TestPublicKey
    let deployer: Mina.TestPublicKey
    let sender: Mina.TestPublicKey
    let aliceAccount: Mina.TestPublicKey
    let aliceAccountContract: AccountContract
    let accountFactory: AccountFactory

    beforeAll(async () => {
        if (proofsEnabled) {
            await accountFactoryOffchainState.compile()
            await AccountFactory.compile()
        }
    })

    beforeEach(async () => {
        ({ localChain, zkApp, aliceAccount, deployer, sender } = await initLocalBlockchain())
        accountFactory = new AccountFactory(zkApp)
        accountFactoryOffchainState.setContractInstance(accountFactory)
        await ensureFundedAccount(zkApp.key)
    })

    async function deployAccount() {
        aliceAccountContract = new AccountContract(aliceAccount)
        await ensureFundedAccount(aliceAccount.key)

        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await aliceAccountContract.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, aliceAccount.key]).send()
    }

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await ensureFundedAccount(deployer.key)
                await accountFactory.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, zkApp.key]).send()
    }

    describe("deploy", () => {
        it("should deploy AccountFactory", async () => {
            await localDeploy()
        })
    })

    describe("initialize", () => {
        it("sets the `entryPoint`", async () => {
            await localDeploy()

            // Initialize the account contract
            await initAccountFactory(deployer, accountFactory, entryPoint)

            // Verify the `entryPoint` is set accordingly
            expect(accountFactory.entryPoint.get().toJSON()).toEqual(entryPoint.toJSON())
        })

        it("reverts when trying to re-initialize the account factory", async () => {
            await localDeploy()
            await initAccountFactory(deployer, accountFactory, entryPoint)

            await expect(async () => await accountFactory.initialize(entryPoint)).rejects.toThrow()
        })
    })

    describe("addAccount", () => {
        it("adds an already deployed account smart contract", async () => {
            await localDeploy()
            await initAccountFactory(deployer, accountFactory, entryPoint)
            await deployAccount()
            await initAccountContract(deployer, aliceAccount, entryPoint, owner, prefund)
            await addAccountToFactory(deployer, accountFactory, aliceAccount)

            // Emits an `AccountAdded``event
            const events = await accountFactory.fetchEvents()
            expect(events[0]?.type).toEqual('AccountAdded')
        })

        it("reverts if the account contract does not have the same entry point", async () => {
            await localDeploy()
            await initAccountFactory(deployer, accountFactory, entryPoint)
            await deployAccount()
            await initAccountContract(deployer, aliceAccount, sender, owner, prefund)

            await expect(async () => await accountFactory.addAccount(aliceAccount)).rejects.toThrow()
        })

        it("reverts if the account was already added", async () => {
            await localDeploy()
            await initAccountFactory(deployer, accountFactory, entryPoint)
            await deployAccount()
            await initAccountContract(deployer, aliceAccount, entryPoint, owner, prefund)
            await addAccountToFactory(deployer, accountFactory, aliceAccount)

            await expect(async () => await accountFactory.addAccount(aliceAccount)).rejects.toThrow()
        })
    })

    describe("getPublicKey", () => {
        it("returns the public key for an existing account when given the secp256k1 owner", async () => {
            await localDeploy()
            await initAccountFactory(deployer, accountFactory, entryPoint)
            await deployAccount()
            await initAccountContract(deployer, aliceAccount, entryPoint, owner, prefund)
            await addAccountToFactory(deployer, accountFactory, aliceAccount)

            const publicKey = await accountFactory.getPublicKey(owner)
            expect(publicKey.toBase58()).toEqual(aliceAccount.toBase58())
        })

        it("returns an empty public key when the secp256k1 owner does not exist", async () => {
            await localDeploy()
            await initAccountFactory(deployer, accountFactory, entryPoint)

            const publicKey = await accountFactory.getPublicKey(owner)
            expect(publicKey.toBase58()).toEqual(PublicKey.empty().toBase58())
        })
    })
})
