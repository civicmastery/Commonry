/**
 * SafeHtml component - Safely renders HTML content with DOMPurify sanitization
 *
 * This component provides a type-safe way to render HTML while preventing XSS attacks.
 * All HTML is sanitized with DOMPurify before rendering.
 *
 * @example
 * ```tsx
 * <SafeHtml html={card.frontHtml} className="card-content" />
 * ```
 */

import DOMPurify from "dompurify";
import { useMemo } from "react";

interface SafeHtmlProps {
  html: string;
  className?: string;
  allowedTags?: string[];
  allowedAttributes?: string[];
}

export function SafeHtml({
  html,
  className,
  allowedTags = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "div",
    "span",
    "br",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "a",
    "ul",
    "ol",
    "li",
    "img",
  ],
  allowedAttributes = ["class", "style", "href", "src", "alt", "title"],
}: SafeHtmlProps) {
  // Memoize sanitization to avoid re-running on every render
  const sanitizedHtml = useMemo(() => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttributes,
    });
  }, [html, allowedTags, allowedAttributes]);

  // This component exists specifically to provide safe HTML rendering
  // HTML is sanitized above with DOMPurify before being rendered
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }} // skipcq: JS-0440
    />
  );
}
