import { useEffect, useRef, useState, useCallback } from "react";
import { CyberpunkScene } from "@/lib/cyberpunkScene";
import { resumeData } from "@/lib/resumeData";
import { type QualityTier, saveQuality, getInitialQuality, QUALITY_PRESETS } from "@/lib/qualitySettings";

function LoadingScreen({ onEnter }: { onEnter: () => void }) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setReady(true);
          return 100;
        }
        return p + Math.random() * 8 + 2;
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "#0A0E27" }}
      data-testid="loading-screen"
    >
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute opacity-20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${1 + Math.random() * 3}px`,
              height: `${20 + Math.random() * 100}px`,
              background: i % 2 === 0 ? "#FF2A6D" : "#05D9E8",
              filter: "blur(1px)",
              animation: `fall ${2 + Math.random() * 3}s linear infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center px-4">
        <h1
          className="text-5xl md:text-7xl font-bold mb-2 tracking-wider"
          style={{
            fontFamily: "Orbitron, sans-serif",
            color: "#05D9E8",
            textShadow: "0 0 20px rgba(5, 217, 232, 0.5), 0 0 40px rgba(5, 217, 232, 0.3)",
          }}
        >
          NICK LEMOFF
        </h1>
        <p
          className="text-lg md:text-xl mb-8 tracking-widest uppercase"
          style={{
            fontFamily: "Rajdhani, sans-serif",
            color: "#FF2A6D",
            textShadow: "0 0 10px rgba(255, 42, 109, 0.5)",
          }}
        >
          Full Stack Developer / Data Scientist / ML Engineer
        </p>

        <div className="w-80 mx-auto mb-8">
          <div className="flex justify-between mb-1">
            <span
              className="text-xs tracking-widest"
              style={{ fontFamily: "Share Tech Mono, monospace", color: "#D1F7FF" }}
            >
              INITIALIZING ENVIRONMENT
            </span>
            <span
              className="text-xs"
              style={{ fontFamily: "Share Tech Mono, monospace", color: "#05D9E8" }}
            >
              {Math.min(100, Math.floor(progress))}%
            </span>
          </div>
          <div
            className="h-1 w-full rounded-full overflow-hidden"
            style={{ background: "rgba(5, 217, 232, 0.15)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.min(100, progress)}%`,
                background: "linear-gradient(90deg, #FF2A6D, #05D9E8)",
                boxShadow: "0 0 10px rgba(5, 217, 232, 0.5)",
              }}
            />
          </div>
        </div>

        {ready && (
          <button
            onClick={onEnter}
            className="px-8 py-3 text-lg tracking-widest uppercase border-2 transition-all duration-300 hover:scale-105"
            style={{
              fontFamily: "Orbitron, sans-serif",
              color: "#05D9E8",
              borderColor: "#05D9E8",
              background: "rgba(5, 217, 232, 0.1)",
              textShadow: "0 0 10px rgba(5, 217, 232, 0.5)",
              boxShadow: "0 0 20px rgba(5, 217, 232, 0.2), inset 0 0 20px rgba(5, 217, 232, 0.1)",
            }}
            data-testid="button-enter"
          >
            ENTER APARTMENT
          </button>
        )}

        <div
          className="mt-6 text-xs tracking-wider"
          style={{
            fontFamily: "Share Tech Mono, monospace",
            color: "rgba(209, 247, 255, 0.4)",
          }}
        >
          <p>WASD / Arrow Keys to move</p>
          <p>Mouse to look around</p>
          <p>Walk near glowing stations to view content</p>
        </div>
      </div>

      <style>{`
        @keyframes fall {
          0% { transform: translateY(-100vh); opacity: 0; }
          10% { opacity: 0.2; }
          90% { opacity: 0.2; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function HUD({
  activeZone,
  isLocked,
}: {
  activeZone: { type: string; label: string } | null;
  isLocked: boolean;
}) {
  return (
    <div className="fixed inset-0 z-30 pointer-events-none" data-testid="hud-overlay">
      <div
        className="absolute top-4 left-44 flex items-center gap-3"
        style={{ fontFamily: "Share Tech Mono, monospace" }}
      >
        <div
          className="px-3 py-1.5 text-xs tracking-widest"
          style={{
            color: "#05D9E8",
            background: "rgba(5, 217, 232, 0.08)",
            border: "1px solid rgba(5, 217, 232, 0.2)",
          }}
          data-testid="hud-name"
        >
          NICK LEMOFF // PORTFOLIO v2.0
        </div>
      </div>

      <div className="absolute top-4 right-4 flex flex-col items-end gap-1"
        style={{ fontFamily: "Share Tech Mono, monospace" }}
      >
        <div
          className="px-3 py-1 text-xs"
          style={{ color: "rgba(209, 247, 255, 0.5)" }}
          data-testid="hud-location"
        >
          SF BAY AREA // 2025
        </div>
        <div className="flex gap-2">
          {[
            { label: "GH", href: resumeData.links.github },
            { label: "LI", href: resumeData.links.linkedin },
            { label: "TW", href: resumeData.links.twitter },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto px-2 py-0.5 text-xs transition-colors"
              style={{
                color: "#FF2A6D",
                border: "1px solid rgba(255, 42, 109, 0.3)",
                background: "rgba(255, 42, 109, 0.05)",
              }}
              data-testid={`link-${label.toLowerCase()}`}
            >
              [{label}]
            </a>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-4"
        style={{ fontFamily: "Share Tech Mono, monospace" }}
      >
        <div className="flex gap-1 mb-2">
          {["W", "A", "S", "D"].map((key) => (
            <div
              key={key}
              className="w-7 h-7 flex items-center justify-center text-xs border"
              style={{
                color: "rgba(209, 247, 255, 0.5)",
                borderColor: "rgba(209, 247, 255, 0.15)",
                background: "rgba(10, 14, 39, 0.7)",
              }}
            >
              {key}
            </div>
          ))}
          <span
            className="ml-2 text-xs self-center"
            style={{ color: "rgba(209, 247, 255, 0.3)" }}
          >
            MOVE
          </span>
        </div>
        {!isLocked && (
          <div
            className="text-xs animate-pulse"
            style={{ color: "#FFB86C" }}
            data-testid="text-click-prompt"
          >
            CLICK TO ENABLE MOUSE LOOK
          </div>
        )}
      </div>

      {activeZone && (
        <div
          className="absolute bottom-4 right-4 max-w-xs"
          style={{ fontFamily: "Share Tech Mono, monospace" }}
        >
          <div
            className="px-4 py-2 text-sm"
            style={{
              color: "#05D9E8",
              background: "rgba(5, 217, 232, 0.08)",
              border: "1px solid rgba(5, 217, 232, 0.3)",
              boxShadow: "0 0 15px rgba(5, 217, 232, 0.1)",
            }}
            data-testid="text-zone-indicator"
          >
            STATION: {activeZone.label}
          </div>
        </div>
      )}

      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2" style={{ borderColor: "rgba(5, 217, 232, 0.3)" }} />
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2" style={{ borderColor: "rgba(5, 217, 232, 0.3)" }} />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2" style={{ borderColor: "rgba(255, 42, 109, 0.3)" }} />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2" style={{ borderColor: "rgba(255, 42, 109, 0.3)" }} />

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className="w-5 h-5 border border-opacity-30 rotate-45"
          style={{ borderColor: "rgba(5, 217, 232, 0.4)" }}
        />
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, transparent 1px, transparent 2px)",
          backgroundSize: "100% 3px",
        }}
      />
    </div>
  );
}

function ResumePanel({
  activeZone,
}: {
  activeZone: { type: string; label: string } | null;
}) {
  if (!activeZone) return null;

  const renderContent = () => {
    switch (activeZone.type) {
      case "about":
        return (
          <div>
            <h3 className="panel-title">{resumeData.name}</h3>
            <p className="panel-subtitle">{resumeData.title}</p>
            <p className="panel-subtitle" style={{ color: "#FFB86C" }}>
              {resumeData.location}
            </p>
            <div className="mt-4 flex gap-3 flex-wrap">
              {Object.entries(resumeData.links).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto panel-link"
                  data-testid={`panel-link-${key}`}
                >
                  {key.toUpperCase()}
                </a>
              ))}
            </div>
          </div>
        );

      case "experience":
        return (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 pointer-events-auto custom-scroll">
            {resumeData.experience.map((exp, i) => (
              <div key={i} className="panel-card">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h4 className="panel-role">{exp.role}</h4>
                  <span className="panel-period">{exp.period}</span>
                </div>
                <p className="panel-company">
                  {exp.company} // {exp.location}
                </p>
                <ul className="mt-2 space-y-1">
                  {exp.bullets.map((b, j) => (
                    <li key={j} className="panel-bullet">
                      <span style={{ color: "#05D9E8" }}>&gt;</span> {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );

      case "skills":
        return (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 pointer-events-auto custom-scroll">
            {Object.entries(resumeData.skills).map(([category, skills]) => (
              <div key={category} className="panel-card">
                <h4 className="panel-role">{category}</h4>
                <div className="flex flex-wrap gap-2 mt-2">
                  {skills.map((skill) => (
                    <span key={skill} className="panel-tag">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      case "projects":
        return (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 pointer-events-auto custom-scroll">
            {resumeData.projects.map((proj, i) => (
              <div key={i} className="panel-card">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h4 className="panel-role">{proj.name}</h4>
                  <a
                    href={proj.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="panel-link pointer-events-auto"
                    data-testid={`project-link-${i}`}
                  >
                    VIEW CODE
                  </a>
                </div>
                <p className="panel-description">{proj.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {proj.tags.map((tag) => (
                    <span key={tag} className="panel-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );

      case "education":
        return (
          <div>
            <div className="panel-card">
              <h4 className="panel-role">{resumeData.education.school}</h4>
              <p className="panel-company">{resumeData.education.degree}</p>
              <p className="panel-period">{resumeData.education.period}</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const borderColor =
    activeZone.type === "experience"
      ? "#FF2A6D"
      : activeZone.type === "skills"
      ? "#05D9E8"
      : activeZone.type === "projects"
      ? "#FFB86C"
      : activeZone.type === "education"
      ? "#7B2FBE"
      : "#D1F7FF";

  return (
    <div
      className="fixed right-6 top-1/2 -translate-y-1/2 z-40 w-96 max-w-[calc(100vw-3rem)]"
      style={{
        fontFamily: "Rajdhani, sans-serif",
        animation: "slideIn 0.3s ease-out",
      }}
      data-testid={`panel-${activeZone.type}`}
    >
      <div
        className="relative p-5"
        style={{
          background: "rgba(10, 14, 39, 0.92)",
          backdropFilter: "blur(12px)",
          border: `1px solid ${borderColor}40`,
          boxShadow: `0 0 30px ${borderColor}15, inset 0 0 30px ${borderColor}08`,
        }}
      >
        <div
          className="absolute top-0 left-0 w-full h-0.5"
          style={{
            background: `linear-gradient(90deg, transparent, ${borderColor}, transparent)`,
          }}
        />
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: borderColor, boxShadow: `0 0 8px ${borderColor}` }}
          />
          <h2
            className="text-lg font-bold tracking-widest"
            style={{
              fontFamily: "Orbitron, sans-serif",
              color: borderColor,
              textShadow: `0 0 10px ${borderColor}50`,
            }}
          >
            {activeZone.label}
          </h2>
        </div>
        {renderContent()}

        <div
          className="absolute -top-1 -left-1 w-3 h-3 border-t border-l"
          style={{ borderColor }}
        />
        <div
          className="absolute -top-1 -right-1 w-3 h-3 border-t border-r"
          style={{ borderColor }}
        />
        <div
          className="absolute -bottom-1 -left-1 w-3 h-3 border-b border-l"
          style={{ borderColor }}
        />
        <div
          className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r"
          style={{ borderColor }}
        />
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-50%) translateX(20px); }
          to { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        .panel-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #D1F7FF;
          text-shadow: 0 0 10px rgba(209, 247, 255, 0.3);
          letter-spacing: 0.05em;
        }
        .panel-subtitle {
          font-size: 0.875rem;
          color: rgba(209, 247, 255, 0.6);
          margin-top: 0.25rem;
          letter-spacing: 0.03em;
        }
        .panel-card {
          padding: 0.75rem;
          background: rgba(5, 217, 232, 0.03);
          border: 1px solid rgba(5, 217, 232, 0.08);
        }
        .panel-role {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.8rem;
          font-weight: 600;
          color: #D1F7FF;
          letter-spacing: 0.05em;
        }
        .panel-company {
          font-size: 0.8rem;
          color: rgba(209, 247, 255, 0.5);
          font-family: 'Share Tech Mono', monospace;
          letter-spacing: 0.02em;
        }
        .panel-period {
          font-size: 0.7rem;
          color: #FFB86C;
          font-family: 'Share Tech Mono', monospace;
          white-space: nowrap;
        }
        .panel-bullet {
          font-size: 0.75rem;
          color: rgba(209, 247, 255, 0.65);
          line-height: 1.4;
        }
        .panel-description {
          font-size: 0.75rem;
          color: rgba(209, 247, 255, 0.55);
          margin-top: 0.25rem;
          line-height: 1.4;
        }
        .panel-tag {
          font-family: 'Share Tech Mono', monospace;
          font-size: 0.65rem;
          padding: 0.15rem 0.5rem;
          color: #05D9E8;
          background: rgba(5, 217, 232, 0.08);
          border: 1px solid rgba(5, 217, 232, 0.2);
          letter-spacing: 0.04em;
        }
        .panel-link {
          font-family: 'Share Tech Mono', monospace;
          font-size: 0.7rem;
          padding: 0.15rem 0.5rem;
          color: #FF2A6D;
          border: 1px solid rgba(255, 42, 109, 0.3);
          background: rgba(255, 42, 109, 0.05);
          text-decoration: none;
          transition: all 0.2s;
          letter-spacing: 0.04em;
        }
        .panel-link:hover {
          background: rgba(255, 42, 109, 0.15);
          box-shadow: 0 0 10px rgba(255, 42, 109, 0.2);
        }
        .custom-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: rgba(5, 217, 232, 0.05);
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(5, 217, 232, 0.3);
        }
      `}</style>
    </div>
  );
}

