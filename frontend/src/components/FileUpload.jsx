import React, { useRef, useState } from 'react';
import { buildFileUrl } from '../api';

/**
 * Receipt / invoice uploader.
 *
 * Client side validation mirrors the server rules (jpg, jpeg, png, pdf and a
 * 5 MB limit); the backend validates the file again, so this is a convenience
 * only. The API is the source of truth for stored files.
 */
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const FileUpload = ({
  label = 'Receipt / invoice',
  hint = 'JPG, PNG or PDF up to 5 MB',
  currentFile,
  existingFile,
  onFileSelected,
  onUpload,
  uploading = false,
  required = false,
  error,
  disabled = false,
}) => {
  const inputRef = useRef(null);
  const [localError, setLocalError] = useState(null);

  const existingUrl = buildFileUrl(existingFile);

  const handleChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    const extension = lower.slice(lower.lastIndexOf('.'));
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setLocalError('Only JPG, JPEG, PNG and PDF files are allowed');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setLocalError('The file must be 5 MB or smaller');
      event.target.value = '';
      return;
    }

    setLocalError(null);
    onFileSelected?.(file);
  };

  const fileName = currentFile?.name || existingFile?.originalName;

  return (
    <div className="field">
      <span className="field__label">
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      <div className="inline">
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          onChange={handleChange}
          disabled={disabled || uploading}
        />
        {onUpload && currentFile ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => onUpload(currentFile)}
            disabled={uploading || disabled}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        ) : null}
        {existingUrl ? (
          <a
            className="small"
            href={existingUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
          >
            View current file
          </a>
        ) : null}
      </div>
      {fileName ? <span className="field__hint">Selected: {fileName}</span> : null}
      {!fileName ? <span className="field__hint">{hint}</span> : null}
      {(localError || error) && <span className="field__error">{localError || error}</span>}
    </div>
  );
};

export default FileUpload;
