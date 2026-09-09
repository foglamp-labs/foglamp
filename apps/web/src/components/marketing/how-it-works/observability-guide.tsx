"use client";

import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUpRight,
  IconBell,
  IconCheck,
  IconMail,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { chapters } from "./chapters";
import styles from "./observability-guide.module.css";

const REQUEST_PATH =
  "M25 48.7 C31 50 36 44 44 43.3 S67 46 78 42 C90 54 48 61 26 57.3";

function ChapterExample({
  index,
  alertFiring,
  onAlertChange,
}: {
  index: number;
  alertFiring: boolean;
  onAlertChange: () => void;
}) {
  const [newPrompt, setNewPrompt] = useState(false);
  const [judge, setJudge] = useState(true);

  switch (index) {
    case 0:
      return (
        <div className={styles.messageExample}>
          <div className={styles.messageAvatar}>
            <IconMail size={20} stroke={1.5} />
          </div>
          <div>
            <span className={styles.smallLabel}>A customer asks</span>
            <p>Where’s my order?</p>
          </div>
          <span className={styles.sentMark}>
            <IconCheck size={15} /> Sent
          </span>
        </div>
      );
    case 1:
      return (
        <div className={styles.example}>
          <div className={styles.exampleHeading}>
            <span>One trace, three steps</span>
            <span>1.8 s</span>
          </div>
          <div className={styles.traceRow}>
            <i />
            <span>Read the question</span>
            <b style={{ width: "20%" }} />
            <small>0.4 s</small>
          </div>
          <div className={styles.traceRow}>
            <i />
            <span>Look up the order</span>
            <b style={{ width: "35%" }} />
            <small>0.6 s</small>
          </div>
          <div className={styles.traceRow}>
            <i />
            <span>Write the answer</span>
            <b style={{ width: "45%" }} />
            <small>0.8 s</small>
          </div>
          <div className={styles.traceMismatch}>
            <span>
              Tool result <strong>Delayed</strong>
            </span>
            <IconArrowRight size={15} />
            <span>
              Answer <strong>Arrives today</strong>
            </span>
          </div>
        </div>
      );
    case 2:
      return (
        <div className={styles.example}>
          <div className={styles.exampleHeading}>
            <span>The agent’s instructions</span>
            <span>Prompt versions</span>
          </div>
          <div className={styles.segmented} aria-label="Example prompt version">
            <button
              type="button"
              aria-pressed={!newPrompt}
              onClick={() => setNewPrompt(false)}
            >
              Version 1
            </button>
            <button
              type="button"
              aria-pressed={newPrompt}
              onClick={() => setNewPrompt(true)}
            >
              Version 2
            </button>
          </div>
          <p className={styles.promptText}>
            {newPrompt
              ? "Use the order data to answer. Never guess a delivery date."
              : "Help the customer with their order. Keep your answer short."}
          </p>
          <div className={styles.exampleFoot}>
            {newPrompt
              ? "A clearer instruction to compare against later runs."
              : "Select version 2 to see what changed."}
          </div>
        </div>
      );
    case 3:
      return (
        <div className={styles.example}>
          <div className={styles.exampleHeading}>
            <span>Order support</span>
            <span>One workflow run</span>
          </div>
          <div className={styles.workflow}>
            <div>
              <span className={styles.workerDot}>1</span>
              <strong>Triage agent</strong>
              <small>Sort the question</small>
            </div>
            <IconArrowRight size={20} stroke={1.5} />
            <div>
              <span className={styles.workerDot}>2</span>
              <strong>Order agent</strong>
              <small>Check and answer</small>
            </div>
          </div>
          <div className={styles.exampleFoot}>
            Two traces, connected by the same run ID.
          </div>
        </div>
      );
    case 4:
      return (
        <div className={styles.example}>
          <div className={styles.exampleHeading}>
            <span>One session</span>
            <span>Two messages</span>
          </div>
          <div className={styles.conversation}>
            <span>Where’s my order?</span>
            <p>Your order arrives today.</p>
            <span>Are you sure? Tracking says it’s delayed.</span>
          </div>
          <div className={styles.exampleFoot}>
            The next message gives the first answer more context.
          </div>
        </div>
      );
    case 5:
      return (
        <div className={styles.example}>
          <div className={styles.exampleHeading}>
            <span>A day in the workshop</span>
            <span>Example data</span>
          </div>
          <div className={styles.costStats}>
            <div>
              <strong>2,400</strong>
              <span>AI calls</span>
            </div>
            <div>
              <strong>$12.80</strong>
              <span>Total cost</span>
            </div>
            <div>
              <strong>1.8 s</strong>
              <span>p95 latency</span>
            </div>
          </div>
          <div
            className={styles.costBar}
            aria-label="Order agent: 75% of cost. Triage agent: 25% of cost."
          >
            <span />
            <span />
          </div>
          <div className={styles.costLegend}>
            <span>
              <i />
              Order agent · $9.60
            </span>
            <span>
              <i />
              Triage agent · $3.20
            </span>
          </div>
          <div className={styles.exampleFoot}>
            p95 means 95% of steps finished within this time.
          </div>
        </div>
      );
    case 6:
      return (
        <div className={styles.example}>
          <div className={styles.exampleHeading}>
            <span>At the inspection bench</span>
            <span>Example checks</span>
          </div>
          <div
            className={styles.segmented}
            aria-label="Example evaluation type"
          >
            <button
              type="button"
              aria-pressed={!judge}
              onClick={() => setJudge(false)}
            >
              Code check
            </button>
            <button
              type="button"
              aria-pressed={judge}
              onClick={() => setJudge(true)}
            >
              LLM judge
            </button>
          </div>
          <div className={styles.evalResult}>
            <span>
              {judge ? "Agrees with order data" : "Answer is not empty"}
            </span>
            <strong data-failed={judge}>
              {judge ? "Fail · 0.18 / 1" : "Pass"}
            </strong>
          </div>
          <p className={styles.evalReason}>
            {judge
              ? "The answer promises delivery today, but the order data says it is delayed."
              : "There is an answer. This check does not tell us whether the answer is correct."}
          </p>
        </div>
      );
    case 7:
      return (
        <div className={styles.example} data-alert={alertFiring}>
          <div className={styles.exampleHeading}>
            <span>
              <IconBell size={16} /> Answer quality
            </span>
            <span
              className={
                alertFiring ? styles.firingStatus : styles.healthyStatus
              }
            >
              {alertFiring ? "Firing" : "Healthy"}
            </span>
          </div>
          <div className={styles.alertReading}>
            <strong>{alertFiring ? "72%" : "97%"}</strong>
            <span>
              pass rate
              <br />
              <small>Alert below 85% over 1 hour</small>
            </span>
          </div>
          <div className={styles.alertMeter}>
            <span style={{ width: alertFiring ? "72%" : "97%" }} />
            <i />
          </div>
          <p className={styles.alertNote} aria-live="polite">
            {alertFiring
              ? "The rule fires. An email points you to the alert and traces to inspect."
              : "The pass rate is above your threshold. All quiet at the watchtower."}
          </p>
          <button
            type="button"
            className={styles.exampleButton}
            onClick={onAlertChange}
          >
            {alertFiring ? "Reset the example" : "Try a quality drop"}
            <IconArrowRight size={15} />
          </button>
        </div>
      );
    default:
      return null;
  }
}

