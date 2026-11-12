const fs = require("fs");
const path = require("path");
const config = require("../config/config");
const HttpError = require("../utils/httpError");
const { getSupabaseClient, isConfigured } = require("./supabaseClient");

function validateObjectKey(objectKey) {
  if (typeof objectKey !== "string"
      || !objectKey
      || objectKey.startsWith("/")
      || objectKey.includes("\\")
      || objectKey.includes("\0")
      || objectKey.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new HttpError(404, "Image file is not available", "IMAGE_FILE_MISSING");
  }
  return objectKey;
}

function localFilePath(objectKey) {
  const key = validateObjectKey(objectKey);
  const root = path.resolve(config.photoStorageDir);
  const file = path.resolve(root, ...key.split("/"));
  if (!file.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(404, "Image file is not available", "IMAGE_FILE_MISSING");
  }
  return file;
}

async function getExistingLocalFile(objectKey) {
  const filePath = localFilePath(objectKey);
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return filePath;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EACCES") return null;
    throw error;
  }
}

function storageFailure(operation, error) {
  const status = Number(error?.statusCode);
  const code = status === 401 || status === 403
    ? "IMAGE_STORAGE_ACCESS_DENIED"
    : `IMAGE_STORAGE_${operation}_FAILED`;
  return new HttpError(
    503,
    "Private image storage is temporarily unavailable",
    code
  );
}

function missingObject(error) {
  return error?.statusCode === 404
    || error?.statusCode === "404"
    || error?.code === "not_found"
    || error?.error === "Not Found";
}

async function uploadBuffer(objectKey, data, contentType, { upsert = false } = {}) {
  const key = validateObjectKey(objectKey);
  let result;
  try {
    result = await getSupabaseClient()
      .storage
      .from(config.supabase.storageBucket)
      .upload(key, data, { contentType, upsert });
  } catch (error) {
    if (error instanceof HttpError && error.code === "IMAGE_FILE_MISSING") throw error;
    throw storageFailure("UPLOAD", error);
  }
  if (result.error) {
    if (result.error.statusCode === 409 || result.error.statusCode === "409") {
      throw new HttpError(409, "An image already exists at this storage path", "IMAGE_ALREADY_EXISTS");
    }
    throw storageFailure("UPLOAD", result.error);
  }
  return key;
}

async function downloadBuffer(objectKey) {
  const key = validateObjectKey(objectKey);
  const localPath = await getExistingLocalFile(key);
  if (localPath) return fs.promises.readFile(localPath);
  let result;
  try {
    result = await getSupabaseClient()
      .storage
      .from(config.supabase.storageBucket)
      .download(key);
  } catch (error) {
    if (error instanceof HttpError && error.code === "IMAGE_FILE_MISSING") throw error;
    throw storageFailure("DOWNLOAD", error);
  }
  if (result.error) {
    if (missingObject(result.error)) {
      throw new HttpError(404, "Image file is not available", "IMAGE_FILE_MISSING");
    }
    throw storageFailure("DOWNLOAD", result.error);
  }
  if (!result.data) throw new HttpError(404, "Image file is not available", "IMAGE_FILE_MISSING");
  try {
    return Buffer.from(await result.data.arrayBuffer());
  } catch (error) {
    throw storageFailure("DOWNLOAD", error);
  }
}

async function getFile(objectKey) {
  const key = validateObjectKey(objectKey);
  const filePath = await getExistingLocalFile(key);
  if (filePath) return { filePath };
  return { data: await downloadBuffer(key) };
}

async function objectExists(objectKey) {
  const key = validateObjectKey(objectKey);
  if (await getExistingLocalFile(key)) return true;
  if (!isConfigured()) return false;

  const directory = path.posix.dirname(key);
  const filename = path.posix.basename(key);
  let result;
  try {
    result = await getSupabaseClient()
      .storage
      .from(config.supabase.storageBucket)
      .list(directory === "." ? "" : directory, { limit: 100, search: filename });
  } catch (error) {
    throw storageFailure("CHECK", error);
  }
  if (result.error) throw storageFailure("CHECK", result.error);
  return Array.isArray(result.data) && result.data.some((item) => item.name === filename);
}

async function deleteObject(objectKey) {
  const key = validateObjectKey(objectKey);
  let result;
  try {
    result = await getSupabaseClient()
      .storage
      .from(config.supabase.storageBucket)
      .remove([key]);
  } catch (error) {
    if (error instanceof HttpError && error.code === "IMAGE_FILE_MISSING") throw error;
    throw storageFailure("DELETE", error);
  }
  if (result.error) throw storageFailure("DELETE", result.error);
}

module.exports = {
  deleteObject,
  downloadBuffer,
  getFile,
  localFilePath,
  objectExists,
  uploadBuffer,
  validateObjectKey,
};
