export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`block shrink-0 ${className}`} aria-hidden="true">
      <img
        src="/images/batmeori-logo.png"
        alt=""
        className="h-full w-full object-contain"
      />
    </span>
  );
}
