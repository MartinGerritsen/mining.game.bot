require("dotenv").config();
const { ethers } = require("ethers");
const readlineModule = require("readline");
const args = require("minimist")(
  process.argv.filter((val) => val.includes("="))
);
const Write = require("./lib/write");
const { decimals, user, wattClaimTrigger } = require("./lib/config");
const {
  wattToken,
  maticToken,
  miningGame,
  miningGameNft,
  miningGameMarket,
} = require("./lib/contracts");

const intervalTime = 3600000; // every hour
const provider = new ethers.providers.JsonRpcProvider(
  "https://polygon-rpc.com/"
);
const wallet = new ethers.Wallet(user.privateKey, provider);
const signer = wallet.provider.getSigner(wallet.address);

const wattTokenContract = new ethers.Contract(
  wattToken.address,
  wattToken.abi,
  signer
);
const maticTokenContract = new ethers.Contract(
  maticToken.address,
  maticToken.abi,
  signer
);
const miningGameContract = new ethers.Contract(
  miningGame.address,
  miningGame.abi,
  signer
);
const miningGameNftContract = new ethers.Contract(
  miningGameNft.address,
  miningGameNft.abi,
  signer
);
const miningGameMarketContract = new ethers.Contract(
  miningGameMarket.address,
  miningGameMarket.abi,
  signer
);

let runningProcess;
let isFreeMintStaking = false;
let balances = {};
const nftItems = [];
const inventoryItems = [];
const stakingItems = [];
const marketListings = [];

const getBalances = async () => {
  const watt = (await wattTokenContract.balanceOf(user.address)) / decimals;
  const matic = (await maticTokenContract.balanceOf(user.address)) / decimals;

  Write.printLine({
    text: " Balances gathered.",
    color: Write.colors.fgYellow,
  });
  balances = {
    watt,
    matic,
  };
};

const checkApprovals = async () => {
  await miningGameNftContract
    .isApprovedForAll(user.address, miningGameContract.address)
    .then(async (isApproved) => {
      if (isApproved) {
        Write.printLine({
          text: " Contracts approved.",
          color: Write.colors.fgYellow,
        });
      } else {
        Write.printLine({
          text: " Contracts not approved, going to approve.",
          color: Write.colors.fgRed,
        });
        await miningGameNftContract
          .setApprovalForAll(miningGameContract.address, true)
          .then(async () => await checkApprovals());
      }
    });
};

const gatherStakingItems = async () => {
  stakingItems.length = 0;
  const stakedItems = (
    await miningGameContract.getActivityLogs(user.address)
  ).filter((item) => !item.isWithdrawn);

  for (const stakedItem of stakedItems) {
    if(stakedItem.tokenId.toNumber() === 1) {
      isFreeMintStaking = true;
    }

    const rewardsAmount = await miningGameContract.getRewardsAmount(
      stakedItem.id
    );

    stakingItems.push({
      id: stakedItem.id.toNumber(),
      tokenId: stakedItem.tokenId.toNumber(),
      amount: stakedItem.amount.toNumber(),
      pending: rewardsAmount[0] / decimals,
    });
  }

  Write.printLine({
    text: ` Staking items gathered.`,
    color: Write.colors.fgYellow,
  });
};

const claimWatt = async () => {
  let total = 0;
  let counter = 0;
  for (const stakingItem of stakingItems) {
    if (stakingItem.pending > 10) {
      total = total + stakingItem.pending;
      const estimatedGas = await miningGameContract.estimateGas.withdrawRewards(
        stakingItem.id
      );
      const gasPrice = await provider.getGasPrice();
      const nftItem = nftItems.find(item => item.id === stakingItem.tokenId)

      const unsignedTx = {
        ...(await miningGameContract.populateTransaction.withdrawRewards(
          stakingItem.id
        )),
        chainId: 137,
        gasLimit: estimatedGas,
        gasPrice: gasPrice,
        nonce:
          (await provider.getTransactionCount(user.address, "pending")),
      };

      counter++;
      const signedTx = await wallet.signTransaction(unsignedTx);
      const transaction = await provider.sendTransaction(signedTx);
      Write.printLine({
        text: ` Claiming ATLAS claim from ${nftItem.name} (${stakingItem.amount}).`,
        color: Write.colors.fgYellow,
      });
      await transaction.wait(1);
      Write.printLine({
        text: ` Finished claiming ATLAS claim from ${nftItem.name} (${stakingItem.amount}).`,
        color: Write.colors.fgYellow,
      });

    }
  }

  Write.printLine({
    text: ` ${total} ATLAS claimed.`,
    color: Write.colors.fgYellow,
  });
};

