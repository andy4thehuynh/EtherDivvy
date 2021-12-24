const timeTravel = async days => {
  await ethers.provider.send("evm_increaseTime", [days * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine");
};

const safelyOpenWithdrawalWindow = async contract => {
  timeTravel(14); // 14 days has passed and withdrawal window eligible to be open
  await contract.openWithdrawalWindow();
};


module.exports = {
  timeTravel,
  safelyOpenWithdrawalWindow
};
