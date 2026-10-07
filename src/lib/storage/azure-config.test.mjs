import assert from "node:assert/strict";
import {
  azureStorageConfig,
  describeAzureTarget,
  isAzureContainerName,
  parseAzureConnectionString,
} from "./azure-config.mjs";
import { azureCopyAction, parseMigrateArgs } from "./azure-copy.mjs";

const connection =
  "DefaultEndpointsProtocol=https;AccountName=trussfiles;AccountKey=abc+def/12==;EndpointSuffix=core.windows.net";

assert.equal(isAzureContainerName("truss"), true);
assert.equal(isAzureContainerName("job-photos"), true);
assert.equal(isAzureContainerName("Truss"), false);
assert.equal(isAzureContainerName("a"), false);
assert.equal(isAzureContainerName("my--files"), false);

const parsed = parseAzureConnectionString(connection);
assert.equal(parsed?.accountName, "trussfiles");
assert.equal(parsed?.accountKey, "abc+def/12==");
assert.equal(parsed?.blobEndpoint, "https://trussfiles.blob.core.windows.net");
assert.equal(parseAzureConnectionString(""), null);
assert.equal(parseAzureConnectionString("AccountName=only"), null);

const fromConnection = azureStorageConfig({
  AZURE_STORAGE_CONNECTION_STRING: connection,
  AZURE_STORAGE_CONTAINER: "Truss-Files",
});
assert.equal(fromConnection.configured, true);
assert.equal(fromConnection.container, "truss-files");
assert.equal(fromConnection.accountName, "trussfiles");
assert.equal(describeAzureTarget(fromConnection), "trussfiles/truss-files");

const fromParts = azureStorageConfig({
  AZURE_STORAGE_ACCOUNT: "trussfiles",
  AZURE_STORAGE_ACCOUNT_KEY: "abc+def/12==",
  AZURE_STORAGE_CONTAINER: "truss",
});
assert.equal(fromParts.configured, true);
assert.match(fromParts.connectionString, /AccountKey=abc\+def\/12==/);

assert.equal(
  azureStorageConfig({ AZURE_STORAGE_CONNECTION_STRING: connection }).configured,
  false,
);

assert.equal(azureCopyAction({ sourceSize: 10, destSize: null }), "copy");
assert.equal(azureCopyAction({ sourceSize: 10, destSize: 10 }), "skip");
assert.equal(azureCopyAction({ sourceSize: 10, destSize: 4 }), "copy");
assert.equal(azureCopyAction({ sourceSize: 0, destSize: 0 }), "skip");
assert.equal(azureCopyAction({ sourceSize: null, destSize: 10 }), "copy");

assert.deepEqual(parseMigrateArgs(["--dry-run", "--prefix", "/company/", "--concurrency", "2"]), {
  dryRun: true,
  verify: false,
  help: false,
  prefix: "company/",
  concurrency: 2,
});
assert.equal(parseMigrateArgs(["--verify"]).verify, true);
assert.throws(() => parseMigrateArgs(["--dry-run", "--verify"]), /either/);
assert.throws(() => parseMigrateArgs(["--prefix", "../secret"]), /Prefix/);
assert.throws(() => parseMigrateArgs(["--concurrency", "0"]), /concurrency/);
