const readlineModule = require("readline");
const args = require("minimist")(
  process.argv.filter((val) => val.includes("="))
);
const Write = require("./lib/write");
const { trackMatic, trackAlt } = require("./lib/config");
const Contracts = require("./lib/contracts");
const MiningProcess = require("./lib/mining-process");

const intervalTime = args.interval || 3600000; // every hour
let runningProcess;

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
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (character) => {
      // if (character?.toString() === "b") {
      //   return orderFromMarket(wattAutoBuy, true);
      // } else if (character?.toString() === "c") {
      //   return claimWatt(true);
      // } else if (character?.toString() === "d") {
      //   return startDonation();
      // } else
      if (character?.toString() === "r") {
        clearInterval(runningProcess);
        return restartProcess();
        // } else if (character?.toString() === "s") {
        //   return stakeItems(true);
      } else if (character?.toString() === "q") {
        return exitProcess();
      }

      return false;
    });
  }
};

const startProcess = async () => {
  if (trackMatic) {
    const maticProcess = new MiningProcess("MATIC", Contracts.matic);
    await maticProcess.initialize();
  }
  if (trackAlt) {
    const altProcess = new MiningProcess("ALT", Contracts.alt);
    await altProcess.initialize();
  }

  if (args.noRunningProcess !== "true") {
    clearInterval(runningProcess);
    runningProcess =
      trackMatic || trackAlt ? setInterval(startProcess, intervalTime) : null;
    Write.printActions();
  }
};

const restartProcess = () => {
  Write.printLine({
    text: "\n Button 'r' pressed, refreshing",
    color: Write.colors.fgYellow,
  });
  clearInterval(runningProcess);
  startProcess();
};

startInputTracking();
startProcess();
