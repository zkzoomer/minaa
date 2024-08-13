import {
  AccountUpdate,
  Bool,
  type DeployArgs,
  type EcdsaSignatureV2,
  Field,
  PublicKey,
  State,
  type UInt64,
  method,
  state,
} from "o1js"
import { IAccountContract } from "../interfaces/IAccountContract"
import {
  type Bytes32,
  Secp256k1,
  type UserOperation,
} from "../interfaces/UserOperation"

export interface AccountContractDeployProps
  extends Exclude<DeployArgs, undefined> {
  entryPoint: PublicKey
  owner: Secp256k1
}

export class AccountContract extends IAccountContract {
  @state(PublicKey)
  entryPoint = State<PublicKey>()
  @state(Secp256k1.provable)
  owner = State<Secp256k1>()

  @method.returns(Field)
  async getNonce(): Promise<Field> {
    return Field(0)
  }

  @method.returns(Bool)
  async validateUserOp(
    userOperation: UserOperation,
    userOperationHash: Bytes32,
    missingAccountFunds: UInt64,
  ): Promise<Bool> {
    this._requireFromEntryPoint()
    const validationData = this._verifySignature(
      userOperationHash,
      userOperation.signature,
    )
    this._payPrefund(missingAccountFunds)
    return validationData
  }

  async getDeposit(): Promise<Field> {
    return Field(0)
  }

  @method
  async addDeposit(amount: UInt64) {
    AccountUpdate.createSigned(this.address).send({
      to: this.entryPoint.getAndRequireEquals(),
      amount,
    })
  }

  /**
   * Executes a validated transaction, sending a `value` amount to the `recipient`
   * @param recipient transaction recipient
   * @param value amount being transferred
   */
  private async _execute(recipient: PublicKey, value: UInt64) {
    this._requireFromEntryPoint()
    AccountUpdate.createSigned(this.address).send({
      to: recipient,
      amount: value,
    })
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
   * Validates that the signature is valid for the operation
   * @param userOperationHash
   * @param signature
   * @param publicKey
   * @returns
   */
  private async _verifySignature(
    userOperationHash: Bytes32,
    signature: EcdsaSignatureV2,
  ): Promise<Bool> {
    return signature.verifyV2(
      userOperationHash,
      this.owner.getAndRequireEquals(),
    )
  }

  private async _payPrefund(missingAccountFunds: UInt64) {
    AccountUpdate.createSigned(this.address).send({
      to: this.entryPoint.getAndRequireEquals(),
      amount: missingAccountFunds,
    })
  }
}
