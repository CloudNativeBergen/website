/**
 * @vitest-environment node
 *
 * REPO-WIDE INVARIANT (#851): a schema field declared `weak: true` must be
 * written weak by the API too.
 *
 * WHY THIS EXISTS. `weak: true` in a `sanity/schemaTypes/*.ts` field definition
 * governs Sanity STUDIO writes and validation. It does NOT govern writes made
 * through the client API: reference strength is a property of the STORED ref
 * object (`_weak: true`), so `createReference(id)` — which emits only
 * `{ _type, _ref }` — produces a STRONG reference no matter what the schema
 * says. A strong reference blocks deletion of its target, so a strong ref to a
 * `speaker` makes that speaker undeletable and defeats GDPR erasure.
 *
 * That gap is not hypothetical. Migration 041 weakened these exact fields in the
 * dataset and passed its own verification, while the code kept writing strong
 * refs — production had accumulated 408 strong `notification.recipient` and 373
 * strong `notification.actor` refs by the time #851 was filed. Nothing in the
 * suite asserted the shape of what gets written, so the schema and the writer
 * were free to disagree indefinitely.
 *
 * WHAT THIS CHECKS. It parses the schema files for every `(documentType, field)`
 * pair declared `weak: true`, then parses every non-test source file under
 * `src/` and flags any object literal that both
 *   (a) self-identifies via `_type: '<documentType>'`, and
 *   (b) assigns one of that type's weak fields a reference value that is
 *       demonstrably strong — a bare `createReference(...)` call, or a literal
 *       `{ _type: 'reference', _ref: ... }` with no `_weak: true`.
 *
 * WHAT IT DOES NOT CHECK — read this before trusting a green run:
 *  - `.patch(id).set({ field: ... })` carries no `_type`, so a patch that
 *    re-strengthens an existing document is INVISIBLE here. Those paths are
 *    covered behaviourally instead (see the notification suite, which asserts
 *    the `set` payload of the message-collapse upsert).
 *  - A ref built indirectly (a variable, a helper, a spread from elsewhere) is
 *    not resolved and is left alone rather than guessed at.
 * It is a floor, not a proof: it catches the literal shape that caused #851 and
 * every future copy of it, and it cannot catch reference strength in general.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SCHEMA_DIR = join(REPO_ROOT, 'sanity', 'schemaTypes')
const SRC_DIR = join(REPO_ROOT, 'src')

function parseSource(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
}

function parse(file: string): ts.SourceFile {
  return parseSource(file, readFileSync(file, 'utf8'))
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

/** The string value of `prop: 'literal'`, or undefined for anything else. */
function stringProp(
  obj: ts.ObjectLiteralExpression,
  name: string,
): string | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (prop.name.getText() !== name) continue
    const init = prop.initializer
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      return init.text
    }
  }
  return undefined
}

function hasTrueProp(obj: ts.ObjectLiteralExpression, name: string): boolean {
  return obj.properties.some(
    (prop) =>
      ts.isPropertyAssignment(prop) &&
      prop.name.getText() === name &&
      prop.initializer.kind === ts.SyntaxKind.TrueKeyword,
  )
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      out.push(...tsFilesUnder(full))
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name) &&
      !/\.stories\.tsx?$/.test(entry.name)
    ) {
      out.push(full)
    }
  }
  return out
}

/**
 * `{ documentType -> Set<weak field name> }`, read from the schema sources.
 *
 * A `defineType({ name: 'x', type: 'document', fields: [...] })` contributes its
 * top-level `defineField({ name: 'f', type: 'reference', weak: true })` names.
 * Nested object types (e.g. `conversationParticipant`) are keyed under their own
 * type name; they are only checked where a literal declares that `_type`.
 */
function collectWeakFields(): Map<string, Set<string>> {
  const byType = new Map<string, Set<string>>()

  for (const file of readdirSync(SCHEMA_DIR).filter((f) => /\.ts$/.test(f))) {
    const source = parse(join(SCHEMA_DIR, file))

    walk(source, (node) => {
      // Find the type-level object literal: it has both `name` and `fields`.
      if (!ts.isObjectLiteralExpression(node)) return
      const typeName = stringProp(node, 'name')
      if (!typeName) return
      const fieldsProp = node.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'fields',
      ) as ts.PropertyAssignment | undefined
      if (!fieldsProp || !ts.isArrayLiteralExpression(fieldsProp.initializer)) {
        return
      }

      const weak = byType.get(typeName) ?? new Set<string>()
      for (const element of fieldsProp.initializer.elements) {
        // `defineField({...})` or a bare `{...}`.
        const literal = ts.isCallExpression(element)
          ? element.arguments.find(ts.isObjectLiteralExpression)
          : ts.isObjectLiteralExpression(element)
            ? element
            : undefined
        if (!literal) continue
        const fieldName = stringProp(literal, 'name')
        if (fieldName && hasTrueProp(literal, 'weak')) weak.add(fieldName)
      }
      if (weak.size > 0) byType.set(typeName, weak)
    })
  }

  return byType
}

