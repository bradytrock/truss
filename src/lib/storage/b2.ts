/**
 * Compatibility exports. File bytes live in Azure Blob Storage.
 * Backblaze remains a read fallback, and the writer, until Azure env is set.
 */
export {
  STORAGE_KINDS,
  STORAGE_NOT_CONFIGURED,
  isStorageKind,
  isStorageConfigured as isB2Configured,
  storageStatus as b2Status,
  storageFailureMessage as b2FailureMessage,
  uploadObject as uploadToB2,
  getStoredObject as getObjectFromB2,
  getStoredObject as getObjectFromB2WithFallback,
  copyStoredObject as copyObjectInB2,
  removeStoredObject as removeFromB2,
  purgeCompanyObjects as purgeCompanyFromB2,
  isAzureConfigured,
  isB2Configured as isBackblazeConfigured,
  azureConfig,
  type StorageKind,
} from "@/lib/storage/object-store";

export {
  companyIdFromObjectKey,
  companyStoragePrefix,
  objectKeyFromStoredPath,
  storageKindFromObjectKey,
  storageObjectKey,
} from "@/lib/storage/keys";

export {
  isAllowedObjectKey,
  isCompanyId,
  legacyKindlessObjectKey,
  publicObjectUrl,
  resolveStoredFileUrl,
  storageProxyPath,
} from "@/lib/storage/urls";
