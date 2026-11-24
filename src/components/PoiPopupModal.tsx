import { useEffect, useState } from 'react';
import { ExternalLink, MapPin, Square, Volume2, X } from 'lucide-react';
import { INTEREST_MAP } from '../data/interests';
import { audioService } from '../services/audioService';
import type { POI } from '../types';

interface PoiPopupModalProps {
  poi: POI;
  speechRate: number;
  isNearbyTrigger?: boolean;
  onClose: () => void;
}

export function PoiPopupModal({ poi, speechRate, isNearbyTrigger, onClose }: PoiPopupModalProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const cfg = INTEREST_MAP[poi.category];

  useEffect(() => {
    return audioService.onSpeakingChange(setIsSpeaking);
  }, []);

  const handleToggleSpeak = () => {
    audioService.unlock();
    if (isSpeaking) {
      audioService.stopSpeaking();
    } else {
      audioService.speakPoiNow(`${poi.name}. ${poi.description}`, speechRate);
    }
  };

  return (
    <div
      className={`fixed inset-x-0 z-50 flex justify-center px-3 pointer-events-none ${
        isNearbyTrigger ? 'bottom-40 sm:bottom-44' : 'top-20 sm:top-24'
      }`}
    >
      <div className="pointer-events-auto w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Optional Photo Banner */}
        {poi.imageUrl ? (
          <div className="relative h-36 w-full bg-slate-200">
            <img src={poi.imageUrl} alt={poi.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Sluit POI"
              className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/55 hover:bg-black/75 text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
              <div>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-white mb-1"
                  style={{ backgroundColor: cfg.color }}
                >
                  {cfg.emoji} {cfg.shortLabel}
                </span>
                <h3 className="text-base font-extrabold text-white leading-tight drop-shadow">
                  {poi.name}
                </h3>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="relative px-4 py-3 text-white flex items-center justify-between gap-2"
            style={{ backgroundColor: cfg.color }}
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold opacity-90 flex items-center gap-1">
                <span>{cfg.emoji}</span>
                <span>{isNearbyTrigger ? 'Je nadert een bezienswaardigheid!' : cfg.label}</span>
              </div>
              <h3 className="text-base font-extrabold truncate">{poi.name}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Sluit POI"
              className="p-1.5 rounded-full bg-black/20 hover:bg-black/35 text-white transition cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-4 space-y-3">
          {isNearbyTrigger && poi.imageUrl && (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
              <MapPin className="w-3.5 h-3.5" />
              Je bent nu in de buurt van deze POI!
            </div>
          )}

          <p className="text-sm text-slate-700 leading-relaxed max-h-36 overflow-y-auto">
            {poi.description}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleToggleSpeak}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl text-xs font-bold transition cursor-pointer ${
                isSpeaking
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}
            >
              {isSpeaking ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-white" />
                  Stop voorlezen
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  Lees voor
                </>
              )}
            </button>

            {poi.wikipediaUrl && (
              <a
                href={poi.wikipediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
              >
                Wiki
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              Sluit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