/** A ref value we can prove is STRONG, or null when we cannot tell. */
function strongRefReason(value: ts.Expression): string | null {
  // `createReference(x)` / `createReferenceWithKey(x)` with nothing added.
  if (ts.isCallExpression(value)) {
    const callee = value.expression.getText()
    if (callee === 'createReference' || callee === 'createReferenceWithKey') {
      return `${callee}(...) with no _weak`
    }
    return null
  }

  if (ts.isObjectLiteralExpression(value)) {
    if (hasTrueProp(value, '_weak')) return null

    // A spread of `createReference(...)` without `_weak: true` beside it.
    const spreadsRef = value.properties.some(
      (p) =>
        ts.isSpreadAssignment(p) &&
        ts.isCallExpression(p.expression) &&
        /^createReference(WithKey)?$/.test(p.expression.expression.getText()),
    )
    if (spreadsRef) return 'spread createReference(...) with no _weak: true'

    // A hand-built `{ _type: 'reference', _ref: ... }`.
    if (stringProp(value, 'reference') === undefined) {
      const isRefLiteral =
        stringProp(value, '_type') === 'reference' &&
        value.properties.some(
          (p) => ts.isPropertyAssignment(p) && p.name.getText() === '_ref',
        )
      if (isRefLiteral) return 'reference literal with no _weak: true'
    }
    return null
  }

  // Identifier, conditional, spread from elsewhere: not resolvable here.
  return null
}

describe('schema `weak: true` must be honoured by API writes (#851)', () => {
  const weakFieldsByType = collectWeakFields()

  it('reads the weak-field declarations out of the schema (guards the guard)', () => {
    // If this ever empties out, every other assertion below passes vacuously.
    expect(weakFieldsByType.size).toBeGreaterThan(0)
    expect(weakFieldsByType.get('notification')).toEqual(
      new Set(['recipient', 'actor', 'relatedProposal']),
    )
    expect(weakFieldsByType.get('conversation')).toEqual(
      new Set([
        'proposal',
        'createdBy',
        'subjectSpeaker',
        'assignedTo',
        'archivedBy',
      ]),
    )
    expect(weakFieldsByType.get('message')).toEqual(new Set(['author']))
  })

  it('no source file writes a strong reference into a weak-declared field', () => {
    const violations: string[] = []
    const allWeakFieldNames = new Set(
      [...weakFieldsByType.values()].flatMap((s) => [...s]),
    )

    for (const file of tsFilesUnder(SRC_DIR)) {
      const text = readFileSync(file, 'utf8')

      // CHEAP PRE-FILTER, purely for speed — parsing every file under src/ with
      // the TypeScript compiler times out on a cold CI runner. This cannot
      // create a false negative: a violation is BY CONSTRUCTION an object
      // literal containing a `_type:` property AND a property whose name is a
      // weak-declared field, so both substrings must be present in the file's
      // text for the AST walk below to have anything to report.
      if (!text.includes('_type:')) continue
      if (![...allWeakFieldNames].some((f) => text.includes(f))) continue

      const source = parseSource(file, text)

      walk(source, (node) => {
        if (!ts.isObjectLiteralExpression(node)) return
        const docType = stringProp(node, '_type')
        if (!docType) return
        const weakFields = weakFieldsByType.get(docType)
        if (!weakFields) return

        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const fieldName = prop.name.getText().replace(/^['"]|['"]$/g, '')
          if (!weakFields.has(fieldName)) continue

          const reason = strongRefReason(prop.initializer)
          if (!reason) continue

          const { line } = source.getLineAndCharacterOfPosition(
            prop.getStart(source),
          )
          violations.push(
            `${relative(REPO_ROOT, file)}:${line + 1} — ${docType}.${fieldName}: ${reason}`,
          )
        }
      })
    }

    // Each entry is a field the schema declares weak but the code writes strong,
    // which blocks deletion of the referenced document (GDPR erasure, #851).
    // Fix by spreading the ref: `{ ...createReference(id), _weak: true }`.
    expect(violations).toEqual([])
    // Parsing is slow on a cold CI runner; the 5s default is not enough even
    // with the pre-filter above.
  }, 30000)
})
