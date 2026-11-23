import React from 'react';

export const JiraBrandIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#0052CC" />
    <path
      d="M23.5 9.2H14.8C14.8 11.5 16.7 13.4 19 13.4H20.7V15C20.7 17.3 22.6 19.2 24.9 19.2V10.6C24.9 9.8 24.3 9.2 23.5 9.2Z"
      fill="#FFFFFF"
    />
    <path
      d="M19.2 13.5H10.5C10.5 15.8 12.4 17.7 14.7 17.7H16.4V19.3C16.4 21.6 18.3 23.5 20.6 23.5V14.9C20.6 14.1 20 13.5 19.2 13.5Z"
      fill="#79B8FF"
    />
    <path
      d="M14.9 17.8H6.2C6.2 20.1 8.1 22 10.4 22H12.1V23.6C12.1 25.9 14 27.8 16.3 27.8V19.2C16.3 18.4 15.7 17.8 14.9 17.8Z"
      fill="#B3D4FF"
    />
  </svg>
);

export const ConfluenceBrandIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#172B4D" />
    <path
      d="M7.6 19.6C7.3 20.1 7 20.6 6.8 20.9C6.5 21.4 6.7 22 7.2 22.3L11.2 24.7C11.7 25 12.3 24.8 12.6 24.3C12.8 24 13.1 23.5 13.5 22.9C15.7 19.3 17.9 19.8 21.7 21.6L24.5 22.9C25 23.2 25.6 22.9 25.8 22.4L27.2 18.9C27.4 18.4 27.2 17.8 26.7 17.6L23.9 16.3C17.4 13.3 12.1 12.7 7.6 19.6Z"
      fill="#4C9AFF"
    />
    <path
      d="M24.4 12.4C24.7 11.9 25 11.4 25.2 11.1C25.5 10.6 25.3 10 24.8 9.7L20.8 7.3C20.3 7 19.7 7.2 19.4 7.7C19.2 8 18.9 8.5 18.5 9.1C16.3 12.7 14.1 12.2 10.3 10.4L7.5 9.1C7 8.8 6.4 9.1 6.2 9.6L4.8 13.1C4.6 13.6 4.8 14.2 5.3 14.4L8.1 15.7C14.6 18.7 19.9 19.3 24.4 12.4Z"
      fill="#FFFFFF"
    />
  </svg>
);

export const ExcelBrandIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#107C41" />
    <rect x="13" y="6" width="13" height="20" rx="2" fill="#21A366" />
    <path d="M13 11H26M13 16H26M13 21H26M19 6V26" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.2" />
    <rect x="5" y="9" width="14" height="14" rx="2.5" fill="#185C37" stroke="#FFFFFF" strokeOpacity="0.2" />
    <path
      d="M9.2 12.8L12 16M12 16L14.8 19.2M12 16L14.8 12.8M12 16L9.2 19.2"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
