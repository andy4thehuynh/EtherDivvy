const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("EtherDivvy", function() {
  let owner;
  let account1;
  let account2;
  let EtherDivvy;
  let etherDivvy;

  beforeEach(async() => {
    [owner, account1, account2] = await ethers.getSigners();
    EtherDivvy                  = await ethers.getContractFactory("EtherDivvy");
    etherDivvy                  = await EtherDivvy.deploy();
  });


  describe("when an account successfully contributes to the contract", function() {
    it("changes number of partipants by one", async function() {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('1'),
      });
      expect(await etherDivvy.numberOfPartipants()).to.equal(1);

      await account2.sendTransaction({
        from: account2.address,
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

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: amount1,
      });
      expect(await etherDivvy.total()).to.equal(amount1);

      await account2.sendTransaction({
        from: account2.address,
        to: etherDivvy.address,
        value: amount2,
      });
      expect(await etherDivvy.total()).to.equal(total);
    });

    it("can contribute the max contribution limit", async function() {
      let max = await etherDivvy.maxContribution();

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: max,
      });

      expect(await etherDivvy.numberOfPartipants()).to.equal(1);
    });

    it("can contribute less than the max contribution limit", async function() {
      let max      = await etherDivvy.maxContribution();
      let lessThan = ethers.utils.parseEther('5');

      expect(lessThan).to.be.below(max);

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: lessThan,
      });
      expect(await etherDivvy.numberOfPartipants()).to.equal(1);
    });
  });

  describe("when an account unsuccessfully contributes to the contract", function() {
    it("contributes multiple times", async function() {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('1'),
      });

      await expect(
        account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('2'),
        })
      ).to.be.revertedWith('Cannot contribute more than once per contribution window');
    });

    it("contributes more than max contribution", async function() {
      let max = await etherDivvy.maxContribution();
      let higher = ethers.utils.parseEther('11');

      expect(max).to.be.below(higher);

      await expect(
        account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: higher,
        })
      ).to.be.revertedWith('Exceeds maximum contribution');
    });
  });

  describe("when contract owner", function() {
    it("set to owner by default on deploying the contract", async function() {
      expect(owner.address).to.equal(await etherDivvy.owner());
    });

    it("can transfer contractownership to someone else", async function() {
      await etherDivvy.transferOwnership(account1.address, {from: owner.address});

      expect(owner.address).to.not.equal(await etherDivvy.owner());
      expect(account1.address).to.equal(await etherDivvy.owner());
    });

    it("can change max contribution", async function() {
      const defaultMax = ethers.utils.parseEther('10');
      const newMax     = ethers.utils.parseEther('50');

      expect(await etherDivvy.maxContribution()).to.equal(defaultMax);

      await etherDivvy.changeMaxContribution(newMax);
      expect(await etherDivvy.maxContribution()).to.equal(newMax);
    });

    it("can not configure max contribution to zero ether", async function() {
      const invalidMax = ethers.utils.parseEther('0');

      await expect(etherDivvy.changeMaxContribution(invalidMax))
        .to.be.revertedWith('Cannot set max contribution to zero');
    });
  });

  describe("when not contract owner", function() {
    let nonContractOwner;

    beforeEach(async() => {
      nonContractOwner = account1;
    });

    it("is not owner when calling owner function on contract", async function() {
      expect(owner.address).to.equal(await etherDivvy.owner());
      expect(nonContractOwner.address).to.not.equal(await etherDivvy.owner());
    });

    it("cannot transfer contract ownership to someone else", async function() {
      await expect(
        etherDivvy.connect(nonContractOwner)
          .transferOwnership(account2.address, {from: nonContractOwner.address})
        ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot configure max contribution", async function() {
      const newMax = ethers.utils.parseEther('5');

      await expect(etherDivvy.connect(nonContractOwner).changeMaxContribution(newMax))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe("#highestContribution", function() {
    it("returns highest account contribution amount", async function() {
      let highest = ethers.utils.parseEther('9');
      let notHighest = ethers.utils.parseEther('5');

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: notHighest,
      });

      await account2.sendTransaction({
        from: account2.address,
        to: etherDivvy.address,
        value: highest,
      });

      expect(await etherDivvy.highestContribution()).to.equal(highest);
    });
  });
});
