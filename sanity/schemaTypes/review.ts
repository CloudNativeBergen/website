import { defineType, defineField } from "sanity";

export default defineType({
  name: "review",
  type: "document",
  title: "Proposal Review",
  fields: [
    defineField({
      name: "reviewer",
      type: "reference",
      title: "Reviewer",
      to: [{ type: "speaker" }],
      description: "The person reviewing the proposal.",
      validation: (Rule) => Rule.required().error("Reviewer is required."),
    }),
    defineField({
      name: "comment",
      type: "text",
      title: "Comment",
      description: "Feedback provided by the reviewer.",
    }),
    defineField({
      name: "score",
      type: "object",
      title: "Score",
      description: "Scores for the proposal.",
      fields: [
        defineField({
          name: "content",
          type: "number",
          title: "Content Score",
          description: "Score for the content quality.",
          validation: (Rule) => Rule.required().min(0).max(10),
        }),
        defineField({
          name: "relevance",
          type: "number",
          title: "Relevance Score",
          description: "Score for the relevance of the proposal.",
          validation: (Rule) => Rule.required().min(0).max(10),
        }),
        defineField({
          name: "speaker",
          type: "number",
          title: "Speaker Score",
          description: "Score for the speaker's presentation skills.",
          validation: (Rule) => Rule.required().min(0).max(10),
        }),
      ],
    }),
    defineField({
      name: "proposal",
      type: "reference",
      title: "Proposal",
      to: [{ type: "talk" }],
      description: "The proposal being reviewed.",
      validation: (Rule) => Rule.required().error("Proposal is required."),
    }),
  ],
  preview: {
    select: {
      reviewer: "reviewer.name",
      proposal: "proposal.title",
      comment: "comment",
    },
    prepare({ reviewer, proposal, comment }) {
      return {
        title: `${reviewer || "Unknown Reviewer"} - ${proposal || "Unknown Proposal"}`,
        subtitle: comment || "No comment provided",
      };
    },
  },
});