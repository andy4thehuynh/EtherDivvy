const timeTravel = async days => {
  await ethers.provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine");
};

const safelyOpenWithdrawalWindow = async contract => {
  timeTravel(14); // 14 days has passed and withdrawal window eligible to be open
  await contract.openWithdrawalWindow();
};

const safelyOpenContributionWindow = async contract => {
  timeTravel(3); // 3 days has passed and contribution window eligible to be open
  await contract.openContributionWindow();
};

module.exports = {
  timeTravel,
  safelyOpenWithdrawalWindow,
  safelyOpenContributionWindow
};
