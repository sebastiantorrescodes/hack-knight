import { useMemo } from "react";
import { findTerms } from "./glossary";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** One tappable science word: a dotted underline that opens a kid-friendly definition. */
function Term({ match, entry, name, onAsk }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-sm font-semibold text-ios-green underline decoration-ios-green/60 decoration-dotted decoration-2 underline-offset-4 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ios-green/40 focus-visible:outline-none"
        >
          {match}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="flex flex-col items-center gap-2 text-center">
        <div className="text-3xl tracking-wide" aria-hidden="true">{entry.picture}</div>
        <p className="font-rounded text-lg font-bold">{entry.title}</p>
        <p className="text-[15px] leading-snug text-muted-foreground">{entry.text}</p>
        {onAsk && (
          <button
            type="button"
            onClick={() => onAsk(`Tell me more about ${entry.title.toLowerCase()}!`)}
            className="mt-1 rounded-full bg-ios-green/12 px-3 py-1.5 text-[13px] font-semibold text-ios-green transition-colors hover:bg-ios-green/20"
          >
            Ask {name} more
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Plain text from the plant, with its science words made tappable (see glossary.js). */
export default function GlossaryText({ text, name, onAsk }) {
  const pieces = useMemo(() => findTerms(text), [text]);
  return pieces.map((piece, i) =>
    typeof piece === "string" ? piece : <Term key={i} {...piece} name={name} onAsk={onAsk} />
  );
}
