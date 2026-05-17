import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Car, Calendar, IndianRupee } from 'lucide-react';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';

/**
 * v2 Bharat — post-trip with bilingual labels (Tamil first), icon-led
 * field groups, big numeric input for fare, vermilion submit.
 */
export function BharatPostTripPage() {
  return (
    <div className="mx-auto max-w-md pb-12">
      <header className="bg-primary px-4 pb-5 pt-4 text-primary-foreground">
        <Link to="/v6" aria-label="Back" className="mb-3 inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <BilingualText as="h1" ta="புதிய டிரிப்" en="New trip" size="lg" />
      </header>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-3 p-4">
        <Group icon={<MapPin className="size-5" />} ta="பயணம்" en="Route">
          <BilingualField ta="புறப்படும் இடம்" en="From" placeholder="Vellore" />
          <BilingualField ta="போகும் இடம்" en="To" placeholder="Chennai" />
        </Group>
        <Group icon={<Calendar className="size-5" />} ta="நேரம்" en="When">
          <BilingualField ta="பிக்அப் நேரம்" en="Pickup time" type="datetime-local" />
        </Group>
        <Group icon={<Car className="size-5" />} ta="வாகனம்" en="Vehicle">
          <BilingualField ta="வகை" en="Type" placeholder="Sedan" />
          <BilingualField ta="இருக்கைகள்" en="Seats" type="number" placeholder="4" />
        </Group>
        <Group icon={<IndianRupee className="size-5" />} ta="கட்டணம்" en="Fare">
          <BilingualField ta="ஒரு கி.மீ-க்கு" en="Per km" type="number" placeholder="14" />
          <BilingualField ta="பத்தா" en="Driver bata" type="number" placeholder="300" />
        </Group>

        <div className="pt-2">
          <button
            type="submit"
            className="h-14 w-full rounded-control text-[16px] font-semibold text-primary-foreground"
            style={{ background: 'var(--skin-bharat-vermilion)' }}
          >
            இடுகையிடு · Post trip
          </button>
        </div>
      </form>
    </div>
  );
}

function Group({ icon, ta, en, children }: { icon: React.ReactNode; ta: string; en: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-card bg-surface p-4 shadow-card">
      <legend className="flex items-center gap-2 px-2 text-primary">
        {icon}
        <BilingualText ta={ta} en={en} size="sm" />
      </legend>
      <div className="mt-2 space-y-2">{children}</div>
    </fieldset>
  );
}

function BilingualField({ ta, en, placeholder, type = 'text' }: { ta: string; en: string; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <BilingualText ta={ta} en={en} size="sm" className="mb-1" />
      <input
        type={type}
        placeholder={placeholder}
        className="block h-11 w-full rounded-control border border-border bg-surface-muted px-3 text-[15px] outline-none focus:border-primary"
      />
    </label>
  );
}

export default BharatPostTripPage;
