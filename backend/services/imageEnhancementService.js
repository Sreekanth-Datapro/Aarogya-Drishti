const sharp = require("sharp");
const HttpError = require("../utils/httpError");
const { audit } = require("../utils/audit");
const privateImageStorage = require("./privateImageStorage");
const realEsrgan = require("./ai/realEsrgan");

const STAGE_DETAILS = {
  STORAGE_CHECK: {
    code: "PHOTO_ENHANCEMENT_STORAGE_CHECK_FAILED",
    message: "Could not check private storage for an existing enhanced image.",
  },
  EXISTING_IMAGE_READ: {
    code: "PHOTO_ENHANCEMENT_EXISTING_IMAGE_READ_FAILED",
    message: "An existing enhanced image could not be read from private storage.",
  },
  ORIGINAL_IMAGE_READ: {
    code: "PHOTO_ENHANCEMENT_ORIGINAL_IMAGE_READ_FAILED",
    message: "The original image could not be read from private storage.",
  },
  MODEL: {
    code: "PHOTO_ENHANCEMENT_MODEL_FAILED",
    message: "Real-ESRGAN could not generate an enhanced image.",
  },
  OUTPUT_VALIDATION: {
    code: "PHOTO_ENHANCEMENT_OUTPUT_INVALID",
    message: "Real-ESRGAN returned an invalid image output.",
  },
  STORAGE_UPLOAD: {
    code: "PHOTO_ENHANCEMENT_UPLOAD_FAILED",
    message: "Real-ESRGAN generated an image, but private storage could not save it.",
  },
  STORAGE_VERIFY: {
    code: "PHOTO_ENHANCEMENT_VERIFY_FAILED",
    message: "The enhanced image was uploaded, but private storage could not verify the saved image.",
  },
};

class InvalidImageError extends Error {}

function enhancedFilePath(screeningId, photoId) {
  return `enhanced/${screeningId}/${photoId}.jpg`;
}

function storageError(error) {
  return String(error?.code || "").startsWith("IMAGE_STORAGE_")
    || error?.code === "IMAGE_FILE_MISSING";
}

async function reportFailure(req, screening, photo, stage, error) {
  const details = STAGE_DETAILS[stage];
  await audit(req, {
    required: true,
    event: "PHOTO_AI_ENHANCEMENT_FAILED",
    outcome: "ERROR",
    resourceType: "photo",
    resourceId: photo.id,
    patientId: screening.patient_id,
    metadata: {
      view: photo.view,
      failure_stage: stage,
      error_code: error?.code || error?.name || "UNKNOWN_ERROR",
      enhanced_object_key: enhancedFilePath(screening.id, photo.id),
    },
  });
  const status = stage === "MODEL" && error instanceof realEsrgan.ModelUnavailableError
    ? 503
    : stage.startsWith("STORAGE") || storageError(error)
      ? 503
      : 502;
  throw new HttpError(status, details.message, details.code);
}

async function readImageMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new InvalidImageError("Image output is empty");
  }
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (error) {
    throw new InvalidImageError("Image is not a readable JPEG");
  }
  if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) {
    throw new InvalidImageError("Image is not a valid JPEG");
  }
  return metadata;
}

/**
 * Run Real-ESRGAN on an in-memory buffer without writing screening photo rows.
 * Used for pre-save preview enhancement; the original bytes are never mutated.
 */
async function enhanceImageBuffer(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new HttpError(400, "Choose a photo to enhance", "INVALID_IMAGE");
  }
  let result;
  try {
    result = await realEsrgan.enhance(imageBuffer);
  } catch (error) {
    if (error instanceof realEsrgan.ModelUnavailableError) {
      throw new HttpError(503, STAGE_DETAILS.MODEL.message, STAGE_DETAILS.MODEL.code);
    }
    throw new HttpError(502, STAGE_DETAILS.MODEL.message, STAGE_DETAILS.MODEL.code);
  }
  try {
    const metadata = await readImageMetadata(result?.data);
    if (metadata.width !== result.width || metadata.height !== result.height) {
      throw new Error("Real-ESRGAN output dimensions do not match its image");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, STAGE_DETAILS.OUTPUT_VALIDATION.message, STAGE_DETAILS.OUTPUT_VALIDATION.code);
  }
  return {
    data: result.data,
    mimeType: "image/jpeg",
    width: result.width,
    height: result.height,
    size_bytes: result.data.length,
    model: realEsrgan.MODEL.name,
    duration_ms: result.durationMs,
    input_width: result.inputWidth,
    input_height: result.inputHeight,
  };
}

