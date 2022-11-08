require("dotenv").config();
const { ethers } = require("ethers");
const readlineModule = require("readline");
const prompt = require("prompt-sync")({ sigint: true });
const args = require("minimist")(
  process.argv.filter((val) => val.includes("="))
);
const Write = require("./lib/write");
const {
  decimals,
  user,
  wattClaimTrigger,
  wattAutoBuy,
  donationAddress,
} = require("./lib/config");
const {
  wattToken,
  maticToken,
  miningGame,
  miningGameNft,
  miningGameMarket,
  multiSend,
} = require("./lib/contracts");

const intervalTime = args.interval || 3600000; // every hour
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
const multiSendContract = new ethers.Contract(
  multiSend.address,
  multiSend.abi,
  signer
);

let runningProcess;
let isFreeMintStaking = false;
let balances = {};
let wattClaimTriggerPercentage = 0;
const nftItems = [];
const inventoryItems = [];
const stakingItems = [];
const marketListings = [];

const getBalances = async (manual = false) => {
  if (manual) {
    Write.printLine({
      text: ` Starting get balances.`,
      color: Write.colors.fgYellow,
    });
  }
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

const gatherStakingItems = async (manual = false) => {
  if (manual) {
    Write.printLine({
      text: ` Starting gather staking items process.`,
      color: Write.colors.fgYellow,
    });
  }
  stakingItems.length = 0;
  const stakedItems = (
    await miningGameContract.getActivityLogs(user.address)
  ).filter((item) => !item.isWithdrawn);

  for (const stakedItem of stakedItems) {
    const nftItem = nftItems.find(
      (item) => item.id === stakedItem.tokenId.toNumber()
    );
    if (stakedItem.tokenId.toNumber() === 1) {
      isFreeMintStaking = true;
    }

    const rewardsAmount = await miningGameContract.getRewardsAmount(
      stakedItem.id
    );

    stakingItems.push({
      id: stakedItem.id.toNumber(),
      tokenId: stakedItem.tokenId.toNumber(),
      name: nftItem.name,
      amount: stakedItem.amount.toNumber(),
      pending: rewardsAmount[0] / decimals,
    });
  }

  Write.printLine({
    text: ` Staking items gathered.`,
    color: Write.colors.fgYellow,
  });
};

const claimWatt = async (manual = false) => {
  if (manual) {
    Write.printLine({
      text: ` Starting claim WATT process.`,
      color: Write.colors.fgYellow,
    });
  }
  let total = 0;
  let counter = 0;
  for (const stakingItem of stakingItems) {
    if (stakingItem.pending > 50) {
      total = total + stakingItem.pending;
      const estimatedGas = await miningGameContract.estimateGas.withdrawRewards(
        stakingItem.id
      );
      const gasPrice = await provider.getGasPrice();
      const nftItem = nftItems.find((item) => item.id === stakingItem.tokenId);

      const unsignedTx = {
        ...(await miningGameContract.populateTransaction.withdrawRewards(
          stakingItem.id
        )),
        chainId: 137,
        gasLimit: estimatedGas,
        gasPrice: gasPrice,
        nonce: await provider.getTransactionCount(user.address, "pending"),
      };

      counter++;
      const signedTx = await wallet.signTransaction(unsignedTx);
      const transaction = await provider.sendTransaction(signedTx);
      Write.printLine({
        text: ` Claiming WATT claim from ${nftItem.name} (${stakingItem.amount}).`,
        color: Write.colors.fgYellow,
      });
      await transaction.wait(1);
      Write.printLine({
        text: ` Finished claiming WATT claim from ${nftItem.name} (${stakingItem.amount}).`,
        color: Write.colors.fgYellow,
      });
    }
  }

  Write.printLine({
    text: ` ${total} WATT claimed.`,
    color: Write.colors.fgYellow,
  });
  await getBalances(true);
};

const getMarketInformation = async () => {
  marketListings.length = 0;
  const listings = [];
  let listingIndex = 0;

  while (listings.length < nftItems.length - 1) {
    const listing = await miningGameMarketContract.listings(listingIndex);

    if (
      !!listing.startTime.toNumber() &&
      listing.currency === wattToken.address
    ) {
      listings.push(listing);
    }

    listingIndex++;
  }

  marketListings.push(...listings);
};

const getNftInformation = async () => {
  if (!nftItems.length) {
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

const getInventoryInformation = async (manual = false) => {
  if (manual) {
    Write.printLine({
      text: ` Starting get inventory process.`,
      color: Write.colors.fgYellow,
    });
  }
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

const stakeItems = async (manual = false) => {
  if (manual) {
    Write.printLine({
      text: ` Starting stake process.`,
      color: Write.colors.fgYellow,
    });
  }
  if (!!inventoryItems.length) {
    const { gasPrice } = await provider.getFeeData();
    for (const inventoryItem of inventoryItems) {
      if (!(inventoryItem.id === 1 && isFreeMintStaking)) {
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
            nonce: await provider.getTransactionCount(user.address, "pending"),
          };

          const signedTx = await wallet.signTransaction(unsignedTx);
          const transaction = await provider.sendTransaction(signedTx);
          Write.printLine({
            text: ` Staking ${inventoryItem.amount.toNumber()} ${
              nftItems.find((item) => item.id === inventoryItem.id)?.name
            }(s)`,
            color: Write.colors.fgYellow,
          });
          await transaction.wait(1);
          Write.printLine({
            text: ` Finished staking ${inventoryItem.amount.toNumber()} ${
              nftItems.find((item) => item.id === inventoryItem.id)?.name
            }(s)`,
            color: Write.colors.fgYellow,
          });
        } catch (e) {
          printError(e);
        }
      }
    }
  }
  Write.printLine({
    text: ` Finished stake process.`,
    color: Write.colors.fgYellow,
  });
};

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
        text: ` - ${item.name}: ${item.amount} \n`,
        color: Write.colors.fgGreen,
      })),
    ]);
  }

  if (!!stakingItems.length) {
    Write.printLine([
      {
        text: `\n Staking:\n`,
        color: Write.colors.fgGreen,
      },
      ...stakingItems.map((item) => ({
        text: ` - ${item.name}: ${item.amount} \n`,
        color: Write.colors.fgGreen,
      })),
    ]);
  }
  const pendingWatt = stakingItems
    .reduce((partialSum, item) => partialSum + (item.pending ?? 0), 0)
    .toFixed(2);
  wattClaimTriggerPercentage = (pendingWatt / wattClaimTrigger) * 100;

  Write.printPercent(
    wattClaimTriggerPercentage,
    `Until auto claim (${wattClaimTrigger})`
  );
  Write.printLine([
    {
      text: `\n WATT pending: ${pendingWatt}`,
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
    const totalPendingWatt = await stakingItems.reduce(
      (partialSum, item) => partialSum + (item.pending ?? 0),
      0
    );

    if (totalPendingWatt > wattClaimTrigger) {
      await claimWatt();
    }
  }

  if (!!wattAutoBuy) {
    await orderFromMarket(wattAutoBuy, false, true);
  }
};

const orderFromMarket = async (id, manual = false, onInit = false) => {
  if (!!id) {
    if (manual) {
      Write.printLine({
        text: ` Started order from market process.`,
        color: Write.colors.fgYellow,
      });
    }
    const marketOrder = marketListings.find(
      (item) => item.tokenId.toNumber() === id || item.tokenId.toString() === id
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
          nonce:
            (await provider.getTransactionCount(user.address, "pending")) + 1,
        };

        const signedBuyTx = await wallet.signTransaction(unsignedBuyTx);
        const transaction = await provider.sendTransaction(signedBuyTx);
        const nftItem = nftItems.find(
          (item) => item.id === marketOrder.tokenId.toNumber()
        );

        Write.printLine({
          text: ` Buying ${nftItem.name} (${quantity}).`,
          color: Write.colors.fgYellow,
        });
        await transaction.wait(1);
        Write.printLine({
          text: ` Bought ${nftItem.name} (${quantity}).`,
          color: Write.colors.fgYellow,
        });
        await getInventoryInformation(true);
        await stakeItems(true);
      } catch (e) {
        printError(e);
      }
    } else if (!onInit) {
      Write.printLine({
        text: " Not enough WATT to order.",
        color: Write.colors.fgYellow,
      });
    }
  }
};

