class Write {
  constructor() {
    this.colors = {
      reset: "\x1b[0m",
      bright: "\x1b[1m",
      dim: "\x1b[2m",
      underscore: "\x1b[4m",
      blink: "\x1b[5m",
      reverse: "\x1b[7m",
      hidden: "\x1b[8m",
      fgBlack: "\x1b[30m",
      fgRed: "\x1b[31m",
      fgGreen: "\x1b[32m",
      fgYellow: "\x1b[33m",
      fgBlue: "\x1b[34m",
      fgMagenta: "\x1b[35m",
      fgCyan: "\x1b[36m",
      fgWhite: "\x1b[37m",
      bgBlack: "\x1b[40m",
      bgRed: "\x1b[41m",
      bgGreen: "\x1b[42m",
      bgYellow: "\x1b[43m",
      bgBlue: "\x1b[44m",
      bgMagenta: "\x1b[45m",
      bgCyan: "\x1b[46m",
      bgWhite: "\x1b[47m",
    };

    this.defaultColor = this.colors.fgGreen;
  }

  // { text: string, color: number } | { text: string, color: number }[]
  printLine(message) {
    if (!!message) {
      if (!Array.isArray(message))
        return process.stdout.write(
          `${message.color || this.colors.reset}${message.background || ""}${
            message.text
          }${this.colors.reset}\n`
        );

      const maxLength = message.length;
      message.forEach((item, index) => {
        process.stdout.write(
          `\x1b[${item.color || 0}${item.background || ""}${item.text}${
            this.colors.reset
          }${index + 1 === maxLength ? "\n" : ""}`
        );
      });
    }
  }

  printError(e) {
    this.printLine([
      {
        text: `\n Something went wrong: ${e.method || e.reason}.\n`,
        color: this.colors.fgRed,
      },
      {
        text: ` Error message: ${e.code}`,
        color: this.colors.fgRed,
      },
    ]);
  }

  writeStartProcessLine(network) {
    const totalLength = 32;
    const totalLengthSide = Math.floor(
      (totalLength - 5 - Math.floor(network.length / 2)) / 2
    );
    const networkStamp = network.charAt(0);

    return process.stdout.write(
      `${this.defaultColor}${networkStamp} ${"-".repeat(
        totalLengthSide
      )} ${network} ${"-".repeat(totalLengthSide)} ${networkStamp}${
        this.colors.reset
      }\n`
    );
  }

  writeItemList(network, type, list) {
    const totalLength = 32;
    const networkStamp = network.charAt(0);

    process.stdout.write(
      `${this.defaultColor}${networkStamp} ${type}:${" ".repeat(
        totalLength - 1 - type.length
      )}${this.defaultColor}${networkStamp}${this.colors.reset}\n`
    );

    list.forEach((item) => {
      const itemString = ` - ${item.name}: ${item.amount}`;
      process.stdout.write(
        `${this.defaultColor}${networkStamp}${
          this.colors.reset
        }${itemString}${" ".repeat(totalLength - itemString.length + 1)}${
          this.defaultColor
        }${networkStamp}${this.colors.reset}\n`
      );
    });
  }

  writeClaimTracking(network, pending, trigger, percent) {
    const totalLength = 30;
    const networkStamp = network.charAt(0);
    const claimString = `Autoclaim (${pending}/${trigger})`;

    process.stdout.write(
      `${this.defaultColor}${networkStamp} ${claimString}${" ".repeat(
        totalLength + 2 - claimString.length
      )}${networkStamp}${this.colors.reset}\n`
    );

    const filledBlocks = Math.round(
      Math.min(100, percent) / (100 / (totalLength + 1))
    );
    const fullPercent = `${percent.toFixed(1).toString()}%`;
    const parsedPercent = [
      fullPercent.slice(0, filledBlocks),
      fullPercent.slice(filledBlocks),
    ];
    const hasTwoPercentValues = !!parsedPercent[1].length;
    const fillWithSpaces = (fillAmount) => {
      let i = 0;
      let fillerText = "";

      while (i < fillAmount) {
        fillerText = fillerText + " ";
        i++;
      }

      return fillerText;
    };
    const percentBarFiller = (hasLength, toEnd = false) => {
      let fillerText;
      let fillAmount;

      if (!toEnd) {
        fillAmount = filledBlocks - hasLength;
      } else {
        fillAmount = totalLength + 1 - filledBlocks - hasLength;
      }

      fillerText = fillWithSpaces(fillAmount);
      return fillerText;
    };
    const percentBarText = parsedPercent[0];
    const percentBarToPrint = [
      {
        text: networkStamp,
        color: this.defaultColor,
      },
      {
        text: " ",
        color: this.defaultColor,
      },
      {
        text: `${percentBarText}${percentBarFiller(percentBarText.length)}`,
        color: this.colors.fgBlack,
        background: this.colors.bgGreen,
      },
    ];
    if (hasTwoPercentValues || filledBlocks < totalLength) {
      const secondPercentBarText = parsedPercent[1];
      percentBarToPrint.push({
        text: `${secondPercentBarText}${percentBarFiller(
          secondPercentBarText.length,
          true
        )}`,
        color: this.colors.fgWhite,
        background: this.colors.bgRed,
      });
    }
    percentBarToPrint.push({
      text: " ",
      color: this.defaultColor,
    });
    percentBarToPrint.push({
      text: networkStamp,
      color: this.defaultColor,
    });
    this.printLine([...percentBarToPrint]);
  }

  writeWallet(network, label, gas, watt) {
    const totalLength = 32;
    const networkStamp = network.charAt(0);

    process.stdout.write(
      `${this.defaultColor}${networkStamp} ${label}${" ".repeat(
        totalLength - label.length
      )}${networkStamp}${this.colors.reset}\n`
    );

    const gasDonationString = `Available ${network}: ${gas.toFixed(3)}`;
    process.stdout.write(
      `${this.defaultColor}${networkStamp}${
        this.colors.reset
      } ${gasDonationString}${" ".repeat(
        totalLength - gasDonationString.length
      )}${this.defaultColor}${networkStamp}${this.colors.reset}\n`
    );

    const wattString = `Available WATT: ${watt.toFixed(2)}`;
    process.stdout.write(
      `${this.defaultColor}${networkStamp}${
        this.colors.reset
      } ${wattString}${" ".repeat(totalLength - wattString.length)}${
        this.defaultColor
      }${networkStamp}${this.colors.reset}\n`
    );
  }

  printCheckTime(network) {
    const totalLength = 32;
    const networkStamp = network.charAt(0);
    const options = {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const now = new Date();
    const nowString = `Updated ${now.toLocaleDateString("en-UK", options)}`;

    process.stdout.write(
      `${this.defaultColor}${networkStamp} ${nowString}${" ".repeat(
        totalLength - nowString.length
      )}${networkStamp}${this.colors.reset}\n\n`
    );
  }

  printActions() {
    // this.printLine({
    //   text: " Options: (b)uy, (c)laim, (d)onate, (r)efresh, (s)take or (q)uit",
    //   color: this.colors.fgYellow,
    // });

    this.printLine({
      text: " Options: (r)efresh or (q)uit",
      color: this.colors.fgYellow,
    });
  }
}
module.exports = new Write();
