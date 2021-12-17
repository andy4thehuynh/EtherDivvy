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

    uint constant DEFAULT_MAX_CONTRIBUTION = 10 ether;
    uint constant WITHDRAWAL_WINDOW_IN_DAYS = 3 days;
    uint constant CONTRIBUTION_WINDOW_IN_DAYS = 14 days;

    uint public total; // total amount from contributing accounts
    uint public maxContribution; // maximum amount of ether for a contribution period
    uint public highestContribution; // records highest so owner can't set maxContribution below
    uint public contributableAt; // when contribution window starts
    uint public withdrawableAt; // when withdrawable window starts

    bool public withdrawable; // keeps track when withdrawal window is open to pull funds
    address[] public accounts; // needed to set balances of contributing accounts to zero
    mapping(address => uint) public balances; // tracks amount each account has contributed

    constructor() {
        total = 0;
        maxContribution = DEFAULT_MAX_CONTRIBUTION;
        highestContribution = 0 ether;
        contributableAt = block.timestamp;
        withdrawableAt = 0;
        withdrawable = false;
    }

    receive() external payable {
        // we check if an account balance is zero to determine if they've contributed
        require(0 == balances[msg.sender], 'Cannot contribute more than once per contribution window');
        require(msg.value <= maxContribution, 'Cannot exceed maximum contribution limit');
        require(!withdrawable, 'Withdrawal window is open - cannot contribute right now');

        uint amount = msg.value;

        if (highestContribution < amount) {
            highestContribution = amount;
        }

        total = total.add(amount);
        balances[msg.sender] = balances[msg.sender].add(amount);
        accounts.push(msg.sender);
    }

    function withdraw() external {
        require(withdrawable, 'Withdrawal window open - cannot change max contribution');
        require(balances[msg.sender] != 0, 'Account did not contribute - cannot withdraw funds');

        uint funds = total.div(accounts.length);
        balances[msg.sender] = 0;

        (bool success, bytes memory data) = msg.sender.call{value: funds}("");
    }

    function changeMaxContribution(uint _amount) external onlyOwner {
        require(!withdrawable, 'Withdrawal window open - cannot change max contribution');
        require(_amount >= highestContribution, 'Cannot set max contribution lower than highest contribution');
        require(_amount > 0 ether, 'Cannot set max contribution to zero');

        maxContribution = _amount;
    }

    function openWithdrawalWindow() external onlyOwner {
        require(!withdrawable, 'Withdrawal window already open');
        require(
            contributableAt + CONTRIBUTION_WINDOW_IN_DAYS <= block.timestamp,
            'Two weeks must pass before opening withdrawal window'
        );

        withdrawable = true;
        withdrawableAt = block.timestamp;
    }

    function openContributionWindow() external onlyOwner {
        require(
            (block.timestamp >= withdrawableAt + getWithdrawalWindowInDays()),
            'Three days must pass before opening contribution window'
        );

        // Resets participating account balances to zero for next contribution window
        for (uint i; i < accounts.length; i += 1) {
            balances[accounts[i]] = 0;
        }

        total = 0;
        maxContribution = DEFAULT_MAX_CONTRIBUTION;
        highestContribution = 0;
        withdrawable = false;
        withdrawableAt = 0;
        delete accounts;
    }

    function getBalanceFor(address _address) external view returns(uint) {
        return balances[_address];
    }

    function getAccounts() external view returns (address[] memory) {
        return accounts;
    }

    // Setting WITHDRAWAL_WINDOW_IN_DAYS to three days could result in current timme for the block
    // (block.timestamp) having a higher value. This is because we're comparing seconds since
    // unix epoch instead of primitive time. An additional day to WITHDRAWAL_WINDOW_IN_DAYS ensures
    // three days has past.
    function getWithdrawalWindowInDays() private view returns(uint) {
        return WITHDRAWAL_WINDOW_IN_DAYS + 1 days;
    }
}