const donate = async () => {
  Write.printLine([
    {
      text: "\n You have offered to start a donation, thank you!",
      color: Write.colors.fgYellow,
    },
    {
      text: "\n How much WATT would you like to donate?",
      color: Write.colors.fgYellow,
    },
  ]);

  const donationAmount = prompt(" Amount: ");
  if (isNaN(donationAmount) || donationAmount <= 0) {
    Write.printLine([
      {
        text: " That is not a valid amount.",
        color: Write.colors.fgRed,
      },
    ]);
  } else if (balances.watt < donationAmount) {
    Write.printLine([
      {
        text: ` Tried to donate ${donationAmount} WATT, but you only have ${balances.watt.toFixed(
          2
        )} WATT available`,
        color: Write.colors.fgRed,
      },
    ]);
  } else {
    try {
      Write.printLine([
        {
          text: ` Preparing donation of ${donationAmount} WATT`,
          color: Write.colors.fgYellow,
        },
      ]);
      const donationWithDecimals = (donationAmount * decimals).toString();
      const estimatedApproveGas = await wattTokenContract.estimateGas.approve(
        multiSendContract.address,
        donationWithDecimals
      );
      const unsignedApproveTx = {
        ...(await wattTokenContract.populateTransaction.approve(
          multiSendContract.address,
          donationWithDecimals
        )),
        chainId: 137,
        gasLimit: estimatedApproveGas,
        gasPrice: await provider.getGasPrice(),
        nonce: await provider.getTransactionCount(user.address, "pending"),
      };
      const signedApproveTx = await wallet.signTransaction(unsignedApproveTx);
      Write.printLine([
        {
          text: ` Approving WATT usage for ${donationAmount} WATT.`,
          color: Write.colors.fgGreen,
        },
      ]);
      const approveTransaction = await provider.sendTransaction(
        signedApproveTx
      );
      await approveTransaction.wait(1);
      Write.printLine([
        {
          text: ` WATT usage approval sent.`,
          color: Write.colors.fgGreen,
        },{
          text: `\n Awaiting confirmation (https://polygonscan.com/tx/${approveTransaction.hash}).`,
          color: Write.colors.fgGreen,
        },
      ]);

      const donationProps = [
        wattTokenContract.address,
        [donationAddress],
        [donationWithDecimals],
      ];
      const estimatedDonationGas =
        await multiSendContract.estimateGas.multisendToken(...donationProps);
      const { data, to, from } =
        await multiSendContract.populateTransaction.multisendToken(
          ...donationProps
        );

      const unsignedDonationTx = {
        data, to, from,
        chainId: 137,
        gasLimit: estimatedDonationGas,
        gasPrice: await provider.getGasPrice(),
        nonce:
            (await provider.getTransactionCount(user.address, "pending")) + 1,
      };
      const signedDonationTx = await wallet.signTransaction(unsignedDonationTx);

      const donationTransaction = await provider.sendTransaction(signedDonationTx);
      Write.printLine([
        {
          text: ` WATT usage confirmed. Sending donation of ${donationAmount} WATT.`,
          color: Write.colors.fgGreen,
        },{
          text: `\n Awaiting confirmation (https://polygonscan.com/tx/${donationTransaction.hash}).`,
          color: Write.colors.fgGreen,
        },
      ]);
      await approveTransaction.wait(1);
      Write.printLine([{
        text: ` Donated ${donationAmount} WATT to ${donationAddress}, thank you!`,
        color: Write.colors.fgGreen,
      }]);
      await getInventoryInformation(true);
    } catch (e) {
      printError(e);
    }
  }
};

