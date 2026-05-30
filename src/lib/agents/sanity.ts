import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import type { AgentConfiguration } from '@/lib/conference/types'

export async function getAgentConfig(conferenceId: string): Promise<{
  config?: AgentConfiguration
  error?: Error
}> {
  try {
    const conference = await clientRead.fetch<{
      agentConfig?: AgentConfiguration
    }>(`*[_type == "conference" && _id == $conferenceId][0]{ agentConfig }`, {
      conferenceId,
    })

    return { config: conference?.agentConfig }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function updateAgentConfig(
  conferenceId: string,
  config: AgentConfiguration,
): Promise<{
  config?: AgentConfiguration
  error?: Error
}> {
  try {
    await clientWrite.patch(conferenceId).set({ agentConfig: config }).commit()

    return { config }
  } catch (error) {
    return { error: error as Error }
  }
}
