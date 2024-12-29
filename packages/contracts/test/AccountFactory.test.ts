import { Mina, PublicKey, UInt64 } from "o1js"
import {
    AccountAddedEvent,
    AccountFactory,
    accountFactoryOffchainState,
} from "../src/contracts/AccountFactory"
import {
    EntryPoint,
    offchainState as entryPointOffchainState,
} from "../src/contracts/EntryPoint"
import { Curve, CurveScalar } from "../src/interfaces/UserOperation"
import {
    FEE,
    addAccountToFactory,
    deployAccount,
    initAccountFactory,
    initLocalBlockchain,
    proofsEnabled,
} from "./test-utils"

// A private key is a random scalar of secp256k1
const privateKey = CurveScalar.random()
const owner = Curve.generator.scale(privateKey)

// Define a prefund amount
const prefund = UInt64.from(350)
// Define the initial balance of the account
const initialBalance = UInt64.from(1_000_000_000)

describe("AccountFactory", () => {
    let deployer: Mina.TestPublicKey
    let account: Mina.TestPublicKey
    let accountFactory: Mina.TestPublicKey
    let entryPoint: Mina.TestPublicKey
    let accountFactoryContract: AccountFactory
    let entryPointContract: EntryPoint

    beforeAll(async () => {
        if (proofsEnabled) {
            await entryPointOffchainState.compile()
            await EntryPoint.compile()
            await accountFactoryOffchainState.compile()
            await AccountFactory.compile()
        }
    })

    beforeEach(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        account = localChain.aliceAccount
        entryPoint = localChain.entryPoint
        accountFactory = localChain.accountFactory

        accountFactoryContract = new AccountFactory(accountFactory)
        accountFactoryContract.offchainState.setContractInstance(
            accountFactoryContract,
        )
        entryPointContract = new EntryPoint(entryPoint)
        entryPointContract.offchainState.setContractInstance(entryPointContract)
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

        const tx2 = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await accountFactoryContract.deploy()
            },
        )
        await tx2.prove()
        await tx2.sign([deployer.key, accountFactory.key]).send()
    }

    describe("deploy", () => {
        it("should deploy AccountFactory", async () => {
            await localDeploy()
        })
    })

    describe("initialize", () => {
        beforeEach(async () => {
            await localDeploy()
            await initAccountFactory(
                deployer,
                accountFactoryContract,
                entryPointContract,
            )
        })

        it("sets the `entryPoint`", async () => {
            // Verify the `entryPoint` is set accordingly
            expect(accountFactoryContract.entryPoint.get().toBase58()).toEqual(
                entryPoint.toBase58(),
            )
        })

        it("reverts when trying to re-initialize the account factory", async () => {
            await expect(
                async () => await accountFactoryContract.initialize(entryPoint),
            ).rejects.toThrow()
        })
    })

    describe("addAccount", () => {
        beforeEach(async () => {
            await localDeploy()
            await initAccountFactory(
                deployer,
                accountFactoryContract,
                entryPointContract,
            )
            await deployAccount(
                deployer,
                account,
                entryPointContract,
                owner,
                prefund,
                initialBalance,
            )
        })

        it("adds an already deployed account smart contract", async () => {
            await addAccountToFactory(deployer, accountFactoryContract, account)

            // The account is added
            const accountInfo = await accountFactoryContract.getPublicKey(owner)
            expect(accountInfo.toBase58()).toEqual(account.toBase58())
        })

        it("reverts if the account contract does not have the same entry point", async () => {
            await expect(
                async () => await accountFactoryContract.addAccount(account),
            ).rejects.toThrow()
        })

        it("reverts if the account was already added", async () => {
            await addAccountToFactory(deployer, accountFactoryContract, account)
            await expect(
                async () => await accountFactoryContract.addAccount(account),
            ).rejects.toThrow()
        })

        it("emits an `AccountAdded` event", async () => {
            await addAccountToFactory(deployer, accountFactoryContract, account)

            // Emits an `AccountAdded``event
            const events = await accountFactoryContract.fetchEvents()
            expect(events[0]?.event.data).toEqual(
                AccountAddedEvent.fromValue({
                    sender: deployer,
                    factory: accountFactory,
                }),
            )
        })
    })

    describe("getPublicKey", () => {
        beforeEach(async () => {
            await localDeploy()
            await initAccountFactory(
                deployer,
                accountFactoryContract,
                entryPointContract,
            )
        })

        it("returns the public key for an existing account when given the secp256k1 owner", async () => {
            await deployAccount(
                deployer,
                account,
                entryPointContract,
                owner,
                prefund,
                initialBalance,
            )
            await addAccountToFactory(deployer, accountFactoryContract, account)

            const publicKey = await accountFactoryContract.getPublicKey(owner)
            expect(publicKey.toBase58()).toEqual(account.toBase58())
        })

        it("returns an empty public key when the secp256k1 owner does not exist", async () => {
            const publicKey = await accountFactoryContract.getPublicKey(owner)
            expect(publicKey.toBase58()).toEqual(PublicKey.empty().toBase58())
        })
    })
})
