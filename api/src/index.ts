import { createApi } from './yoga'

const yoga = createApi()

export default {
  fetch: (request: Request) => yoga.fetch(request),
}
