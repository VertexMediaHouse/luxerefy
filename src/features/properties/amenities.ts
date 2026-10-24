import type { ComponentType } from 'react'
import {
  AirVent,
  Bath,
  BatteryCharging,
  Bell,
  Building2,
  Car,
  Dumbbell,
  Fence,
  Flower2,
  Gamepad2,
  Heart,
  Heater,
  Key,
  Leaf,
  Lightbulb,
  Lock,
  ParkingCircle,
  ShieldCheck,
  Sparkles,
  TreePine,
  Umbrella,
  UtensilsCrossed,
  Waves,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react'

export type AmenityIcon = ComponentType<{ className?: string }>

export const AMENITIES: { key: string; icon: AmenityIcon }[] = [
  { key: 'Swimming pool', icon: Waves },
  { key: 'Gym', icon: Dumbbell },
  { key: 'Clubhouse', icon: UtensilsCrossed },
  { key: 'Garden', icon: Flower2 },
  { key: 'Parking', icon: ParkingCircle },
  { key: 'Security', icon: ShieldCheck },
  { key: 'CCTV', icon: Lock },
  { key: 'Power backup', icon: Zap },
  { key: 'Lift', icon: Building2 },
  { key: 'Home automation', icon: Lightbulb },
  { key: 'Wi-Fi', icon: Wifi },
  { key: 'Air conditioning', icon: AirVent },
  { key: 'Modular kitchen', icon: UtensilsCrossed },
  { key: 'Servant room', icon: Key },
  { key: 'Private pool', icon: Waves },
  { key: 'Terrace', icon: Umbrella },
  { key: 'Landscaping', icon: TreePine },
  { key: 'Jogging track', icon: Heart },
  { key: 'Kids play area', icon: Gamepad2 },
  { key: 'Rain water harvesting', icon: Leaf },
  { key: 'Car wash', icon: Car },
  { key: 'Spa', icon: Sparkles },
  { key: 'Jacuzzi', icon: Bath },
  { key: 'Covered parking', icon: Car },
  { key: 'Fence', icon: Fence },
  { key: 'Geyser', icon: Heater },
  { key: 'Cross ventilation', icon: Wind },
  { key: 'EV charging', icon: BatteryCharging },
  { key: 'Concierge', icon: Bell },
  { key: 'Staff quarters', icon: Key },
  { key: 'Gymnasium', icon: Dumbbell },
  { key: 'Landscaped garden', icon: TreePine },
  { key: '24×7 security', icon: ShieldCheck },
]

export function getAmenityIcon(name: string): AmenityIcon {
  const norm = name.trim().toLowerCase()
  const exact = AMENITIES.find(a => a.key.toLowerCase() === norm)
  if (exact) return exact.icon

  // Fallback matching by keyword
  if (norm.includes('pool') || norm.includes('swim')) return Waves
  if (norm.includes('gym') || norm.includes('fitness') || norm.includes('workout')) return Dumbbell
  if (norm.includes('club') || norm.includes('lounge')) return UtensilsCrossed
  if (norm.includes('garden') || norm.includes('lawn')) return Flower2
  if (norm.includes('landscape') || norm.includes('tree') || norm.includes('park')) return TreePine
  if (norm.includes('ev') || norm.includes('charging')) return BatteryCharging
  if (norm.includes('car') || norm.includes('parking') || norm.includes('garage')) return ParkingCircle
  if (norm.includes('security') || norm.includes('guard') || norm.includes('safety')) return ShieldCheck
  if (norm.includes('cctv') || norm.includes('camera') || norm.includes('surveillance')) return Lock
  if (norm.includes('power') || norm.includes('backup') || norm.includes('generator')) return Zap
  if (norm.includes('automation') || norm.includes('smart')) return Lightbulb
  if (norm.includes('concierge') || norm.includes('bell') || norm.includes('reception')) return Bell
  if (norm.includes('staff') || norm.includes('servant') || norm.includes('quarter') || norm.includes('maid')) return Key
  if (norm.includes('spa') || norm.includes('sauna') || norm.includes('steam')) return Sparkles
  if (norm.includes('bath') || norm.includes('jacuzzi')) return Bath
  if (norm.includes('lift') || norm.includes('elevator')) return Building2
  if (norm.includes('wifi') || norm.includes('internet')) return Wifi
  if (norm.includes('ac') || norm.includes('air')) return AirVent
  if (norm.includes('kitchen')) return UtensilsCrossed
  if (norm.includes('terrace') || norm.includes('roof') || norm.includes('balcony')) return Umbrella
  if (norm.includes('jog') || norm.includes('track') || norm.includes('walk')) return Heart
  if (norm.includes('kid') || norm.includes('play') || norm.includes('game') || norm.includes('child')) return Gamepad2
  if (norm.includes('water') || norm.includes('rain') || norm.includes('harvest')) return Leaf
  if (norm.includes('fence')) return Fence
  if (norm.includes('geyser') || norm.includes('heater')) return Heater
  if (norm.includes('ventilation') || norm.includes('breeze') || norm.includes('wind')) return Wind

  return Sparkles
}
