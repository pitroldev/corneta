import {
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Crop,
  Download,
  Eye,
  Gauge,
  Globe,
  Heart,
  Info,
  Keyboard,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  Minimize2,
  Minus,
  MonitorPlay,
  Palette,
  Pause,
  PictureInPicture2,
  Play,
  Power,
  Radio,
  Save,
  Settings,
  Shield,
  Sliders,
  Square,
  Star,
  Users,
  Volume2,
  X,
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
export const ChatIcon = wrap(MessageSquare);
export const CheckIcon = wrap(Check);
export const CloseIcon = wrap(X);
export const CoinIcon = wrap(CircleDollarSign);
export const CropIcon = wrap(Crop);
export const DownloadIcon = wrap(Download);
export const EyeIcon = wrap(Eye);
export const GaugeIcon = wrap(Gauge);
export const GlobeIcon = wrap(Globe);
export const HeartIcon = wrap(Heart);
export const InfoIcon = wrap(Info);
export const KeyboardIcon = wrap(Keyboard);
export const LayersIcon = wrap(Layers);
export const LoaderIcon = wrap(Loader2);
export const LockIcon = wrap(Lock);
export const MaximizeIcon = wrap(Square);
export const MinimizeIcon = wrap(Minus);
export const MonitorIcon = wrap(MonitorPlay);
export const PauseIcon = wrap(Pause);
export const PlayIcon = wrap(Play);
export const PopoutIcon = wrap(PictureInPicture2);
export const PowerIcon = wrap(Power);
export const RadioIcon = wrap(Radio);
export const RaidIcon = wrap(Users);
export const ReportIcon = wrap(BarChart3);
export const SaveIcon = wrap(Save);
export const SettingsIcon = wrap(Settings);
export const ShieldIcon = wrap(Shield);
export const SlidersIcon = wrap(Sliders);
export const StarIcon = wrap(Star);
export const TrayIcon = wrap(Minimize2);
export const ThemeIcon = wrap(Palette);
export const VolumeIcon = wrap(Volume2);
