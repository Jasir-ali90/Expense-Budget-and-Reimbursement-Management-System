const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
} = require('../config/constants');

/**
 * Secure local receipt/invoice upload.
 * - the original file name never touches the filesystem (no path traversal)
 * - extension *and* reported MIME type are both whitelisted
 * - size limit comes from the environment configuration
 */

if (!fs.existsSync(env.uploadPath)) {
  fs.mkdirSync(env.uploadPath, { recursive: true });
}

const sanitizeBaseName = (originalName) => {
  const extension = path.extname(originalName || '').toLowerCase();
  return (
    path
      .basename(originalName || 'receipt', extension)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40) || 'receipt'
  );
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.uploadPath),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${unique}-${sanitizeBaseName(file.originalname)}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const extensionAllowed = ALLOWED_UPLOAD_EXTENSIONS.includes(extension);
  const mimeAllowed = ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype);

  if (!extensionAllowed || !mimeAllowed) {
    return cb(
      ApiError.badRequest(
        `Unsupported file type. Allowed formats: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`,
      ),
    );
  }
  return cb(null, true);
};

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxFileSize, files: 5 },
});

/** Single receipt upload submitted as the "receipt" field. */
const uploadReceipt = uploader.single('receipt');

/** Multiple receipts submitted as the "receipts" field. */
const uploadReceipts = uploader.array('receipts', 5);

/**
 * Profile pictures are images only (no PDF) and get a tighter size cap, so
 * they use their own filter + multer instance.
 */
const imageFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const extensionAllowed = ALLOWED_IMAGE_EXTENSIONS.includes(extension);
  const mimeAllowed = ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype);

  if (!extensionAllowed || !mimeAllowed) {
    return cb(
      ApiError.badRequest(
        `Unsupported image type. Allowed formats: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`,
      ),
    );
  }
  return cb(null, true);
};

const avatarUploader = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: env.maxAvatarSize, files: 1 },
});

/** Profile picture submitted as the "avatar" field. */
const uploadAvatar = avatarUploader.single('avatar');

/** Normalise a stored file into the shape persisted on documents. */
const toStoredFile = (file) => {
  if (!file) return null;
  return {
    fileName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url: `/uploads/${file.filename}`,
    extension: path.extname(file.filename).toLowerCase(),
  };
};

/** Remove an uploaded file - used to clean up after a failed validation. */
const removeUploadedFile = async (fileName) => {
  if (!fileName) return;
  const target = path.join(env.uploadPath, path.basename(fileName));
  try {
    await fs.promises.unlink(target);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Could not delete upload ${fileName}: ${error.message}`);
    }
  }
};

module.exports = {
  uploadReceipt,
  uploadReceipts,
  uploadAvatar,
  toStoredFile,
  removeUploadedFile,
  ALLOWED_UPLOAD_EXTENSIONS,
};
