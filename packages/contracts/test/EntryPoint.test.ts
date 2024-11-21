import { Field,PublicKey,  Mina } from "o1js"
import { EntryPoint, offchainState } from "../src/contracts/EntryPoint"
import { Bytes32, Secp256k1, Secp256k1Scalar } from "../src/interfaces/UserOperation"
import { initLocalBlockchain, proofsEnabled } from "./test-utils"

const FEE = 100_000_000

// a private key is a random scalar of secp256k1
const privateKey = Secp256k1Scalar.random()
const publicKey = Secp256k1.generator.scale(privateKey)

// create a message to sign
const message = Bytes32.fromString("sneed")

describe("EntryPoint", () => {
    let deployer: Mina.TestPublicKey
    let zkApp: Mina.TestPublicKey
    let entryPoint: EntryPoint

    beforeAll(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        zkApp = localChain.zkApp
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
})

// HELPER FUNCTIONS
async function settle(contract: EntryPoint, sender: Mina.TestPublicKey) {
    const proof = await contract.offchainState.createSettlementProof();
    const tx = Mina.transaction(sender, async () => {
        await contract.settle(proof);
    });
    tx.sign([sender.key]);
    await tx.prove().send().wait();
}