function Workshop({
  active,
  paused,
  alertFiring,
  onPause,
  onSelect,
}: {
  active: number;
  paused: boolean;
  alertFiring: boolean;
  onPause: () => void;
  onSelect: (index: number) => void;
}) {
  const chapter = chapters[active];
  const routesRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const routes = routesRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function updateMotion() {
      if (paused || reducedMotion.matches) routes?.pauseAnimations();
      else routes?.unpauseAnimations();
    }
    updateMotion();
    reducedMotion.addEventListener("change", updateMotion);
    return () => reducedMotion.removeEventListener("change", updateMotion);
  }, [paused]);

  return (
    <figure
      className={styles.workshop}
      data-paused={paused}
      data-alert={active === 7 && alertFiring}
      style={{ "--station-color": chapter.color } as CSSProperties}
    >
      <div className={styles.sceneTopline}>
        <span>
          <i /> Inside an AI app
        </span>
        <button
          type="button"
          onClick={onPause}
          aria-pressed={paused}
          aria-label={
            paused ? "Play illustration motion" : "Pause illustration motion"
          }
        >
          {paused ? (
            <IconPlayerPlay size={14} />
          ) : (
            <IconPlayerPause size={14} />
          )}
          <span>{paused ? "Play motion" : "Pause motion"}</span>
        </button>
      </div>
      <div className={styles.artwork}>
        <Image
          src="/illustrations/ai-workshop.webp"
          alt="A hand-drawn workshop with an agent at a desk, an order clerk, a counting room, an inspection bench, and a bell tower. Messages travel between its rooms."
          width={1536}
          height={1024}
          sizes="(max-width: 900px) 100vw, 65vw"
          preload
          className={styles.workshopImage}
        />
        <svg
          ref={routesRef}
          className={styles.routes}
          viewBox="0 0 100 66.667"
          fill="none"
          aria-hidden="true"
        >
          <path className={styles.routeUnderlay} d={REQUEST_PATH} />
          <path className={styles.requestRoute} d={REQUEST_PATH} />
          <path
            className={styles.observationRoute}
            data-visible={active >= 5}
            d="M44 43.3 C40 35 33 34 30 22.7 M78 42 C80 35 76 24 66 22 M66 22 C70 17 82 18 87 9.3"
          />
          <g className={styles.courier}>
            <rect
              x="-1.65"
              y="-1.15"
              width="3.3"
              height="2.3"
              rx="0.25"
              fill="#fffaf0"
              stroke="#a65a36"
              strokeWidth="0.13"
            />
            <path
              d="M-1.5 -0.95 0 0.2 1.5 -0.95 M-1.5 0.95 -0.45 0.05 M1.5 0.95 0.45 0.05"
              stroke="#a65a36"
              strokeWidth="0.12"
            />
            <animateMotion
              path={REQUEST_PATH}
              dur="16s"
              repeatCount="indefinite"
            />
          </g>
        </svg>
        {chapters.map((station, index) => (
          <button
            key={station.id}
            type="button"
            className={styles.station}
            data-active={index === active}
            data-bell={index === 7}
            style={
              {
                left: `${station.x}%`,
                top: `${station.y}%`,
                "--pin-color": station.color,
              } as CSSProperties
            }
            onClick={() => onSelect(index)}
            aria-label={`Explore ${station.label}: ${station.station}`}
            aria-current={index === active ? "step" : undefined}
          >
            <span className={styles.pin}>{index + 1}</span>
            <span className={styles.stationLabel}>{station.station}</span>
          </button>
        ))}
      </div>
      <figcaption className={styles.sceneCaption}>
        <span className={styles.captionRule} />
        <span>Your app does the work. Foglamp helps you see it.</span>
        <span className={styles.captionRule} />
      </figcaption>
      <div className={styles.sceneLegend}>
        <span>
          <i />
          The request’s path
        </span>
        <span>
          <i />
          Recorded activity
        </span>
        <span>Illustrative data</span>
      </div>
    </figure>
  );
}

