/**
 * Decide whether a Backblaze object still needs to be uploaded to Azure.
 * A missing destination is copied. The same byte size is already migrated.
 * A different size is copied again so a partial run can be repeated.
 */
export function azureCopyAction(input) {
  const destSize = input.destSize;
  if (destSize == null) return "copy";
  if (input.sourceSize != null && input.sourceSize === destSize) return "skip";
  return "copy";
}

export function parseMigrateArgs(argv) {
  const args = {
    dryRun: false,
    verify: false,
    help: false,
    prefix: "",
    concurrency: 4,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--verify") args.verify = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--prefix") {
      args.prefix = String(argv[index + 1] || "").replace(/^\/+/, "");
      index += 1;
    } else if (arg === "--concurrency") {
      args.concurrency = Number(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument ${arg}. Use --help.`);
    }
  }
  if (args.prefix.includes("..")) {
    throw new Error("Prefix cannot contain '..'.");
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 16) {
    throw new Error("--concurrency must be an integer from 1 to 16.");
  }
  if (args.dryRun && args.verify) {
    throw new Error("Use either --dry-run or --verify.");
  }
  return args;
}
