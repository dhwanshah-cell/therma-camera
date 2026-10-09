import { useCallback, useEffect, useState } from 'react';
import { IntroSequence } from './components/IntroSequence';
import { OceanHero } from './components/OceanHero';
import { SiteFooter } from './components/SiteFooter';
import { SiteNavigation } from './components/SiteNavigation';
import { SponsorsSection } from './components/SponsorsSection';
import { VoyageTimeline } from './components/VoyageTimeline';
import { ScrollTrigger } from './motion';

// Deep links (e.g. /#sponsors) go straight to the content.
const skipIntro = () => window.location.hash.length > 1;

export function App() {
  const [introActive, setIntroActive] = useState(() => !skipIntro());
  const [revealed, setRevealed] = useState(() => skipIntro());
  const reveal = useCallback(() => setRevealed(true), []);
  const done = useCallback(() => setIntroActive(false), []);

  useEffect(() => {
    document.documentElement.classList.toggle('intro-lock', introActive);
    if (!introActive) ScrollTrigger.refresh();
  }, [introActive]);

  useEffect(() => {
    // Web fonts change text metrics; re-measure pins and the voyage route once they land.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
  }, []);

  return (
    <>
      <a href="#voyage" className="skip-link">Skip to content</a>
      {introActive && <IntroSequence onReveal={reveal} onDone={done} />}
      <SiteNavigation visible={revealed} />
      <main>
        <OceanHero revealed={revealed} />
        <VoyageTimeline />
        <SponsorsSection />
      </main>
      <SiteFooter />
      <div className="grain" aria-hidden />
    </>
  );
}
