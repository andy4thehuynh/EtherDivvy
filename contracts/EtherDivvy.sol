//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


/**
   @title This smart contract accepts contributions in ETH. The grand total will be dispersed
   evenly to participating accounts every two weeks. There will be a three day withdrawal period
   for partipating accounts to withdraw their payouts.

   @author Andy Huynh

   @notice Accounts can contribute ether once per contribution window. This contract accepts
   contributions upto the max contribution limit. If a partipaticipating account fails to withdraw
   their funds during the withdrawal window, they will forfeit their ETH. The pulling of ether on
   an individual basis avoids external calls failing accidentally. It is the responsibility of the
   partipating account to withdraw their funds in a timely manner.

   @dev Contract owners can set the max contribution limit to an amount above zero. Owners can also
   transfer contract ownership to someone else. If remaining ether has not been withdrawn by all
   partipants, it stays in the contract.
*/
contract EtherDivvy is Ownable {
     // LOOM network recommends preventing overflow checks when performing arithmetic operations
    using SafeMath for uint;

    uint constant DEFAULT_MAX_CONTRIBUTION = 10 ether;
    uint constant WITHDRAWAL_WINDOW_IN_DAYS = 3 days;
    uint constant CONTRIBUTION_WINDOW_IN_DAYS = 14 days;

    uint public total; // total amount by contributing accounts during a contribution window
    uint public maxContribution; // maximum amount ETH accounts can contribute - owner can change this value
    uint public highestContribution; // records highest so owner cannot set maxContribution value below it
    uint public contributableAt; // when contribution window starts
    uint public withdrawableAt; // when withdrawable window starts

    bool public withdrawable; // for opening and closing withdrawal window
    address[] public accounts; // a necessary list to reset balances of contributing accounts to zero
    mapping(address => uint) public balances; // tracks each account's contributions

    event ChangeMaxContribution(uint amount);

    constructor() {
        setContributionWindowValues();
    }

    receive() external payable {
        require(0 == balances[msg.sender], 'An account can only contribute once per contribution period');
        require(msg.value <= maxContribution, 'Exceeds maximum contribution limit');
        require(!withdrawable, 'Withdrawal window is open. Please wait until next contribution window');

        uint amount = msg.value;

        if (highestContribution < amount) {
            highestContribution = amount;
        }

        total = total.add(amount);
        accounts.push(msg.sender);
        balances[msg.sender] = balances[msg.sender].add(amount);
    }

    function withdraw() external {
        require(balances[msg.sender] != 0, 'Acting account did not contribute during contribution window');
        require(
            withdrawable,
            'Withdrawal window is closed. You have forfeited your funds if previously contributed'
        );

        balances[msg.sender] = 0;
        uint funds = total.div(accounts.length);

        (bool success, bytes memory data) = msg.sender.call{value: funds}('');
        require(success, 'Something went wrong.. failed to send Ether');
    }

    function openWithdrawalWindow() external onlyOwner {
        require(!withdrawable, 'Withdrawal window is already open');
        require(
            contributableAt + CONTRIBUTION_WINDOW_IN_DAYS <= block.timestamp,
            'Two weeks must pass before opening withdrawal window'
        );

        withdrawable = true;
        withdrawableAt = block.timestamp;
    }

    function openContributionWindow() external onlyOwner {
        require(withdrawable, 'Contribution window is already open');
        require(
            (block.timestamp >= withdrawableAt + getWithdrawalWindowInDays()),
            'Three days must pass before opening contribution window'
        );

        // Resets participating account balances to zero
        for (uint i = 0; i < accounts.length; i += 1) {
            balances[accounts[i]] = 0;
        }

        setContributionWindowValues();
        delete accounts;
    }

    /// @param amount in ETH to change how much an account can contribute
    function changeMaxContribution(uint amount) external onlyOwner {
        require(!withdrawable, 'Withdrawal window is open. Please wait until next contribution window');
        require(amount >= highestContribution, 'Please set max contribution higher than highest contribution');
        require(amount > 0 ether, 'Please set max contribution higher than zero');

        maxContribution = amount;
        emit ChangeMaxContribution(amount);
    }

    /// @param addr Address of a partipating account
    /// @return amount an address has contributed. Returns zero if account did not partipate
    function getBalanceFor(address addr) external view returns(uint) {
        return balances[addr];
    }

    /// @return a list of partipating accounts for a contribution window
    function getAccounts() external view returns(address[] memory) {
        return accounts;
    }

    function setContributionWindowValues() private {
        total = 0;
        withdrawable = false;
        withdrawableAt = 0;
        contributableAt = block.timestamp;
        highestContribution = 0 ether;
        maxContribution = DEFAULT_MAX_CONTRIBUTION;
    }

    /**
      @dev Comparing WITHDRAWAL_WINDOW_IN_DAYS to a block's timestamp could result in the block
      having a higher value if it's the same day. This is because we're dealing with days in seconds.
      Adding an additional day to WITHDRAWAL_WINDOW_IN_DAYS ensures the withdrawal window is more accurate.
    */
    /// @return withdrawal window in days
    function getWithdrawalWindowInDays() private pure returns(uint) {
        return WITHDRAWAL_WINDOW_IN_DAYS + 1 days;
    }
}
