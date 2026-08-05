// PROTOTYPE — throwaway UI exploration for the social media dashboard
// (wayfinder ticket #790). Three variants behind ?variant=A|B|C, cycled by
// the floating bar or ←/→. Delete this whole directory once a winner is
// folded into the real implementation. Not linked from admin navigation.
import { SocialPrototypeClient } from './prototype-client'

export const metadata = { title: 'PROTOTYPE — Social composer' }

export default function SocialPrototypePage() {
  return <SocialPrototypeClient />
}
