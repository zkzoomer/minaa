import {
    AccountUpdate,
    Experimental,
    Field,
    type Option,
    Poseidon,
    PublicKey,
    State,
    Struct,
    UInt64,
    type Void,
    method,
    state,
} from "o1js"
import {
    DepositedEvent,
    IEntryPoint,
    UserOperationEvent,
    Withdrawal,
    WithdrawnEvent,
} from "../interfaces/IEntryPoint"
import {
    Ecdsa,
    NonceSequence,
    UserOperation,
} from "../interfaces/UserOperation"
import { AccountContract } from "./AccountContract"

// Offchain storage definition
const { OffchainState } = Experimental
export const offchainState = OffchainState({
    nonceSequenceNumber: OffchainState.Map(NonceSequence, Field),
    depositInfo: OffchainState.Map(PublicKey, UInt64),
})
export class EntryPointStateProof extends offchainState.Proof {}

export class EntryPoint extends IEntryPoint {
    events = {
        Deposited: DepositedEvent,
        Withdrawn: WithdrawnEvent,
        UserOperation: UserOperationEvent,
    }

    // Offchain storage commitment
    @state(OffchainState.Commitments) offchainStateCommitments =
        offchainState.emptyCommitments()
    offchainState = offchainState.init(this)

    /// @inheritdoc IEntryPoint
    async getNonce(sender: PublicKey, key: Field): Promise<Field> {
        return (await this._getNonce(sender, key)).orElse(Field(0))
    }

    private async _getNonce(
        sender: PublicKey,
        key: Field,
    ): Promise<Option<Field>> {
        return this.offchainState.fields.nonceSequenceNumber.get({
            sender,
            key,
        })
    }

    /// @inheritdoc IEntryPoint
    async balanceOf(account: PublicKey): Promise<UInt64> {
        return (await this._balanceOf(account)).orElse(UInt64.from(0))
    }

    private async _balanceOf(account: PublicKey): Promise<Option<UInt64>> {
        return this.offchainState.fields.depositInfo.get(account)
    }

    /// @inheritdoc IEntryPoint
    @method
    async depositTo(account: PublicKey, amount: UInt64): Promise<Void> {
        // Deposit the amount to the smart contract
        AccountUpdate.createSigned(this.sender.getAndRequireSignature()).send({
            to: this,
            amount,
        })

        // Update the offchain state
        const oldAmountOption = await this._balanceOf(account)
        const oldAmount = oldAmountOption.orElse(UInt64.from(0))
        await this.offchainState.fields.depositInfo.update(account, {
            from: oldAmountOption,
            to: oldAmount.add(amount),
        })

        // Emits a `Deposited` event
        this.emitEvent("Deposited", new DepositedEvent({ account, amount }))
    }

    /// @inheritdoc IEntryPoint
    @method
    async withdrawTo(
        account: PublicKey,
        recipient: PublicKey,
        amount: UInt64,
        signature: Ecdsa,
    ): Promise<Void> {
        // Withdrawal operation must have be validated by the account
        const accountContract = new AccountContract(account)
        const withdrawToHash = Poseidon.hashPacked(
            Withdrawal,
            new Withdrawal({ account, recipient, amount }),
        )
        await accountContract.verifySignature(withdrawToHash, signature)

        // Update the offchain state
        const oldAmount = await this.balanceOf(account)
        oldAmount.assertGreaterThanOrEqual(amount)
        await this.offchainState.fields.depositInfo.update(account, {
            from: oldAmount,
            to: oldAmount.sub(amount),
        })

        // Withdraw the amount to the recipient
        this.send({ to: recipient, amount })

        // Emits a `Withdrawn` event
        this.emitEvent(
            "Withdrawn",
            new WithdrawnEvent({ account, recipient, amount }),
        )
    }

    /// @inheritdoc IEntryPoint
    @method
    async handleOp(
        userOp: UserOperation,
        signature: Ecdsa,
        beneficiary: PublicKey,
    ): Promise<Void> {
        // Check if the account has enough funds to pay for the operation
        const oldBalanceOption = await this._balanceOf(userOp.sender)
        const oldBalance = oldBalanceOption.orElse(UInt64.from(0))
        oldBalance.assertGreaterThanOrEqual(userOp.fee)

        // Decrease the deposited amount for the account by the required fee, which will be sent to the beneficiary
        await this.offchainState.fields.depositInfo.update(userOp.sender, {
            from: oldBalanceOption,
            to: oldBalance.sub(userOp.fee),
        })

        // Execute the user operation
        await this._handleOp(userOp, signature, beneficiary)
    }

    /// @inheritdoc IEntryPoint
    @method
    async paymasterHandleOp(
        userOp: UserOperation,
        signature: Ecdsa,
        beneficiary: PublicKey,
    ): Promise<Void> {
        // The caller will act as the paymaster and cover the fee
        AccountUpdate.createSigned(this.sender.getAndRequireSignature()).send({
            to: this,
            amount: userOp.fee,
        })

        // Execute the user operation
        await this._handleOp(userOp, signature, beneficiary)
    }

    /**
     * Executes a `UserOperation`
     * @param userOp user operation being executed
     * @param signature user operation signature
     * @param beneficiary address to receive the fees
     */
    private async _handleOp(
        userOp: UserOperation,
        signature: Ecdsa,
        beneficiary: PublicKey,
    ): Promise<Void> {
        const userOpHash = await this._validateAndExecute(userOp, signature)
        await this._compensate(beneficiary, userOp.fee)

        // Emits a `UserOperation`
        this.emitEvent(
            "UserOperation",
            new UserOperationEvent({ userOpHash, ...userOp }),
        )
    }

    /// @inheritdoc IEntryPoint
    @method.returns(Field)
    async getUserOpHash(userOp: UserOperation): Promise<Field> {
        const hash = Poseidon.hashPacked(UserOperation, userOp)
        return Poseidon.hashPacked(
            Struct({ hash: Field, address: PublicKey }),
            { hash, address: this.address },
        )
    }

    /// @inheritdoc IEntryPoint
    @method
    async validateAndUpdateNonce(
        sender: PublicKey,
        key: Field,
        nonce: Field,
    ): Promise<Void> {
        // Get current nonce
        const nonceOption = await this._getNonce(sender, key)
        const currentNonce = nonceOption.orElse(Field(0))
        currentNonce.assertEquals(nonce)

        // Update offchain state
        this.offchainState.fields.nonceSequenceNumber.update(
            { sender, key },
            {
                from: nonceOption,
                to: currentNonce.add(Field(1)),
            },
        )
    }

    /**
     * Calls `validateUserOpAndExecute` on the corresponding account, reverts if it fails verification
     * @param userOp user operation being executed
     * @param signature user operation signature
     */
    private async _validateAndExecute(
        userOp: UserOperation,
        signature: Ecdsa,
    ): Promise<Field> {
        // Validate the operation and execute it
        const accountContract = new AccountContract(userOp.sender)
        const userOpHash = await accountContract.validateUserOpAndExecute(
            userOp,
            signature,
        )

        return userOpHash
    }

    /**
     * Compensates the caller beneficiary address with the collected fee
     * @param beneficiary address to receive the fees
     * @param amount amount to receive
     */
    private async _compensate(beneficiary: PublicKey, amount: UInt64) {
        this.send({ to: beneficiary, amount })
    }

    /**
     * Method used to resolve pending state updates
     * @param proof Recursive proof being verified
     */
    @method
    async settle(proof: EntryPointStateProof) {
        await this.offchainState.settle(proof)
    }
}
