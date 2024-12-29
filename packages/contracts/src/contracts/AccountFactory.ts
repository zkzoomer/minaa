import {
    Experimental,
    Field,
    type Option,
    PublicKey,
    SmartContract,
    State,
    Struct,
    method,
    state,
} from "o1js"
import { Curve } from "../interfaces/UserOperation"
import { AccountContract } from "./AccountContract"

/**
 * An event emitted after a given account `sender` was deployed
 * @param sender the account that is deployed
 * @param factory the factory used to deploy this account
 */
export class AccountAddedEvent extends Struct({
    sender: PublicKey,
    factory: PublicKey,
}) {}

// Offchain storage definition
const { OffchainState, OffchainStateCommitments } = Experimental
export const accountFactoryOffchainState = OffchainState({
    accounts: OffchainState.Map(Curve.provable, PublicKey),
})
export class AccountFactoryStateProof extends accountFactoryOffchainState.Proof {}

export class AccountFactory extends SmartContract {
    events = {
        AccountAdded: AccountAddedEvent,
    }

    // `EntryPoint` contract
    @state(PublicKey)
    entryPoint = State<PublicKey>()
    // Offchain storage commitment
    @state(OffchainState.Commitments) offchainStateCommitments =
        accountFactoryOffchainState.emptyCommitments()
    offchainState = accountFactoryOffchainState.init(this)

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
     * Adds a deployed account at the specified address
     * @param owner The secp256k1 public key of the owner of the account, which must not be already defined
     * @param address The address where the account will be deployed to
     * @param prefund amount the account is prefunded with
     */
    @method
    public async addAccount(address: PublicKey) {
        // Instantiate the account contract
        const accountContract = new AccountContract(address)
        // Entry point must match
        accountContract.entryPoint
            .getAndRequireEquals()
            .assertEquals(this.entryPoint.getAndRequireEquals())

        // Get the account owner
        const owner = accountContract.owner.getAndRequireEquals()
        // Update offchain state
        const oldPublicKey = await this._getPublicKey(owner)
        this.offchainState.fields.accounts.update(owner, {
            from: oldPublicKey,
            to: address,
        })

        // Emit an `AccountAdded` event
        this.emitEvent(
            "AccountAdded",
            new AccountAddedEvent({
                sender: this.sender.getAndRequireSignature(),
                factory: this.address,
            }),
        )
    }

    /**
     * Returns the public key of the account that corresponds to a given owner
     * @param owner The secp256k1 public key of the owner of the account
     * @returns The public key of the account
     */
    @method.returns(PublicKey)
    async getPublicKey(owner: Curve): Promise<PublicKey> {
        return (await this._getPublicKey(owner)).orElse(PublicKey.empty())
    }

    async _getPublicKey(owner: Curve): Promise<Option<PublicKey>> {
        return this.offchainState.fields.accounts.get(owner)
    }

    /**
     * Method used to resolve pending state updates
     * @param proof Recursive proof being verified
     */
    @method
    async settle(proof: AccountFactoryStateProof) {
        await this.offchainState.settle(proof)
    }
}
