type BrandMarkProps = {
  className?: string;
  showName?: boolean;
};

export function BrandMark({ className = "", showName = true }: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M7 15.5 23 10v20L7 24.5z" fill="currentColor" />
          <path d="M9.5 24 14 25.5 12.5 33H8z" fill="currentColor" />
          <path
            d="M28 14a9 9 0 0 1 0 12M32 10a14 14 0 0 1 0 20"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {showName && <span className="brand-name">CORNETA</span>}
    </span>
  );
}
