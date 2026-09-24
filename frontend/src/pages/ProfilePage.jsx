import React, { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  changePassword,
  logout,
  removeAvatar,
  selectAuth,
  uploadAvatar,
} from '../features/auth/authSlice';
import Avatar from '../components/Avatar';
import { InlineAlert } from '../components/StateViews';
import { PasswordInput } from '../components/FormField';
import { RoleBadge } from '../components/StatusBadge';
import useToast from '../hooks/useToast';
import { formatDateTime } from '../utils/format';

/** Mirrors the server rules in middleware/upload.js for instant feedback. */
const AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Profile page: account details (read only - Admin manages the master data)
 * plus the change-password form.
 */
const ProfilePage = () => {
  const dispatch = useDispatch();
  const toast = useToast();
  const { user, passwordChangeMessage, error } = useSelector(selectAuth);

  const fileInputRef = useRef(null);

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [localError, setLocalError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError(null);

    if (!form.currentPassword || !form.newPassword) {
      setLocalError('Enter your current password and the new password.');
      return;
    }
    if (form.newPassword.length < 8) {
      setLocalError('The new password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) {
      setLocalError('The new password must contain at least one letter and one number.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setLocalError('The new password and confirmation do not match.');
      return;
    }

    setBusy(true);
    const result = await dispatch(
      changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
    );
    setBusy(false);

    if (changePassword.fulfilled.match(result)) {
      toast.success('Password changed', 'Please sign in again with your new password.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      // The JWT is still valid, but re-authenticating is the documented flow.
      setTimeout(() => dispatch(logout()), 1500);
    } else {
      toast.error('Could not change password', result.payload);
    }
  };

  /** Validate the picture locally (same rules as the API), then upload it. */
  const handleAvatarPick = async (event) => {
    const file = event.target.files?.[0];
    // Reset first so picking the same file again still fires a change event.
    event.target.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    const extension = lower.slice(lower.lastIndexOf('.'));
    if (!AVATAR_EXTENSIONS.includes(extension)) {
      setAvatarError('Only JPG, PNG or WEBP images are allowed.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError('The picture must be 2 MB or smaller.');
      return;
    }

    setAvatarError(null);
    setAvatarBusy(true);
    const result = await dispatch(uploadAvatar(file));
    setAvatarBusy(false);

    if (uploadAvatar.fulfilled.match(result)) {
      toast.success('Profile picture updated', 'Your new picture is now used across the app.');
    } else {
      setAvatarError(result.payload || 'The picture could not be uploaded.');
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarError(null);
    setAvatarBusy(true);
    const result = await dispatch(removeAvatar());
    setAvatarBusy(false);

    if (removeAvatar.fulfilled.match(result)) {
      toast.success('Profile picture removed', 'The initials bubble is back.');
    } else {
      setAvatarError(result.payload || 'The picture could not be removed.');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p className="page-header__sub">Your account details and password.</p>
        </div>
      </div>

      <div className="grid grid--2">
        <div className="card">
          <div className="card__header">
            <h2 className="card__title">Account</h2>
          </div>
          <div className="profile-avatar">
            <Avatar user={user} size="xl" />
            <div className="profile-avatar__meta">
              <strong>{user?.name}</strong>
              <div className="small muted">
                <RoleBadge role={user?.role} />
              </div>
              <div className="btn-row mt-1">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                >
                  {avatarBusy ? 'Uploading…' : user?.avatar ? 'Replace picture' : 'Upload picture'}
                </button>
                {user?.avatar ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={handleAvatarRemove}
                    disabled={avatarBusy}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <span className="field__hint">JPG, PNG or WEBP up to 2 MB.</span>
              {avatarError ? <span className="field__error">{avatarError}</span> : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="visually-hidden"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleAvatarPick}
              aria-label="Choose a profile picture"
            />
          </div>
          <div className="kv">
            <span className="kv__key">Email</span>
            <span>{user?.email}</span>
            <span className="kv__key">Employee code</span>
            <span>{user?.employeeCode || '—'}</span>
            <span className="kv__key">Designation</span>
            <span>{user?.designation || '—'}</span>
            <span className="kv__key">Department</span>
            <span>{user?.department?.name || 'Not assigned'}</span>
            <span className="kv__key">Last sign in</span>
            <span>{formatDateTime(user?.lastLoginAt)}</span>
            <span className="kv__key">Account status</span>
            <span>{user?.isActive ? 'Active' : 'Deactivated'}</span>
          </div>
          <p className="small muted mt-1">
            Profile master data (name, role, department) is maintained by an administrator.
          </p>
        </div>

        <div className="card">
          <div className="card__header">
            <h2 className="card__title">Change password</h2>
          </div>

          {passwordChangeMessage ? <InlineAlert tone="success">{passwordChangeMessage}</InlineAlert> : null}
          {error && !passwordChangeMessage ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          {localError ? <InlineAlert tone="error">{localError}</InlineAlert> : null}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <PasswordInput
                label="Current password"
                required
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(event) =>
                  setForm((current) => ({ ...current, currentPassword: event.target.value }))
                }
              />
              <PasswordInput
                label="New password"
                required
                autoComplete="new-password"
                hint="At least 8 characters with one letter and one number."
                value={form.newPassword}
                onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))}
              />
              <PasswordInput
                label="Confirm new password"
                required
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm((current) => ({ ...current, confirmPassword: event.target.value }))
                }
              />
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default ProfilePage;
