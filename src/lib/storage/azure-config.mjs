/**
 * Azure Blob settings for the B2 copy.
 * The app keeps reading Backblaze until a later cutover. This module only
 * describes the private container that receives the same object keys.
 */

const CONTAINER_NAME = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export function isAzureContainerName(name) {
  return CONTAINER_NAME.test(name) && !name.includes("--");
}

/** Parse a Storage account connection string. Account keys are base64 and may contain `=`. */
export function parseAzureConnectionString(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parts = {};
  for (const segment of raw.split(";")) {
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    if (!key) continue;
    parts[key] = segment.slice(eq + 1).trim();
  }
  const accountName = parts.accountname || "";
  const accountKey = parts.accountkey || "";
  const endpointSuffix = parts.endpointsuffix || "core.windows.net";
  const protocol = (parts.defaultendpointsprotocol || "https").replace(/:$/, "").toLowerCase();
  const blobEndpoint =
    parts.blobendpoint ||
    (accountName ? `${protocol}://${accountName}.blob.${endpointSuffix}` : "");
  if (!accountName || !accountKey || !blobEndpoint) return null;
  return {
    accountName,
    accountKey,
    blobEndpoint: blobEndpoint.replace(/\/+$/, ""),
    connectionString: raw,
  };
}

export function azureStorageConfig(env = process.env) {
  const connectionString = env.AZURE_STORAGE_CONNECTION_STRING?.trim() || "";
  const accountName = env.AZURE_STORAGE_ACCOUNT?.trim() || "";
  const accountKey = env.AZURE_STORAGE_ACCOUNT_KEY?.trim() || "";
  const container = (env.AZURE_STORAGE_CONTAINER?.trim() || "").toLowerCase();
  const parsed = parseAzureConnectionString(connectionString);
  const account = parsed?.accountName || accountName;
  const key = parsed?.accountKey || accountKey;
  const blobEndpoint =
    parsed?.blobEndpoint || (account ? `https://${account}.blob.core.windows.net` : "");
  const connection =
    parsed?.connectionString ||
    (account && key
      ? `DefaultEndpointsProtocol=https;AccountName=${account};AccountKey=${key};EndpointSuffix=core.windows.net`
      : "");
  const containerOk = isAzureContainerName(container);
  return {
    configured: Boolean(connection && account && key && containerOk),
    accountName: account,
    container,
    blobEndpoint,
    connectionString: connection,
    containerOk,
  };
}

export function describeAzureTarget(config) {
  const account = config.accountName || "unset-account";
  const container = config.container || "unset-container";
  return `${account}/${container}`;
}
