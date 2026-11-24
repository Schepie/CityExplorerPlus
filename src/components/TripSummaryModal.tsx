import { Award, CheckCircle2, Clock, Gauge, MapPin, X } from 'lucide-react';
import { INTEREST_MAP } from '../data/interests';
import type { CompletedTrip } from '../types';
import { formatDistance, formatDuration } from '../utils/geo';

interface TripSummaryModalProps {
  trip: CompletedTrip;
  onClose: () => void;
}

export function TripSummaryModal({ trip, onClose }: TripSummaryModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-br from-teal-600 to-emerald-700 text-white p-5 relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit samenvatting"
            className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Award className="w-7 h-7 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-teal-100">
                Ritsamenvatting opgeslagen
              </div>
              <h3 className="text-lg font-black truncate">{trip.routeName}</h3>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
            <div>
              <MapPin className="w-4 h-4 text-teal-600 mx-auto mb-0.5" />
              <div className="text-base font-extrabold text-slate-900">
                {formatDistance(trip.distanceMeters)}
              </div>
              <div className="text-[11px] text-slate-500">Afgelegd</div>
            </div>
            <div className="border-x border-slate-200">
              <Clock className="w-4 h-4 text-teal-600 mx-auto mb-0.5" />
              <div className="text-base font-extrabold text-slate-900">
                {formatDuration(trip.durationSeconds)}
              </div>
              <div className="text-[11px] text-slate-500">Duur</div>
            </div>
            <div>
              <Gauge className="w-4 h-4 text-teal-600 mx-auto mb-0.5" />
              <div className="text-base font-extrabold text-slate-900">
                {trip.avgSpeedKmh.toFixed(1).replace('.', ',')}
              </div>
              <div className="text-[11px] text-slate-500">km/u gem.</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-600">
              Ontdekte bezienswaardigheden ({trip.discoveredPois.length}/{trip.totalPoisOnRoute})
            </div>
            {trip.discoveredPois.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-2.5">
                Geen POIs gepasseerd tijdens deze sessie.
              </p>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {trip.discoveredPois.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-800 bg-emerald-50/70 border border-emerald-200/70 rounded-xl px-2.5 py-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{INTEREST_MAP[p.category]?.emoji ?? '⭐'}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm cursor-pointer"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
