const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("EtherDivvy", function() {
  let owner;
  let acc1;
  let acc2;
  let acc3;
  let EtherDivvy;
  let etherDivvy;

  beforeEach(async() => {
    [owner, acc1, acc2, acc3] = await ethers.getSigners();
    EtherDivvy                = await ethers.getContractFactory("EtherDivvy");
    etherDivvy                = await EtherDivvy.deploy();
  });


  describe("when an account contributes ether", function() {

    describe("successfully", function() {

      it("changes numberOfPartipants by one", async function() {
        await acc1.sendTransaction({
          from: acc1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('1'),
        });
        expect(await etherDivvy.numberOfPartipants()).to.equal(1);

        await acc2.sendTransaction({
          from: acc2.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('1'),
        });
        expect(await etherDivvy.numberOfPartipants()).to.equal(2);
      });

      it("changes total amount of contributions", async function() {
        expect(await etherDivvy.total()).to.equal(0);

        let amount1 = ethers.utils.parseEther('5');
        let amount2 = ethers.utils.parseEther('5');
        let total   = ethers.utils.parseEther('10');

        await acc1.sendTransaction({
          from: acc1.address,
          to: etherDivvy.address,
          value: amount1,
        });
        expect(await etherDivvy.total()).to.equal(amount1);

        await acc2.sendTransaction({
          from: acc2.address,
          to: etherDivvy.address,
          value: amount2,
        });
        expect(await etherDivvy.total()).to.equal(total);
      });

      it("upto max contribution limit", async function() {
        let max = await etherDivvy.maxContribution();

        await acc1.sendTransaction({
          from: acc1.address,
          to: etherDivvy.address,
          value: max,
        });

        expect(await etherDivvy.numberOfPartipants()).to.equal(1);
      });

      it("less than max contribution limit", async function() {
        let max      = await etherDivvy.maxContribution();
        let lessThan = ethers.utils.parseEther('5');

        expect(lessThan).to.be.below(max);

        await acc1.sendTransaction({
          from: acc1.address,
          to: etherDivvy.address,
          value: lessThan,
        });
        expect(await etherDivvy.numberOfPartipants()).to.equal(1);
      });
    });

    describe("unsuccessfully", function() {

      it("when withdrawal window is open", async function() {
        await etherDivvy.openWithdrawalWindow();
        expect(await etherDivvy.withdrawable()).to.equal(true);

        await expect(
          acc1.sendTransaction({
            from: acc1.address,
            to: etherDivvy.address,
            value: ethers.utils.parseEther('1'),
          })
        ).to.be.revertedWith('Withdrawal window is open - cannot contribute right now');
      });

      it("contributes multiple times during a contribution window", async function() {
        await acc1.sendTransaction({
          from: acc1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('1'),
        });

        await expect(
          acc1.sendTransaction({
            from: acc1.address,
            to: etherDivvy.address,
            value: ethers.utils.parseEther('2'),
          })
        ).to.be.revertedWith('Cannot contribute more than once per contribution window');
      });

      it("contributes more than max contribution", async function() {
        let max = await etherDivvy.maxContribution();
        let higherContribution = ethers.utils.parseEther('11');

        expect(max).to.be.below(higherContribution);

        await expect(
          acc1.sendTransaction({
            from: acc1.address,
            to: etherDivvy.address,
            value: higherContribution,
          })
        ).to.be.revertedWith('Cannot exceed maximum contribution limit');
      });
    });
  });


  describe("when an account withdraws ether", function() {

    describe("successfully", function() {

      beforeEach(async() => {
        await acc1.sendTransaction({
          from: acc1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('8')
        });

        await acc2.sendTransaction({
          from: acc2.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('4')
        });

        await etherDivvy.openWithdrawalWindow();
      });

      it("the withdrawal window is open", async function() {
        expect(await etherDivvy.withdrawable()).to.equal(true);

        await expect(await etherDivvy.connect(acc1).withdraw())
          .to.changeEtherBalance(acc1, ethers.utils.parseEther('6'));
      });

      it("changes account ether balance with their share", async function() {
        await expect(await etherDivvy.connect(acc1).withdraw())
          .to.changeEtherBalance(acc1, ethers.utils.parseEther('6'));
        await expect(await etherDivvy.connect(acc2).withdraw())
          .to.changeEtherBalance(acc2, ethers.utils.parseEther('6'));
      });

      it("resets contract balance for account's address to zero", async function() {
        await etherDivvy.connect(acc1).withdraw();
        await etherDivvy.connect(acc2).withdraw();

        expect(await etherDivvy.getBalanceFor(acc1.address)).to.equal(0);
        expect(await etherDivvy.getBalanceFor(acc2.address)).to.equal(0);
      });
    });

    describe("unsuccessfully", function() {

      beforeEach(async() => {
        await acc1.sendTransaction({
          from: acc1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('8')
        });
      });

      it("the withdrawal window is closed", async function() {
        expect(await etherDivvy.withdrawable()).to.equal(false);

        await expect(etherDivvy.connect(acc1).withdraw())
          .to.be.revertedWith('Withdrawal window open - cannot change max contribution');
      });

      it("did not contribute any ether", async function() {
        expect(await etherDivvy.getBalanceFor(acc2.address)).to.equal(0);

        await etherDivvy.openWithdrawalWindow();
        await expect(etherDivvy.connect(acc2).withdraw())
          .to.be.revertedWith('Account did not contribute - cannot withdraw funds');
      });
    });
  });


  describe("when withdrawal window is closed and there's remaining ether", function() {

    beforeEach(async() => {
      await acc1.sendTransaction({
        from: acc1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('8')
      });

      await acc2.sendTransaction({
        from: acc2.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('4')
      });

      await acc3.sendTransaction({
        from: acc3.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('1')
      });

      await etherDivvy.openWithdrawalWindow();
    });

    it("the remaining ether stays in the contract", async function() {
      await expect(await etherDivvy.connect(acc1).withdraw())
        .to.changeEtherBalance(acc1, ethers.utils.parseEther('4.333333333333333333'));
      await expect(await etherDivvy.connect(acc2).withdraw())
        .to.changeEtherBalance(acc2, ethers.utils.parseEther('4.333333333333333333'));
      await expect(await etherDivvy.connect(acc3).withdraw())
        .to.changeEtherBalance(acc3, ethers.utils.parseEther('4.333333333333333333'));

      expect(await etherDivvy.provider.getBalance(etherDivvy.address))
        .to.not.equal(0);
    });
  });


  describe("when contract owner", function() {

    it("sets owner to address of contract deployer", async function() {
      expect(owner.address).to.equal(await etherDivvy.owner());
    });

    it("sets contribution window time on deploy", async function() {
      expect(await etherDivvy.contributableAt()).to.not.equal(0);
    });

    it("can transfer ownership to another address", async function() {
      await etherDivvy.transferOwnership(acc1.address, {from: owner.address});

      expect(owner.address).to.not.equal(await etherDivvy.owner());
      expect(acc1.address).to.equal(await etherDivvy.owner());
    });

    it("can change max contribution", async function() {
      const defaultMax = ethers.utils.parseEther('10');
      const newMax     = ethers.utils.parseEther('50');

      expect(await etherDivvy.maxContribution()).to.equal(defaultMax);
      await etherDivvy.changeMaxContribution(newMax);

      expect(await etherDivvy.maxContribution()).to.equal(newMax);
    });

    it("can open withdrawal window", async function() {
      expect(await etherDivvy.withdrawable()).to.equal(false);

      await etherDivvy.openWithdrawalWindow();
      expect(await etherDivvy.withdrawable()).to.equal(true);
    });

    it("can open contribution window", async function() {
      await expect(
        etherDivvy.openContributionWindow()
      ).to.not.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot open withdrawal window when already open", async function() {
      await etherDivvy.openWithdrawalWindow();
      expect(await etherDivvy.withdrawable()).to.equal(true);

      await expect(etherDivvy.openWithdrawalWindow())
        .to.be.revertedWith('Withdrawal window already open');
    });

    it("cannot change max contribution when withdrawal window is open", async function() {
      await etherDivvy.openWithdrawalWindow();

      await expect(etherDivvy.changeMaxContribution(ethers.utils.parseEther('1')))
        .to.be.revertedWith('Withdrawal window open - cannot change max contribution');
    });

    it("cannot change max contribution to zero ether", async function() {
      const invalidMax = ethers.utils.parseEther('0');

      await expect(etherDivvy.changeMaxContribution(invalidMax))
        .to.be.revertedWith('Cannot set max contribution to zero');
    });

    it("cannot change max contribution lower than highestContribution", async function() {
      let highestContribution = ethers.utils.parseEther('9');
      let newMax = ethers.utils.parseEther('1');

      await acc1.sendTransaction({
        from: acc1.address,
        to: etherDivvy.address,
        value: highestContribution,
      });

      expect(await etherDivvy.highestContribution()).to.equal(highestContribution);

      await expect(
        etherDivvy.changeMaxContribution(newMax)
      ).to.be.revertedWith('Cannot set max contribution lower than highest contribution');
    });
  });


  describe("when not contract owner", function() {

    let nonContractOwner;

    beforeEach(async() => {
      nonContractOwner = acc1;
    });

    it("is not the contract owner", async function() {
      expect(await etherDivvy.owner()).to.equal(owner.address);
      expect(await etherDivvy.owner()).to.not.equal(nonContractOwner.address);
    });

    it("cannot transfer ownership to another address", async function() {
      await expect(
        etherDivvy.connect(nonContractOwner)
          .transferOwnership(acc2.address, {from: nonContractOwner.address})
        ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot change max contribution", async function() {
      const newMax = ethers.utils.parseEther('5');

      await expect(etherDivvy.connect(nonContractOwner).changeMaxContribution(newMax))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot open withdrawal window to pull funds", async function() {
      expect(await etherDivvy.withdrawable()).to.equal(false);

      await expect(etherDivvy.connect(nonContractOwner).openWithdrawalWindow())
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot open contribution window", async function() {
      await expect(
        etherDivvy.connect(acc1).openContributionWindow()
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });


  describe("#highestContribution", function() {

    it("returns highest amount an account has contributed", async function() {
      let highest = ethers.utils.parseEther('9');
      let notHighest = ethers.utils.parseEther('5');

      await acc1.sendTransaction({
        from: acc1.address,
        to: etherDivvy.address,
        value: notHighest,
      });

      await acc2.sendTransaction({
        from: acc2.address,
        to: etherDivvy.address,
        value: highest,
      });

      expect(await etherDivvy.highestContribution()).to.equal(highest);
    });
  });
});
