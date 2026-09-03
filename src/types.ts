export type Locale = 'ko' | 'vi' | 'ne';

export interface FeatureContent {
  title: string;
  description: string;
}

export interface StepContent {
  title: string;
  description: string;
}

export interface LandingContent {
  localeName: string;
  tagline: string;
  nav: {
    about: string;
    features: string;
    how: string;
    faq: string;
  };
  start: string;
  hero: {
    line1: string;
    line2: string;
    description: string;
    freeStart: string;
    viewGuide: string;
    benefits: string[];
  };
  phone: {
    question: string;
    speak: string;
    write: string;
    recent: string;
    more: string;
    task: string;
    delivered: string;
    time: string;
  };
  features: {
    eyebrow: string;
    titleBefore: string;
    titleGreen: string;
    titleBlue: string;
    cards: FeatureContent[];
  };
  cta: {
    title: string;
    description: string;
    button: string;
  };
  how: {
    title: string;
    steps: StepContent[];
  };
  footer: {
    copyright: string;
    terms: string;
    privacy: string;
    contact: string;
  };
}
