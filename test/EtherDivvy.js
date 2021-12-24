const { ethers } = require("hardhat");
const { expect } = require("chai");
let helpers = require("./helpers.js");

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

  describe("#receive", function() {
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
      ).to.be.revertedWith("An account can only contribute once per contribution window");
    });

    it("throws an exception when an account contributes more than max contribution limit", async function() {
      let max = await etherDivvy.maxContribution();
      let contribution = ethers.utils.parseEther("11");

      expect(max).to.be.below(contribution);

      await expect(
        account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: contribution,
        })
      ).to.be.revertedWith("Exceeds maximum contribution limit");
    });

    it("throws an exception for an account contributing when withdrawal window is open", async function() {
      helpers.timeTravel(15);

      await etherDivvy.openWithdrawalWindow();
      expect(await etherDivvy.withdrawable()).to.equal(true);

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

    it("accounts can contribute ether to the contract", async function() {
      let amount1 = ethers.utils.parseEther("5");
      let amount2 = ethers.utils.parseEther("6");
      let total = ethers.utils.parseEther("11");

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
  });

  describe("#withdraw", function() {
    it("throws an exception for an account that did not contribute ether", async function() {
      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);

      helpers.timeTravel(20);

      await etherDivvy.openWithdrawalWindow();
      await expect(
        etherDivvy.connect(account1).withdraw()
      ).to.be.revertedWith("Acting account did not contribute during contribution window");
    });

    it("throws an exception for an account withdrawing before 14 days has passed", async function() {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("5"),
      });

      helpers.timeTravel(13);
      expect(await etherDivvy.withdrawable()).to.equal(false);

      await expect(
        etherDivvy.connect(account1).withdraw()
      ).to.be.revertedWith(
        "Withdrawal window is closed. You have forfeited funds if previously contributed"
      );
    });

    it("partipating accounts can withdraw ether from the contract", async function() {
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

      helpers.timeTravel(14); // 14 days has passed and withdrawal window opens

      await etherDivvy.openWithdrawalWindow();
      expect(await etherDivvy.withdrawable()).to.equal(true);

      expect(await etherDivvy.connect(account1).withdraw())
        .to.changeEtherBalance(account1, ethers.utils.parseEther("6"));
      expect(await etherDivvy.connect(account2).withdraw())
        .to.changeEtherBalance(account2, ethers.utils.parseEther("6"));

      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
      expect(await etherDivvy.getBalanceFor(account2.address)).to.equal(0);
    });
  });

  describe("#openWithdrawalWindow", function() {
    it("throws an exception when owner opens withdrawal window before 14 days has past", async function() {
      helpers.timeTravel(13);

      await expect(
        etherDivvy.openWithdrawalWindow()
      ).to.be.revertedWith("Two weeks must pass before opening withdrawal window");
    });

    it("throws an exception when owner opens withdrawal window after its already open", async function() {
      helpers.timeTravel(14);
      await etherDivvy.openWithdrawalWindow();
      expect(await etherDivvy.withdrawable()).to.equal(true);

      await expect(
        etherDivvy.openWithdrawalWindow()
      ).to.be.revertedWith("Withdrawal window is already open");
    });

    it("owner can open withdrawal window after 14 days since opening contribution window", async function() {
      // mocks initial contribution window of 14 days and opens withdrawal window
      helpers.timeTravel(14);
      await etherDivvy.openWithdrawalWindow();

      expect(await etherDivvy.withdrawable()).to.equal(true);
      expect(await etherDivvy.withdrawableAt()).to.not.equal(0);
    });
  });

  describe("#openContributionWindow", function() {
    it("throws an exception when owner opens contribution window after its already open", async function() {
      expect(await etherDivvy.withdrawable()).to.equal(false); // cannot withdraw, so only able to contribute

      await expect(
        etherDivvy.openContributionWindow()
      ).to.be.revertedWith("Contribution window is already open");
    });

    it("throws an when owner opens contribution window before three days has past", async function() {
      // mocks initial contribution window of 14 days and opens withdrawal window
      helpers.timeTravel(14);
      await etherDivvy.openWithdrawalWindow();

      helpers.timeTravel(2);

      await expect(
        etherDivvy.openContributionWindow()
      ).to.be.revertedWith('Three days must pass before opening contribution window');
    });

    it("owner can open contribution window after 3 days since opening withdrawal window", async function() {
      // create a transaction to ensure their balance is zero'd out when opening contribution window
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther("8")
      });

      // mocks initial contribution window of 14 days and opens withdrawal window
      helpers.timeTravel(14);
      await etherDivvy.openWithdrawalWindow();

      helpers.timeTravel(3);

      await etherDivvy.openContributionWindow();

      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
      expect(await etherDivvy.total()).to.equal(0);
      expect(await etherDivvy.withdrawable()).to.equal(false);
      expect(await etherDivvy.withdrawableAt()).to.equal(0);
      expect(await etherDivvy.contributableAt()).to.not.equal(0);
      expect(await etherDivvy.highestContribution()).to.equal(0);
      expect(await etherDivvy.maxContribution()).to.equal(ethers.utils.parseEther("10"));
      expect(await etherDivvy.getAccounts()).to.be.empty;
    });
  });

  describe("#changeMaxContribution", function() {
    it("owner cannot change max contribution when withdrawal window is open", async function() {
      // mocks initial contribution window of 14 days and opens withdrawal window
      helpers.timeTravel(14);
      await etherDivvy.openWithdrawalWindow();

      await expect(
        etherDivvy.changeMaxContribution(ethers.utils.parseEther("1"))
      ).to.be.revertedWith(
        "Please wait until next contribution window to change max contribution"
      );
    });

    it("owner cannot change max contribution lower than highestContribution", async function() {
      let highestContribution = ethers.utils.parseEther("9");
      let newMax = ethers.utils.parseEther("1");

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: highestContribution,
      });

      expect(await etherDivvy.highestContribution()).to.equal(highestContribution);

      await expect(
        etherDivvy.changeMaxContribution(newMax)
      ).to.be.revertedWith("Please set max contribution higher than highest contribution");
    });

    it("owner cannot change max contribution to zero ether", async function() {
      const invalidMax = ethers.utils.parseEther("0");

      await expect(
        etherDivvy.changeMaxContribution(invalidMax)
      ).to.be.revertedWith("Please set max contribution higher than zero");
    });

    it("owner can change max contribution", async function() {
      const oldMax = ethers.utils.parseEther("10");
      const newMax = ethers.utils.parseEther("50");

      expect(await etherDivvy.maxContribution()).to.equal(oldMax);

      await expect(etherDivvy.changeMaxContribution(newMax))
        .to.emit(etherDivvy, "ChangeMaxContribution")
        .withArgs(newMax);

      expect(await etherDivvy.maxContribution()).to.equal(newMax);
    });
  });

  describe("#getBalanceFor", function() {
    it("returns balance for a partipating account", async function() {
      const balance = ethers.utils.parseEther("6");

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: balance,
      });

      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(balance);
    });

    it("returns a zero balance for a non-partipating account", async function() {
      expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
    });
  });
});

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


  describe("when an account contributes ether", function() {

    describe("successfully", function() {

      it("changes total amount of contributions", async function() {
        let amount1 = ethers.utils.parseEther('5');
        let amount2 = ethers.utils.parseEther('5');
        let total = ethers.utils.parseEther('10');

        expect(await etherDivvy.total()).to.equal(0);

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

      it("contributes upto max contribution limit", async function() {
        let max = await etherDivvy.maxContribution();

        await account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: max,
        });

        expect(await etherDivvy.total()).to.equal(max);
      });

      it("contributes less than max contribution limit", async function() {
        let contribution = ethers.utils.parseEther('5');
        let max = await etherDivvy.maxContribution();

        expect(contribution).to.be.below(max);

        await account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: contribution,
        });

        expect(await etherDivvy.total()).to.equal(contribution);
      });

      it("is added to accounts list", async function() {
        await account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('1'),
        });

        expect(await etherDivvy.getAccounts()).to.include(account1.address);
      });
    });


    describe("unsuccessfully", function() {

      it("contributes when withdrawal window is open", async function() {
        helpers.timeTravel(15);
        await etherDivvy.openWithdrawalWindow();

        expect(await etherDivvy.withdrawable()).to.equal(true);

        await expect(
          account1.sendTransaction({
            from: account1.address,
            to: etherDivvy.address,
            value: ethers.utils.parseEther('1'),
          })
        ).to.be.revertedWith(
          'Withdrawal window is open. Please wait until next contribution window'
        );
      });

      it("contributes multiple times during a contribution window", async function() {
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
        ).to.be.revertedWith('An account can only contribute once per contribution window');
      });

      it("contributes more than max contribution", async function() {
        let max = await etherDivvy.maxContribution();
        let contribution = ethers.utils.parseEther('11');

        expect(max).to.be.below(contribution);

        await expect(
          account1.sendTransaction({
            from: account1.address,
            to: etherDivvy.address,
            value: contribution,
          })
        ).to.be.revertedWith('Exceeds maximum contribution limit');
      });
    });
  });


  describe("when an account withdraws ether", function() {

    describe("successfully", function() {

      beforeEach(async() => {
        await account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('8')
        });

        await account2.sendTransaction({
          from: account2.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('4')
        });

        helpers.timeTravel(20);
        await etherDivvy.openWithdrawalWindow();
      });

      it("the withdrawal window is open", async function() {
        expect(await etherDivvy.withdrawable()).to.equal(true);

        expect(await etherDivvy.connect(account1).withdraw())
          .to.changeEtherBalance(account1, ethers.utils.parseEther('6'));
      });

      it("changes account ether balance with their funds", async function() {
        expect(await etherDivvy.connect(account1).withdraw())
          .to.changeEtherBalance(account1, ethers.utils.parseEther('6'));
        expect(await etherDivvy.connect(account2).withdraw())
          .to.changeEtherBalance(account2, ethers.utils.parseEther('6'));
      });

      it("resets contract balance for account's address to zero", async function() {
        await etherDivvy.connect(account1).withdraw();
        await etherDivvy.connect(account2).withdraw();

        expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
        expect(await etherDivvy.getBalanceFor(account2.address)).to.equal(0);
      });
    });


    describe("unsuccessfully", function() {

      beforeEach(async() => {
        await account1.sendTransaction({
          from: account1.address,
          to: etherDivvy.address,
          value: ethers.utils.parseEther('8')
        });
      });

      it("the withdrawal window is closed", async function() {
        expect(await etherDivvy.withdrawable()).to.equal(false);

        await expect(
          etherDivvy.connect(account1).withdraw()
        ).to.be.revertedWith(
          'Withdrawal window is closed. You have forfeited funds if previously contributed'
        );
      });

      it("did not contribute any ether", async function() {
        expect(await etherDivvy.getBalanceFor(account2.address)).to.equal(0);

        helpers.timeTravel(20);
        await etherDivvy.openWithdrawalWindow();

        await expect(
          etherDivvy.connect(account2).withdraw()
        ).to.be.revertedWith('Acting account did not contribute during contribution window');
      });
    });
  });


  describe("when remaining ether exists after a withdrawal window closes", function() {

    beforeEach(async() => {
      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('8')
      });

      await account2.sendTransaction({
        from: account2.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('4')
      });

      await account3.sendTransaction({
        from: account3.address,
        to: etherDivvy.address,
        value: ethers.utils.parseEther('1')
      });

      helpers.timeTravel(20);
      await etherDivvy.openWithdrawalWindow();
    });

    it("the remaining ether stays in the contract", async function() {
      expect(await etherDivvy.connect(account1).withdraw())
        .to.changeEtherBalance(account1, ethers.utils.parseEther('4.333333333333333333'));
      expect(await etherDivvy.connect(account2).withdraw())
        .to.changeEtherBalance(account2, ethers.utils.parseEther('4.333333333333333333'));
      expect(await etherDivvy.connect(account3).withdraw())
        .to.changeEtherBalance(account3, ethers.utils.parseEther('4.333333333333333333'));

      expect(await etherDivvy.provider.getBalance(etherDivvy.address))
        .to.not.equal(0);
    });
  });


  describe("when contract owner", function() {

    it("sets owner to address of contract deployer", async function() {
      expect(await etherDivvy.owner()).to.equal(owner.address);
    });

    it("sets contribution window time on deploy", async function() {
      expect(await etherDivvy.contributableAt()).to.not.equal(0);
    });

    it("sets withdrawable window time to zero on deploy", async function() {
      expect(await etherDivvy.withdrawableAt()).to.equal(0);
    });

    it("can transfer ownership to another address", async function() {
      await etherDivvy.transferOwnership(account1.address, {from: owner.address});

      expect(await etherDivvy.owner()).to.not.equal(owner.address);
      expect(await etherDivvy.owner()).to.equal(account1.address);
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

      helpers.timeTravel(20);
      await etherDivvy.openWithdrawalWindow();

      expect(await etherDivvy.withdrawable()).to.equal(true);
    });

    it("can open contribution window", async function() {
      await expect(
        etherDivvy.openContributionWindow()
      ).to.not.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot open withdrawal window when already open", async function() {
      helpers.timeTravel(20);
      await etherDivvy.openWithdrawalWindow();

      expect(await etherDivvy.withdrawable()).to.equal(true);

      await expect(
        etherDivvy.openWithdrawalWindow()
      ).to.be.revertedWith('Withdrawal window is already open');
    });

    it("cannot change max contribution when withdrawal window is open", async function() {
      helpers.timeTravel(20);
      await etherDivvy.openWithdrawalWindow();

      await expect(
        etherDivvy.changeMaxContribution(ethers.utils.parseEther('1'))
      ).to.be.revertedWith(
        'Please wait until next contribution window to change max contribution'
        // 'Withdrawal window is open. Please wait until next contribution window'
      );
    });

    it("cannot change max contribution to zero ether", async function() {
      const invalidMax = ethers.utils.parseEther('0');

      await expect(
        etherDivvy.changeMaxContribution(invalidMax)
      ).to.be.revertedWith('Please set max contribution higher than zero');
    });

    it("cannot change max contribution lower than highestContribution", async function() {
      let highestContribution = ethers.utils.parseEther('9');
      let newMax = ethers.utils.parseEther('1');

      await account1.sendTransaction({
        from: account1.address,
        to: etherDivvy.address,
        value: highestContribution,
      });

      expect(await etherDivvy.highestContribution()).to.equal(highestContribution);

      await expect(
        etherDivvy.changeMaxContribution(newMax)
      ).to.be.revertedWith('Please set max contribution higher than highest contribution');
    });


    describe("#openWithdrawalWindow", function() {

      it("sets withdrawable to true", async function() {
        helpers.timeTravel(20);
        expect(await etherDivvy.withdrawable()).to.equal(false);

        await etherDivvy.openWithdrawalWindow();
        expect(await etherDivvy.withdrawable()).to.equal(true);
      });

      it("sets withdrawableAt timestamp", async function() {
        helpers.timeTravel(20);
        expect(await etherDivvy.withdrawableAt()).to.equal(0);

        await etherDivvy.openWithdrawalWindow();
        expect(await etherDivvy.withdrawableAt()).to.not.equal(0);
      });

      it("throws an exception if under two weeks since contribution window opened", async function() {
        helpers.timeTravel(13);

        await expect(
          etherDivvy.openWithdrawalWindow()
        ).to.be.revertedWith('Two weeks must pass before opening withdrawal window');
      });

      it("does not revert if over two weeks since contribution window opened", async function() {
        helpers.timeTravel(20);
        await etherDivvy.openWithdrawalWindow();

        await expect(
          etherDivvy.openWithdrawalWindow()
        ).to.not.be.revertedWith('Two weeks must pass before opening withdrawal window');
      });
    });


    describe("#openContributionWindow", function() {

      describe("withdrawal window is closed", function() {

        beforeEach(async() => {
          expect(await etherDivvy.withdrawable()).to.equal(false);
        });

        it("throws an exception with a message", async function() {
          await expect(
            etherDivvy.openContributionWindow()
          ).to.be.revertedWith('Contribution window is already open');
        });
      });

      describe("withdrawal window is open", function() {

        beforeEach(async() => {
          await account1.sendTransaction({
            from: account1.address,
            to: etherDivvy.address,
            value: ethers.utils.parseEther('1'),
          });

          await account2.sendTransaction({
            from: account2.address,
            to: etherDivvy.address,
            value: ethers.utils.parseEther('5'),
          });

          helpers.timeTravel(20);
          await etherDivvy.openWithdrawalWindow();
        });

        it("sets total to zero", async function() {
          expect(await etherDivvy.total()).to.equal(ethers.utils.parseEther('6'));

          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.total()).to.equal(0);
        });

        it("resets maxContribution to default", async function() {
          let defaultMax = ethers.utils.parseEther('10');

          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.maxContribution()).to.equal(defaultMax);
        });

        it("sets highestContribution to zero", async function() {
          expect(await etherDivvy.highestContribution()).to.equal(ethers.utils.parseEther('5'));

          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.highestContribution()).to.equal(0);
        });

        it("sets withdrawable to false", async function() {
          expect(await etherDivvy.withdrawable()).to.equal(true);

          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.withdrawable()).to.equal(false);
        });

        it("empties accounts list", async function() {
          expect(await etherDivvy.getAccounts()).to.not.be.empty;

          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.getAccounts()).to.be.empty;
        });

        it("sets withdrawableAt to zero", async function() {
          expect(await etherDivvy.withdrawableAt()).to.not.equal(0);

          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.withdrawableAt()).to.equal(0);
        });

        it("sets contributableAt timestamp for the contribution window", async function() {
          let previous = await etherDivvy.contributableAt();

          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.contributableAt()).to.not.equal(previous);
        });

        it("sets contributing account balances to zero", async function() {
          helpers.timeTravel(4);
          await etherDivvy.openContributionWindow();

          expect(await etherDivvy.getBalanceFor(account1.address)).to.equal(0);
          expect(await etherDivvy.getBalanceFor(account2.address)).to.equal(0);
        });

        it("throws an exception if under three days since withdrawal window opened", async function() {
          helpers.timeTravel(2);

          await expect(
            etherDivvy.openContributionWindow()
          ).to.be.revertedWith('Three days must pass before opening contribution window');
        });

        it("throw an exception if three days since withdrawal window opened", async function() {
          helpers.timeTravel(3);

          await expect(
            etherDivvy.openContributionWindow()
          ).to.be.revertedWith('Three days must pass before opening contribution window');
        });

        it("does not throw an exception if over three days since withdrawal window opened", async function() {
          helpers.timeTravel(4);

          await expect(
            etherDivvy.openContributionWindow()
          ).to.not.be.revertedWith('Three days must pass before opening contribution window');
        });
      });
    });
  });


  describe("when not contract owner", function() {

    let nonContractOwner;

    beforeEach(async() => {
      nonContractOwner = account1;
    });

    it("is not the contract owner", async function() {
      expect(await etherDivvy.owner()).to.equal(owner.address);
      expect(await etherDivvy.owner()).to.not.equal(nonContractOwner.address);
    });

    it("cannot transfer ownership to another address", async function() {
      await expect(
        etherDivvy
          .connect(nonContractOwner)
          .transferOwnership(
            account2.address,
            {from: nonContractOwner.address}
          )
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot change max contribution", async function() {
      await expect(
        etherDivvy
          .connect(nonContractOwner)
          .changeMaxContribution(ethers.utils.parseEther('5'))
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot open withdrawal window", async function() {
      expect(await etherDivvy.withdrawable()).to.equal(false);

      await expect(
        etherDivvy.connect(nonContractOwner).openWithdrawalWindow()
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("cannot open contribution window", async function() {
      await expect(
        etherDivvy.connect(account1).openContributionWindow()
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });


  describe("#highestContribution", function() {

    it("returns highest amount an account has contributed", async function() {
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
