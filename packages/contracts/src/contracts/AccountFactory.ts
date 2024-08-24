import {
    AccountUpdate,
    Experimental,
    Field,
    Permissions,
    PublicKey,
    SmartContract,
    State,
    Struct,
    UInt64,
    method,
    state,
} from "o1js"
import { Secp256k1 } from "../interfaces/UserOperation"
import { AccountContract } from "./AccountContract"

/**
 * An event emitted after a given account `sender` was deployed
 * @param sender the account that is deployed
 * @param factory the factory used to deploy this account
 */
export class AccountDeployedEvent extends Struct({
    sender: PublicKey,
    factory: PublicKey,
}) {}


// Offchain storage definition
const { OffchainState, OffchainStateCommitments } = Experimental
export const accountFactoryOffchainState = OffchainState({ accounts: OffchainState.Map(Secp256k1.provable, PublicKey) })
export class AccountFactoryStateProof extends accountFactoryOffchainState.Proof {}

// AccountContract verification key
const accountVerificationKey = (await AccountContract.compile()).verificationKey

export class AccountFactory extends SmartContract {
    events = {
        AccountDeployed: AccountDeployedEvent,
    }

    // `EntryPoint` contract
    @state(PublicKey)
    entryPoint = State<PublicKey>()
    // Offchain storage commitment
    @state(OffchainStateCommitments) offchainState = State(
        OffchainStateCommitments.empty()
    )

    /**
     * Initializes the `AccountFactory` smart contract
     * @param entryPoint The `EntryPoint` smart contract
     */
    @method
    async initialize(entryPoint: PublicKey) {
        // Check that the `AccountFactory` was not already initialized
        this.entryPoint.getAndRequireEquals().assertEquals(PublicKey.empty())
        // Define the account's `entryPoint`
        this.entryPoint.set(entryPoint)
    }

    /**
     * Creates an account at the specified address
     * @param owner The secp256k1 public key of the owner of the account, which must not be already defined
     * @param address The address where the account will be deployed to
     * @param prefund amount the account is prefunded with
     */
    @method
    public async createAccount(owner: Secp256k1, address: PublicKey, prefund: UInt64) {
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

        // Initialize the account smart contract
        const accountContract = new AccountContract(address)
        await accountContract.initialize(this.entryPoint.getAndRequireEquals(), owner)

        // Update offchain state
        accountFactoryOffchainState.fields.accounts.update(owner, {
            from: publicKey,
            to: address
        })

        // Prefund the account with the transaction amount
        AccountUpdate.createSigned(this.sender.getAndRequireSignature()).send({ to: this, amount: prefund });

        // Emit an `AccountDeployed` event
        this.emitEvent('AccountDeployed', new AccountDeployedEvent({ sender: this.sender.getAndRequireSignature(), factory: this.address }))
    }

    /**
     * Returns the public key of the account that corresponds to a given owner
     * @param owner The secp256k1 public key of the owner of the account
     * @returns The public key of the account
     */
    async getPublicKey(owner: Secp256k1): Promise<PublicKey> {
        return (await accountFactoryOffchainState.fields.accounts.get(owner)).orElse(PublicKey.empty())
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