const runProcess = async () => {
  Write.printLine({
    text: " Starting process.",
    color: Write.colors.fgYellow,
  });

  await gatherInformation();
  await checkTriggers();
  Write.printCheckTime();
  Write.printLine({
    text: "\n Options: (b)uy, (c)laim, (d)onate, (r)efresh, (s)take or (q)uit",
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

const startInputTracking = () => {
  readlineModule.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on("keypress", (character) => {
    if (character?.toString() === "b") {
      return orderFromMarket(wattAutoBuy, true);
    } else if (character?.toString() === "c") {
      return claimWatt(true);
    } else if (character?.toString() === "d") {
      return donate();
    } else if (character?.toString() === "r") {
      return reset();
    } else if (character?.toString() === "s") {
      return stakeItems(true);
    } else if (character?.toString() === "q") {
      return exitProcess();
    }

    return false;
  });
};
const reset = async () =>
  init()
    .then(startInterval)
    .catch((err) => printError(err));

const init = async () => {
  startInputTracking();
  await runProcess();
};

const startInterval = async () => {
  if (args.noRunningProcess !== "true") {
    clearInterval(runningProcess);
    runningProcess = setInterval(runProcess, intervalTime);
  } else {
    process.exit(0);
  }
};

const printError = (e) =>
  Write.printLine([
    {
      text: `\n Something went wrong: ${e.method || e.reason}.\n`,
      color: Write.colors.fgRed,
    },
    {
      text: ` Error message: ${e.code}`,
      color: Write.colors.fgRed,
    },
  ]);

init()
  .then(startInterval)
  .catch((err) => printError(err));
