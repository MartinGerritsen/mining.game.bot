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

  printCheckTime() {
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const now = new Date();
    this.printLine({
      text: "\n Last update: " + now.toLocaleDateString("en-UK", options),
      color: this.colors.fgYellow,
    });
  }
}
module.exports = new Write();
