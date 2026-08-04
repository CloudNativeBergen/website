/**
 * This configuration is used to for the Sanity Studio that’s mounted on the `/pages/studio/[[...index]].tsx` route
 */

import { visionTool } from '@sanity/vision'
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { slugOnSave } from './sanity/actions/slugOnSave'
import { inlineSvgInput } from '@starefossen/sanity-plugin-inline-svg-input'

// Go to https://www.sanity.io/docs/api-versioning to learn how API versioning works
import { apiVersion, dataset, projectId } from './sanity/env'
import { schema, STUDIO_HIDDEN_TYPES } from './sanity/schema'

export default defineConfig({
  basePath: '/studio',
  projectId,
  dataset,
  // Add and edit the content schema in the './sanity/schema' folder
  schema,
  plugins: [
    // Default structure MINUS the platform-internal auth artifacts. Those hold
    // only hashes, but they are not content and must not invite hand-editing.
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items(
            S.documentTypeListItems().filter(
              (item) => !STUDIO_HIDDEN_TYPES.includes(item.getId() ?? ''),
            ),
          ),
    }),
    // Vision is a tool that lets you query your content with GROQ in the studio
    // https://www.sanity.io/docs/the-vision-plugin
    visionTool({ defaultApiVersion: apiVersion }),

    inlineSvgInput(),
  ],

  document: {
    actions: (prev) =>
      prev.map((originalAction) =>
        originalAction.action === 'publish'
          ? slugOnSave(originalAction)
          : originalAction,
      ),
  },
})