function MiniMap({ cameraPos }: { cameraPos: { x: number; z: number } }) {
  const roomW = 20;
  const roomD = 24;
  const mapSize = 120;

  const px = ((cameraPos.x + roomW / 2) / roomW) * mapSize;
  const pz = ((cameraPos.z + roomD / 2) / roomD) * mapSize;

  const stations = [
    { x: 0, z: -10, label: "EXP", color: "#FF2A6D" },
    { x: -7, z: -4, label: "SKL", color: "#05D9E8" },
    { x: -5, z: 8, label: "PRJ", color: "#FFB86C" },
    { x: 7, z: 4, label: "EDU", color: "#7B2FBE" },
    { x: 3, z: -6, label: "ABT", color: "#D1F7FF" },
  ];

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30"
      style={{
        width: mapSize,
        height: mapSize * (roomD / roomW),
        background: "rgba(10, 14, 39, 0.7)",
        border: "1px solid rgba(5, 217, 232, 0.2)",
        backdropFilter: "blur(4px)",
      }}
      data-testid="minimap"
    >
      {stations.map((s) => {
        const sx = ((s.x + roomW / 2) / roomW) * mapSize;
        const sz = ((s.z + roomD / 2) / roomD) * (mapSize * (roomD / roomW));
        return (
          <div
            key={s.label}
            className="absolute flex items-center justify-center"
            style={{
              left: sx - 4,
              top: sz - 4,
              width: 8,
              height: 8,
              background: `${s.color}40`,
              border: `1px solid ${s.color}`,
              borderRadius: "1px",
            }}
          >
            <span
              className="absolute -top-3 text-center whitespace-nowrap"
              style={{
                fontSize: "6px",
                color: s.color,
                fontFamily: "Share Tech Mono, monospace",
              }}
            >
              {s.label}
            </span>
          </div>
        );
      })}
      <div
        className="absolute rounded-full"
        style={{
          left: px - 3,
          top: pz * (roomD / roomW) - 3,
          width: 6,
          height: 6,
          background: "#D1F7FF",
          boxShadow: "0 0 6px #D1F7FF",
        }}
      />
    </div>
  );
}

