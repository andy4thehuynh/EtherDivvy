//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/*
   @dev Write a blurb about what your contract does
*/

contract EtherDivvy is Ownable {
    using SafeMath for uint;

    uint public maxContribution; // maximum amount of ether an account can contribute

    constructor() {
        maxContribution = 10 ether;
    }

    function changeMaxContribution(uint _amount) public onlyOwner {
        require(_amount > 0 ether, 'Cannot set max contribution to zero');
        maxContribution = _amount;
    }
}
