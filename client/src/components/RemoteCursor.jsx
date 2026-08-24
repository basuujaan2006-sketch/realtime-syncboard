import React from 'react';

export default function RemoteCursor({ userName, userColor, x, y }) {
  // Hide cursor if no valid position or if it's at 0,0 (user hasn't moved yet)
  if (typeof x !== 'number' || typeof y !== 'number' || (x === 0 && y === 0)) {
    return null;
  }

  return (
    <div
      className="remote-cursor"
      style={{
        transform: `translate3d(${x}px, ${y}px, 0)`
      }}
    >
      <svg
        className="cursor-pointer-svg"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500003 16.8829L0.500003 1.19841L17.7841 12.3673H5.65376Z"
          fill={userColor || '#FF6B6B'}
          stroke="#FFFFFF"
          strokeWidth="1.5"
        />
      </svg>

      <div
        className="cursor-label"
        style={{ backgroundColor: userColor || '#FF6B6B' }}
      >
        {userName || 'Remote User'}
      </div>
    </div>
  );
}
