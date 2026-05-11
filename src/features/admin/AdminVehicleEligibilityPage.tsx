import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Bell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const VEHICLES = [
  { driver: 'Ravi Kumar', vehicle: 'Innova 2020', year: 2020, retire: 2030, status: 'eligible', daysLeft: 1820 },
  { driver: 'Murugan Sivam', vehicle: 'Dzire 2016', year: 2016, retire: 2026, status: 'expiring_soon', daysLeft: 89 },
  { driver: 'Anbu Krishnan', vehicle: 'Etios 2015', year: 2015, retire: 2025, status: 'expiring_soon', daysLeft: 12 },
  { driver: 'Vasanth Selvam', vehicle: 'Indica 2014', year: 2014, retire: 2024, status: 'expired', daysLeft: -45 },
];

export function AdminVehicleEligibilityPage() {
  const navigate = useNavigate();
  const eligible = VEHICLES.filter((v) => v.status === 'eligible').length;
  const expiringSoon = VEHICLES.filter((v) => v.status === 'expiring_soon').length;
  const expired = VEHICLES.filter((v) => v.status === 'expired').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="font-semibold">Vehicle Eligibility</h1>
          <p className="text-xs text-muted-foreground">min_vehicle_year = 2015</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Eligible" value={eligible} variant="success" />
          <Stat label="Expiring soon" value={expiringSoon} variant="warning" />
          <Stat label="Expired" value={expired} variant="destructive" />
        </div>

        <Card>
          <CardContent>
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold text-sm">All Vehicles</div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline">
                  <Bell className="size-3.5" /> Notify
                </Button>
                <Button size="sm" variant="outline">
                  <Download className="size-3.5" /> CSV
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {VEHICLES.map((v) => (
                <div key={v.driver} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{v.driver}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.vehicle} · retires {v.retire}
                    </div>
                  </div>
                  <Badge
                    variant={
                      v.status === 'eligible'
                        ? 'success'
                        : v.status === 'expired'
                          ? 'destructive'
                          : 'warning'
                    }
                  >
                    {v.status === 'eligible'
                      ? 'Eligible'
                      : v.status === 'expired'
                        ? '❌ Expired'
                        : `⚠ ${v.daysLeft} days`}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'success' | 'warning' | 'destructive';
}) {
  const map = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    destructive: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`border rounded-xl p-3 text-center ${map[variant]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider font-semibold">{label}</div>
    </div>
  );
}
