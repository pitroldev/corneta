import {
  ArrowRight,
  Check,
  Clapperboard,
  Crop,
  Download,
  Gauge,
  Globe,
  Info,
  Keyboard,
  Layers,
  Lock,
  Minimize2,
  Palette,
  PictureInPicture2,
  Play,
  Power,
  Save,
  Sheet,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Icons are decorative; their enclosing control supplies the accessible name.

function wrap(Base: LucideIcon) {
  return function Icon() {
    return <Base aria-hidden="true" />;
  };
}

// Windows logo from Simple Icons (CC0).
export function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

export const ArrowIcon = wrap(ArrowRight);
export const BoltIcon = wrap(Zap);
export const CheckIcon = wrap(Check);
export const ClapperIcon = wrap(Clapperboard);
export const CropIcon = wrap(Crop);
export const DownloadIcon = wrap(Download);
export const GaugeIcon = wrap(Gauge);
export const GlobeIcon = wrap(Globe);
export const InfoIcon = wrap(Info);
export const KeyboardIcon = wrap(Keyboard);
export const LayersIcon = wrap(Layers);
export const LockIcon = wrap(Lock);
export const PlayIcon = wrap(Play);
export const PopoutIcon = wrap(PictureInPicture2);
export const PowerIcon = wrap(Power);
export const SaveIcon = wrap(Save);
export const SheetIcon = wrap(Sheet);
export const TrayIcon = wrap(Minimize2);
export const ThemeIcon = wrap(Palette);