const getMarketInformation = async () => {
  marketListings.length = 0;
  const listings = [];
  const totalListings = (
    await miningGameMarketContract.totalListings()
  ).toNumber();
  let listingIndex = 0;
  let counter = 1;

  while (counter < totalListings - 1) {
    const listing = await miningGameMarketContract.listings(listingIndex);
    if (!!listing.startTime.toNumber()) {
      listings.push(listing);
      counter++;
    }
    listingIndex++;
  }

  marketListings.push(
    ...listings.filter((listing) => listing.currency === wattToken.address)
  );
};

const getNftInformation = async () => {
  if(!nftItems.length) {
    let continueFetching = true;
    let idCounter = 1;
    const baseUrl = "https://api.mining.game";
    while (continueFetching) {
      const response = await fetch(`${baseUrl}/${idCounter}.json`);
      if (response.status === 200) {
        const nftItem = await response.json();
        nftItems.push({ id: idCounter, ...nftItem });
        idCounter++;
      } else {
        continueFetching = false;
      }
    }

    Write.printLine({
      text: ` Gathered NFT information.`,
      color: Write.colors.fgYellow,
    });
  }
};

const getInventoryInformation = async () => {
  inventoryItems.length = 0;
  for (const nftItem of nftItems) {
    const nftInventoryAmount = await miningGameNftContract.balanceOf(
      user.address,
      nftItem.id
    );
    if (!!nftInventoryAmount.toNumber()) {
      inventoryItems.push({
        id: nftItem.id,
        name: nftItem.name,
        amount: nftInventoryAmount,
      });
    }
  }
};

const stakeItems = async () => {
  if(!!inventoryItems.length) {
    const { gasPrice } = await provider.getFeeData();
    for (const inventoryItem of inventoryItems) {
      if(!(inventoryItem.id === 1 && isFreeMintStaking)) {
        try {
          const estimatedGas = await miningGameContract.estimateGas.stake(
              inventoryItem.id,
              inventoryItem.amount.toNumber()
          );
          const unsignedTx = {
            ...(await miningGameContract.populateTransaction.stake(
                inventoryItem.id,
                inventoryItem.amount.toNumber()
            )),
            chainId: 137,
            gasLimit: estimatedGas,
            gasPrice,
            nonce:
                (await provider.getTransactionCount(user.address, "pending")),
          };

          const signedTx = await wallet.signTransaction(unsignedTx);
          const transaction = await provider.sendTransaction(signedTx);
          Write.printLine({
            text: ` Staking ${inventoryItem.amount.toNumber()} ${nftItems.find(item => item.id === inventoryItem.id)?.name}(s)`,
            color: Write.colors.fgYellow,
          });
          await transaction.wait(1);
          Write.printLine({
            text: ` Finished staking ${inventoryItem.amount.toNumber()} ${nftItems.find(item => item.id === inventoryItem.id)?.name}(s)`,
            color: Write.colors.fgYellow,
          });
        } catch (e) {
          printError(e);
        }
      }
    }
  }
}

const gatherInformation = async () => {
  await getNftInformation();
  await getInventoryInformation();
  await getMarketInformation();
  await getBalances();
  await checkApprovals();
  await gatherStakingItems();
  if (!!inventoryItems.length) {
    Write.printLine([
      {
        text: `\n Inventory:\n`,
        color: Write.colors.fgGreen,
      },
      ...inventoryItems.map((item) => ({
        text: ` ${item.name}: ${item.amount} \n`,
        color: Write.colors.fgGreen,
      })),
    ]);
  }
  Write.printLine([
    {
      text: ` Total pending: ${stakingItems
        .reduce((partialSum, item) => partialSum + (item.pending ?? 0), 0)
        .toFixed(2)}`,
      color: Write.colors.fgGreen,
    },
    {
      text: `\n Available WATT: ${balances.watt.toFixed(3)}`,
      color: Write.colors.fgGreen,
    },
    {
      text: `\n Available MATIC: ${balances.matic.toFixed(3)}`,
      color: Write.colors.fgGreen,
    },
  ]);
};

