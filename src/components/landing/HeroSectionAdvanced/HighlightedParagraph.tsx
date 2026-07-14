import { memo, forwardRef } from "react";

interface HighlightedParagraphProps {
  text: string;
  className?: string;
}

/**
 * Renders text with **markdown-style** bold keywords highlighted with neon glow
 * Syntax: **keyword** becomes bold + pink glow
 */
export const HighlightedParagraph = memo(forwardRef<HTMLParagraphElement, HighlightedParagraphProps>(
  function HighlightedParagraph({ text, className = "" }, ref) {
    // Split text by **markdown** pattern
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    return (
      <p ref={ref} className={`text-base sm:text-lg text-white/95 max-w-2xl leading-relaxed ${className}`}>
        {parts.map((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            const keyword = part.slice(2, -2);
            return (
              <span 
                key={index} 
                className="font-bold text-blue-100 drop-shadow-[0_0_25px_rgba(59,130,246,0.9)]"
                style={{
                  textShadow: '0 0 20px rgba(59, 130, 246, 1), 0 0 40px rgba(96, 165, 250, 0.8), 0 0 60px rgba(147, 197, 253, 0.6)'
                }}
              >
                {keyword}
              </span>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </p>
    );
  }
));
