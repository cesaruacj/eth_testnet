const { expect } = require("chai");
const { ethers } = require("hardhat");
// Add this line to define anyValue
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Lock", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOneYearLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    const ONE_GWEI = 1_000_000_000n; // Use BigInt

    // Define variables properly
    const lockedAmount = ONE_GWEI;
    const unlockTime = (await ethers.provider.getBlock("latest")).timestamp + ONE_YEAR_IN_SECS;

    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const Lock = await ethers.getContractFactory("Lock");
    const lock = await Lock.deploy(unlockTime, { value: lockedAmount });

    return { lock, unlockTime, lockedAmount, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.unlockTime()).to.equal(unlockTime);
    });

    it("Should set the right owner", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.owner()).to.equal(owner.address);
    });

    it("Should receive and store the funds to lock", async function () {
      const { lock, lockedAmount } = await loadFixture(deployOneYearLockFixture);

      expect(await ethers.provider.getBalance(await lock.getAddress())).to.equal(lockedAmount);
    });

    it("Should fail if the unlockTime is not in the future", async function () {
      // We don't use the fixture here because we want a different deployment
      const latestTime = (await ethers.provider.getBlock("latest")).timestamp;
      const Lock = await ethers.getContractFactory("Lock");
      
      await expect(Lock.deploy(latestTime, { value: 1 }))
        .to.be.rejectedWith("Unlock time should be in the future");
    });
  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);

        await expect(lock.withdraw())
          .to.be.rejectedWith("You can't withdraw yet");
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(deployOneYearLockFixture);

        // We increase the time to pass the unlock time
        await ethers.provider.send("evm_increaseTime", [unlockTime - (await ethers.provider.getBlock("latest")).timestamp + 1]);
        await ethers.provider.send("evm_mine");

        // We use lock.connect() to send a transaction from another account
        await expect(lock.connect(otherAccount).withdraw())
          .to.be.rejectedWith("You aren't the owner");
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
        const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

        // We increase the time to pass the unlock time
        await ethers.provider.send("evm_increaseTime", [unlockTime - (await ethers.provider.getBlock("latest")).timestamp + 1]);
        await ethers.provider.send("evm_mine");

        await expect(lock.withdraw()).not.to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {
        const { lock, unlockTime, lockedAmount, owner } = await loadFixture(deployOneYearLockFixture);

        // We increase the time to pass the unlock time
        await ethers.provider.send("evm_increaseTime", [unlockTime - (await ethers.provider.getBlock("latest")).timestamp + 1]);
        await ethers.provider.send("evm_mine");

        await expect(lock.withdraw())
          .to.emit(lock, "Withdrawal")
          .withArgs(owner.address, lockedAmount, anyValue); // Ensure the arguments match the event
      });
    });

    describe("Transfers", function () {
      it("Should transfer the funds to the owner", async function () {
        const { lock, unlockTime, lockedAmount, owner } = await loadFixture(deployOneYearLockFixture);

        // We increase the time to pass the unlock time
        await ethers.provider.send("evm_increaseTime", [unlockTime - (await ethers.provider.getBlock("latest")).timestamp + 1]);
        await ethers.provider.send("evm_mine");

        const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
        const tx = await lock.withdraw();
        const receipt = await tx.wait();
        
        // Calculate gas used
        const gasUsed = receipt.gasUsed * receipt.gasPrice;
        
        const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

        // Owner should have received the locked amount minus gas costs
        expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + BigInt(lockedAmount) - gasUsed);
      });
    });
  });
});