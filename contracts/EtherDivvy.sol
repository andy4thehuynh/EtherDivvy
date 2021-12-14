//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

/*
   @title Allows accounts to contribute ether to this contract. The total
   contributions will ultimately get dispersed to partipants evenly after
   two weeks where the contribution window closes.

   @author Andy Huynh

   @notice Accounts can contribute ether until the max contribution limit has been reached.
   The withdrawal window of three days allows partipants to pull their
   ether invidually which avoids external calls failing accidentally. Failure to
   pull ether within the withdrawal window results in forfeiting their share.

   @dev Contract owners can set the max contribution limit above zero. If remaining
   ether has not been withdrawn by all partipants, it stays in the contract.
*/

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


contract EtherDivvy is Ownable {
    /*
       LOOM network recommends preventing overflow checks when performing
       arithmetic operations
     */
    using SafeMath for uint;

    uint public total; // total amount from contributing accounts
    uint public numberOfPartipants; // number the contract uses to divvy up the total
    uint public maxContribution; // maximum amount of ether for a contribution period

    address[] public accounts; // partipating accounts
    mapping(address => int) public balances; // tracks amount each account has contributed

    constructor() {
        maxContribution = 10 ether;
        total = 0 ether;
    }

    receive() external payable {
        uint amount = msg.value;

        if (amount <= maxContribution) {
            numberOfPartipants = numberOfPartipants.add(1);
            total = total.add(amount);
            accounts.push(msg.sender);
        }
    }

    // @return List of partipating accounts
    function getAccounts() public view returns (address[] memory) {
        return accounts;
    }

    // @param _amount Sets new limit an account can contribute
    function changeMaxContribution(uint _amount) public onlyOwner {
        require(_amount > 0 ether, 'Cannot set max contribution to zero');
        maxContribution = _amount;
    }
}
