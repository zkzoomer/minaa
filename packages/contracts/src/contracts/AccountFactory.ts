import {
    AccountUpdate,
    Experimental,
    Permissions,
    PublicKey,
    SmartContract,
    State,
    method,
    state,
} from "o1js"
import { Secp256k1 } from "../interfaces/UserOperation"
import { AccountContract } from "./AccountContract"

// Offchain storage definition
const { OffchainState, OffchainStateCommitments } = Experimental
export const accountFactoryOffchainState = OffchainState({ accounts: OffchainState.Map(Secp256k1.provable, PublicKey) })
export class AccountFactoryStateProof extends accountFactoryOffchainState.Proof {}

// AccountContract verification key
const accountVerificationKey = (await AccountContract.compile()).verificationKey

export class AccountFactory extends SmartContract {
    // Offchain storage commitment
    @state(OffchainStateCommitments) offchainState = State(
        OffchainStateCommitments.empty()
    )

    /**
     * Creates an account at the specified address
     * @param owner The secp256k1 public key of the owner of the account, which must not be already defined
     * @param address The address where the account will be deployed to
     */
    @method
    public async createAccount(owner: Secp256k1, address: PublicKey) {
        // Check if account already exists, in which case transaction is reverted it
        const publicKey = await this.getPublicKey(owner)
        publicKey.assertEquals(PublicKey.empty())

        // Deploy account smart contract
        const zkapp = AccountUpdate.createSigned(address)
        zkapp.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.proofOrSignature(),
            access: Permissions.proofOrSignature(),
        })
        zkapp.account.verificationKey.set(accountVerificationKey)

        // Update offchain state
        accountFactoryOffchainState.fields.accounts.update(owner, {
            from: publicKey,
            to: address
        })
    }

    /**
     * Returns the public key of the account that corresponds to a given owner
     * @param owner The secp256k1 public key of the owner of the account
     * @returns The public key of the account
     */
    async getPublicKey(owner: Secp256k1): Promise<PublicKey> {
        const address = await accountFactoryOffchainState.fields.accounts.get(owner)

        return address.orElse(PublicKey.empty())
    }

    /**
     * Method used to resolve pending state updates
     * @param proof Recursive proof being verified
     */
    @method
    async settle(proof: AccountFactoryStateProof) {
        await accountFactoryOffchainState.settle(proof)
    }
}
