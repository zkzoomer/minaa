import { Mina, type VerificationKey } from "o1js"
import { AccountContract } from "../src/contracts/AccountContract"
import { Bytes32, Secp256k1, Secp256k1Scalar } from "../src/interfaces/UserOperation"
import { ensureFundedAccount, initLocalBlockchain } from "./test-utils"

const FEE = 100_000_000

// a private key is a random scalar of secp256k1
const privateKey = Secp256k1Scalar.random()
const publicKey = Secp256k1.generator.scale(privateKey)

// create a message to sign
const message = Bytes32.fromString("sneed")

describe("Ownable", () => {
    let deployer: Mina.TestPublicKey
    let zkApp: Mina.TestPublicKey
    let zkAppContract: AccountContract
    let verificationKey: VerificationKey

    beforeEach(async () => {
        const localChain = await initLocalBlockchain()
        deployer = localChain.deployer
        zkApp = localChain.zkApp
        zkAppContract = new AccountContract(zkApp)
        await ensureFundedAccount(zkApp.key)
    })

    beforeAll(async () => {
        verificationKey = (await AccountContract.compile()).verificationKey
    })

    async function localDeploy() {
        const tx = await Mina.transaction(
            { sender: deployer, fee: FEE },
            async () => {
                await ensureFundedAccount(deployer.key)
                await zkAppContract.deploy()
            },
        )
        await tx.prove()
        await tx.sign([deployer.key, zkApp.key]).send()

    }

    describe("deploy", () => {
        it("should deploy AccountContract", async () => {
            await localDeploy()
            const owner = zkAppContract.owner.get()
        })
    })
})