function FpsCounter({ fps }: { fps: number }) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 px-2 py-1"
      style={{
        fontFamily: "Share Tech Mono, monospace",
        fontSize: "11px",
        color: fps >= 50 ? "#05D9E8" : fps >= 30 ? "#FFB86C" : "#FF2A6D",
        background: "rgba(10, 14, 39, 0.7)",
        border: `1px solid ${fps >= 50 ? "rgba(5, 217, 232, 0.2)" : fps >= 30 ? "rgba(255, 184, 108, 0.2)" : "rgba(255, 42, 109, 0.2)"}`,
      }}
      data-testid="fps-counter"
    >
      {fps} FPS
    </div>
  );
}

function SettingsOverlay({
  isOpen,
  onClose,
  quality,
  onQualityChange,
  config,
}: {
  isOpen: boolean;
  onClose: () => void;
  quality: QualityTier;
  onQualityChange: (tier: QualityTier) => void;
  config: typeof QUALITY_PRESETS["ultra"];
}) {
  if (!isOpen) return null;

  const tiers: QualityTier[] = ["ultra", "high", "low"];

  return (
    <div
      className="fixed top-12 right-4 z-50 w-64"
      style={{
        fontFamily: "Share Tech Mono, monospace",
        background: "rgba(10, 14, 39, 0.92)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(5, 217, 232, 0.2)",
        boxShadow: "0 0 30px rgba(5, 217, 232, 0.05)",
      }}
      data-testid="settings-overlay"
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(5, 217, 232, 0.1)" }}
      >
        <span className="text-xs tracking-widest" style={{ color: "#05D9E8" }}>
          GRAPHICS
        </span>
        <button
          onClick={onClose}
          className="text-xs px-1.5 py-0.5"
          style={{ color: "rgba(209, 247, 255, 0.5)" }}
          data-testid="button-close-settings"
        >
          X
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <div className="text-xs mb-1.5" style={{ color: "rgba(209, 247, 255, 0.4)" }}>
            QUALITY PRESET
          </div>
          <div className="flex gap-1">
            {tiers.map((tier) => (
              <button
                key={tier}
                onClick={() => onQualityChange(tier)}
                className="flex-1 px-2 py-1.5 text-xs tracking-wider transition-all"
                style={{
                  color: quality === tier ? "#05D9E8" : "rgba(209, 247, 255, 0.4)",
                  border: `1px solid ${quality === tier ? "rgba(5, 217, 232, 0.4)" : "rgba(209, 247, 255, 0.1)"}`,
                  background: quality === tier ? "rgba(5, 217, 232, 0.1)" : "transparent",
                  textTransform: "uppercase",
                }}
                data-testid={`quality-${tier}`}
              >
                {tier}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs" style={{ color: "rgba(209, 247, 255, 0.4)" }}>
            ACTIVE EFFECTS
          </div>
          {[
            { label: "Bloom", enabled: config.bloom.enabled },
            { label: "Vignette", enabled: config.vignette.enabled },
            { label: "Chromatic Aberration", enabled: config.chromaticAberration.enabled },
            { label: "Shadows", enabled: config.shadows.enabled },
          ].map(({ label, enabled }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "rgba(209, 247, 255, 0.55)" }}>
                {label}
              </span>
              <span
                className="text-xs"
                style={{ color: enabled ? "#05D9E8" : "rgba(209, 247, 255, 0.25)" }}
              >
                {enabled ? "ON" : "OFF"}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "rgba(209, 247, 255, 0.55)" }}>
              Render Scale
            </span>
            <span className="text-xs" style={{ color: "#FFB86C" }}>
              {Math.round(config.renderScale * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioView({ onEnter3D, webGLUnavailable }: { onEnter3D: () => void; webGLUnavailable: boolean }) {
  const [activeSection, setActiveSection] = useState<string | null>("about");
  const sections = [
    { id: "about", label: "ABOUT", color: "#D1F7FF" },
    { id: "experience", label: "EXPERIENCE", color: "#FF2A6D" },
    { id: "skills", label: "SKILLS", color: "#05D9E8" },
    { id: "projects", label: "PROJECTS", color: "#FFB86C" },
    { id: "education", label: "EDUCATION", color: "#7B2FBE" },
  ];

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#0A0E27", fontFamily: "Rajdhani, sans-serif" }}
      data-testid="portfolio-view"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute opacity-10"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${1 + Math.random() * 2}px`,
              height: `${40 + Math.random() * 120}px`,
              background: i % 2 === 0 ? "#FF2A6D" : "#05D9E8",
              filter: "blur(1px)",
              animation: `fall ${3 + Math.random() * 4}s linear infinite`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      <header
        className="sticky top-0 z-50 px-6 py-3 flex items-center justify-between flex-wrap gap-2"
        style={{
          background: "rgba(10, 14, 39, 0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(5, 217, 232, 0.15)",
        }}
      >
        <h1
          className="text-xl font-bold tracking-widest"
          style={{ fontFamily: "Orbitron, sans-serif", color: "#05D9E8", textShadow: "0 0 12px rgba(5, 217, 232, 0.3)" }}
        >
          NICK LEMOFF
        </h1>
        <nav className="flex gap-2 flex-wrap">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className="px-3 py-1 text-xs tracking-widest transition-all"
              style={{
                fontFamily: "Share Tech Mono, monospace",
                color: activeSection === s.id ? s.color : "rgba(209, 247, 255, 0.5)",
                border: `1px solid ${activeSection === s.id ? s.color + "60" : "rgba(209, 247, 255, 0.1)"}`,
                background: activeSection === s.id ? s.color + "10" : "transparent",
              }}
              data-testid={`nav-${s.id}`}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="flex gap-2 items-center">
          {[
            { label: "GH", href: resumeData.links.github },
            { label: "LI", href: resumeData.links.linkedin },
            { label: "TW", href: resumeData.links.twitter },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 text-xs transition-all"
              style={{
                fontFamily: "Share Tech Mono, monospace",
                color: "#FF2A6D",
                border: "1px solid rgba(255, 42, 109, 0.3)",
                background: "rgba(255, 42, 109, 0.05)",
              }}
              data-testid={`link-${label.toLowerCase()}`}
            >
              [{label}]
            </a>
          ))}
          <button
            onClick={onEnter3D}
            disabled={webGLUnavailable}
            className="ml-2 px-3 py-1 text-xs tracking-widest transition-all"
            style={{
              fontFamily: "Orbitron, sans-serif",
              color: webGLUnavailable ? "rgba(209, 247, 255, 0.25)" : "#05D9E8",
              border: `1px solid ${webGLUnavailable ? "rgba(209, 247, 255, 0.1)" : "rgba(5, 217, 232, 0.4)"}`,
              background: webGLUnavailable ? "rgba(209, 247, 255, 0.02)" : "rgba(5, 217, 232, 0.08)",
              textShadow: webGLUnavailable ? "none" : "0 0 8px rgba(5, 217, 232, 0.4)",
              boxShadow: webGLUnavailable ? "none" : "0 0 12px rgba(5, 217, 232, 0.1), inset 0 0 12px rgba(5, 217, 232, 0.05)",
              cursor: webGLUnavailable ? "not-allowed" : "pointer",
            }}
            title={webGLUnavailable ? "3D mode requires WebGL (desktop browser)" : ""}
            data-testid="button-enter-3d"
          >
            {webGLUnavailable ? "3D UNAVAILABLE" : "ENTER 3D APARTMENT"}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-8">
        {activeSection === "about" && (
          <section data-testid="section-about">
            <h2
              className="text-4xl font-bold mb-3 tracking-wider"
              style={{
                fontFamily: "Orbitron, sans-serif",
                color: "#D1F7FF",
                textShadow: "0 0 15px rgba(209, 247, 255, 0.2)",
              }}
            >
              {resumeData.name}
            </h2>
            <p className="text-lg mb-1" style={{ color: "rgba(209, 247, 255, 0.6)" }}>
              {resumeData.title}
            </p>
            <p className="text-sm mb-6" style={{ color: "#FFB86C", fontFamily: "Share Tech Mono, monospace" }}>
              {resumeData.location}
            </p>
            <div
              className="p-5 mt-4"
              style={{
                background: "rgba(5, 217, 232, 0.03)",
                border: "1px solid rgba(5, 217, 232, 0.1)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#05D9E8", boxShadow: "0 0 8px #05D9E8" }} />
                <span
                  className="text-xs tracking-widest"
                  style={{ fontFamily: "Orbitron, sans-serif", color: "#05D9E8" }}
                >
                  EXPLORE IN 3D
                </span>
              </div>
              <p className="text-sm mb-4" style={{ color: "rgba(209, 247, 255, 0.5)" }}>
                Navigate through a cyberpunk apartment to discover my resume as interactive 3D visualizations. Use WASD to move and mouse to look around.
              </p>
              <button
                onClick={onEnter3D}
                disabled={webGLUnavailable}
                className="px-6 py-2.5 text-sm tracking-widest transition-all"
                style={{
                  fontFamily: "Orbitron, sans-serif",
                  color: webGLUnavailable ? "rgba(209, 247, 255, 0.25)" : "#05D9E8",
                  border: `2px solid ${webGLUnavailable ? "rgba(209, 247, 255, 0.1)" : "rgba(5, 217, 232, 0.4)"}`,
                  background: webGLUnavailable ? "rgba(209, 247, 255, 0.02)" : "rgba(5, 217, 232, 0.08)",
                  textShadow: webGLUnavailable ? "none" : "0 0 10px rgba(5, 217, 232, 0.5)",
                  boxShadow: webGLUnavailable ? "none" : "0 0 20px rgba(5, 217, 232, 0.15), inset 0 0 20px rgba(5, 217, 232, 0.05)",
                  cursor: webGLUnavailable ? "not-allowed" : "pointer",
                }}
                data-testid="button-enter-3d-hero"
              >
                {webGLUnavailable ? "3D UNAVAILABLE" : "ENTER APARTMENT"}
              </button>
              <span
                className="ml-3 text-xs"
                style={{ fontFamily: "Share Tech Mono, monospace", color: "rgba(209, 247, 255, 0.3)" }}
              >
                {webGLUnavailable ? "Requires WebGL (desktop browser)" : "Desktop only // WASD + Mouse"}
              </span>
            </div>
          </section>
        )}

        {activeSection === "experience" && (
          <section className="space-y-4" data-testid="section-experience">
            <h2
              className="text-2xl font-bold mb-4 tracking-wider flex items-center gap-3"
              style={{ fontFamily: "Orbitron, sans-serif", color: "#FF2A6D", textShadow: "0 0 10px rgba(255, 42, 109, 0.3)" }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: "#FF2A6D", boxShadow: "0 0 8px #FF2A6D" }} />
              EXPERIENCE
            </h2>
            {resumeData.experience.map((exp, i) => (
              <div
                key={i}
                className="p-4"
                style={{
                  background: "rgba(255, 42, 109, 0.03)",
                  border: "1px solid rgba(255, 42, 109, 0.1)",
                }}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h3
                    className="text-sm font-bold"
                    style={{ fontFamily: "Orbitron, sans-serif", color: "#D1F7FF", letterSpacing: "0.05em" }}
                  >
                    {exp.role}
                  </h3>
                  <span className="text-xs whitespace-nowrap" style={{ fontFamily: "Share Tech Mono, monospace", color: "#FFB86C" }}>
                    {exp.period}
                  </span>
                </div>
                <p
                  className="text-sm mt-0.5"
                  style={{ fontFamily: "Share Tech Mono, monospace", color: "rgba(209, 247, 255, 0.5)" }}
                >
                  {exp.company} // {exp.location}
                </p>
                <ul className="mt-2 space-y-1">
                  {exp.bullets.map((b, j) => (
                    <li key={j} className="text-sm" style={{ color: "rgba(209, 247, 255, 0.65)" }}>
                      <span style={{ color: "#05D9E8" }}>&gt;</span> {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {activeSection === "skills" && (
          <section className="space-y-4" data-testid="section-skills">
            <h2
              className="text-2xl font-bold mb-4 tracking-wider flex items-center gap-3"
              style={{ fontFamily: "Orbitron, sans-serif", color: "#05D9E8", textShadow: "0 0 10px rgba(5, 217, 232, 0.3)" }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: "#05D9E8", boxShadow: "0 0 8px #05D9E8" }} />
              SKILLS
            </h2>
            {Object.entries(resumeData.skills).map(([category, skills]) => (
              <div
                key={category}
                className="p-4"
                style={{
                  background: "rgba(5, 217, 232, 0.03)",
                  border: "1px solid rgba(5, 217, 232, 0.1)",
                }}
              >
                <h3
                  className="text-sm font-bold mb-2"
                  style={{ fontFamily: "Orbitron, sans-serif", color: "#D1F7FF", letterSpacing: "0.05em" }}
                >
                  {category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 text-xs"
                      style={{
                        fontFamily: "Share Tech Mono, monospace",
                        color: "#05D9E8",
                        border: "1px solid rgba(5, 217, 232, 0.2)",
                        background: "rgba(5, 217, 232, 0.05)",
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {activeSection === "projects" && (
          <section className="space-y-4" data-testid="section-projects">
            <h2
              className="text-2xl font-bold mb-4 tracking-wider flex items-center gap-3"
              style={{ fontFamily: "Orbitron, sans-serif", color: "#FFB86C", textShadow: "0 0 10px rgba(255, 184, 108, 0.3)" }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: "#FFB86C", boxShadow: "0 0 8px #FFB86C" }} />
              PROJECTS
            </h2>
            {resumeData.projects.map((proj, i) => (
              <div
                key={i}
                className="p-4"
                style={{
                  background: "rgba(255, 184, 108, 0.03)",
                  border: "1px solid rgba(255, 184, 108, 0.1)",
                }}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h3
                    className="text-sm font-bold"
                    style={{ fontFamily: "Orbitron, sans-serif", color: "#D1F7FF", letterSpacing: "0.05em" }}
                  >
                    {proj.name}
                  </h3>
                  <a
                    href={proj.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-0.5 transition-all"
                    style={{
                      fontFamily: "Share Tech Mono, monospace",
                      color: "#FF2A6D",
                      border: "1px solid rgba(255, 42, 109, 0.3)",
                      background: "rgba(255, 42, 109, 0.05)",
                    }}
                    data-testid={`project-link-${i}`}
                  >
                    VIEW CODE
                  </a>
                </div>
                <p className="text-sm mt-1" style={{ color: "rgba(209, 247, 255, 0.55)" }}>
                  {proj.description}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {proj.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs"
                      style={{
                        fontFamily: "Share Tech Mono, monospace",
                        color: "#05D9E8",
                        border: "1px solid rgba(5, 217, 232, 0.2)",
                        background: "rgba(5, 217, 232, 0.05)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {activeSection === "education" && (
          <section data-testid="section-education">
            <h2
              className="text-2xl font-bold mb-4 tracking-wider flex items-center gap-3"
              style={{ fontFamily: "Orbitron, sans-serif", color: "#7B2FBE", textShadow: "0 0 10px rgba(123, 47, 190, 0.3)" }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: "#7B2FBE", boxShadow: "0 0 8px #7B2FBE" }} />
              EDUCATION
            </h2>
            <div
              className="p-4"
              style={{
                background: "rgba(123, 47, 190, 0.03)",
                border: "1px solid rgba(123, 47, 190, 0.1)",
              }}
            >
              <h3
                className="text-sm font-bold"
                style={{ fontFamily: "Orbitron, sans-serif", color: "#D1F7FF", letterSpacing: "0.05em" }}
              >
                {resumeData.education.school}
              </h3>
              <p style={{ fontFamily: "Share Tech Mono, monospace", color: "rgba(209, 247, 255, 0.5)", fontSize: "0.875rem" }}>
                {resumeData.education.degree}
              </p>
              <p style={{ fontFamily: "Share Tech Mono, monospace", color: "#FFB86C", fontSize: "0.75rem" }}>
                {resumeData.education.period}
              </p>
            </div>
          </section>
        )}
      </main>

      <div
        className="fixed top-0 left-0 w-6 h-6 border-t border-l pointer-events-none"
        style={{ borderColor: "rgba(5, 217, 232, 0.2)" }}
      />
      <div
        className="fixed top-0 right-0 w-6 h-6 border-t border-r pointer-events-none"
        style={{ borderColor: "rgba(5, 217, 232, 0.2)" }}
      />
      <div
        className="fixed bottom-0 left-0 w-6 h-6 border-b border-l pointer-events-none"
        style={{ borderColor: "rgba(255, 42, 109, 0.2)" }}
      />
      <div
        className="fixed bottom-0 right-0 w-6 h-6 border-b border-r pointer-events-none"
        style={{ borderColor: "rgba(255, 42, 109, 0.2)" }}
      />

      <style>{`
        @keyframes fall {
          0% { transform: translateY(-100vh); opacity: 0; }
          10% { opacity: 0.1; }
          90% { opacity: 0.1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function CyberpunkPortfolio() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CyberpunkScene | null>(null);
  const [mode, setMode] = useState<"portfolio" | "loading" | "3d">("portfolio");
  const [activeZone, setActiveZone] = useState<{ type: string; label: string } | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [cameraPos, setCameraPos] = useState({ x: 0, z: 8 });
  const [webGLUnavailable, setWebGLUnavailable] = useState(false);
  const [fps, setFps] = useState(0);
  const [quality, setQuality] = useState<QualityTier>(() => getInitialQuality());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleQualityChange = useCallback((tier: QualityTier) => {
    setQuality(tier);
    saveQuality(tier);
    if (sceneRef.current) {
      sceneRef.current.setQuality(tier);
    }
  }, []);

  const initScene = useCallback(() => {
    if (!containerRef.current || sceneRef.current) return;

    try {
      const testCanvas = document.createElement("canvas");
      const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
      if (!gl) {
        setWebGLUnavailable(true);
        setMode("portfolio");
        return;
      }
    } catch {
      setWebGLUnavailable(true);
      setMode("portfolio");
      return;
    }

    try {
      const scene = new CyberpunkScene(containerRef.current);
      scene.onZoneChange = (zone) => {
        setActiveZone(zone ? { type: zone.type, label: zone.label } : null);
      };
      scene.onLockChange = (locked) => setIsLocked(locked);
      scene.onFpsUpdate = (f) => setFps(f);
      scene.onQualityChange = (tier) => setQuality(tier);
      sceneRef.current = scene;
      scene.start();

      const posInterval = setInterval(() => {
        if (sceneRef.current) {
          setCameraPos({
            x: sceneRef.current.camera.position.x,
            z: sceneRef.current.camera.position.z,
          });
        }
      }, 100);

      return () => {
        clearInterval(posInterval);
        scene.dispose();
        sceneRef.current = null;
      };
    } catch {
      setWebGLUnavailable(true);
      setMode("portfolio");
    }
  }, []);

  useEffect(() => {
    if (mode === "3d") {
      const cleanup = initScene();
      return cleanup;
    }
  }, [mode, initScene]);

  const handleEnter3D = () => {
    setMode("loading");
  };

  const handleLoadingComplete = () => {
    setMode("3d");
  };

  const handleBack = () => {
    if (sceneRef.current) {
      sceneRef.current.dispose();
      sceneRef.current = null;
    }
    setActiveZone(null);
    setIsLocked(false);
    setSettingsOpen(false);
    setMode("portfolio");
  };

  const handleCanvasClick = () => {
    if (sceneRef.current && !sceneRef.current.isLocked) {
      sceneRef.current.requestPointerLock();
    }
  };

  if (mode === "portfolio") {
    return <PortfolioView onEnter3D={handleEnter3D} webGLUnavailable={webGLUnavailable} />;
  }

  if (mode === "loading") {
    return <LoadingScreen onEnter={handleLoadingComplete} />;
  }

  return (
    <div className="w-full h-screen overflow-hidden" style={{ background: "#0A0E27" }}>
      <HUD activeZone={activeZone} isLocked={isLocked} />
      <ResumePanel activeZone={activeZone} />
      <MiniMap cameraPos={cameraPos} />
      <FpsCounter fps={fps} />
      <SettingsOverlay
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        quality={quality}
        onQualityChange={handleQualityChange}
        config={QUALITY_PRESETS[quality]}
      />
      <div className="fixed top-4 left-4 z-50 flex gap-2">
        <button
          onClick={handleBack}
          className="px-3 py-1.5 text-xs tracking-widest transition-all"
          style={{
            fontFamily: "Share Tech Mono, monospace",
            color: "#FF2A6D",
            border: "1px solid rgba(255, 42, 109, 0.3)",
            background: "rgba(10, 14, 39, 0.8)",
            backdropFilter: "blur(8px)",
          }}
          data-testid="button-back"
        >
          &lt; EXIT
        </button>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="px-3 py-1.5 text-xs tracking-widest transition-all"
          style={{
            fontFamily: "Share Tech Mono, monospace",
            color: settingsOpen ? "#05D9E8" : "rgba(209, 247, 255, 0.5)",
            border: `1px solid ${settingsOpen ? "rgba(5, 217, 232, 0.4)" : "rgba(209, 247, 255, 0.15)"}`,
            background: settingsOpen ? "rgba(5, 217, 232, 0.08)" : "rgba(10, 14, 39, 0.8)",
            backdropFilter: "blur(8px)",
          }}
          data-testid="button-settings"
        >
          GRAPHICS [{quality.toUpperCase()}]
        </button>
      </div>
      <div
        ref={containerRef}
        className="w-full h-full cursor-crosshair"
        onClick={handleCanvasClick}
        data-testid="three-canvas"
      />
    </div>
  );
}