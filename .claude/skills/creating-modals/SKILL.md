---
name: fleet-command:creating-modals
description: Use when creating or modifying modal dialogs in the web-react application
---

# Creating Modals in Fleet Command

This skill documents the correct patterns for creating modal dialogs in the web-react application.

## Base Components

All modals use the Radix UI-based Dialog components from `@/components/ui/dialog`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
```

## Theme Variables

The dialog component uses the project's theme variables by default:

- **Background**: `bg-bg-secondary`
- **Border**: `border-border`
- **Title text**: `text-text-primary`
- **Description text**: `text-text-secondary`

These are baked into the base `DialogContent`, `DialogTitle`, and `DialogDescription` components, so you typically don't need to override them.

## Basic Modal Structure

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Modal Title</DialogTitle>
      <DialogDescription>
        Description text explaining what this modal does.
      </DialogDescription>
    </DialogHeader>

    {/* Modal body content */}
    <div className="space-y-4 py-2">{/* Form fields, content, etc. */}</div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleSubmit}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Confirmation Dialogs

For destructive actions, use a warning icon and destructive button variant:

```tsx
import { AlertTriangle } from "lucide-react";

<Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-accent-red" />
        Delete Item?
      </DialogTitle>
      <DialogDescription>
        Are you sure you want to delete this item? This action cannot be undone.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setShowDeleteDialog(false)}
        disabled={isDeleting}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        onClick={handleDelete}
        disabled={isDeleting}
      >
        {isDeleting ? "Deleting..." : "Delete"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>;
```

## Form Modals

For modals with form inputs:

```tsx
<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Add Item</DialogTitle>
      <DialogDescription>
        Fill out the form below to add a new item.
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <label htmlFor="field-name" className="text-sm text-text-secondary">
          Field Label
        </label>
        <input
          id="field-name"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter value"
          disabled={isSubmitting}
          className="w-full bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            Saving...
          </>
        ) : (
          "Save"
        )}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Input Styling

Use these classes for form inputs inside modals:

```tsx
className =
  "w-full bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent";
```

Or use the `Input` component from `@/components/ui/input` if available.

## State Management Patterns

### Local state (simple modals)

```tsx
const [showModal, setShowModal] = useState(false);
```

### Global state (app-wide modals)

```tsx
// In stores/appStore.ts
addProjectModalOpen: boolean
openAddProjectModal: () => void
closeAddProjectModal: () => void

// Usage
const isOpen = useAppStore((s) => s.addProjectModalOpen)
const closeModal = useAppStore((s) => s.closeAddProjectModal)
```

## Checklist

When creating a modal:

- [ ] Import Dialog components from `@/components/ui/dialog`
- [ ] Use `DialogContent` (theme styles are built-in)
- [ ] Include `DialogHeader` with `DialogTitle` and `DialogDescription`
- [ ] Include `DialogFooter` with Cancel and primary action buttons
- [ ] Handle loading states with `disabled` prop on buttons
- [ ] Show loading indicator in submit button when processing
- [ ] Display error messages if submission fails
- [ ] Reset form state when modal closes
- [ ] Use `variant="destructive"` for dangerous actions
- [ ] Add warning icon for destructive confirmations
