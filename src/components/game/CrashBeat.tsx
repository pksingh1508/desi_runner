import { XText } from "@/components/ui/Logo";

/** The ~900 ms crash beat before the summary: impact flash + comic "DHADAAM!". */
export function CrashBeat() {
  return (
    <div className="crash" aria-hidden="true">
      <div className="crash__flash" />
      <div className="crash__burst">
        <XText className="crash__word" text="DHADAAM!" srLabel={false} />
      </div>
    </div>
  );
}
