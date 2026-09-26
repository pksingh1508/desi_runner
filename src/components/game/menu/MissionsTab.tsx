"use client";

import type { MissionView } from "@/types/game";
import { cssVars } from "@/components/ui/cn";
import { Ring } from "@/components/ui/Ring";
import { MissionCard } from "./MissionCard";

/** Today's daily missions with an overall completion ring. */
export function MissionsTab({ missions }: { missions: MissionView[] }) {
  const done = missions.filter((mission) => mission.completed).length;
  const total = missions.length;
  return (
    <div className="tab-stack stagger">
      <header className="tab-head" style={cssVars({ "--i": 0 })}>
        <Ring
          className="tab-head__ring"
          value={total ? done / total : 0}
          thickness={12}
          gradient={["#4de3d4", "#00a6a6"]}
          label={`${done} of ${total} missions complete`}
        >
          <span className="tab-head__ring-num" aria-hidden="true">
            {done}/{total}
          </span>
        </Ring>
        <div className="tab-head__text">
          <h2 className="sec-title">
            AAJ KE MISSIONS <span className="sec-title__hi" lang="hi">आज के मिशन</span>
          </h2>
          <p className="tab-head__sub">Fresh missions every day · rewards land when your run ends</p>
        </div>
      </header>
      {missions.map((mission, index) => (
        <MissionCard
          key={`${mission.title}-${mission.target}-${index}`}
          mission={mission}
          style={cssVars({ "--i": index + 1 })}
        />
      ))}
      {total === 0 && (
        <p className="empty-note" style={cssVars({ "--i": 1 })}>
          Missions are loading — check back in a moment.
        </p>
      )}
    </div>
  );
}
