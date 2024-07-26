import { Group, SmartContract, State, method, state } from "o1js"

export class Ownable extends SmartContract {
  // Represented as X, Y of ECDSA curve
  @state(Group) owner = State<Group>()

  @method
  async transferOwnership(newOwner: Group) {
    this.owner.getAndRequireEquals()
    this.owner.set(newOwner)
  }
}
