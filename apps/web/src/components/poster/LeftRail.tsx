import type { PosterData, RailItem } from "@foglamp/contracts/poster";
import { IconBox, IconPlug, type IconProps } from "@tabler/icons-react";
import type { ComponentType } from "react";

import { BrandMark, Favicon } from "./Brand";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${months[(m ?? 1) - 1]} ${d} ${y}`;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Chip({ item, FallbackIcon }: { item: RailItem; FallbackIcon: ComponentType<IconProps> }) {
  return (
    <span className="chip">
      <span className="chip-icon">
        <Favicon domain={item.domain} size={16} fallback={<FallbackIcon size={14} stroke={2} />} />
      </span>
      {item.label}
    </span>
  );
}

export function LeftRail({ data }: { data: PosterData }) {
  const { project, stats, topModels, topTools, topIntegrations } = data;
  return (
    <aside className="rail">
      <header className="rail-head">
        <span className="rail-project-icon">
          <Favicon
            domain={project.iconDomain}
            size={34}
            fallback={<span className="rail-project-initial">{project.name.charAt(0)}</span>}
          />
        </span>
        <h1 className="rail-name">{project.name}</h1>
        {project.tagline ? <p className="rail-tagline">{project.tagline}</p> : null}
        <span className="rail-date">{formatDate(project.date)}</span>
      </header>

      <div className="stat-grid">
        <Stat value={stats.agents} label="Agents" />
        <Stat value={stats.models} label="Models" />
        <Stat value={stats.tools} label="Tools" />
        <Stat value={stats.integrations} label="Integrations" />
      </div>

      {topModels.length > 0 ? (
        <section className="rail-section">
          <h2 className="rail-section-title">Models</h2>
          <ol className="rank">
            {topModels.map((m, i) => (
              <li key={m.id} className="rank-item">
                <span className="rank-num">{i + 1}</span>
                <span className="rank-icon">
                  <Favicon domain={m.domain} size={18} fallback={<IconBox size={15} stroke={2} />} />
                </span>
                <span className="rank-label">{m.label}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {topTools.length > 0 ? (
        <section className="rail-section">
          <h2 className="rail-section-title">Tools</h2>
          <div className="chips">
            {topTools.map((t) => (
              <Chip key={t.id} item={t} FallbackIcon={IconBox} />
            ))}
          </div>
        </section>
      ) : null}

      {topIntegrations.length > 0 ? (
        <section className="rail-section">
          <h2 className="rail-section-title">Integrations</h2>
          <div className="chips">
            {topIntegrations.map((t) => (
              <Chip key={t.id} item={t} FallbackIcon={IconPlug} />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="rail-foot">
        <BrandMark className="rail-foot-mark" />
        <span className="rail-foot-url">foglamp.dev/{project.slug}</span>
      </footer>
    </aside>
  );
}
