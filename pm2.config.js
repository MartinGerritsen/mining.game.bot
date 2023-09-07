module.exports = {
  apps: [
    {
      name: "Mining Automation",
      script: "start.js",
      node_args: "-r dotenv/config",
      out_file: "/dev/null",
      error_file: "/dev/null",
    },
  ],
};