const checkTriggers = async () => {
  if (!!wattClaimTrigger) {
    const totalPendingWatt = stakingItems.reduce(
      (partialSum, item) => partialSum + (item.pending ?? 0),
      0
    );

    if (totalPendingWatt > wattClaimTrigger) {
      await claimWatt();
    }
  }
};

const orderFromMarket = async (id) => {
  const marketOrder = marketListings.find(
    (item) => item.tokenId.toNumber() === id
  );
  const pricePerToken = marketOrder.buyoutPricePerToken.toString();
  if (balances.watt >= pricePerToken / decimals) {
    const quantity = Math.floor(balances.watt / (pricePerToken / decimals));
    const totalCost = marketOrder.buyoutPricePerToken.mul(quantity);

    try {
      const estimatedApproveGas = await wattTokenContract.estimateGas.approve(
          miningGameMarket.address,
          totalCost.toString()
      );
      const unsignedApproveTx = {
        ...(await wattTokenContract.populateTransaction.approve(
            miningGameMarket.address,
            totalCost.toString()
        )),
        chainId: 137,
        gasLimit: estimatedApproveGas,
        gasPrice: await provider.getGasPrice(),
        nonce: await provider.getTransactionCount(user.address, "pending"),
      };
      const signedApproveTx = await wallet.signTransaction(unsignedApproveTx);
      await provider.sendTransaction(signedApproveTx);
      const buyGasProps = [
        marketOrder.listingId,
        user.address,
        quantity,
        wattToken.address,
        totalCost.toString(),
      ];
      const estimatedBuyGas = await miningGameMarketContract.estimateGas.buy(
          ...buyGasProps
      );
      const unsignedBuyTx = {
        ...(await miningGameMarketContract.populateTransaction.buy(
            ...buyGasProps
        )),
        chainId: 137,
        gasLimit: estimatedBuyGas,
        gasPrice: await provider.getGasPrice(),
        nonce: (await provider.getTransactionCount(user.address, "pending")) + 1,
      };

      const signedBuyTx = await wallet.signTransaction(unsignedBuyTx);
      const transaction = await provider.sendTransaction(signedBuyTx);
      const nftItem = nftItems.find(item => item.id === marketOrder.tokenId.toNumber());

      Write.printLine({
        text: ` Buying ${nftItem.name} (${quantity}).`,
        color: Write.colors.fgYellow,
      });
      await transaction.wait(1);
      Write.printLine({
        text: ` Bought ${nftItem.name} (${quantity}).`,
        color: Write.colors.fgYellow,
      });
    } catch (e) {
      printError(e)
    }
  } else {
    Write.printLine({
      text: " Not enough WATT to order.",
      color: Write.colors.fgYellow,
    });
  }
};

const runProcess = async () => {
  Write.printLine({
    text: " Starting process.",
    color: Write.colors.fgYellow,
  });
  await gatherInformation();
  await checkTriggers();
  Write.printLine({
    text: "\n Options: (b)uy, (c)laim, (r)efresh, (s)take, (q)uit",
    color: Write.colors.fgRed,
  });
};

const exitProcess = async () => {
  Write.printLine({
    text: "\n Button 'q' pressed",
    color: Write.colors.fgYellow,
  });
  Write.printLine({
    text: " Stopping process.",
    color: Write.colors.fgYellow,
  });
  clearInterval(runningProcess);
  process.exit(0);
};

const reset = async () => init()
    .then(startInterval)
    .catch((err) => printError(err));

const init = async () => {
  await runProcess();
};

readlineModule.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on("keypress", (character) => {
  if (character?.toString() === "b") {
    return orderFromMarket(3);
  }
  else if (character?.toString() === "c") {
    return claimWatt();
  }
  else if (character?.toString() === "r") {
    return reset();
  }
  else if (character?.toString() === "s") {
      Write.printLine({
        text: " Staking is a work in progress.",
        color: Write.colors.fgYellow,
      });
      return stakeItems();
  }
  else if (character?.toString() === "q") {
    return exitProcess();
  }

  return false;
});

const startInterval = async () => {
  if (args.noRunningProcess !== "true") {
    clearInterval(runningProcess);
    runningProcess = setInterval(runProcess, intervalTime);
  } else {
    process.exit(0);
  }
};

const printError = (e) => Write.printLine([{
  text: ` Something went wrong: ${e.method || e.reason}.\n`,
  color: Write.colors.fgYellow,
},{
  text: `Error code: ${e.code}`,
  color: Write.colors.fgRed,
}]);

init()
  .then(startInterval)
  .catch((err) => printError(err));
