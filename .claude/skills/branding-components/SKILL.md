---
name: fleet-command:branding-components
description: Use when creating or styling UI components in the web-react application
---

# Fleet Command UI Components & Branding

This skill documents the UI components, theme variables, and styling conventions for the web-react application. Use this as a reference when creating or modifying UI elements.

## Theme Variables

All colors are defined in `web-react/src/index.css` under the `@theme` block:

### Background Colors
| Variable | Value | Usage |
|----------|-------|-------|
| `bg-primary` | `#0d1117` | Main app background |
| `bg-secondary` | `#161b22` | Cards, panels, modals |
| `bg-tertiary` | `#21262d` | Input backgrounds, elevated surfaces |
| `bg-hover` | `#30363d` | Hover states |

### Text Colors
| Variable | Value | Usage |
|----------|-------|-------|
| `text-primary` | `#e6edf3` | Primary text, headings |
| `text-secondary` | `#8b949e` | Secondary text, labels |
| `text-muted` | `#6e7681` | Muted text, placeholders |

### Accent Colors
| Variable | Value | Usage |
|----------|-------|-------|
| `accent` | `#58a6ff` | Links, primary actions |
| `accent-green` | `#3fb950` | Success states |
| `accent-yellow` | `#d29922` | Warning states, brand color |
| `accent-red` | `#f85149` | Error states, destructive actions |
| `accent-purple` | `#a371f7` | Decorative accents |

### Border & Other
| Variable | Value | Usage |
|----------|-------|-------|
| `border` | `#30363d` | All borders |
| `destructive` | `#f85149` | Destructive button backgrounds |

## Form Components

### Input Component
Location: `web-react/src/components/ui/input.tsx`

Standard input styling:
```tsx
import { Input } from "@/components/ui/input"

<Input
  placeholder="Enter value"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

Base classes (reference only - use the component):
```
border-border/50 bg-bg-tertiary/50 rounded-md h-9
focus-visible:border-border focus-visible:ring-border/30 focus-visible:ring-[2px]
placeholder:text-text-muted
```

### Select Component
Location: `web-react/src/components/ui/select.tsx`

Standard select dropdown:
```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="w-[180px]">
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

**Size variants:**
- Default: `h-9` (36px)
- Small: `size="sm"` → `h-8` (32px) - use for table rows

**Important:** Do NOT add custom background or border classes to Select components. The base component styles match the Input component automatically.

### Textarea Component
Location: `web-react/src/components/ui/textarea.tsx`

```tsx
import { Textarea } from "@/components/ui/textarea"

<Textarea
  placeholder="Enter description"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

## Button Component
Location: `web-react/src/components/ui/button.tsx`

```tsx
import { Button } from "@/components/ui/button"

<Button>Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button size="sm">Small</Button>
<Button size="icon">Icon only</Button>
```

**Variants:**
- `default` - Primary action, filled background
- `outline` - Secondary action, bordered
- `ghost` - Tertiary action, no border
- `destructive` - Dangerous action, red background

## Modal/Dialog Component
Location: `web-react/src/components/ui/dialog.tsx`

See the `fleet-command:creating-modals` skill for detailed modal patterns.

Basic structure:
```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button onClick={handleSubmit}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Badge Component
Location: `web-react/src/components/ui/badge.tsx`

```tsx
import { Badge } from "@/components/ui/badge"

<Badge>Default</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
```

## Focus States

All interactive elements should use consistent focus styling:

```
focus-visible:border-border focus-visible:ring-border/30 focus-visible:ring-[2px]
```

This provides:
- Border color change to `border` (from `border/50`)
- 2px ring with 30% opacity border color
- Visible only on keyboard focus (not mouse click)

## Hover States

Use `bg-bg-hover` for hover backgrounds:

```tsx
className="hover:bg-bg-hover"
```

For text hover:
```tsx
className="hover:text-text-primary"
```

## Common Patterns

### Card with hover effect
```tsx
<div className="bg-bg-secondary border border-border rounded-lg p-4 hover:bg-bg-hover transition-colors cursor-pointer">
  {/* content */}
</div>
```

### Muted label with value
```tsx
<div className="space-y-1">
  <span className="text-sm text-text-muted">Label</span>
  <p className="text-text-primary">Value</p>
</div>
```

### Icon + text row
```tsx
<div className="flex items-center gap-2 text-text-secondary">
  <Icon className="h-4 w-4" />
  <span>Text</span>
</div>
```

## Checklist

When creating UI components:

- [ ] Use theme variables from this document (not hardcoded colors)
- [ ] Use existing UI components from `@/components/ui/`
- [ ] Apply consistent focus states with `focus-visible:ring-[2px]`
- [ ] Use `bg-bg-hover` for hover backgrounds
- [ ] Use `text-text-muted` for placeholder text
- [ ] Use `border-border` for all borders
- [ ] Test in dark mode (the app is dark-only)
- [ ] Verify keyboard navigation works
- [ ] Check component looks correct at different sizes

## Anti-Patterns

**DO NOT:**
- Use `bg-popover`, `text-popover-foreground`, `bg-accent`, `text-accent-foreground` - use our theme variables
- Add custom `bg-bg-secondary border-border` to Select components - base styles handle this
- Use `ring-ring` or `border-ring` - use `ring-border` and `border-border`
- Create new color values - use existing theme variables
- Override base component styles unless absolutely necessary
