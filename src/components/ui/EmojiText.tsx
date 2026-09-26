import { Fragment } from "react";

// Built with the constructor so the ES2017 TS target does not reject the
// Unicode property escape; runtime support is universal in modern browsers.
const EMOJI_RUN = new RegExp(
  "((?:\\p{Extended_Pictographic}|\\p{Regional_Indicator})(?:\\uFE0F|\\u200D|\\p{Emoji_Modifier}|\\p{Extended_Pictographic})*)",
  "gu"
);

/**
 * Renders engine strings like "GAU MATA KI JAI! 🐄" so emoji keep their own
 * colours inside gradient-clipped (`color: transparent`) display text.
 */
export function EmojiText({ text }: { text: string }) {
  const parts = text.split(EMOJI_RUN);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={`e${index}`} className="emoji">
            {part}
          </span>
        ) : (
          <Fragment key={`t${index}`}>{part}</Fragment>
        )
      )}
    </>
  );
}
