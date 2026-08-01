import {
  ArrowRight,
  BarChart3,
  Bell,
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
  Menu,
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

// ============================================================
// Os ícones da LP são os MESMOS do app: lucide-react.
// ============================================================
// Antes eram trinta `<path>` desenhados à mão "no espírito dos lucide". Isso
// tem três problemas que nenhum deles é estética:
//
//  1. Desenho à mão não tem grade. Cada ícone nascia com peso de traço, raio de
//     canto e área ótica um pouquinho diferentes — e é exatamente essa diferença
//     que faz um conjunto parecer amador quando os ícones se encontram na mesma
//     linha.
//  2. O app já usa lucide (`src/`, mesma versão). Duas linguagens de ícone entre
//     o produto e a página que vende o produto é a mesma inconsistência que a
//     gente evita nos tokens de cor.
//  3. Ícone novo virava desenho novo. Agora é um import.
//
// MARCA CONTINUA SENDO MARCA: o logo do Windows, os das plataformas, o do OBS e
// o megafone da Corneta NÃO vêm daqui — lucide não tem (nem deve ter) logotipo.
// Esses moram em `decor.tsx` com os traçados oficiais do simple-icons, que é a
// fonte de verdade dessas marcas.
//
// CONTRATO DE PINTURA: ícone de interface na LP é TRAÇO, nunca preenchido.
// Lucide é desenhado assim; um `fill` por cima transforma o "i" do Info numa
// bolinha sólida e o cifrão da moeda em disco.
//
// Duas exceções, e as duas têm motivo: LOGOTIPO (que é forma cheia por
// definição) e o par PLAY/PAUSA — são formas fechadas, e num botão de transporte
// o triângulo vazado lê como controle desligado.
//
// Todos entram decorativos (`aria-hidden`): quem carrega o significado é o texto
// ao lado. E nenhum define tamanho — quem dimensiona é o bloco que o usa, pelo
// CSS, como já era antes.

function wrap(Base: LucideIcon) {
  return function Icon() {
    return <Base aria-hidden="true" />;
  };
}

/** Logo do Windows — marca, não ícone de interface. Traçado do simple-icons
 *  (CC0), o mesmo catálogo que o app usa pras plataformas. Preenchido, e é o
 *  único lugar da LP onde `fill-current` num ícone continua certo. */
export function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

export const ArrowIcon = wrap(ArrowRight);
export const BellIcon = wrap(Bell);
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
export const MenuIcon = wrap(Menu);
export const MinimizeIcon = wrap(Minus);
export const MonitorIcon = wrap(MonitorPlay);
export const PauseIcon = wrap(Pause);
export const PlayIcon = wrap(Play);
export const PopoutIcon = wrap(PictureInPicture2);
export const PowerIcon = wrap(Power);
export const RadioIcon = wrap(Radio);
/** Raid é gente chegando de uma vez — o desenho anterior era uma seta batendo
 *  numa parede, que lê como "importar". */
export const RaidIcon = wrap(Users);
export const ReportIcon = wrap(BarChart3);
export const SaveIcon = wrap(Save);
export const SettingsIcon = wrap(Settings);
export const ShieldIcon = wrap(Shield);
export const SlidersIcon = wrap(Sliders);
export const StarIcon = wrap(Star);
/** "Fecha pra bandeja" é minimizar, não uma caixinha de sistema. */
export const TrayIcon = wrap(Minimize2);
export const ThemeIcon = wrap(Palette);
export const VolumeIcon = wrap(Volume2);
