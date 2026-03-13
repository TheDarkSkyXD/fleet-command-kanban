import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

interface ListItemCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as child element using Radix Slot */
  asChild?: boolean
  /** Show selected state with accent styling */
  isSelected?: boolean
  /** Show active state (dragging, processing) with reduced opacity */
  isActive?: boolean
  /** Tint color from parent container - card will be a lighter version */
  tintColor?: string
  /** Selection styling intensity: 'default' for subtle, 'bold' for prominent */
  selectedVariant?: 'default' | 'bold'
}

/**
 * Shared card component for list items (tickets, brainstorms, etc.)
 * Provides consistent styling across different list views.
 */
export function ListItemCard({
  asChild,
  isSelected,
  isActive,
  tintColor,
  selectedVariant = 'default',
  className,
  children,
  style,
  ...props
}: ListItemCardProps) {
  const Comp = asChild ? Slot : 'div'

  // Blend accent into tint when selected (fixes inline style specificity)
  const cardStyle = tintColor
    ? {
        ...style,
        backgroundColor: isSelected
          ? `color-mix(in srgb, var(--color-accent) 20%, color-mix(in srgb, ${tintColor} 60%, #3a3a3c))`
          : `color-mix(in srgb, ${tintColor} 60%, #3a3a3c)`
      }
    : style

  // Selection classes (only applied when no tintColor, since tintColor uses inline style for bg)
  const selectedClasses = isSelected && !tintColor && (
    selectedVariant === 'bold'
      ? 'border-accent/50 bg-accent/15 ring-1 ring-accent/20'
      : 'border-accent/30 bg-accent/10'
  )

  // Border/ring classes always apply regardless of tintColor (no conflict with inline backgroundColor)
  const selectedBorderClasses = isSelected && tintColor && (
    selectedVariant === 'bold'
      ? 'border-accent/50 ring-1 ring-accent/20'
      : 'border-accent/30'
  )

  return (
    <Comp
      className={cn(
        'rounded-lg p-3 cursor-pointer transition-all',
        'border border-white/10 hover:border-white/20',
        'shadow-md shadow-black/30',
        !tintColor && !isSelected && 'bg-bg-tertiary',
        selectedClasses,
        selectedBorderClasses,
        isActive && 'opacity-50 shadow-lg',
        className
      )}
      style={cardStyle}
      {...props}
    >
      {children}
    </Comp>
  )
}
