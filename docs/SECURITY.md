# Security Documentation

## HTML Sanitization Strategy

### Overview
Commonry imports flashcard decks from Anki, which may contain HTML formatting. To prevent XSS (Cross-Site Scripting) attacks while preserving formatting, we implement a **defense-in-depth** strategy with multiple layers of sanitization.

### Multi-Layer Protection

#### Layer 1: Import-Time Sanitization
**Location:** `src/lib/anki-import.ts:331`

When importing Anki decks, all HTML content is sanitized using DOMPurify before being stored in the database.

```typescript
cleanedHtml = DOMPurify.sanitize(cleanedHtml, {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'br', 'hr',
                 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'img'],
  ALLOWED_ATTR: ['class', 'style', 'href', 'src', 'alt', 'title'],
});
```

**Purpose:** Prevents malicious content from ever entering our database.

#### Layer 2: Render-Time Sanitization
**Location:** `src/components/SafeHtml.tsx`

When rendering HTML content, it's sanitized again using the `SafeHtml` component.

```tsx
<SafeHtml
  html={card.frontHtml}
  className="text-lg text-gray-900 dark:text-white mb-4 anki-card-content"
/>
```

**Purpose:** Provides protection even if database is tampered with or if there's a bug in import-time sanitization.

### ESLint Configuration

#### Enforced Rules
**Location:** `eslint.config.js:34`

```javascript
"react/no-danger": "warn", // Warn when using dangerouslySetInnerHTML
```

This rule warns developers when they try to use `dangerouslySetInnerHTML` directly, encouraging use of the `SafeHtml` component instead.

### Best Practices

#### ✅ DO: Use SafeHtml Component
```tsx
import { SafeHtml } from './SafeHtml';

function MyComponent({ htmlContent }) {
  return <SafeHtml html={htmlContent} className="my-class" />;
}
```

#### ❌ DON'T: Use dangerouslySetInnerHTML Directly
```tsx
// Avoid this - it bypasses sanitization!
function MyComponent({ htmlContent }) {
  return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
}
```

#### ⚠️ EXCEPTION: Already Sanitized Content
If you must use `dangerouslySetInnerHTML` for already-sanitized content, add a `skipcq` comment explaining why:

```tsx
// skipcq: JS-0440 - HTML is sanitized with DOMPurify in SafeHtml component
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
```

### Allowed HTML Tags & Attributes

The following tags and attributes are permitted (any others are stripped):

**Tags:**
- Headings: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- Text: `p`, `div`, `span`, `br`, `hr`
- Formatting: `strong`, `b`, `em`, `i`, `u`
- Links: `a`
- Lists: `ul`, `ol`, `li`
- Images: `img`

**Attributes:**
- `class` - CSS classes
- `style` - Inline styles
- `href` - Links (URLs are also sanitized by DOMPurify)
- `src` - Image sources
- `alt` - Image alt text
- `title` - Tooltips

### Testing for XSS Vulnerabilities

To test that sanitization is working:

1. Create a test Anki deck with potentially malicious HTML:
   ```html
   <script>alert('XSS')</script>
   <img src=x onerror="alert('XSS')">
   <div onclick="alert('XSS')">Click me</div>
   ```

2. Import the deck into Commonry

3. Verify that:
   - No alerts are triggered
   - Scripts are removed from the rendered HTML
   - Event handlers are stripped
   - Only safe formatting remains

### Dependencies

- **DOMPurify** (`^3.3.0`): Industry-standard HTML sanitizer that removes unsafe content while preserving formatting

### Additional Resources

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)
- [React Security Best Practices](https://react.dev/learn/security)
