import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DexAggregator, ArbitrageLogic } from "../typechain-types";

describe("Arbitrage Logic", function () {
  let dexAggregator: DexAggregator;
  let arbitrageLogic: ArbitrageLogic;
  let owner: SignerWithAddress;

  before(async function () {
    [owner] = await ethers.getSigners();
    
    // Deploy DexAggregator
    const DexAggregatorFactory = await ethers.getContractFactory("DexAggregator");
    dexAggregator = await DexAggregatorFactory.deploy() as DexAggregator;
    console.log("DexAggregator deployed to:", await dexAggregator.getAddress());
    
    // Deploy ArbitrageLogic passing the address of DexAggregator
    const ArbitrageLogicFactory = await ethers.getContractFactory("ArbitrageLogic");
    arbitrageLogic = await ArbitrageLogicFactory.deploy(await dexAggregator.getAddress()) as ArbitrageLogic;
    console.log("ArbitrageLogic deployed to:", await arbitrageLogic.getAddress());
  });

  it("should set owner correctly in ArbitrageLogic", async function () {
    expect(await arbitrageLogic.owner()).to.equal(owner.address);
  });

  it("should add a Dex and mark it as active in DexAggregator", async function () {
    await dexAggregator.addDex(0, owner.address);
    const dexInfo = await dexAggregator.dexes(0);
    expect(dexInfo.router).to.equal(owner.address);
    expect(dexInfo.active).to.equal(true);
  });

  it("should set a price feed in ArbitrageLogic", async function () {
    const dummyToken = "0x1111111111111111111111111111111111111111";
    const dummyFeed = "0x2222222222222222222222222222222222222222";
    await arbitrageLogic.setPriceFeed(dummyToken, dummyFeed);
    expect(await arbitrageLogic.priceFeeds(dummyToken)).to.equal(dummyFeed);
  });
});