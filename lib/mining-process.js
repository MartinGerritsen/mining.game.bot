const { ethers } = require("ethers");
const Write = require("./write");
const {
  user,
  wattClaimTrigger,
  trackDonations,
  decimals,
  donate,
  wattAutoBuy,
  wattAutoGroup,
  donationPercentage,
  donationAddress,
} = require("./config");
const { hexlify } = require("ethers/lib/utils");

module.exports = class MiningProcess {
  constructor(network, contracts) {
    if (!contracts) {
      return;
    }

    this.network = network;
    this.wattPair = undefined;
    this.provider = new ethers.providers.JsonRpcProvider(contracts.rpc);
    this.wallet = new ethers.Wallet(user.privateKey, this.provider);
    const signer = this.wallet.provider.getSigner(this.wallet.address);

    this.wattTokenContract = new ethers.Contract(
      contracts.wattToken.address,
      contracts.wattToken.abi,
      signer
    );
    this.networkTokenContract = new ethers.Contract(
      contracts.networkToken.address,
      contracts.networkToken.abi,
      signer
    );
    this.miningGameStakingContract = new ethers.Contract(
      contracts.miningGameStaking.address,
      contracts.miningGameStaking.abi,
      signer
    );
    this.miningGameNftContract = new ethers.Contract(
      contracts.miningGameNft.address,
      contracts.miningGameNft.abi,
      signer
    );

    this.miningGameMarketContract = !!contracts.miningGameMarket?.address
      ? new ethers.Contract(
          contracts.miningGameMarket.address,
          contracts.miningGameMarket.abi,
          signer
        )
      : undefined;

    this.isFreeMintStaking = false;
    this.balances = {};
    this.wattClaimTriggerPercentage = 0;
    this.lastDonatedWatt = 0;
    this.totalDonatedWattSession = 0;
    this.nftItems = [];
    this.inventoryItems = [];
    this.stakingItems = [];
    this.marketListings = [];
  }

  async initialize() {
    Write.writeStartProcessLine(this.network);
    await this.getNftInformation();
    await this.runProcess();
  }

  async runProcess() {
    await this.gatherInformation();
    await this.checkTriggers();
    Write.printCheckTime(this.network);
  }

  async gatherInformation() {
    await this.getWattInformation();
    await this.getInventoryInformation();
    await this.getMarketInformation();
    await this.getBalances();
    await this.checkApprovals();
    await this.gatherStakingItems();

    const pendingWatt = this.stakingItems.reduce(
      (partialSum, item) => partialSum + (item.pending ?? 0),
      0
    );

    console.log(
      "Pending value: $",
      (pendingWatt * Number(this.wattPair?.priceUsd || 0)).toFixed(2)
    );
    console.log("WATT price: $", Number(this.wattPair?.priceUsd || 0));
    const priceChange = this.wattPair.priceChange.h24;
    Write.printLine({
      text: `Change 24h: ${priceChange}`,
      color:
        Number(priceChange) < 0 ? Write.colors.fgRed : Write.colors.fgGreen,
    });
    this.printInformation();
  }

  async getWattInformation() {
    const getWattPair = async () =>
      await fetch(
        "https://api.dexscreener.io/latest/dex/pairs/polygon/0xec54584a6da0c4e4d8029f47da4d361cc2279bef"
      );

    this.wattPair = await getWattPair().then(
      async (response) => (await response.json()).pair
    );
  }

  async getInventoryInformation(manual = false) {
    if (manual) {
      Write.printLine({
        text: ` Refreshing inventory.`,
        color: Write.colors.fgYellow,
      });
    }
    this.inventoryItems.length = 0;
    for (const nftItem of this.nftItems) {
      const nftInventoryAmount = await this.miningGameNftContract.balanceOf(
        user.address,
        nftItem.id
      );

      if (!!nftInventoryAmount.toNumber()) {
        this.inventoryItems.push({
          id: nftItem.id,
          name: nftItem.name,
          amount: nftInventoryAmount,
        });
      }
    }
  }

  async getMarketInformation() {
    if (!!this.miningGameMarketContract) {
      this.marketListings.length = 0;
      const listings = [];
      let listingIndex = 0;

      while (listings.length < this.nftItems.length) {
        const listing = await this.miningGameMarketContract.listings(
          listingIndex
        );

        if (
          !!listing.startTime.toNumber() &&
          listing.currency === this.wattTokenContract.address
        ) {
          listings.push(listing);
        }

        listingIndex++;
      }

      this.marketListings.push(...listings);
    }
  }

  async getBalances(manual = false) {
    if (manual) {
      Write.printLine({
        text: ` Starting get balances.`,
        color: Write.colors.fgYellow,
      });
    }
    const watt =
      (await this.wattTokenContract.balanceOf(user.address)) / decimals;
    const gas =
      ((await this.provider.getBalance(await this.wallet.getAddress())) || 0) /
      decimals;

    const donatedWatt =
      (await this.wattTokenContract.balanceOf(donate.address)) / decimals;
    const donatedGas =
      ((await this.provider.getBalance(donate.address)) || 0) / decimals;

    if (trackDonations && !this.lastDonatedWatt) {
      this.lastDonatedWatt = donatedWatt;
    } else if (trackDonations && this.lastDonatedWatt !== donatedWatt) {
      const donatedAmount = donatedWatt - this.lastDonatedWatt;
      Write.printLine([
        {
          text: `\n !!! Donations received !!!`,
          color: Write.colors.fgMagenta,
        },
        {
          text: `\n !!! ${donatedAmount.toFixed(2)} has been donated !!!\n`,
          color: Write.colors.fgMagenta,
        },
      ]);

      this.lastDonatedWatt = donatedWatt;
      this.totalDonatedWattSession += donatedAmount;
    }

    if (trackDonations && !!this.totalDonatedWattSession) {
      Write.printLine([
        {
          text: `\n ${this.totalDonatedWattSession.toFixed(
            2
          )} has been donated this session!\n`,
          color: Write.colors.fgMagenta,
        },
      ]);
    }

    this.balances = {
      watt,
      gas,
      donatedWatt,
      donatedGas,
    };
  }

  async checkApprovals() {
    try {
      await this.miningGameNftContract
        .isApprovedForAll(user.address, this.miningGameStakingContract.address)
        .then(async (isApproved) => {
          if (!isApproved) {
            await this.miningGameNftContract
              .setApprovalForAll(this.miningGameStakingContract.address, true)
              .then(async () => await this.checkApprovals());
          }
        });
    } catch (e) {
      console.log(e.message);
      Write.printLine({
        text: " Could not check contract approvals, ALT?",
        color: Write.colors.fgRed,
      });
    }
  }

  async gatherStakingItems(manual = false) {
    if (manual) {
      Write.printLine({
        text: ` Starting gather staking items process.`,
        color: Write.colors.fgYellow,
      });
    }
    try {
      this.stakingItems.length = 0;
      const stakedItems = (
        await this.miningGameStakingContract.getActivityLogs(user.address)
      ).filter((item) => !item.isWithdrawn);

      for (const stakedItem of stakedItems) {
        const nftItem = this.nftItems.find(
          (item) => item.id === stakedItem.tokenId.toNumber()
        );
        if (stakedItem.tokenId.toNumber() === 1) {
          this.isFreeMintStaking = true;
        }

        const rewardsAmount =
          await this.miningGameStakingContract.getRewardsAmount(stakedItem.id);

        this.stakingItems.push({
          id: stakedItem.id.toNumber(),
          tokenId: stakedItem.tokenId.toNumber(),
          name: nftItem.name,
          amount: stakedItem.amount.toNumber(),
          pending: rewardsAmount[0] / decimals,
        });
      }
    } catch (e) {
      console.log(e.message);
      Write.printLine({
        text: ` Could not recover staked items, ALT?`,
        color: Write.colors.fgRed,
      });
    }
  }

  printInformation() {
    if (!!this.inventoryItems.length) {
      Write.writeItemList(this.network, "Inventory", this.inventoryItems);
    }

    if (!!this.stakingItems.length) {
      Write.writeItemList(this.network, "Staking", this.stakingItems);
    }

    const pendingWatt = this.stakingItems
      .reduce((partialSum, item) => partialSum + (item.pending ?? 0), 0)
      .toFixed(2);
    this.wattClaimTriggerPercentage = (pendingWatt / wattClaimTrigger) * 100;

    Write.writeClaimTracking(
      this.network,
      pendingWatt,
      wattClaimTrigger,
      this.wattClaimTriggerPercentage
    );

    Write.writeWallet(
      this.network,
      "Wallet",
      this.balances.gas,
      this.balances.watt
    );

    if (trackDonations) {
      Write.writeWallet(
        this.network,
        "Donate Wallet",
        this.balances.donatedGas,
        this.balances.donatedWatt
      );
    }
  }

  async getNftInformation() {
    if (!this.nftItems.length) {
      let continueFetching = true;
      let idCounter = 1;
      const baseUrl = "https://api.mining.game";
      while (continueFetching) {
        const response = await fetch(`${baseUrl}/${idCounter}.json`);
        if (response.status === 200) {
          const nftItem = await response.json();
          this.nftItems.push({ id: idCounter, ...nftItem });
          idCounter++;
        } else {
          continueFetching = false;
        }
      }
    }
  }

  async checkTriggers() {
    if (!!wattClaimTrigger) {
      const totalPendingWatt = await this.stakingItems.reduce(
        (partialSum, item) => partialSum + (item.pending ?? 0),
        0
      );

      if (totalPendingWatt > wattClaimTrigger) {
        await this.claimWatt(false, !!wattAutoBuy);
      }
    }

    if (!!wattAutoBuy) {
      await this.orderFromMarket(wattAutoBuy, false, true);
    }
  }

  async claimWatt(manual = false, buyProcess = false) {
    if (manual) {
      Write.printLine({
        text: ` Starting claim WATT process.`,
        color: Write.colors.fgYellow,
      });
    }

    let total = 0;
    let counter = 0;
    for (const stakingItem of this.stakingItems) {
      if (stakingItem.pending > 50) {
        total = total + stakingItem.pending;
        const nftItem = this.nftItems.find(
          (item) => item.id === stakingItem.tokenId
        );
        if (
          wattAutoGroup &&
          buyProcess &&
          !!wattAutoBuy &&
          wattAutoBuy === stakingItem.tokenId.toString()
        ) {
          const estimatedGas =
            await this.miningGameStakingContract.estimateGas.unstake(
              stakingItem.id
            );
          const gasPrice = await this.provider.getGasPrice();

          const unsignedTx = {
            ...(await this.miningGameStakingContract.populateTransaction.unstake(
              stakingItem.id
            )),
            chainId: 137,
            gasLimit: estimatedGas,
            gasPrice: gasPrice,
            nonce: hexlify(
              await this.provider.getTransactionCount(user.address, "latest")
            ),
          };

          counter++;
          const signedTx = await this.wallet.signTransaction(unsignedTx);
          const transaction = await this.provider.sendTransaction(signedTx);
          Write.printLine({
            text: ` Unstaking ${nftItem.name} (${stakingItem.amount}), claiming WATT.`,
            color: Write.colors.fgYellow,
          });
          await transaction.wait(1);
          Write.printLine({
            text: ` Finished unstaking ${nftItem.name} (${stakingItem.amount}), claiming WATT.`,
            color: Write.colors.fgYellow,
          });
        } else {
          const estimatedGas =
            await this.miningGameStakingContract.estimateGas.withdrawRewards(
              stakingItem.id
            );
          const gasPrice = await this.provider.getGasPrice();

          const unsignedTx = {
            ...(await this.miningGameStakingContract.populateTransaction.withdrawRewards(
              stakingItem.id
            )),
            chainId: 137,
            gasLimit: estimatedGas,
            gasPrice: gasPrice,
            nonce: hexlify(
              await this.provider.getTransactionCount(user.address, "latest")
            ),
          };

          counter++;
          const signedTx = await this.wallet.signTransaction(unsignedTx);
          const transaction = await this.provider.sendTransaction(signedTx);
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
    }

    Write.printLine({
      text: ` ${total} WATT claimed.`,
      color: Write.colors.fgYellow,
    });
    await this.getBalances(true);
  }

  async orderFromMarket(id, manual = false, onInit = false) {
    if (!!this.miningGameMarketContract && !!id) {
      if (manual) {
        Write.printLine({
          text: ` Started order from market process.`,
          color: Write.colors.fgYellow,
        });
      }

      const marketOrder = this.marketListings.find(
        (item) =>
          item.tokenId.toNumber() === id || item.tokenId.toString() === id
      );

      if (!marketOrder) {
        return false;
      }

      const pricePerToken = marketOrder.buyoutPricePerToken.toString();
      const donationAmountPerToken = pricePerToken * (donationPercentage / 100);
      if (
        this.balances.watt >=
        pricePerToken / decimals + donationAmountPerToken / decimals
      ) {
        const quantity = Math.floor(
          this.balances.watt /
            (pricePerToken / decimals + donationAmountPerToken / decimals)
        );
        const totalCost = marketOrder.buyoutPricePerToken.mul(quantity);

        try {
          const estimatedApproveGas =
            await this.wattTokenContract.estimateGas.approve(
              this.miningGameMarketContract.address,
              totalCost.toString()
            );
          const unsignedApproveTx = {
            ...(await this.wattTokenContract.populateTransaction.approve(
              this.miningGameMarketContract.address,
              totalCost.toString()
            )),
            chainId: 137,
            gasLimit: estimatedApproveGas,
            gasPrice: await this.provider.getGasPrice(),
            nonce: hexlify(
              await this.provider.getTransactionCount(user.address, "latest")
            ),
          };
          const signedApproveTx = await this.wallet.signTransaction(
            unsignedApproveTx
          );
          const approveTransaction = await this.provider.sendTransaction(
            signedApproveTx
          );
          Write.printLine({
            text: ` Approving usage of ${totalCost / decimals} WATT.`,
            color: Write.colors.fgYellow,
          });
          await approveTransaction.wait(1);
          Write.printLine({
            text: ` Approved usage of ${totalCost / decimals} WATT.`,
            color: Write.colors.fgYellow,
          });

          const buyGasProps = [
            marketOrder.listingId,
            user.address,
            quantity,
            this.wattTokenContract.address,
            totalCost.toString(),
          ];
          const estimatedBuyGas =
            await this.miningGameMarketContract.estimateGas.buy(...buyGasProps);
          const unsignedBuyTx = {
            ...(await this.miningGameMarketContract.populateTransaction.buy(
              ...buyGasProps
            )),
            chainId: 137,
            gasLimit: estimatedBuyGas,
            gasPrice: await this.provider.getGasPrice(),
            nonce: hexlify(
              await this.provider.getTransactionCount(user.address, "latest")
            ),
          };

          const signedBuyTx = await this.wallet.signTransaction(unsignedBuyTx);
          const buyTransaction = await this.provider.sendTransaction(
            signedBuyTx
          );
          const nftItem = this.nftItems.find(
            (item) => item.id === marketOrder.tokenId.toNumber()
          );

          Write.printLine({
            text: ` Buying ${nftItem.name} (${quantity}).`,
            color: Write.colors.fgYellow,
          });
          await buyTransaction.wait(1);
          Write.printLine({
            text: ` Bought ${nftItem.name} (${quantity}).`,
            color: Write.colors.fgYellow,
          });
          if (!!Number(donationPercentage)) {
            await this.prepareDonation(
              (donationAmountPerToken / decimals) * quantity
            );
          }
          await this.getInventoryInformation(true);
          await this.stakeItems(true);
        } catch (e) {
          Write.printError(e);
        }
      } else if (!onInit) {
        Write.printLine({
          text: " Not enough WATT to order.",
          color: Write.colors.fgYellow,
        });
      }
    }
  }

  async prepareDonation(donationAmount) {
    try {
      Write.printLine([
        {
          text: ` Preparing donation of ${donationAmount} WATT`,
          color: Write.colors.fgYellow,
        },
      ]);
      const donationWithDecimals = (donationAmount * decimals).toString();
      const donationProps = [donationAddress, donationWithDecimals];

      const unsignedDonationTransaction = {
        ...(await this.wattTokenContract.populateTransaction.transfer(
          ...donationProps
        )),
        chainId: 137,
        gasLimit: await this.wattTokenContract.estimateGas.transfer(
          ...donationProps
        ),
        gasPrice: await this.provider.getGasPrice(),
        nonce: hexlify(
          await this.provider.getTransactionCount(user.address, "latest")
        ),
      };

      const signedDonationTransaction = await this.wallet.signTransaction(
        unsignedDonationTransaction
      );
      const donationTransaction = await this.provider.sendTransaction(
        signedDonationTransaction
      );
      await donationTransaction.wait(1);

      Write.printLine([
        {
          text: ` Donated ${donationAmount} WATT to ${donationAddress}, thank you!`,
          color: Write.colors.fgGreen,
        },
        {
          text: `\n For tx details: https://polygonscan.com/tx/${donationTransaction.hash}.`,
          color: Write.colors.fgGreen,
        },
      ]);
      await this.gatherInformation();
    } catch (e) {
      Write.printError(e);
    }
  }

  async stakeItems(manual = false) {
    if (manual) {
      Write.printLine({
        text: ` Starting stake process.`,
        color: Write.colors.fgYellow,
      });
    }
    if (!!this.inventoryItems.length) {
      const { gasPrice } = await this.provider.getFeeData();
      for (const inventoryItem of this.inventoryItems) {
        if (!(inventoryItem.id === 1 && this.isFreeMintStaking)) {
          try {
            const estimatedGas =
              await this.miningGameStakingContract.estimateGas.stake(
                inventoryItem.id,
                inventoryItem.amount.toNumber()
              );
            const unsignedTx = {
              ...(await this.miningGameStakingContract.populateTransaction.stake(
                inventoryItem.id,
                inventoryItem.amount.toNumber()
              )),
              chainId: 137,
              gasLimit: estimatedGas,
              gasPrice,
              nonce: hexlify(
                await this.provider.getTransactionCount(user.address, "latest")
              ),
            };

            const signedTx = await this.wallet.signTransaction(unsignedTx);
            const transaction = await this.provider.sendTransaction(signedTx);
            Write.printLine({
              text: ` Staking ${inventoryItem.amount.toNumber()} ${
                this.nftItems.find((item) => item.id === inventoryItem.id)?.name
              }(s)`,
              color: Write.colors.fgYellow,
            });
            await transaction.wait(1);
            Write.printLine({
              text: ` Finished staking ${inventoryItem.amount.toNumber()} ${
                this.nftItems.find((item) => item.id === inventoryItem.id)?.name
              }(s)`,
              color: Write.colors.fgYellow,
            });
          } catch (e) {
            Write.printError(e);
          }
        }
      }
    }
    Write.printLine({
      text: ` Finished stake process.`,
      color: Write.colors.fgYellow,
    });
  }
};
