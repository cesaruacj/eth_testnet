import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Lock", function () {
  async function deployOneYearLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    const ONE_GWEI: BigNumber = ethers.parseUnits("1", "gwei");

    const lockedAmount: BigNumber = ONE_GWEI;
    const latestBlock = await ethers.provider.getBlock("latest");
    const unlockTime: number = latestBlock.timestamp + ONE_YEAR_IN_SECS;

    const [owner, otherAccount] = await ethers.getSigners();

    const LockFactory = await ethers.getContractFactory("Lock");
    const lock: Contract = await LockFactory.deploy(unlockTime, { value: lockedAmount });

    return { lock, unlockTime, lockedAmount, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { lock, unlockTime } = await deployOneYearLockFixture();
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
      const latestTime = (await ethers.provider.getBlock("latest")).timestamp;
      const LockFactory = await ethers.getContractFactory("Lock");
      await expect(
        LockFactory.deploy(latestTime, { value: ethers.parseUnits("1", "wei") })
      ).to.be.rejectedWith("Unlock time should be in the future");
    });
  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);
        await expect(lock.withdraw()).to.be.rejectedWith("You can't withdraw yet");
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(deployOneYearLockFixture);
        const currentBlock = await ethers.provider.getBlock("latest");
        const timeIncrease = unlockTime - currentBlock.timestamp + 1;
        await ethers.provider.send("evm_increaseTime", [timeIncrease]);
        await ethers.provider.send("evm_mine", []);
        await expect(lock.connect(otherAccount).withdraw()).to.be.rejectedWith("You aren't the owner");
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
        const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);
        const currentBlock = await ethers.provider.getBlock("latest");
        const timeIncrease = unlockTime - currentBlock.timestamp + 1;
        await ethers.provider.send("evm_increaseTime", [timeIncrease]);
        await ethers.provider.send("evm_mine", []);
        await expect(lock.withdraw()).not.to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {
        const { lock, unlockTime, lockedAmount, owner } = await loadFixture(deployOneYearLockFixture);
        const currentBlock = await ethers.provider.getBlock("latest");
        const timeIncrease = unlockTime - currentBlock.timestamp + 1;
        await ethers.provider.send("evm_increaseTime", [timeIncrease]);
        await ethers.provider.send("evm_mine", []);
        await expect(lock.withdraw())
          .to.emit(lock, "Withdrawal")
          .withArgs(owner.address, lockedAmount, anyValue);
      });
    });

    describe("Transfers", function () {
      it("Should transfer the funds to the owner", async function () {
        const { lock, unlockTime, lockedAmount, owner } = await deployOneYearLockFixture();
        const currentBlock = await ethers.provider.getBlock("latest");
        const timeIncrease = unlockTime - currentBlock.timestamp + 1;
        await ethers.provider.send("evm_increaseTime", [timeIncrease]);
        await ethers.provider.send("evm_mine", []);

        const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
        const tx = await lock.withdraw();
        const receipt = await tx.wait();
        const effectiveGasPrice = receipt.effectiveGasPrice || tx.gasPrice;
        const gasUsed = BigInt(receipt.gasUsed.toString()) * BigInt(effectiveGasPrice.toString());
        const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

        expect(ownerBalanceAfter).to.equal(
          BigInt(ownerBalanceBefore.toString()) + 
          BigInt(lockedAmount.toString()) - 
          gasUsed
        );
      });
    });
  });
});