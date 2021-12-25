const { ethers } = require("hardhat");
const { expect } = require("chai");
const helpers    = require("./helpers.js");

describe("EtherDivvy", function() {
  let owner;
  let account1;
  let account2;
  let account3;
  let EtherDivvy;
  let etherDivvy;

  beforeEach(async() => {
    [owner, account1, account2, account3] = await ethers.getSigners();
    EtherDivvy = await ethers.getContractFactory("EtherDivvy");
    etherDivvy = await EtherDivvy.deploy();
  });


  it("assigns owner to contract deployer's address", async function(){
    expect(await etherDivvy.owner()).to.equal(owner.address);
  });

  it("allows owner to transfer ownership to another address", async function (){
    expect(await etherDivvy.owner()).to.equal(owner.address);

    await etherDivvy.transferOwnership(account1.address, {from: owner.address});
    expect(await etherDivvy.owner()).to.equal(account1.address);
  });

  describe("#highestContribution", function() {
    it("returns highest amount accounts have contributed for a contribution window", async function() {
      const highest = ethers.utils.parseEther("9");
      const notHighest = ethers.utils.parseEther("5");

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: highest,
      });
      await account2.sendTransaction({
        from: account2.address,
        to: etherDivvy.address,
        value: notHighest,
      });

      expect(await etherDivvy.highestContribution()).to.equal(highest);
    });
  });

  describe("#receive", function() {
    it("accounts can contribute ether to the contract", async function() {
      const amount1 = ethers.utils.parseEther("5");
      const amount2 = ethers.utils.parseEther("6");
      const total   = ethers.utils.parseEther("11");

      expect(await etherDivvy.total()).to.equal(0);
      expect(await etherDivvy.highestContribution()).to.equal(0);
      expect(await etherDivvy.getAccounts()).to.be.empty;
      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
      expect(await etherDivvy.getBalanceFor(account2.address)).to.equal(0);

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: amount1,
      });
      await account2.sendTransaction({
        from: account2.address,
        to: etherDivvy.address,
        value: amount2,
      });

      expect(await etherDivvy.total()).to.equal(total);
      expect(await etherDivvy.highestContribution()).to.equal(amount2);
      expect(await etherDivvy.getAccounts()).to.include.members([account1.address, account2.address]);
      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(amount1);
      expect(await etherDivvy.getBalanceFor(account2.address)).to.equal(amount2);
    });

    it("throws an exception when an account contributes multiple times", async function() {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("1"),
      });

      await expect(
        account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther("2"),
        })
      ).to.be.revertedWith(
        "An account can only contribute once per contribution window"
      );
    });

    it("throws an exception when an account contributes more than max contribution limit", async function() {
      const max = await etherDivvy.maxContribution();
      const contribution = ethers.utils.parseEther("11");

      expect(max).to.be.below(contribution);

      await expect(
        account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: contribution,
        })
      ).to.be.revertedWith(
        "Exceeds maximum contribution limit"
      );
    });

    it("throws an exception for an account contributing when withdrawal window is open", async function() {
      helpers.safelyOpenWithdrawalWindow(etherDivvy);

      await expect(
        account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther("1"),
        })
      ).to.be.revertedWith(
        "Withdrawal window is open. Please wait until next contribution window"
      );
    });
  });

  describe("#withdraw", function() {
    it("participating accounts can withdraw ether from the contract", async function() {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("8")
      });
      await account2.sendTransaction({
        from: account2.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("4")
      });

      helpers.safelyOpenWithdrawalWindow(etherDivvy);

      expect(
        await etherDivvy.connect(account1).withdraw())
        .to.changeEtherBalance(account1, ethers.utils.parseEther("6"));
      expect(
        await etherDivvy.connect(account2).withdraw())
        .to.changeEtherBalance(account2, ethers.utils.parseEther("6"));

      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
      expect(await etherDivvy.getBalanceFor(account2.address)).to.equal(0);
    });

    it("throws an exception for an account that did not contribute ether", async function() {
      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);

      helpers.safelyOpenWithdrawalWindow(etherDivvy);

      await expect(
        etherDivvy.connect(account1).withdraw()
      ).to.be.revertedWith(
        "Acting account did not contribute during contribution window"
      );
    });

    it("throws an exception for an account withdrawing before 14 days has passed", async function() {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("5"),
      });

      helpers.timeTravel(13);

      await expect(
        etherDivvy.connect(account1).withdraw()
      ).to.be.revertedWith(
        "Withdrawal window is closed. You have forfeited funds if previously contributed"
      );
    });
  });

  describe("#openWithdrawalWindow", function() {
    it("owner can open withdrawal window 14 days after contribution window opens", async function() {
      helpers.safelyOpenWithdrawalWindow(etherDivvy);

      expect(await etherDivvy.withdrawable()).to.equal(true);
      expect(await etherDivvy.withdrawableAt()).to.not.equal(0);
    });

    it("throws an exception when owner opens withdrawal window before 14 days has passed", async function() {
      helpers.timeTravel(13);

      await expect(
        etherDivvy.openWithdrawalWindow()
      ).to.be.revertedWith(
        "Two weeks must pass before opening withdrawal window"
      );
    });

    it("throws an exception when owner opens withdrawal window after its already open", async function() {
      helpers.safelyOpenWithdrawalWindow(etherDivvy);

      await expect(
        etherDivvy.openWithdrawalWindow()
      ).to.be.revertedWith("Withdrawal window is already open");
    });
  });

  describe("#openContributionWindow", function() {
    it("owner can open contribution window after 3 days since opening withdrawal window", async function() {
      const amount = ethers.utils.parseEther("8");

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: amount
      });
      // resets account balances after opening contribution window
      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(amount);

      await helpers.safelyOpenWithdrawalWindow(etherDivvy);
      await helpers.safelyOpenContributionWindow(etherDivvy);

      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
      expect(await etherDivvy.total()).to.equal(0);
      expect(await etherDivvy.withdrawable()).to.equal(false);
      expect(await etherDivvy.withdrawableAt()).to.equal(0);
      expect(await etherDivvy.contributableAt()).to.not.equal(0);
      expect(await etherDivvy.highestContribution()).to.equal(0);
      expect(await etherDivvy.maxContribution()).to.equal(ethers.utils.parseEther("10"));
      expect(await etherDivvy.getAccounts()).to.be.empty;
    });

    it("throws an exception when owner opens contribution window after already open", async function() {
      expect(await etherDivvy.withdrawable()).to.equal(false);

      await expect(
        etherDivvy.openContributionWindow()
      ).to.be.revertedWith(
        "Contribution window is already open"
      );
    });

    it("throws an exception when owner opens contribution window before three days has passed", async function() {
      helpers.safelyOpenWithdrawalWindow(etherDivvy);

      helpers.timeTravel(2);
      await expect(
        etherDivvy.openContributionWindow()
      ).to.be.revertedWith(
        "Three days must pass before opening contribution window"
      );
    });
  });

  describe("#changeMaxContribution", function() {
    it("owner can change max contribution", async function() {
      const oldMax = ethers.utils.parseEther("10");
      const newMax = ethers.utils.parseEther("50");

      expect(await etherDivvy.maxContribution()).to.equal(oldMax);

      await expect(etherDivvy.changeMaxContribution(newMax))
        .to.emit(etherDivvy, "ChangeMaxContribution")
        .withArgs(newMax);

      expect(await etherDivvy.maxContribution()).to.equal(newMax);
    });

    it("owner cannot change max contribution when withdrawal window is open", async function() {
      helpers.safelyOpenWithdrawalWindow(etherDivvy);

      await expect(
        etherDivvy.changeMaxContribution(ethers.utils.parseEther("1"))
      ).to.be.revertedWith(
        "Please wait until next contribution window to change max contribution"
      );
    });

    it("owner cannot change max contribution lower than highestContribution", async function() {
      const highestContribution = ethers.utils.parseEther("9");
      const lowerContribution   = ethers.utils.parseEther("1");

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: highestContribution,
      });

      expect(await etherDivvy.highestContribution()).to.equal(highestContribution);

      await expect(
        etherDivvy.changeMaxContribution(lowerContribution)
      ).to.be.revertedWith(
        "Please set max contribution higher than highest contribution"
      );
    });

    it("owner cannot change max contribution to zero ether", async function() {
      const invalidMax = ethers.utils.parseEther("0");

      await expect(
        etherDivvy.changeMaxContribution(invalidMax)
      ).to.be.revertedWith(
        "Please set max contribution higher than zero"
      );
    });
  });

  describe("#getBalanceFor", function() {
    it("returns balance for a participating account", async function() {
      const balance = ethers.utils.parseEther("6");

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: balance,
      });

      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(balance);
    });

    it("returns zero balance for a non-participating account", async function() {
      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
    });
  });

  describe("#getAccounts", function() {
    it("return a list of participating accounts for a contribution window", async function() {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("6"),
      });
      await account2.sendTransaction({
        from: account2.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("6"),
      });
      await account3.sendTransaction({
        from: account3.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("6"),
      });

      expect(await etherDivvy.getAccounts())
        .to.include.members([account1.address, account2.address, account3.address]);
    });

    it("returns an empty list if no participating accounts", async function() {
      expect(await etherDivvy.getAccounts()).to.be.empty;
    });
  });
});
