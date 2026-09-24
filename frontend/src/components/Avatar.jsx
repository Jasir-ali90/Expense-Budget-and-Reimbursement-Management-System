import React from 'react';
import { buildFileUrl } from '../api';
import { initials } from '../utils/format';

/**
 * User avatar.
 *
 * Shows the uploaded profile picture when there is one and falls back to the
 * initials bubble. Used by the top bar, the profile page and anywhere else a
 * face should appear, so a new picture shows up everywhere at once.
 */
const Avatar = ({ user, name, size = 'sm', className = '' }) => {
  const label = user?.name || name || '';
  const url = buildFileUrl(user?.avatar);
  const classes = `avatar avatar--${size}${className ? ` ${className}` : ''}`;

  if (url) {
    return (
      <span className={classes}>
        <img src={url} alt={label ? `${label} profile picture` : 'Profile picture'} />
      </span>
    );
  }

  return (
    <span className={classes} aria-hidden="true">
      {initials(label)}
    </span>
  );
};

export default Avatar;
