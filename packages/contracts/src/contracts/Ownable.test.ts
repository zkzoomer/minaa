import { Group, Mina, type VerificationKey } from "o1js"
import { ensureFundedAccount, initLocalBlockchain } from "../test-utils"
import { Ownable } from "./Ownable"

const FEE = 100_000_000

describe("Ownable", () => {
  let deployer: Mina.TestPublicKey
  let sender: Mina.TestPublicKey
  let receiver: Mina.TestPublicKey
  let zkApp: Mina.TestPublicKey
  let zkAppContract: Ownable
  let verificationKey: VerificationKey

  beforeEach(async () => {
    const localChain = await initLocalBlockchain()
    deployer = localChain.deployer
    sender = localChain.sender
    receiver = localChain.receiver
    zkApp = localChain.zkApp
    zkAppContract = new Ownable(zkApp)
    await ensureFundedAccount(zkApp.key)
  })

  beforeAll(async () => {
    verificationKey = (await Ownable.compile()).verificationKey
  })

  async function localDeploy() {
    const tx = await Mina.transaction(
      { sender: deployer, fee: FEE },
      async () => {
        await ensureFundedAccount(deployer.key)
        await zkAppContract.deploy({ verificationKey })
      },
    )
    await tx.prove()
    await tx.sign([deployer.key, zkApp.key]).send()
  }

  describe("deploy", () => {
    it("should deploy Ownable contract", async () => {
      await localDeploy()
      const owner = zkAppContract.owner.get()
      expect(owner).toEqual(Group.from(0, 0))
    })
  })

  describe("transferOwnership", () => {
    it("transfers the ownership to different public key", async () => {
      await localDeploy()
      const newOwner = Group.from(-1, 2)
      const tx = await Mina.transaction({ sender, fee: FEE }, async () => {
        await zkAppContract.transferOwnership(newOwner)
      })
      await tx.prove()
      await tx.sign([sender.key, zkApp.key]).send()
      const owner = zkAppContract.owner.get()
      expect(owner).toEqual(newOwner)
    })
  })
})
