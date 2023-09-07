const readlineModule = require("readline");
const args = require("minimist")(
  process.argv.filter((val) => val.includes("="))
);
const Write = require("./lib/write");
const { trackMatic, trackAlt } = require("./lib/config");
const Contracts = require("./lib/contracts");
const MiningProcess = require("./lib/mining-process");

const intervalTime = args.interval || 3600000; // every hour
let runningMaticProcess;
let runningAltProcess;

const exitProcess = async () => {
  Write.printLine({
    text: "\n Button 'q' pressed",
    color: Write.colors.fgYellow,
  });
  Write.printLine({
    text: " Stopping process.",
    color: Write.colors.fgYellow,
  });
  clearInterval(runningMaticProcess);
  clearInterval(runningAltProcess);
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
        clearInterval(runningMaticProcess);
        clearInterval(runningAltProcess);
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

const startProcess = () => {
  if (trackMatic) {
    const maticProcess = new MiningProcess("MATIC", Contracts.matic);
    maticProcess.initialize().then((e) => {
      if (args.noRunningProcess !== "true") {
        clearInterval(runningMaticProcess);
        runningMaticProcess = setInterval(startProcess, intervalTime);
      }

      if (trackAlt) {
        const altProcess = new MiningProcess("ALT", Contracts.alt);
        altProcess.initialize().then((e) => {
          if (args.noRunningProcess !== "true") {
            clearInterval(runningAltProcess);
            Write.printActions();
          }
        });
      } else if (args.noRunningProcess !== "true") {
        Write.printActions();
      }
    });
  } else if (trackAlt) {
    const altProcess = new MiningProcess(Contracts.alt);
    altProcess.initialize().then((e) => {
      if (args.noRunningProcess !== "true") {
        clearInterval(runningAltProcess);
        runningAltProcess = setInterval(startProcess, intervalTime);
        Write.printActions();
      }
    });
  }
};

const restartProcess = () => {
  Write.printLine({
    text: "\n Button 'r' pressed, refreshing",
    color: Write.colors.fgYellow,
  });
  clearInterval(runningMaticProcess);
  clearInterval(runningAltProcess);
  startProcess();
};

startInputTracking();
startProcess();
