# Admin Notification System

## Overview

The admin notification system provides a user-friendly toast notification system to replace browser `alert()` calls throughout the admin interface. This system provides better UX with styled notifications that match the brand design and automatically dismiss after a set duration.

## Architecture

### NotificationProvider

A React Context Provider that manages notification state and renders notification toasts.

#### Features

- **Multiple notification types**: success, error, warning, info
- **Auto-dismiss**: Configurable duration (default: 5 seconds)
- **Manual dismiss**: Click the X button to remove notifications
- **Branded styling**: Uses Cloud Native Bergen brand colors and fonts
- **Smooth animations**: Slide-in from right with fade effects
- **Stacked display**: Multiple notifications stack vertically

#### Usage Pattern

```tsx
import { useNotification } from '@/components/admin/NotificationProvider'

function MyComponent() {
  const { showNotification } = useNotification()

  const handleSuccess = () => {
    showNotification({
      type: 'success',
      title: 'Operation completed!',
      message: 'Your action was successful.',
      duration: 3000, // Optional, defaults to 5000ms
    })
  }

  const handleError = () => {
    showNotification({
      type: 'error',
      title: 'Something went wrong',
      message: 'Please try again later.',
    })
  }

  // ... rest of component
}
```

#### Notification Types

1. **Success** (green): For successful operations
2. **Error** (red): For errors and failures
3. **Warning** (yellow): For important warnings
4. **Info** (blue): For informational messages

### ConfirmationModal

A branded confirmation dialog component to replace browser `confirm()` dialogs.

#### Confirmation Features

- **Branded styling**: Matches Cloud Native Bergen design system
- **Multiple variants**: danger, warning, info
- **Loading states**: Shows loading spinner during async operations
- **Customizable content**: Title, message, and button text
- **Keyboard accessible**: Proper focus management and ARIA labels

#### Confirmation Usage Pattern

```tsx
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'

function MyComponent() {
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteItem()
      setShowConfirm(false)
      showNotification({ type: 'success', title: 'Item deleted' })
    } catch (error) {
      showNotification({ type: 'error', title: 'Delete failed' })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <button onClick={() => setShowConfirm(true)}>Delete</button>
      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmButtonText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  )
}
```

## Integration

The `NotificationProvider` should be integrated at the root level of the admin layout, making the notification system available to all admin pages and components.

```tsx
// AdminLayout.tsx
return (
  <NotificationProvider>{/* ... admin layout content */}</NotificationProvider>
)
```

## Best Practices

### Notification Type Selection

- Use `success` for completed actions
- Use `error` for failures that need attention
- Use `warning` for validation issues or important notices
- Use `info` for general information

### Message Content

- **Title**: Brief, action-focused (e.g., "Email sent", "Sync failed")
- **Message**: Provide specific details and context
- Keep messages concise but informative

### Duration

- Default 5 seconds works for most notifications
- Use shorter durations (3s) for simple success messages
- Use longer durations (7-10s) for complex error messages with multiple steps

### Error Handling

Always provide actionable error messages:

```tsx
// Good
showNotification({
  type: 'error',
  title: 'Failed to sync audience',
  message: 'Check your internet connection and try again.',
})

// Avoid
showNotification({
  type: 'error',
  title: 'Error',
  message: 'Something went wrong',
})
```

## Technical Details

### Context API

The system uses React Context to provide notification functionality throughout the admin interface without prop drilling.

### State Management

- Uses `useState` to manage active notifications array
- Each notification gets a unique ID for individual removal
- Automatic cleanup with `setTimeout` for auto-dismiss

### Styling

- **Brand-compliant design system**: Uses Cloud Native Bergen color palette
- **Consistent typography**: Space Grotesk for titles, Inter for body text
- **Enhanced visual hierarchy**: Larger icons, better spacing, refined borders
- **Subtle gradients**: Gradient backgrounds with brand colors for visual appeal
- **Professional shadows**: Enhanced shadows with ring accents for depth
- **Rounded corners**: Consistent with modal and card styling
- **Responsive width optimization**: Adapts to screen size to prevent line breaks
- **Proper positioning**: Fixed positioning with header clearance and generous spacing

### Accessibility

- Proper ARIA labels for screen readers
- Keyboard-accessible dismiss buttons
- Semantic HTML structure

## Migration Guide

To migrate existing `alert()` calls to the notification system:

1. Import the hook: `import { useNotification } from './NotificationProvider'`
2. Get the function: `const { showNotification } = useNotification()`
3. Replace `alert()` calls with appropriate notification types
4. Add contextual titles and messages
5. Test the user experience

## Future Enhancements

Potential improvements to consider:

1. **Action buttons**: Add action buttons to notifications
2. **Persistence**: Option to keep critical notifications until manually dismissed
3. **Sound**: Audio feedback for important notifications
4. **Position options**: Allow different positioning (top-left, bottom, etc.)
5. **Animation variants**: More animation options for different contexts
6. **Notification history**: Log of recent notifications
