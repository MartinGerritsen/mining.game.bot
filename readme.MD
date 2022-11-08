# Mining.game automation

Welcome to the [Mining.game](https://mining.game/) automation script, created by [Martin Gerritsen](https://github.com/MartinGerritsen).

This script will allow you to track the progress of your staked items and auto buy and stake new items.

Follow this step-by-step guide to help get you set up and if you like it,  
please consider donating, every bit is very much appreciated.

## Step-by-step
First install the following:
 - [GIT](https://git-scm.com/downloads): You will need to install git to download this script. 
 - [Node](https://nodejs.org/en/download/): You will need to install node to be able to run this script.

To download and prepare the script do the following:
 - `git clone git@github.com:MartinGerritsen/mining.game.bot.git`
 - `cd mining.game.bot`
 - `npm install`

Then the final steps, remember to be careful with your private key!
 - Create the file `.env` by copy-pasting the file `.env.example` and renaming it.
 - Fill in the non-optional values with your private and public key.
 - You can now run `node .\start.js` and open Netflix!

## Optional information arguments:

The following values are optional in the `.env`:

 - WATT_CLAIM_TRIGGER: Sets the amount of WATT you want the script to auto-collect your pending WATT.
 - WATT_AUTO_BUY: Set the item id that you want to .

## Optional arguments:

### Interval (600000 / 6000000)

`node start.js --interval=6000000`

### No Running Process (true / any)

`node start.js --noRunningProcess=true`