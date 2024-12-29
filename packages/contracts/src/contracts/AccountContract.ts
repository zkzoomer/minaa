import {
    AccountUpdate,
    Bool,
    type DeployArgs,
    Field,
    PublicKey,
    State,
    Struct,
    UInt64,
    method,
    state,
} from "o1js"
import { IAccountContract } from "../interfaces/IAccountContract"
import {
    Ecdsa,
    Secp256k1,
    Secp256k1Scalar,
    UserOperation,
} from "../interfaces/UserOperation"
import { EntryPoint } from "./EntryPoint"

export interface AccountContractDeployProps
    extends Exclude<DeployArgs, undefined> {
    entryPoint: PublicKey
    owner: Secp256k1
}

/***
 * An event emitted after each successful request
 * @param userOpHash unique identifier for the request (hash its entire content, except signature)
 * @param sender the account that generates this request
 * @param key the nonce key value from the request
 * @param nonce the nonce value from the request
 */
export class AccountInitializedEvent extends Struct({
    entryPoint: PublicKey,
    account: PublicKey,
    owner: Secp256k1.provable,
}) {}

// Defining the uninitialized state for the account contract
const deadKey = Secp256k1Scalar.from(0xdead)
const deadOwner = Secp256k1.generator.scale(deadKey)

export class AccountContract extends IAccountContract {
    events = {
        AccountInitialized: AccountInitializedEvent,
    }

    @state(PublicKey)
    entryPoint = State<PublicKey>(PublicKey.empty())
    @state(Secp256k1.provable)
    owner = State<Secp256k1>(deadOwner)

    /**
     * Initializes the `AccountContract` smart contract
     * @param entryPoint The `EntryPoint` smart contract
     * @param owner The secp256k1 public key of the owner of this account smart contract
     * @param prefund The amount of funds to be prefunded to the account
     * @param initialBalance The initial balance of the account
     */
    @method
    async initialize(
        entryPoint: PublicKey,
        owner: Secp256k1,
        prefund: UInt64,
        initialBalance: UInt64,
    ) {
        // Check that the `AccountContract` was not already initialized
        this.entryPoint.getAndRequireEquals().assertEquals(PublicKey.empty())
        const _owner = this.owner.getAndRequireEquals()
        _owner.x.assertEquals(deadOwner.x)
        _owner.y.assertEquals(deadOwner.y)

        // Define the account's `entryPoint`
        this.entryPoint.set(entryPoint)
        // Define the account's `owner`
        this.owner.set(owner)

        // Prefund the account with the transaction amount
        const entryPointContract = new EntryPoint(entryPoint) // Using `this.entryPoint.getAndRequireEquals()` will cause it to fail for some reason
        await entryPointContract.depositTo(this.address, prefund)

        // Set the initial balance of the account
        AccountUpdate.createSigned(this.sender.getAndRequireSignatureV2()).send(
            { to: this, amount: initialBalance },
        )

        // Emits an `AccountInitialized`
        this.emitEvent(
            "AccountInitialized",
            new AccountInitializedEvent({
                entryPoint,
                account: this.address,
                owner,
            }),
        )
    }

    /// @inheritdoc IAccountContract
    @method.returns(Field)
    async validateUserOpAndExecute(
        userOp: UserOperation,
        signature: Ecdsa,
    ): Promise<Field> {
        const entryPointContract = new EntryPoint(
            this.entryPoint.getAndRequireEquals(),
        )
        entryPointContract.offchainState.setContractInstance(entryPointContract)
        const userOpHash = await entryPointContract.getUserOpHash(userOp)

        await this.verifySignature(userOpHash, signature)
        await entryPointContract.validateAndUpdateNonce(
            userOp.sender,
            userOp.key,
            userOp.nonce,
        )
        await this._execute(userOp.calldata.recipient, userOp.calldata.amount)

        return userOpHash
    }

    /**
     * Validates that the signature is valid for the operation
     * @param userOperationHash
     * @param signature
     * @param publicKey
     */
    async verifySignature(userOperationHash: Field, signature: Ecdsa) {
        signature
            .verifySignedHashV2(
                new Secp256k1Scalar([userOperationHash, Field(0), Field(0)]),
                this.owner.getAndRequireEquals(),
            )
            .assertEquals(Bool(true))
    }

    /**
     * Validates and executes a transaction, sending a `value` amount to the `recipient`
     * @param recipient transaction recipient
     * @param value amount being transferred
     */
    private async _execute(recipient: PublicKey, value: UInt64) {
        this.send({ to: recipient, amount: value })
    }
}
