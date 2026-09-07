import { inspectJavaScript, issueMessages } from "./source-language.mjs";

export default {
  rules: {
    "english-source": {
      meta: { type: "suggestion", schema: [], messages: issueMessages },
      create(context) {
        return {
          Program() {
            for (const issue of inspectJavaScript(
              context.sourceCode.text,
              context.filename,
            )) {
              context.report({
                loc: context.sourceCode.getLocFromIndex(issue.offset),
                messageId: issue.code,
              });
            }
          },
        };
      },
    },
  },
};
