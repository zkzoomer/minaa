import { Mina, VerificationKey } from "o1js"
import { EntryPoint, entryPointOffchainState } from "../src/contracts/EntryPoint"
import { Bytes32, Secp256k1, Secp256k1Scalar } from "../src/interfaces/UserOperation"
import { ensureFundedAccount, initLocalBlockchain, proofsEnabled } from "./test-utils"

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
    let verificationKey: VerificationKey

    beforeAll(async () => {
        if (proofsEnabled) {
            await entryPointOffchainState.compile()
            verificationKey = (await EntryPoint.compile()).verificationKey
        }
    })

    beforeEach(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        zkApp = localChain.zkApp
        entryPoint = new EntryPoint(zkApp)
        entryPoint.offchainState.setContractInstance(entryPoint)
        await ensureFundedAccount(zkApp.key)
    })

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await ensureFundedAccount(deployer.key)
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
})
