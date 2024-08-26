import {
    Bool,
    DeployArgs,
    Field,
    PublicKey,
    State,
    UInt64,
    method,
    state,
} from "o1js"
import { AccountInitializedEvent, IAccountContract } from "../interfaces/IAccountContract"
import { Ecdsa, Secp256k1, Secp256k1Scalar, UserOperation } from "../interfaces/UserOperation"
import { EntryPoint } from "./EntryPoint"

export interface AccountContractDeployProps
    extends Exclude<DeployArgs, undefined> {
    entryPoint: PublicKey
    owner: Secp256k1
}

export class AccountContract extends IAccountContract {
    events = {
        AccountInitialized: AccountInitializedEvent,
    };

    @state(PublicKey)
    entryPoint = State<PublicKey>()
    @state(Secp256k1.provable)
    owner = State<Secp256k1>()

    /**
     * Initializes the `AccountContract` smart contract
     * @param entryPoint The `EntryPoint` smart contract
     * @param owner The secp256k1 public key of the owner of this account smart contract
     */
    @method
    async initialize(entryPoint: PublicKey, owner: Secp256k1) {
        // Check that the `AccountContract` was not already initialized
        this.entryPoint.getAndRequireEquals().assertEquals(PublicKey.empty())
        const _owner = this.owner.getAndRequireEquals()
        _owner.x.assertEquals(Secp256k1Scalar.from('0'))
        _owner.y.assertEquals(Secp256k1Scalar.from('0'))

        // Define the account's `entryPoint`
        this.entryPoint.set(entryPoint)
        // Define the account's `owner`
        this.owner.set(owner)

        // Emits an `AccountInitialized`
        this.emitEvent('AccountInitialized', new AccountInitializedEvent({ entryPoint, account: this.address, owner }))
    }

    /**
     * Executes a validated transaction, sending a `value` amount to the `recipient`
     * @param recipient transaction recipient
     * @param value amount being transferred
     */
    @method
    async execute(recipient: PublicKey, value: UInt64) {
        await this._requireFromEntryPoint()
        this.send({ to: recipient, amount: value, })
    }

    
    /// @inheritdoc IAccountContract
    @method
    async validateUserOp(
        userOperationHash: Field,
        signature: Ecdsa,
        missingAccountFunds: UInt64,
    ) {
        await this._requireFromEntryPoint()
        await this.verifySignature(userOperationHash, signature)
        await this._payPrefund(missingAccountFunds)
    }

    /**
     * Validates that the signature is valid for the operation
     * @param userOperationHash
     * @param signature
     * @param publicKey
     */
    async verifySignature(userOperationHash: Field, signature: Ecdsa) {
        signature.verifySignedHashV2(
            new Secp256k1Scalar([userOperationHash, Field(0), Field(0)]),
            this.owner.getAndRequireEquals()
        ).assertEquals(Bool(true))
    }

    /**
     * Require the function call went through the {@link EntryPoint}
     */
    private async _requireFromEntryPoint() {
        this.entryPoint
        .getAndRequireEquals()
        .assertEquals(this.sender.getAndRequireSignature())
    }

    /**
     * Prefund the `EntryPoint` gas for this transaction
     * @param missingAccountFunds Amount to be prefunded
     */
    private async _payPrefund(missingAccountFunds: UInt64) {
        await (new EntryPoint(this.entryPoint.getAndRequireEquals())).depositTo(this.address, missingAccountFunds)
    }
}
