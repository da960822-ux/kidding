import { useEffect, useState } from 'react';
import { CTASection } from './components/CTASection';
import { FAQSection } from './components/FAQSection';
import { FeaturesSection } from './components/FeaturesSection';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { HowItWorksSection } from './components/HowItWorksSection';
import { landingContent } from './content';
import type { Locale } from './types';
import { WebApp } from './webapp/WebApp';

function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const savedLocale = window.localStorage.getItem('batmeori-locale');
    return savedLocale === 'vi' || savedLocale === 'ne' ? savedLocale : 'ko';
  });
  const content = landingContent[locale];
  const appMode = window.location.pathname !== '/' || new URLSearchParams(window.location.search).has('app');
  const appHref = '/start';

  useEffect(() => {
    if (!appMode) document.documentElement.lang = locale;
  }, [appMode, locale]);

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem('batmeori-locale', nextLocale);
  };

  if (appMode) return <WebApp initialLocale={locale} />;

  return (
    <div id="top" className={`min-h-screen bg-cream text-ink ${locale === 'ko' ? 'break-keep' : ''}`}>
      <a href="#main-content" className="sr-only z-[100] rounded-lg bg-deep px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        본문 바로가기
      </a>
      <Header content={content} locale={locale} onLocaleChange={changeLocale} appHref={appHref} />
      <main id="main-content">
        <HeroSection content={content} appHref={appHref} locale={locale} />
        <FeaturesSection content={content} />
        <CTASection content={content} appHref={appHref} />
        <HowItWorksSection content={content} />
        <FAQSection locale={locale} />
      </main>
      <Footer content={content} />
    </div>
  );
}

export default App;
