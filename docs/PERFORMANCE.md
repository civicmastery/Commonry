# Performance Best Practices

## Avoiding Function Recreation in JSX

### The Problem
Creating functions inline in JSX props causes React components to re-render unnecessarily because a new function reference is created on every render.

**Bad Practice:**
```tsx
// ❌ Creates new function on every render
<button onClick={(e) => handleClick(e, data)}>Click</button>

// ❌ Creates new function on every render
<button onClick={() => someAction()}>Click</button>
```

### Solution 1: Data Attributes (Preferred for Lists)
Use data attributes to pass information instead of creating closures:

**Good Practice:**
```tsx
// ✅ Stable function reference + data attribute
const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
  const itemId = e.currentTarget.dataset.itemId;
  doSomething(itemId);
}, []);

// In JSX:
{items.map(item => (
  <button onClick={handleClick} data-item-id={item.id}>
    {item.name}
  </button>
))}
```

### Solution 2: useCallback (For Single Handlers)
Wrap handlers in `useCallback` to prevent recreation:

```tsx
// ✅ Memoized function
const handleDelete = useCallback(async () => {
  await deleteItem(selectedItem.id);
  setSelectedItem(null);
}, [selectedItem]);

// In JSX:
<button onClick={handleDelete}>Delete</button>
```

### Solution 3: Extract Component
For complex interactions, create a separate component:

```tsx
// ✅ Component handles its own events
function DeckCard({ deck }: { deck: Deck }) {
  const handleClick = useCallback(() => {
    selectDeck(deck.id);
  }, [deck.id]);

  return <div onClick={handleClick}>{deck.name}</div>;
}
```

## Toast Notifications vs. Alert

### The Problem
Browser `alert()`, `confirm()`, and `prompt()` are obtrusive and should be avoided:
- Block the entire UI thread
- Cannot be styled or customized
- Poor user experience on mobile
- Difficult to test

**Bad Practice:**
```tsx
// ❌ Blocks UI, cannot be styled
alert("Export failed!");
```

### Solution: Toast Notifications
Use the `useToast` hook for non-blocking notifications:

**Good Practice:**
```tsx
import { useToast } from './components/Toast';

function MyComponent() {
  const { showToast } = useToast();

  const handleExport = async () => {
    try {
      await exportDeck();
      showToast("Export successful!", "success");
    } catch (error) {
      showToast(`Export failed: ${error.message}`, "error");
    }
  };

  return <button onClick={handleExport}>Export</button>;
}
```

Toast types:
- `"success"` - Green, with checkmark icon
- `"error"` - Red, with alert icon
- `"info"` - Blue, with info icon (default)

## ESLint Rules

The following ESLint rules help catch performance issues:

### react/jsx-no-bind
**Rule:** `"react/jsx-no-bind": ["warn"]`

Warns when creating functions in JSX:
```tsx
// ⚠️ ESLint warning
<button onClick={() => handleClick()}>Click</button>
<button onClick={handleClick.bind(this, arg)}>Click</button>

// ✅ No warning
<button onClick={handleClick}>Click</button>
```

### react-hooks/exhaustive-deps
**Rule:** `"react-hooks/exhaustive-deps": "warn"`

Ensures `useCallback` and `useEffect` dependencies are correct:
```tsx
// ⚠️ ESLint warning - missing dependency
const handleClick = useCallback(() => {
  doSomething(data); // 'data' is used but not in deps
}, []);

// ✅ No warning
const handleClick = useCallback(() => {
  doSomething(data);
}, [data]);
```

## Real-World Examples

### Example 1: Dropdown Menu Actions
**Before (Performance Issue):**
```tsx
<DropdownMenu.Item onClick={(e) => handleEdit(e, deck)}>
  Edit
</DropdownMenu.Item>
```

**After (Optimized):**
```tsx
// Handler:
const handleEdit = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  e.stopPropagation();
  const deckId = e.currentTarget.dataset.deckId;
  const deck = decks.find(d => d.id === deckId);
  if (deck) openEditDialog(deck);
}, [decks]);

// JSX:
<DropdownMenu.Item
  onClick={handleEdit}
  data-deck-id={deck.id}
>
  Edit
</DropdownMenu.Item>
```

### Example 2: File Upload
**Before (Performance Issue):**
```tsx
<input onChange={(e) => handleFileUpload(e.target.files)} />
```

**After (Optimized):**
```tsx
const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files) processFiles(files);
}, []);

<input onChange={handleFileUpload} />
```

## When to Use Each Pattern

| Scenario | Pattern | Why |
|----------|---------|-----|
| List items with actions | Data attributes | Avoids creating N functions for N items |
| Single button/action | useCallback | Simple and clear |
| Complex item interactions | Extract component | Encapsulates logic |
| Simple onClick with no args | Direct reference | Already optimized |

## Testing Performance

Use React DevTools Profiler to identify unnecessary re-renders:

1. Open React DevTools
2. Go to "Profiler" tab
3. Click record
4. Interact with your component
5. Look for components that render when they shouldn't

Components re-rendering due to new function props will show up clearly in the flame graph.

## Additional Resources

- [React useCallback docs](https://react.dev/reference/react/useCallback)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [ESLint Plugin React](https://github.com/jsx-eslint/eslint-plugin-react)
