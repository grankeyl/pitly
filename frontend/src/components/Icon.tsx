// Иконки — SVG-ассеты из Figma (MEMGIFT / Bonly), окрашиваются через currentColor (CSS mask).
import arrowRight from '../assets/icons/arrow-right.svg'
import v2Pie from '../assets/icons/v2-pie.svg'
import v2Home from '../assets/icons/v2-home.svg'
import v2Category from '../assets/icons/v2-category.svg'
import v2Chevron from '../assets/icons/v2-chevron.svg'
import dkMenu from '../assets/icons/ds/menu-dark.svg'
import dkCaret from '../assets/icons/ds/caret-dark.svg'
import dkCompose from '../assets/icons/ds/compose-dark.svg'
import dkPlus from '../assets/icons/ds/plus-dark.svg'
import dkMic from '../assets/icons/ds/mic-dark.svg'
import dkVoice from '../assets/icons/ds/voice-dark.svg'
import dkCopy from '../assets/icons/ds/copy-dark.svg'
import dkShare from '../assets/icons/ds/share-dark.svg'
import dkSpeaker from '../assets/icons/ds/speaker-dark.svg'
import dkThumbUp from '../assets/icons/ds/thumbup-dark.svg'
import dkThumbDown from '../assets/icons/ds/thumbdown-dark.svg'
import dkRetry from '../assets/icons/ds/retry-dark.svg'
import navChats from '../assets/icons/ds/nav-chats.svg'
import navProjects from '../assets/icons/ds/nav-projects.svg'
import navArtifacts from '../assets/icons/ds/nav-artifacts.svg'
import navCode from '../assets/icons/ds/nav-code.svg'
import chevronR from '../assets/icons/ds/chevron-r.svg'
import search24 from '../assets/icons/ds/search-24.svg'
import settingsOrange from '../assets/icons/ds/settings-orange.svg'
import filter24 from '../assets/icons/ds/filter-24.svg'
import ghostDark from '../assets/icons/ds/ghost-dark.svg'
import greetingSpark from '../assets/icons/ds/greeting-spark.svg'
import dsX24 from '../assets/icons/ds/x-24.svg'
import dsCaretDown24 from '../assets/icons/ds/caret-down-24.svg'
import dsAdd24 from '../assets/icons/ds/add-24.svg'
import dsMic24 from '../assets/icons/ds/mic-24.svg'
import dsArrowRight24 from '../assets/icons/ds/arrow-right-24.svg'
import dsCheckDefault from '../assets/icons/ds/check-default.svg'
import dsCheckActive from '../assets/icons/ds/check-active.svg'
import dsRadioActive from '../assets/icons/ds/radio-active.svg'
import dsMenu24 from '../assets/icons/ds/menu-24.svg'
import dsCopy24 from '../assets/icons/ds/copy-24.svg'
import link from '../assets/icons/link.svg'
import upRight2 from '../assets/icons/up-right2.svg'
import tabHome2 from '../assets/icons/tab-home2.svg'
import tabStats from '../assets/icons/tab-stats.svg'
import tabPiggy from '../assets/icons/tab-piggy.svg'
import tabSliders from '../assets/icons/tab-sliders.svg'
import eye from '../assets/icons/eye.svg'
import copy from '../assets/icons/copy.svg'
import external from '../assets/icons/external.svg'
import clock from '../assets/icons/clock.svg'
import percent from '../assets/icons/percent.svg'
import grid from '../assets/icons/grid.svg'
import arrowDl from '../assets/icons/arrow-dl.svg'
import arrowUr from '../assets/icons/arrow-ur.svg'
import chart from '../assets/icons/chart.svg'
import wallet from '../assets/icons/wallet.svg'
import megaphone from '../assets/icons/megaphone.svg'
import ticket from '../assets/icons/ticket.svg'
import check from '../assets/icons/check.svg'
import close from '../assets/icons/close.svg'
import caretDown from '../assets/icons/caret-down.svg'
import caretUp from '../assets/icons/caret-up.svg'
import mic from '../assets/icons/mic.svg'
import plus from '../assets/icons/plus.svg'
import search2 from '../assets/icons/search2.svg'
import settings2 from '../assets/icons/settings2.svg'
import upRight from '../assets/icons/up-right.svg'
import badgeCoin from '../assets/icons/badge-coin.svg'
import badgeGem from '../assets/icons/badge-gem.svg'
import bell from '../assets/icons/bell.svg'
import chevronRight from '../assets/icons/chevron-right.svg'
import drawer from '../assets/icons/drawer.svg'
import home from '../assets/icons/home.svg'
import lamp from '../assets/icons/lamp.svg'
import logout from '../assets/icons/logout.svg'
import note from '../assets/icons/note.svg'
import search from '../assets/icons/search.svg'
import settings from '../assets/icons/settings.svg'
import shield from '../assets/icons/shield.svg'
import tabCompass from '../assets/icons/tab-compass.svg'
import tabHome from '../assets/icons/tab-home.svg'
import tabSide from '../assets/icons/tab-side.svg'
import tabStore from '../assets/icons/tab-store.svg'
import tabUser from '../assets/icons/tab-user.svg'
import user from '../assets/icons/user.svg'
import users from '../assets/icons/users.svg'

export const ICONS = {
  v2Pie,
  v2Home,
  v2Category,
  v2Chevron,
  dkMenu,
  dkCaret,
  dkCompose,
  dkPlus,
  dkMic,
  dkVoice,
  dkCopy,
  dkShare,
  dkSpeaker,
  dkThumbUp,
  dkThumbDown,
  dkRetry,
  navChats,
  navProjects,
  navArtifacts,
  navCode,
  chevronR,
  search24,
  settingsOrange,
  filter24,
  ghostDark,
  greetingSpark,
  dsX24,
  dsCaretDown24,
  dsAdd24,
  dsMic24,
  dsArrowRight24,
  dsCheckDefault,
  dsCheckActive,
  dsRadioActive,
  dsMenu24,
  dsCopy24,
  link,
  upRight2,
  tabHome2,
  tabStats,
  tabPiggy,
  tabSliders,
  eye,
  copy,
  external,
  clock,
  percent,
  grid,
  arrowDl,
  arrowUr,
  chart,
  wallet,
  megaphone,
  ticket,
  check,
  close,
  arrowRight,
  caretDown,
  caretUp,
  mic,
  plus,
  search2,
  settings2,
  upRight,
  badgeCoin,
  badgeGem,
  bell,
  chevronRight,
  drawer,
  home,
  lamp,
  logout,
  note,
  search,
  settings,
  shield,
  tabCompass,
  tabHome,
  tabSide,
  tabStore,
  tabUser,
  user,
  users,
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`ic ${className ?? ''}`}
      style={{ width: size, height: size, ['--ic' as string]: `url("${ICONS[name]}")` }}
    />
  )
}
