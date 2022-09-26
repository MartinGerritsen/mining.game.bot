require("dotenv").config();
const { providers, Wallet } = require("ethers");
const Write = require("./lib/write");
const readlineModule = require("readline");
const args = require("minimist")(
  process.argv.filter((val) => val.includes("="))
);

const { user, rpc, wattTokenAddress, decimals } = require("./lib/config");
const { POSClient, use } = require("@maticnetwork/maticjs");
const { Web3ClientPlugin } = require("@maticnetwork/maticjs-ethers");
use(Web3ClientPlugin);

const intervalTime = 30000000;
const parentProvider = new providers.JsonRpcProvider(rpc.parent);
const childProvider = new providers.JsonRpcProvider(rpc.child);
const posClient = new POSClient();
let runningProcess;

const runProcess = async () => {
  const erc20ChildToken = posClient.erc20(wattTokenAddress);
  const balance = await erc20ChildToken.getBalance(user.address);
  console.log("balance", balance / decimals);
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

readlineModule.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on("keypress", (character) => {
  if (character?.toString() === "q") {
    return exitProcess();
  }

  return false;
});

const init = async () => {
  await posClient.init({
    network: "mainnet",
    version: "v1",
    parent: {
      provider: new Wallet(user.privateKey, parentProvider),
      defaultConfig: {
        from: user.address,
      },
    },
    child: {
      provider: new Wallet(user.privateKey, childProvider),
      defaultConfig: {
        from: user.address,
      },
    },
  });

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

init()
  .then(startInterval)
  .catch((err) => console.error(err));
