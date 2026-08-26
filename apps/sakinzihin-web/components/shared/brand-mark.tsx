export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64" role="presentation">
        <circle className="brand-mark-ring" cx="32" cy="32" r="28" />
        <g transform="translate(4.9 5.1) scale(.84)">
          <path className="brand-mark-sprout" d="M20 48h24" />
          <path className="brand-mark-sprout" d="M32 48c1-7 1-13-1-18" />
          <path
            className="brand-mark-sprout"
            d="M31 33c-6 2-14 0-18-6 5-7 14-7 20-1 2 2 1 5-2 7Z"
          />
          <path
            className="brand-mark-sprout"
            d="M33 29c0-8 6-14 15-16 1 9-4 16-13 18-2 0-2-1-2-2Z"
          />
        </g>
      </svg>
    </span>
  );
}
