import React from 'react';
import defaultLogoImg from '../assets/images/srk_enterprises_logo.jpg';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'invoice';
  showSubtitle?: boolean;
  customLogoUrl?: string;
  forceVector?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
  customLogoUrl,
  forceVector = false
}) => {
  const activeLogoUrl = customLogoUrl || (!forceVector ? defaultLogoImg : undefined);

  if (activeLogoUrl && !forceVector) {
    const sizeCls =
      size === 'sm'
        ? 'h-12 w-auto max-w-[150px] object-contain'
        : size === 'invoice'
        ? 'h-[7.5rem] w-auto max-w-[260px] object-contain'
        : size === 'xl'
        ? 'h-28 w-auto max-w-[300px] object-contain'
        : size === 'lg'
        ? 'w-full h-full object-contain object-center scale-[1.42]'
        : 'h-16 w-auto max-w-[200px] object-contain';

    return (
      <div
        className={`inline-flex items-center justify-center overflow-hidden ${
          size === 'lg' ? 'w-full h-full' : ''
        } ${className}`}
      >
        <img
          src={activeLogoUrl}
          alt="SRK Enterprises — Pure Water · Reliable Supply"
          referrerPolicy="no-referrer"
          className={sizeCls}
        />
      </div>
    );
  }

  // Fallback vector mark (navy + water-drop accent) if image unavailable
  const dimensions = {
    sm: { width: 120, height: 60 },
    md: { width: 165, height: 82 },
    lg: { width: 200, height: 98 },
    xl: { width: 260, height: 128 },
    invoice: { width: 240, height: 120 }
  }[size] || { width: 165, height: 82 };

  return (
    <div className={`inline-flex flex-col items-start ${className}`} style={{ width: dimensions.width }}>
      <svg
        viewBox="0 0 430 225"
        width={dimensions.width}
        height={dimensions.height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto select-none"
      >
        <defs>
          <linearGradient id="dropGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7EC8E3" />
            <stop offset="100%" stopColor="#4BA3C7" />
          </linearGradient>
        </defs>
        <text
          x="215"
          y="95"
          textAnchor="middle"
          fill="#081C2D"
          fontSize="92"
          fontWeight="700"
          fontFamily="Georgia, 'Times New Roman', serif"
          letterSpacing="4"
        >
          SRK
        </text>
        <ellipse cx="248" cy="48" rx="14" ry="18" fill="url(#dropGrad)" />
        {showSubtitle && (
          <text
            x="215"
            y="150"
            textAnchor="middle"
            fill="#081C2D"
            fontSize="28"
            fontWeight="700"
            letterSpacing="6"
            fontFamily="Georgia, 'Times New Roman', serif"
          >
            SRK ENTERPRISES
          </text>
        )}
        <line x1="80" y1="170" x2="195" y2="170" stroke="#7EC8E3" strokeWidth="2" />
        <circle cx="215" cy="170" r="5" fill="#7EC8E3" />
        <line x1="235" y1="170" x2="350" y2="170" stroke="#7EC8E3" strokeWidth="2" />
        <text
          x="215"
          y="200"
          textAnchor="middle"
          fill="#9AA3A8"
          fontSize="14"
          fontWeight="600"
          letterSpacing="3"
          fontFamily="system-ui, sans-serif"
        >
          PURE WATER · RELIABLE SUPPLY
        </text>
      </svg>
    </div>
  );
};
