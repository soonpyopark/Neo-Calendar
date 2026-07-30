import type { ReactElement } from 'react'

export type LinkChainIconProps = {
  size?: number
  className?: string
}

/** Diagonal chain-link glyph (replaces the horizontal Material “link” icon). */
export function LinkChainIcon({ size = 16, className }: LinkChainIconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12.586 4.586a2 2 0 1 1 2.828 2.828l-3 3a2 2 0 0 1-2.828 0 1 1 0 0 0-1.414 1.414 4 4 0 0 0 5.656 0l3-3a4 4 0 0 0-5.656-5.656l-1.5 1.5a1 1 0 1 0 1.414 1.414l1.5-1.5zm-5 5a2 2 0 0 1 2.828 0 1 1 0 1 0 1.414-1.414 4 4 0 0 0-5.656 0l-3 3a4 4 0 1 0 5.656 5.656l1.5-1.5a1 1 0 0 0-1.414-1.414l-1.5 1.5a2 2 0 1 1-2.828-2.828l3-3z"
      />
    </svg>
  )
}

export default LinkChainIcon
