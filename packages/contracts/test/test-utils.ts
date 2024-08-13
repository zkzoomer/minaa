import {
  AccountUpdate,
  Bool,
  Crypto,
  Mina,
  type PrivateKey,
  fetchAccount,
} from "o1js"

const proofsEnabled = process.env.SKIP_PROOFS !== "true"
if (!proofsEnabled) console.log("Skipping proof generation in tests.")

export const initLocalBlockchain = async () => {
  const localChain = await Mina.LocalBlockchain({
    proofsEnabled,
    enforceTransactionLimits: false,
  })
  Mina.setActiveInstance(localChain)

  const zkApp = Mina.TestPublicKey.random()
  const [deployer, sender, receiver] = localChain.testAccounts

  return {
    zkApp,
    deployer,
    sender,
    receiver,
  }
}

export const ensureFundedAccount = async (privateKey: PrivateKey) => {
  const publicKey = privateKey.toPublicKey()
  const result = await fetchAccount({ publicKey })
  const balance = result.account?.balance.toBigInt()
  if (!balance || balance <= 15_000_000_000n) {
    AccountUpdate.fundNewAccount(publicKey, 1)
  }
  return { privateKey, publicKey }
}