export function ObservabilityGuide() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [alertFiring, setAlertFiring] = useState(false);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const chapterRail = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 900px)");
    let observer: IntersectionObserver;
    function observe() {
      observer?.disconnect();
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries.find((candidate) => candidate.isIntersecting);
          if (entry)
            setActive(Number((entry.target as HTMLElement).dataset.chapter));
        },
        {
          rootMargin: compact.matches
            ? "-60% 0px -15% 0px"
            : "-35% 0px -45% 0px",
          threshold: 0,
        },
      );
      for (const section of sectionRefs.current)
        if (section) observer.observe(section);
    }
    observe();
    compact.addEventListener("change", observe);
    return () => {
      observer.disconnect();
      compact.removeEventListener("change", observe);
    };
  }, []);

  useEffect(() => {
    const rail = chapterRail.current;
    const item = rail?.children[active] as HTMLElement | undefined;
    if (!rail || !item) return;
    const left = item.offsetLeft - rail.offsetLeft;
    if (
      left < rail.scrollLeft ||
      left + item.offsetWidth > rail.scrollLeft + rail.clientWidth
    ) {
      rail.scrollTo({ left: left - 16, behavior: "instant" });
    }
  }, [active]);

  function selectChapter(index: number) {
    setActive(index);
    sectionRefs.current[index]?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
    sectionRefs.current[index]?.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${chapters[index].id}`);
  }

  return (
    <div className={styles.guide}>
      <header className={styles.hero}>
        <div className={styles.eyebrow}>
          <span className={styles.littleLamp} aria-hidden="true">
            ✳
          </span>
          A field guide by Foglamp
        </div>
        <div className={styles.heroColumns}>
          <h1>
            AI observability,
            <br />
            <em>illustrated.</em>
          </h1>
          <div className={styles.heroIntro}>
            <p>
              Follow a request through an AI app. See how traces, evaluations,
              and alerts help you understand what happened, and whether the
              answer was good.
            </p>
            <button
              type="button"
              onClick={() => selectChapter(0)}
              className={styles.followButton}
            >
              Follow a request
              <IconArrowDown size={16} stroke={1.7} />
            </button>
          </div>
        </div>
        <div className={styles.heroFoot}>
          <span>A small world. The whole picture.</span>
          <span>8 stops along the way</span>
        </div>
      </header>

      <nav className={styles.chapterNav} aria-label="Guide chapters">
        <div ref={chapterRail}>
          {chapters.map((chapter, index) => (
            <a
              key={chapter.id}
              href={`#${chapter.id}`}
              aria-current={active === index ? "step" : undefined}
              onClick={(event) => {
                event.preventDefault();
                selectChapter(index);
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {chapter.label}
            </a>
          ))}
        </div>
      </nav>

      <div className={styles.journey}>
        <div className={styles.sceneColumn}>
          <Workshop
            active={active}
            paused={paused}
            alertFiring={alertFiring}
            onPause={() => setPaused((value) => !value)}
            onSelect={selectChapter}
          />
        </div>
        <div className={styles.story}>
          {chapters.map((chapter, index) => (
            <section
              key={chapter.id}
              id={chapter.id}
              data-chapter={index}
              tabIndex={-1}
              ref={(node) => {
                sectionRefs.current[index] = node;
              }}
              className={styles.chapter}
              style={{ "--chapter-color": chapter.color } as CSSProperties}
              aria-labelledby={`${chapter.id}-title`}
            >
              <div className={styles.chapterEyebrow}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {chapter.label}
              </div>
              <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
              <p className={styles.description}>{chapter.description}</p>
              <ChapterExample
                index={index}
                alertFiring={alertFiring}
                onAlertChange={() => setAlertFiring((value) => !value)}
              />
              <p className={styles.chapterNote}>{chapter.note}</p>
              {chapter.href.startsWith("https:") ? (
                <a className={styles.featureLink} href={chapter.href}>
                  {chapter.link}
                  <IconArrowUpRight size={16} />
                </a>
              ) : (
                <Link
                  className={styles.featureLink}
                  href={chapter.href as Route}
                >
                  {chapter.link}
                  <IconArrowUpRight size={16} />
                </Link>
              )}
              {index < chapters.length - 1 ? (
                <button
                  className={styles.nextChapter}
                  type="button"
                  onClick={() => selectChapter(index + 1)}
                >
                  Next: {chapters[index + 1].label}
                  <IconArrowDown size={14} />
                </button>
              ) : null}
            </section>
          ))}
        </div>
      </div>

      <section className={styles.ending} aria-labelledby="guide-ending">
        <div className={styles.endingMotif} aria-hidden="true">
          <IconMail size={22} stroke={1.25} />
          <span />
          <IconCheck size={22} stroke={1.25} />
        </div>
        <p className={styles.endingEyebrow}>
          Now you can see the whole picture.
        </p>
        <h2 id="guide-ending">
          A little light on
          <br />
          <em>your AI app.</em>
        </h2>
        <p>
          Follow the work. Check the answers.
          <br />
          Know when something needs your attention.
        </p>
        <div className={styles.endingActions}>
          <Link href="/login">
            See it in Foglamp
            <IconArrowUpRight size={17} />
          </Link>
          <button type="button" onClick={() => selectChapter(0)}>
            Take another look
            <IconArrowRight size={16} />
          </button>
        </div>
        <span className={styles.endingFoot}>
          Open source. Built for the Vercel AI SDK.
        </span>
      </section>
    </div>
  );
}
