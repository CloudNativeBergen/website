export interface WorkshopStats {
  workshopId: string
  workshopTitle: string
  capacity: number
  totalSignups: number
  confirmedCount: number
  waitlistCount: number
  experienceLevels: {
    beginner: number
    intermediate: number
    advanced: number
  }
  operatingSystems: {
    windows: number
    macos: number
    linux: number
  }
}
