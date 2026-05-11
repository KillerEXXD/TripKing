import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PhoneCall,
  Ghost,
  ShieldQuestion,
  MapPinned,
  MessageSquareDashed,
  Send,
  Star,
  Navigation,
  CheckCircle2,
  FilePlus2,
  Users,
  ArrowRight,
} from 'lucide-react';

/**
 * /for-agents — a public, shareable pitch page for trip managers / travel agents.
 * Mobile-first (agents open it from WhatsApp on a phone). English + Tamil toggle.
 * Screenshots: drop real PNGs in /public/screenshots/<name>.png and they'll be
 * picked up automatically; until then a labelled phone-frame placeholder shows.
 */

// =====================
// Copy — English + Tamil
// =====================

type Lang = 'en' | 'ta';

const COPY = {
  en: {
    nav: { try: 'Try it free' },
    hero: {
      kicker: 'For travel agents & trip managers',
      h1: 'Stop chasing drivers in WhatsApp groups.',
      sub: 'Post a trip → verified drivers come to you. Pick the best one. Track it live. Done.',
      cta: 'Try Trip King — free',
    },
    pain: {
      title: 'Sound familiar?',
      items: [
        { icon: PhoneCall, text: 'Calling 10 drivers to fill one trip — half don’t pick up.' },
        { icon: Ghost, text: 'Driver confirms… then ghosts. You lose the customer and look bad.' },
        { icon: ShieldQuestion, text: 'No idea if a driver is reliable until the customer complains.' },
        { icon: MapPinned, text: '“Where’s my car?” the customer asks — and you have to call the driver to find out.' },
        { icon: MessageSquareDashed, text: 'Trip details, fare, bata — all buried somewhere in a WhatsApp chat.' },
      ],
    },
    how: {
      title: 'How it works',
      steps: [
        { n: '1', icon: FilePlus2, h: 'Post a trip in 30 seconds', p: 'From, to, when, car type. That’s it.', shot: 'post-trip', shotLabel: 'Post a trip' },
        { n: '2', icon: Star, h: 'Verified drivers apply', p: 'See each driver’s rating, trips completed, vehicle and KYC. Pick the one you trust.', shot: 'applicants', shotLabel: 'Driver applicants + ratings' },
        { n: '3', icon: Navigation, h: 'Track the trip live', p: 'Where the car is right now, time to reach the destination, on-time / delayed status. Answer the customer instantly.', shot: 'tracking', shotLabel: 'Live tracking + ETA' },
        { n: '4', icon: CheckCircle2, h: 'Done — and recorded', p: 'Every trip kept with route, fare, bata, driver and timestamps. The passenger rates the driver. No more disputes.', shot: 'completed', shotLabel: 'Trip sheet + review' },
      ],
    },
    manage: {
      title: 'Your passengers. Your drivers. Plus the whole network when you need it.',
      items: [
        'Manage your own customer list and your regular drivers.',
        'See which drivers are available right now — in your city and in other cities for one-way / return trips.',
        'Send the passenger a clean trip confirmation card, not a forwarded mess.',
      ],
      shot: 'dashboard',
      shotLabel: 'Your trips, drivers & passengers',
    },
    why: {
      title: 'Why agents choose Trip King',
      rows: [
        { a: 'vs WhatsApp groups', b: 'Drivers come to you, already verified. Everything’s recorded. Live tracking. No scrolling, no chaos.' },
        { a: 'vs Savaari / Ola Outstation', b: 'You keep your customer. Trip King is your tool — not a middleman that takes your booking.' },
      ],
    },
    cost: {
      title: 'What it costs',
      body: 'Free to post trips. Free to manage your drivers and passengers. A small fee only when a trip is completed — no completion, no charge.',
    },
    finalCta: {
      h: 'Start posting trips — it’s free.',
      cta: 'Open Trip King',
      whatsapp: 'WhatsApp us for access',
      footnote: 'Built for Tamil Nadu travel agents.',
    },
  },
  ta: {
    nav: { try: 'இலவசமாக முயற்சி செய்யுங்கள்' },
    hero: {
      kicker: 'டிராவல் ஏஜெண்ட்கள் & டிரிப் மேனேஜர்களுக்கு',
      h1: 'வாட்ஸ்அப் குரூப்களில் டிரைவர்களைத் தேடுவதை நிறுத்துங்கள்.',
      sub: 'ஒரு டிரிப் போடுங்கள் → சரிபார்க்கப்பட்ட டிரைவர்கள் உங்களை அணுகுவார்கள். சிறந்தவரைத் தேர்வு செய்யுங்கள். நேரடியாகக் கண்காணியுங்கள்.',
      cta: 'Trip King — இலவசமாக முயற்சி செய்யுங்கள்',
    },
    pain: {
      title: 'இது உங்களுக்கு பரிச்சயமா?',
      items: [
        { icon: PhoneCall, text: 'ஒரு டிரிப்புக்கு 10 டிரைவர்களை அழைக்கிறீர்கள் — பாதி பேர் போனை எடுப்பதில்லை.' },
        { icon: Ghost, text: 'டிரைவர் ஒத்துக்கொண்டு… பிறகு காணாமல் போகிறார். வாடிக்கையாளரை இழக்கிறீர்கள், மானம் போகிறது.' },
        { icon: ShieldQuestion, text: 'வாடிக்கையாளர் புகார் சொல்லும் வரை டிரைவர் நம்பகமானவரா என்று தெரியாது.' },
        { icon: MapPinned, text: '“என் கார் எங்கே?” என வாடிக்கையாளர் கேட்கிறார் — பதில் சொல்ல டிரைவரை அழைக்க வேண்டியிருக்கிறது.' },
        { icon: MessageSquareDashed, text: 'டிரிப் விவரம், கட்டணம், பத்தா — எல்லாம் வாட்ஸ்அப் சாட்டில் எங்கோ புதைந்திருக்கிறது.' },
      ],
    },
    how: {
      title: 'இது எப்படி வேலை செய்கிறது',
      steps: [
        { n: '1', icon: FilePlus2, h: '30 விநாடியில் டிரிப் போடுங்கள்', p: 'எங்கிருந்து, எங்கே, எப்போது, கார் வகை. அவ்வளவுதான்.', shot: 'post-trip', shotLabel: 'டிரிப் போடுங்கள்' },
        { n: '2', icon: Star, h: 'சரிபார்க்கப்பட்ட டிரைவர்கள் விண்ணப்பிக்கிறார்கள்', p: 'ஒவ்வொரு டிரைவரின் ரேட்டிங், முடித்த டிரிப்புகள், வாகனம், KYC பாருங்கள். நம்பகமானவரைத் தேர்வு செய்யுங்கள்.', shot: 'applicants', shotLabel: 'டிரைவர் விண்ணப்பதாரர்கள் + ரேட்டிங்' },
        { n: '3', icon: Navigation, h: 'டிரிப்பை நேரடியாகக் கண்காணியுங்கள்', p: 'கார் இப்போது எங்கே, இலக்கை அடைய எவ்வளவு நேரம், சரியான நேரத்திலா / தாமதமா. வாடிக்கையாளருக்கு உடனே பதில் சொல்லுங்கள்.', shot: 'tracking', shotLabel: 'நேரடி கண்காணிப்பு + ETA' },
        { n: '4', icon: CheckCircle2, h: 'முடிந்தது — பதிவும் ஆனது', p: 'ஒவ்வொரு டிரிப்பும் வழி, கட்டணம், பத்தா, டிரைவர், நேரங்களுடன் பதிவாகிறது. பயணி டிரைவரை மதிப்பிடுகிறார். இனி தகராறு இல்லை.', shot: 'completed', shotLabel: 'டிரிப் ஷீட் + மதிப்பீடு' },
      ],
    },
    manage: {
      title: 'உங்கள் பயணிகள். உங்கள் டிரைவர்கள். தேவைப்படும்போது முழு நெட்வொர்க்கும்.',
      items: [
        'உங்கள் சொந்த வாடிக்கையாளர் பட்டியலையும் வழக்கமான டிரைவர்களையும் நிர்வகியுங்கள்.',
        'இப்போது யார் கிடைக்கிறார்கள் என்று பாருங்கள் — உங்கள் ஊரிலும், ஒன்-வே / திரும்பும் டிரிப்புகளுக்கு மற்ற ஊர்களிலும்.',
        'பயணிக்கு ஃபார்வர்ட் செய்த குழப்பமான மெசேஜ் அல்ல — சுத்தமான டிரிப் கன்ஃபர்மேஷன் கார்டு அனுப்புங்கள்.',
      ],
      shot: 'dashboard',
      shotLabel: 'உங்கள் டிரிப்புகள், டிரைவர்கள் & பயணிகள்',
    },
    why: {
      title: 'ஏஜெண்ட்கள் ஏன் Trip King-ஐத் தேர்வு செய்கிறார்கள்',
      rows: [
        { a: 'வாட்ஸ்அப் குரூப்களை விட', b: 'டிரைவர்கள் உங்களை அணுகுகிறார்கள், ஏற்கனவே சரிபார்க்கப்பட்டவர்கள். எல்லாம் பதிவாகிறது. நேரடி கண்காணிப்பு. ஸ்க்ரோல் இல்லை, குழப்பம் இல்லை.' },
        { a: 'Savaari / Ola Outstation-ஐ விட', b: 'உங்கள் வாடிக்கையாளர் உங்களிடமே இருக்கிறார். Trip King உங்கள் கருவி — உங்கள் புக்கிங்கை எடுக்கும் இடைத்தரகர் அல்ல.' },
      ],
    },
    cost: {
      title: 'கட்டணம் என்ன',
      body: 'டிரிப் போடுவது இலவசம். டிரைவர்கள் & பயணிகளை நிர்வகிப்பது இலவசம். டிரிப் முடிந்தால் மட்டுமே சிறு கட்டணம் — முடியவில்லை என்றால் கட்டணம் இல்லை.',
    },
    finalCta: {
      h: 'டிரிப்புகள் போட ஆரம்பியுங்கள் — இலவசம்.',
      cta: 'Trip King திறக்க',
      whatsapp: 'அணுகலுக்கு வாட்ஸ்அப் செய்யுங்கள்',
      footnote: 'தமிழ்நாடு டிராவல் ஏஜெண்ட்களுக்காக உருவாக்கப்பட்டது.',
    },
  },
} as const;

