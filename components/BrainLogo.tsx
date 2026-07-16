type BrainLogoProps = {
  className?: string;
  withWordmark?: boolean;
};

export function BrainLogo({ className, withWordmark = false }: BrainLogoProps) {
  return (
    <span className={`${className ?? ""} brain-logo ${withWordmark ? "brain-logo--wordmark" : ""}`}>
      <svg
        className="brain-logo__mark"
        viewBox="0 0 64 64"
        role="img"
        aria-label="Brainworm: a worm emerging from a brain"
      >
        <path
          className="brain-logo__brain-fill"
          d="M32 17.2c-2.7-4.4-8.8-5.4-12.5-1.7-5.1-1.2-9.6 2.9-9 8.1-4.8 1.9-5.7 8.3-1.8 11.4-3.2 4.2-1.2 10.5 3.9 12.1.2 5.3 5.8 8.5 10.5 5.9 2.7 3.4 7.2 1.8 8.9-2 1.7 3.8 6.2 5.4 8.9 2 4.7 2.6 10.3-.6 10.5-5.9 5.1-1.6 7.1-7.9 3.9-12.1 3.9-3.1 3-9.5-1.8-11.4.6-5.2-3.9-9.3-9-8.1-3.7-3.7-9.8-2.7-12.5 1.7Z"
        />
        <path
          className="brain-logo__brain"
          d="M32 17.2c-2.7-4.4-8.8-5.4-12.5-1.7-5.1-1.2-9.6 2.9-9 8.1-4.8 1.9-5.7 8.3-1.8 11.4-3.2 4.2-1.2 10.5 3.9 12.1.2 5.3 5.8 8.5 10.5 5.9 2.7 3.4 7.2 1.8 8.9-2 1.7 3.8 6.2 5.4 8.9 2 4.7 2.6 10.3-.6 10.5-5.9 5.1-1.6 7.1-7.9 3.9-12.1 3.9-3.1 3-9.5-1.8-11.4.6-5.2-3.9-9.3-9-8.1-3.7-3.7-9.8-2.7-12.5 1.7Z"
        />
        <path
          className="brain-logo__fold"
          d="M32 17.2c-2.1 3.8 1.8 6.5 0 10.2-1.8 3.8 1.8 6.5 0 10.3-1.8 3.7 1.6 7.1 0 13.3M22 17.1c-3.6 1.5-4.8 5.2-2.6 8.1-3.9-.7-7 1.7-6.9 5.2M27.2 29.4c-4.2-.7-7.1 2.1-6.8 5.6.2 2.6-1.5 4.4-4.3 4.8M22.9 51.8c-2.3-2.1-2.2-5.7.2-7.6M42 17.1c3.6 1.5 4.8 5.2 2.6 8.1 3.9-.7 7 1.7 6.9 5.2M36.8 29.4c4.2-.7 7.1 2.1 6.8 5.6-.2 2.6 1.5 4.4 4.3 4.8M41.1 51.8c2.3-2.1 2.2-5.7-.2-7.6"
        />
        <g className="brain-logo__worm">
          <path
            className="brain-logo__worm-body"
            d="M42.8 23.8c-.3-4.4 3.2-5.9 3.1-9.4-.1-3.2 2.2-5.8 5.3-6.4"
          />
          <circle className="brain-logo__worm-head" cx="52.8" cy="7.2" r="5.2" />
          <circle className="brain-logo__eye" cx="51.4" cy="6.1" r=".7" />
          <circle className="brain-logo__eye" cx="54.7" cy="6.6" r=".7" />
          <path className="brain-logo__smile" d="M51.4 8.8c1 .8 2.2.9 3.2.2" />
        </g>
      </svg>
      {withWordmark && (
        <span className="brain-logo__type">
          brain<span>worm</span>
        </span>
      )}
    </span>
  );
}
