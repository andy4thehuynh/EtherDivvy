const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("EtherDivvy", function() {
  describe("when contract owner", function() {
    it("set to owner by default on deploying the contract", async function() {
      const [owner]    = await ethers.getSigners();
      const EtherDivvy = await ethers.getContractFactory("EtherDivvy");
      const etherDivvy = await EtherDivvy.deploy();
      expect(owner.address).to.equal(await etherDivvy.owner());
    });

    it("can transfer ownership to someone else", async function() {
      const [owner, alice] = await ethers.getSigners();
      const EtherDivvy     = await ethers.getContractFactory("EtherDivvy");
      const etherDivvy     = await EtherDivvy.deploy();

      await etherDivvy.transferOwnership(alice.address, {from: owner.address});

      expect(owner.address).to.not.equal(await etherDivvy.owner());
      expect(alice.address).to.equal(await etherDivvy.owner());
    });
  });
});