async function enhancePhoto(req, screening, photo) {
  const target = enhancedFilePath(screening.id, photo.id);
  let replaceExisting = false;
  let existing = false;

  try {
    existing = await privateImageStorage.objectExists(target);
  } catch (error) {
    return reportFailure(req, screening, photo, "STORAGE_CHECK", error);
  }

  if (existing) {
    try {
      const current = await privateImageStorage.downloadBuffer(target);
      const metadata = await readImageMetadata(current);
      return {
        photo_id: photo.id,
        view: photo.view,
        width: metadata.width,
        height: metadata.height,
        size_bytes: current.length,
        model: realEsrgan.MODEL.name,
        already_enhanced: true,
      };
    } catch (error) {
      if (error.code === "IMAGE_FILE_MISSING") {
        existing = false;
      } else if (error instanceof InvalidImageError) {
        replaceExisting = true;
      } else {
        return reportFailure(req, screening, photo, "EXISTING_IMAGE_READ", error);
      }
    }
  }

  await audit(req, {
    required: true,
    event: "PHOTO_AI_ENHANCEMENT_STARTED",
    resourceType: "photo",
    resourceId: photo.id,
    patientId: screening.patient_id,
    metadata: {
      view: photo.view,
      model: realEsrgan.MODEL.name,
      enhanced_object_key: target,
    },
  });

  let original;
  try {
    original = await privateImageStorage.downloadBuffer(photo.private_key);
    if (!Buffer.isBuffer(original) || original.length === 0) {
      throw new Error("Original image is empty");
    }
  } catch (error) {
    return reportFailure(req, screening, photo, "ORIGINAL_IMAGE_READ", error);
  }

  let result;
  try {
    result = await realEsrgan.enhance(original);
  } catch (error) {
    return reportFailure(req, screening, photo, "MODEL", error);
  }

  try {
    const metadata = await readImageMetadata(result?.data);
    if (metadata.width !== result.width || metadata.height !== result.height) {
      throw new Error("Real-ESRGAN output dimensions do not match its image");
    }
  } catch (error) {
    return reportFailure(req, screening, photo, "OUTPUT_VALIDATION", error);
  }

  try {
    await privateImageStorage.uploadBuffer(target, result.data, "image/jpeg", {
      upsert: replaceExisting,
    });
  } catch (error) {
    return reportFailure(req, screening, photo, "STORAGE_UPLOAD", error);
  }

  try {
    const stored = await privateImageStorage.downloadBuffer(target);
    if (!stored.equals(result.data)) {
      throw new Error("Stored enhanced image does not match the generated image");
    }
    await readImageMetadata(stored);
  } catch (error) {
    return reportFailure(req, screening, photo, "STORAGE_VERIFY", error);
  }

  await audit(req, {
    required: true,
    event: "PHOTO_AI_ENHANCED",
    resourceType: "photo",
    resourceId: photo.id,
    patientId: screening.patient_id,
    metadata: {
      view: photo.view,
      model: realEsrgan.MODEL.name,
      checkpoint: realEsrgan.MODEL.checkpoint,
      enhanced_object_key: target,
      input_size: `${result.inputWidth}x${result.inputHeight}`,
      output_size: `${result.width}x${result.height}`,
      tiles: result.tiles,
      duration_ms: result.durationMs,
    },
  });
  return {
    photo_id: photo.id,
    view: photo.view,
    width: result.width,
    height: result.height,
    size_bytes: result.data.length,
    model: realEsrgan.MODEL.name,
    duration_ms: result.durationMs,
    already_enhanced: false,
  };
}

module.exports = { enhancePhoto, enhanceImageBuffer, enhancedFilePath, STAGE_DETAILS };
