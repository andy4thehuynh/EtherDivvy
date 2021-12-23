const timeTravel = async days => {
  await ethers.provider.send('evm_increaseTime', [days * 24 * 60 * 60]);
  await ethers.provider.send('evm_mine');
};

module.exports = {
  timeTravel
};
