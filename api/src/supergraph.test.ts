import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { compose, publicContract, publicSdl } from './supergraph'

// Node's graphql (CJS), the copy @graphql-tools/utils loads; Vite's ESM copy
// would trip graphql's cross-realm check.
const { buildSchema, printSchema } = createRequire(import.meta.url)(
  'graphql',
) as typeof import('graphql')

describe('publicContract', () => {
  it('drops @tag(internal) types, fields, args and enum values, and unreachable types', () => {
    const schema = buildSchema(`
      directive @tag(name: String!) repeatable on OBJECT | INTERFACE | FIELD_DEFINITION | ARGUMENT_DEFINITION | ENUM_VALUE | INPUT_FIELD_DEFINITION | ENUM | UNION | SCALAR | INPUT_OBJECT
      type Query {
        a(keep: Int, secret: Int @tag(name: "internal")): Kind
        node: Node
        hidden: Hidden @tag(name: "internal")
      }
      enum Kind { PUBLIC SECRET @tag(name: "internal") }
      interface Node @tag(name: "internal") { id: ID }
      type Hidden { id: ID }
    `)
    const sdl = printSchema(publicContract(schema))
    expect(sdl).toContain('a(keep: Int): Kind')
    expect(sdl).toContain('PUBLIC')
    for (const gone of ['secret', 'SECRET', 'Node', 'Hidden']) {
      expect(sdl).not.toContain(gone)
    }
  })
})

describe('compose', () => {
  it('composes the cfp subgraph into the public supergraph', () => {
    expect(compose()).toMatch(/CFP @join__graph\(name: "cfp"/)
    const pub = buildSchema(publicSdl())
    expect(pub.getQueryType()!.getFields().cfp).toBeDefined()
    const talk = pub.getType('CfpTalk') as unknown as {
      getFields(): Record<string, unknown>
    }
    expect(Object.keys(talk.getFields()).sort()).toEqual([
      'audiences',
      'format',
      'id',
      'language',
      'level',
      'speakers',
      'title',
      'topicIds',
    ])
  })

  it('composes the sponsors subgraph into the public supergraph', () => {
    expect(compose()).toMatch(/SPONSORS @join__graph\(name: "sponsors"/)
    const pub = buildSchema(publicSdl())
    const query = pub.getQueryType()!.getFields()
    expect(query.sponsors).toBeDefined()
    expect(query.sponsorTiers).toBeDefined()
    const fields = (name: string) =>
      Object.keys(
        (
          pub.getType(name) as unknown as {
            getFields(): Record<string, unknown>
          }
        ).getFields(),
      ).sort()
    expect(fields('Sponsor')).toEqual([
      'id',
      'logoBrightUrl',
      'logoUrl',
      'name',
      'website',
    ])
  })

  it('composes the program subgraph into the public supergraph', () => {
    expect(compose()).toMatch(/PROGRAM @join__graph\(name: "program"/)
    const query = buildSchema(publicSdl()).getQueryType()!.getFields()
    for (const f of ['program', 'talk', 'speakers', 'speaker', 'speakerBySlug'])
      expect(query[f]).toBeDefined()
    const speaker = buildSchema(publicSdl()).getType('Speaker') as unknown as {
      getFields(): Record<string, unknown>
    }
    expect(Object.keys(speaker.getFields()).sort()).toEqual([
      'bio',
      'flags',
      'galleryImages',
      'id',
      'image',
      'links',
      'name',
      'slug',
      'talks',
      'title',
      'updatedAt',
    ])
  })
})