// CONFIGURE: your WhatsApp number for "request access" (digits only, with country code)
const WHATSAPP_NUMBER = '910000000000';

// =====================
// Phone-frame screenshot placeholder
// Drop a real PNG at /public/screenshots/<name>.png to replace the placeholder.
// =====================

function PhoneShot({ name, label }: { name: string; label: string }) {
  const [hasImg, setHasImg] = useState(true);
  return (
    <div className="mx-auto w-full max-w-[260px]">
      <div className="rounded-[2rem] border-8 border-gray-900 bg-gray-900 shadow-xl overflow-hidden">
        <div className="aspect-[9/19.5] bg-gradient-to-b from-emerald-50 to-white relative">
          {hasImg ? (
            <img
              src={`/screenshots/${name}.png`}
              alt={label}
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setHasImg(false)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Navigation className="size-5 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">{label}</span>
              <span className="text-[10px] text-gray-400">screenshot</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================
// Page
// =====================

export function ForAgentsPage() {
  const [lang, setLang] = useState<Lang>('en');
  const t = COPY[lang];

  useEffect(() => {
    document.title = 'Trip King — for travel agents';
    return () => { document.title = 'Trip King — Cab & Trip Marketplace'; };
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <span className="text-emerald-600">Trip</span>King
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/website"
              className="hidden sm:inline-flex text-xs font-semibold text-gray-600 hover:text-gray-900"
            >
              {lang === 'en' ? 'See the full site →' : 'முழு தளத்தைப் பாருங்கள் →'}
            </Link>
            <button
              onClick={() => setLang(lang === 'en' ? 'ta' : 'en')}
              className="text-xs font-semibold rounded-full border px-3 py-1.5 text-gray-600 hover:bg-gray-50"
            >
              {lang === 'en' ? 'தமிழ்' : 'English'}
            </button>
            <Link
              to="/"
              className="hidden sm:inline-flex text-xs font-semibold rounded-full bg-emerald-600 text-white px-3 py-1.5"
            >
              {t.nav.try}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        {/* Hero */}
        <section className="pt-8 pb-10 text-center">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 rounded-full px-3 py-1">
            {t.hero.kicker}
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold leading-tight">{t.hero.h1}</h1>
          <p className="mt-3 text-base sm:text-lg text-gray-600 max-w-xl mx-auto">{t.hero.sub}</p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold px-6 py-3.5 text-base shadow-sm active:scale-[0.99]"
            >
              {t.hero.cta} <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-8">
            <PhoneShot name="applicants" label={t.how.steps[1].shotLabel} />
          </div>
        </section>

        {/* Pain */}
        <section className="py-8 border-t">
          <h2 className="text-xl font-bold text-center">{t.pain.title}</h2>
          <ul className="mt-5 space-y-3 max-w-xl mx-auto">
            {t.pain.items.map((it, i) => {
              const Icon = it.icon;
              return (
                <li key={i} className="flex items-start gap-3 rounded-xl bg-gray-50 p-3.5">
                  <span className="mt-0.5 size-8 shrink-0 rounded-lg bg-red-50 flex items-center justify-center">
                    <Icon className="size-4 text-red-500" />
                  </span>
                  <span className="text-sm text-gray-700">{it.text}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* How it works */}
        <section className="py-8 border-t">
          <h2 className="text-xl font-bold text-center">{t.how.title}</h2>
          <div className="mt-6 space-y-10">
            {t.how.steps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="grid sm:grid-cols-2 gap-5 items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="size-8 rounded-full bg-emerald-600 text-white font-bold text-sm flex items-center justify-center">{s.n}</span>
                      <Icon className="size-5 text-emerald-600" />
                    </div>
                    <h3 className="mt-3 text-lg font-bold">{s.h}</h3>
                    <p className="mt-1.5 text-sm text-gray-600">{s.p}</p>
                  </div>
                  <PhoneShot name={s.shot} label={s.shotLabel} />
                </div>
              );
            })}
          </div>
        </section>

        {/* Manage everything */}
        <section className="py-8 border-t">
          <div className="grid sm:grid-cols-2 gap-5 items-center">
            <div>
              <div className="flex items-center gap-2 text-emerald-600"><Users className="size-5" /></div>
              <h2 className="mt-2 text-xl font-bold">{t.manage.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {t.manage.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
            <PhoneShot name={t.manage.shot} label={t.manage.shotLabel} />
          </div>
        </section>

        {/* Why choose */}
        <section className="py-8 border-t">
          <h2 className="text-xl font-bold text-center">{t.why.title}</h2>
          <div className="mt-5 space-y-3 max-w-xl mx-auto">
            {t.why.rows.map((r, i) => (
              <div key={i} className="rounded-xl border p-4">
                <div className="text-sm font-bold text-gray-900">{r.a}</div>
                <div className="mt-1 text-sm text-gray-600">{r.b}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Cost */}
        <section className="py-8 border-t">
          <div className="rounded-2xl bg-emerald-50 p-6 text-center max-w-xl mx-auto">
            <h2 className="text-lg font-bold text-emerald-800">{t.cost.title}</h2>
            <p className="mt-2 text-sm text-emerald-900/80">{t.cost.body}</p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-10 border-t text-center">
          <h2 className="text-2xl font-extrabold">{t.finalCta.h}</h2>
          <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-semibold px-6 py-3.5"
            >
              {t.finalCta.cta} <ArrowRight className="size-4" />
            </Link>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi, I run a travel agency — I want to try Trip King for posting trips.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 text-emerald-700 font-semibold px-6 py-3.5"
            >
              <Send className="size-4" /> {t.finalCta.whatsapp}
            </a>
          </div>
          <p className="mt-6 text-xs text-gray-400">{t.finalCta.footnote}</p>
        </section>
      </main>
    </div>
  );
}

export default ForAgentsPage;
